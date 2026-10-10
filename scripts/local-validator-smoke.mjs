import assert from 'node:assert/strict';
import {readFile,writeFile,realpath} from 'node:fs/promises';
import {createPrivateKey,sign,randomUUID} from 'node:crypto';
import {join,relative,isAbsolute} from 'node:path';
import {Keypair,PublicKey,Transaction,ChainClient,loadIdl,pda} from '../packages/chain-client/dist/index.js';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const {Connection}=require('@solana/web3.js');
if(process.env.CI)throw new Error('Local operator smoke only');
const directory=await realpath(process.argv[2]),root=await realpath(new URL('../',import.meta.url));
const rel=relative(root,directory);assert.ok(rel&&(rel.startsWith('..')||isAbsolute(rel)));
const base='http://localhost:5174',rpc=new Connection('http://127.0.0.1:8899','finalized');
const genesis=await rpc.getGenesisHash();assert.notEqual(genesis,'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');assert.ok(!genesis.startsWith('5eykt4Us'));
const chain=new ChainClient(rpc,new PublicKey(loadIdl().address));
assert.ok((await rpc.getAccountInfo(chain.programId))?.executable,'Deploy and independently verify the program first');
const results=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function fund(address){const signature=await rpc.requestAirdrop(address,1000000000);for(let n=0;n<60;n++){const s=(await rpc.getSignatureStatuses([signature])).value[0];if(s?.confirmationStatus==='finalized'){assert.equal(s.err,null);return;}await pause(1000);}throw new Error('Local funding confirmation timed out');}
async function login(role){
 const key=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await readFile(join(directory,role+'-keypair.json'),'utf8'))));
 let cookie='',csrf='';
 async function call(path,body){
  const res=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':csrf,'Idempotency-Key':randomUUID()},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await res.json().catch(()=>null);
  if(!res.ok)throw new Error(`${role} ${path}: ${res.status} ${data?.error?.code??'UNKNOWN'}`);
  return {res,data};
 }
 const address=key.publicKey.toBase58();await fund(key.publicKey);assert.ok(await rpc.getBalance(key.publicKey)>=30000000,role+' needs local test SOL');
 const {data:c}=await call('/v1/auth/challenge',{wallet:address,domain:'localhost:5174',uri:base});
 const privateKey=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.from(key.secretKey.slice(0,32))]),format:'der',type:'pkcs8'});
 const {res,data:s}=await call('/v1/auth/verify',{wallet:address,challengeId:c.challengeId,signatureBase64:sign(null,Buffer.from(c.message),privateKey).toString('base64')});
 cookie=res.headers.get('set-cookie').split(';')[0];csrf=s.csrfToken;
 return {key,address,request:async(path,body)=>(await call(path,body)).data};
}
async function submit(user,prepared,partial=false){
 const i=prepared.intent??prepared;assert.equal(i.cluster,'devnet');assert.equal(i.expectedSigner,user.address);assert.ok(i.expiresAt>Date.now()/1000);
 const tx=Transaction.from(Buffer.from(i.transactionBase64,'base64'));
 assert.equal(tx.instructions.length,1);assert.ok(tx.instructions[0].programId.equals(chain.programId));
 tx.partialSign(user.key);
 let receipt=await user.request('/v1/transactions/submit',{intentId:i.intentId,signedTransactionBase64:tx.serialize({requireAllSignatures:false,verifySignatures:true}).toString('base64')});
 if(partial){assert.equal(receipt.signature,null);return i;}
 const stop=Date.now()+180000;
 while(receipt.status==='pending'&&Date.now()<stop){await pause(2500);receipt=await user.request('/v1/transactions/'+i.intentId);}
 assert.equal(receipt.status,'confirmed','No finalized success: '+i.intentId);assert.ok(receipt.signature);
 const actual=await rpc.getTransaction(receipt.signature,{commitment:'finalized',maxSupportedTransactionVersion:0});assert.ok(actual&&!actual.meta.err);
 results.push({intentId:i.intentId,signature:receipt.signature,network:'local-validator'});
 console.log('Finalized LOCAL validator transaction:',receipt.signature);
 return receipt;
}
const gate=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await readFile(join(directory,'gate-keypair.json'),'utf8'))));await fund(gate.publicKey);
const org=await login('organizer'),a=await login('participant'),b=await login('replacement');
async function rejectedOnChain(user,intent){
 assert.equal(intent.expectedSigner,user.address);
 const tx=Transaction.from(Buffer.from(intent.transactionBase64,'base64'));
 assert.equal(tx.instructions.length,1);assert.ok(tx.instructions[0].programId.equals(chain.programId));tx.partialSign(user.key);assert.ok(tx.verifySignatures(true));
 // LOCAL negative test only: broadcast the expected-to-fail transaction so rejection
 // is recorded by the actual program, rather than treating an API intent as admission.
 const signature=await rpc.sendRawTransaction(tx.serialize(),{skipPreflight:true,maxRetries:3});
 let status;for(let n=0;n<90;n++){status=(await rpc.getSignatureStatuses([signature])).value[0];if(status?.confirmationStatus==='finalized')break;await pause(1000);}
 assert.equal(status?.confirmationStatus,'finalized');assert.ok(status.err,'Capacity transaction unexpectedly succeeded');
 results.push({signature,status:'rejected-by-program',network:'local-validator'});
 console.log('Finalized LOCAL program rejection:',signature);
}
async function event(title,attendance=false,visibility='public'){
 const now=Math.floor(Date.now()/1000),start=attendance?now+180:now+7200;
 const policy={depositLamports:'10000000',rule1Deadline:attendance?now+30:now+1800,rule2Deadline:attendance?now+60:now+3600,checkInOpensAt:attendance?now+90:now+5400,eventStartsAt:start,checkInClosesAt:start+600,eventEndsAt:start+900,disputeSeconds:86400};
 const accessCode=visibility==='private'?randomUUID():undefined;
 const created=await org.request('/v1/events',{title,description:'Real local Solana integration rehearsal',location:'SeatBack local validator',visibility,...(accessCode?{accessCode}:{}),capacity:1,registrationLimit:3,policy});
 await submit(org,created);return {id:created.eventId,policy,accessCode};
}
const registration=async(user,id)=>(await user.request('/v1/me/registrations')).items.find(r=>r.eventId===id);
async function money(user,id,refund,allocation){
 const row=await registration(user,id);assert.ok(row);assert.equal(row.participantRefundLamports,refund);assert.equal(row.organizerAllocationLamports,allocation);
 const reservation=new PublicKey(row.reservationPda);
 const state=await chain.account('Reservation',reservation,'finalized');assert.equal(state.participant_paid_lamports.toString(),refund);assert.equal(state.organizer_allocated_lamports.toString(),allocation);
 const vault=await rpc.getAccountInfo(pda(chain.programId,'vault',reservation.toBytes()),'finalized');assert.ok(vault?.owner.equals(chain.programId));
 const rent=await rpc.getMinimumBalanceForRentExemption(vault.data.length);
 assert.equal(BigInt(vault.lamports-rent),BigInt(state.policy_snapshot.deposit_lamports.toString())-BigInt(refund)-BigInt(state.organizer_paid_lamports.toString()),'Program-owned escrow conservation failed');return row;
}
const e=await event('LOCAL cancellation and waitlist '+new Date().toISOString());
await submit(a,await a.request(`/v1/events/${e.id}/register`,{}));
await money(a,e.id,'0','0');
await rejectedOnChain(b,await b.request(`/v1/events/${e.id}/register`,{}));
assert.equal(await registration(b,e.id),undefined);
await assert.rejects(b.request(`/v1/events/${e.id}/cancel`,{}));
await b.request(`/v1/events/${e.id}/waitlist`,{});
const ar=await registration(a,e.id);await submit(a,await a.request(`/v1/registrations/${ar.id}/cancel`,{}));await money(a,e.id,'10000000','0');
let offer;const stop=Date.now()+180000;
while(Date.now()<stop){offer=(await b.request('/v1/me/waitlist')).items.find(w=>w.eventId===e.id&&w.status==='offered'&&w.offerId);if(offer)break;await pause(3000);}
assert.ok(offer?.offerId,'Worker did not offer vacant seat');
await submit(b,await b.request(`/v1/offers/${offer.offerId}/accept`,{}));await money(b,e.id,'0','0');
await submit(org,await org.request(`/v1/events/${e.id}/cancel`,{}));
const br=await registration(b,e.id);await submit(b,await b.request(`/v1/registrations/${br.id}/claim-refund`,{}));await money(b,e.id,'10000000','0');
const attendance=await event('LOCAL QR attendance '+new Date().toISOString(),true);
await submit(a,await a.request(`/v1/events/${attendance.id}/register`,{}));
while(Date.now()/1000<attendance.policy.checkInOpensAt+2)await pause(1000);
const reg=await registration(a,attendance.id),qr=await a.request(`/v1/registrations/${reg.id}/qr`,{});
const verified=await org.request(`/v1/events/${attendance.id}/attendance/verify`,{token:qr.token});await submit(org,verified,true);
await money(a,attendance.id,'0','0');
const co=(await a.request('/v1/me/attendance-intents')).items.find(i=>i.intentId===verified.intent.intentId);assert.ok(co);await submit(a,co);await money(a,attendance.id,'10000000','0');
assert.equal((await registration(a,attendance.id)).status,'attended');
await assert.rejects(a.request(`/v1/registrations/${reg.id}/qr`,{}));
await assert.rejects(org.request(`/v1/events/${attendance.id}/attendance/verify`,{token:qr.token}));
const privateEvent=await event('LOCAL private invitation',false,'private');
assert.equal((await fetch(base+'/v1/events/'+privateEvent.id)).status,404);
await assert.rejects(a.request('/v1/events/'+privateEvent.id));
await assert.rejects(a.request(`/v1/events/${privateEvent.id}/access`,{code:'incorrect-invitation'}));
await a.request(`/v1/events/${privateEvent.id}/access`,{code:privateEvent.accessCode});
assert.equal((await a.request('/v1/events/'+privateEvent.id)).id,privateEvent.id);
assert.ok(!(await org.request('/v1/events')).items.some(e=>e.id===privateEvent.id),'Private event leaked into public discovery');
await writeFile(new URL('../.cache/local-results.json',import.meta.url),JSON.stringify({cluster:'local-validator',genesis,programId:chain.programId.toBase58(),verifiedAt:new Date().toISOString(),events:[e.id,attendance.id],checks:['registration escrow','100% early cancellation','automatic waitlist offer','offer acceptance','event cancellation refund','scanner+participant QR attendance','100% attendance refund'],transactions:results},null,2));
console.log('Real LOCAL validator API MVP flow passed; public transaction proof saved. Phantom and 24-hour settlement were not tested.');
