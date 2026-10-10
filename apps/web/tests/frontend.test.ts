import test from "node:test";
import assert from "node:assert/strict";
import {cancellationSplit,disputeDeadline,validatePolicy,type Policy} from "@seatback/contracts";
import {createApi,ApiFailure,DEMO_MODE,isOfferExpired,requiresSession} from "../src/api.ts";
import {lamportsToSol,solToLamports} from "../src/money.ts";

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

test("demo transport is visibly read-only and never fabricates transaction success",async()=>{
  assert.equal(DEMO_MODE,true);
  const api=createApi();
  const results=await api.events("design");
  assert.equal(results.items.length,1);
  const event=await api.event(results.items[0]!.id);
  assert.equal(event.status,"open");
  await assert.rejects(api.action(`/v1/events/${event.id}/register`),e=>e instanceof ApiFailure&&e.status===501);
  await assert.rejects(api.request("/v1/events",{method:"POST",body:JSON.stringify({title:"No demo writes"})}),e=>e instanceof ApiFailure&&e.status===501);
});

test("demo waitlist offer exposes server expiry and QR flow does not confirm attendance",async()=>{
  const api=createApi();
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
