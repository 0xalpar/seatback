import test from "node:test";
import assert from "node:assert/strict";
import {cancellationSplit,disputeDeadline,validatePolicy,type Policy} from "@seatback/contracts";
import {createApi,ApiFailure,DEMO_MODE,isOfferExpired,requiresSession} from "../src/api.ts";
import {lamportsToSol,solToLamports} from "../src/money.ts";
import {signAndSubmit,waitForReceipt} from "../src/transactions.ts";
import {resolveWebConfig} from "../src/config.ts";

test("frontend config supports canonical and legacy names and preserves same-origin API base",()=>{
  assert.deepEqual(resolveWebConfig({}),{programId:undefined,apiBase:"http://localhost:3001"});
  assert.deepEqual(resolveWebConfig({VITE_PROGRAM_ID:"program",VITE_SEATBACK_PROGRAM_ID:"program",VITE_API_BASE:"",VITE_API_BASE_URL:""}),{programId:"program",apiBase:""});
  assert.deepEqual(resolveWebConfig({VITE_SEATBACK_PROGRAM_ID:"legacy",VITE_API_BASE_URL:"https://seatback.example/"}),{programId:"legacy",apiBase:"https://seatback.example"});
  assert.deepEqual(resolveWebConfig({VITE_PROGRAM_ID:"primary",VITE_API_BASE:"https://seatback.example"}),{programId:"primary",apiBase:"https://seatback.example"});
});

test("frontend config rejects conflicting program and API aliases",()=>{
  assert.throws(()=>resolveWebConfig({VITE_PROGRAM_ID:"one",VITE_SEATBACK_PROGRAM_ID:"two"}),/Conflicting SeatBack program IDs/);
  assert.throws(()=>resolveWebConfig({VITE_API_BASE:"",VITE_API_BASE_URL:"http://localhost:3001"}),/Conflicting API base URLs/);
});

test("SOL text converts to integer lamports without float rounding",()=>{
  assert.equal(solToLamports("1.000000001"),"1000000001");
  assert.equal(solToLamports("0.25"),"250000000");
  assert.throws(()=>solToLamports("0.0000000001"));
  assert.throws(()=>solToLamports("1e-3"));
  assert.equal(lamportsToSol("18446744073709551615"),"18,446,744,073.709551615 SOL");
});

test("policy preview arithmetic honors the exact deadline boundaries",()=>{
  const [before,rule1,rule2]=[99,100,200].map(t=>cancellationSplit("101",t,100,200));
  assert.deepEqual(before,{participant:"101",organizer:"0"});
  assert.deepEqual(rule1,{participant:"30",organizer:"71"});
  assert.deepEqual(rule2,{participant:"0",organizer:"101"});
  assert.equal(disputeDeadline(1000),87400);
  const policy:Policy={depositLamports:"1",rule1Deadline:10,rule2Deadline:20,checkInOpensAt:20,checkInClosesAt:40,eventStartsAt:19,eventEndsAt:50,disputeSeconds:86400};
  assert.throws(()=>validatePolicy(policy),/INVALID_DEADLINE_ORDER/);
});

test("opt-in fixture transport is read-only and never fabricates transaction success",async()=>{
  assert.equal(DEMO_MODE,false);
  const api=createApi(true);
  const results=await api.events("design");
  assert.equal(results.items.length,1);
  const event=await api.event(results.items[0]!.id);
  assert.equal(event.status,"open");
  await assert.rejects(api.action(`/v1/events/${event.id}/register`),e=>e instanceof ApiFailure&&e.status===501);
  await assert.rejects(api.request("/v1/events",{method:"POST",body:JSON.stringify({title:"No demo writes"})}),e=>e instanceof ApiFailure&&e.status===501);
});

test("opt-in fixture waitlist shows expiry and QR never confirms attendance",async()=>{
  const api=createApi(true);
  const queue=await api.waitlist();
  assert.equal(queue.items[0]?.status,"offered");
  assert.ok((queue.items[0]?.offerExpiresAt??0)>Math.floor(Date.now()/1000));
  await assert.rejects(api.action("/v1/events/evt-design-night/attendance/verify",{token:"example"}),e=>e instanceof ApiFailure&&e.status===501);
});

test("route access checks protect wallet areas and offer expiry uses the server timestamp",()=>{
  assert.equal(requiresSession("/me"),true);
  assert.equal(requiresSession("/organizer/events/new"),true);
  assert.equal(requiresSession("/events"),false);
  assert.equal(isOfferExpired(99,100),true);
  assert.equal(isOfferExpired(101,100),false);
  assert.equal(isOfferExpired(null,100),true);
});

test("default transport calls the configured API and preserves backend failures",async()=>{
  const priorFetch=globalThis.fetch;
  const priorStorage=(globalThis as any).sessionStorage;
  let seen:RequestInit|undefined;
  (globalThis as any).sessionStorage={getItem:(key:string)=>key==="seatback.csrf"?"csrf-value":null,removeItem:()=>{}};
  globalThis.fetch=async(_input,init)=>{seen=init;return new Response(JSON.stringify({error:{code:"SERVICE_UNAVAILABLE",message:"SERVICE_UNAVAILABLE"}}),{status:503,headers:{"Content-Type":"application/json"}})};
  try {
    await assert.rejects(createApi().events("live"),e=>e instanceof ApiFailure&&e.status===503&&e.code==="SERVICE_UNAVAILABLE");
    assert.equal(seen?.credentials,"include");
    assert.equal(new Headers(seen?.headers).get("Accept"),"application/json");
  } finally { globalThis.fetch=priorFetch; (globalThis as any).sessionStorage=priorStorage; }
});

test("transaction client rejects non-Devnet and expired intents before Phantom signing",async()=>{
  let signed=false;
  const signer={walletAddress:"11111111111111111111111111111111",signTransaction:async(tx:any)=>{signed=true;return tx}};
  await assert.rejects(signAndSubmit({intentId:"i",cluster:"mainnet-beta" as any,transactionBase64:"",expiresAt:9999999999,lastValidBlockHeight:1,expectedSigner:signer.walletAddress},signer),/not for Devnet/);
  await assert.rejects(signAndSubmit({intentId:"i",cluster:"devnet",transactionBase64:"",expiresAt:1,lastValidBlockHeight:1,expectedSigner:signer.walletAddress},signer),/expired/);
  assert.equal(signed,false);
});

test("a pending receipt is never converted to confirmation",async()=>{
  const pending={intentId:"i",signature:null,status:"pending" as const};
  let calls=0;
  await assert.rejects(waitForReceipt({intentId:"i",cluster:"devnet",transactionBase64:"",expiresAt:Math.floor(Date.now()/1000)+1,lastValidBlockHeight:1,expectedSigner:"wallet"},pending,async()=>{calls++;return pending}),/still pending or expired/);
  assert.equal(calls,1);
});
