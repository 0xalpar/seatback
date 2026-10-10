import {readFileSync} from "node:fs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createPrivateKey,sign,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {PGlite} from '@electric-sql/pglite';
import {PostgresDatabase} from '../apps/api/dist/db.js';
import {Auth} from '../apps/api/dist/auth.js';
import {SeatBackService} from '../apps/api/dist/service.js';
import {BackendWorker} from '../apps/api/dist/worker.js';
import {createApiServer} from '../apps/api/dist/server.js';
import {Intents} from '../apps/api/dist/intents.js';
import {sha,hashCode,verifyCode,canonical} from '../apps/api/dist/security.js';
import {loadConfig} from '../apps/api/dist/config.js';
import {Keypair,PublicKey,Transaction,serializePartial,mergeSignedTransactions,pda,policyArgs,ChainClient,loadIdl,policyDigest} from '../packages/chain-client/dist/index.js';
const programId=new PublicKey(JSON.parse(readFileSync(new URL("../packages/chain-client/idl/seatback.json",import.meta.url),"utf8")).address);
const config={webOrigin:'http://localhost:5173',authDomain:'localhost:5173',sessionSecret:'s'.repeat(40),codePepper:'p'.repeat(40),secureCookies:false,localValidator:true,disputeAuthority:Keypair.generate().publicKey.toBase58()};
function walletSign(k,message){const key=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.from(k.secretKey.slice(0,32))]),format:'der',type:'pkcs8'});return sign(null,Buffer.from(message),key).toString('base64');}
async function database(){
 if(process.env.TEST_DATABASE_URL){
  // Only create/drop this test's randomly named schema; never reset a user's public schema.
  const schema='seatback_test_'+randomUUID().replaceAll('-',''),admin=new PostgresDatabase(process.env.TEST_DATABASE_URL);
  await admin.query('CREATE SCHEMA '+schema);
  const url=new URL(process.env.TEST_DATABASE_URL);url.searchParams.set('options','-c search_path='+schema);
  const db=new PostgresDatabase(url.href);
  try{
   for(const name of (await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort())
    await db.query((await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8')).replaceAll('public.',schema+'.'));
  }catch(error){await db.close();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.close();throw error;}
  const close=db.close.bind(db);db.schema=schema;db.close=async()=>{await close();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.close();};return db;
 }
 const pg=new PGlite();
 for(const name of (await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort())await pg.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 const wrap=p=>({query:async(sql,args=[])=>{const r=await p.query(sql,args);return {rows:r.rows,rowCount:r.affectedRows??r.rows.length};}});
 return {...wrap(pg),transaction:fn=>pg.transaction(tx=>fn(wrap(tx))),close:()=>pg.close()};
}
async function seed(db,visibility='public'){
 const organizer=Keypair.generate(),participant=Keypair.generate(),gate=Keypair.generate(),arbiter=Keypair.generate();
 for(const w of [organizer,participant,gate,arbiter])await db.query('INSERT INTO wallets(address) VALUES($1)',[w.publicKey.toBase58()]);
 const id=randomUUID(),now=Math.floor(Date.now()/1000),p={depositLamports:'1000001',rule1Deadline:now+600,rule2Deadline:now+1200,checkInOpensAt:now+1800,checkInClosesAt:now+3600,eventStartsAt:now+2400,eventEndsAt:now+4000,disputeSeconds:86400};
 const eventPda=Keypair.generate().publicKey.toBase58();
 await db.query("INSERT INTO events(id,organizer,event_pda,title,location,visibility,status,access_code_hash,capacity,registration_limit,deposit_lamports,rule1_deadline,rule2_deadline,check_in_opens_at,check_in_closes_at,event_starts_at,event_ends_at,gate_authority,dispute_authority,policy_hash,metadata_hash) VALUES($1,$2,$3,'Meetup','Istanbul',$4,'open',$5,1,3,1000001,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)",[id,organizer.publicKey.toBase58(),eventPda,visibility,visibility==='private'?hashCode('secret-code',config.codePepper):null,...[p.rule1Deadline,p.rule2Deadline,p.checkInOpensAt,p.checkInClosesAt,p.eventStartsAt,p.eventEndsAt].map(x=>new Date(x*1000)),gate.publicKey.toBase58(),arbiter.publicKey.toBase58(),sha('policy')]);
 const state={organizer:organizer.publicKey,gate_authority:gate.publicKey,dispute_authority:arbiter.publicKey,status:1,capacity:1,registration_limit:3,registrations_created:0,occupied_seats:0,held_offers:0,policy:{check_in_opens_at:p.checkInOpensAt},terms_locked:false};
 return {id,organizer,participant,gate,arbiter,p,eventPda,state};
}
test('PostgreSQL migrations enforce immutable policy, capacity, money conservation and default-deny RLS',async()=>{
 const db=await database(),role='browser_'+randomUUID().replaceAll('-','');try{
  const s=await seed(db);
  await db.query('UPDATE events SET terms_locked=true WHERE id=$1',[s.id]);
  await assert.rejects(db.query("UPDATE events SET deposit_lamports=2 WHERE id=$1",[s.id]),/immutable/);
  await assert.rejects(db.query("UPDATE events SET occupied_seats=2 WHERE id=$1",[s.id]),/check constraint/);
  const r=randomUUID();await db.query("INSERT INTO registrations(id,event_id,wallet,reservation_pda,status,policy_snapshot,policy_hash,deposit_lamports,dispute_deadline) VALUES($1,$2,$3,$4,'reserved',$5,$6,1000001,$7)",[r,s.id,s.participant.publicKey.toBase58(),Keypair.generate().publicKey.toBase58(),JSON.stringify(s.p),sha('policy'),new Date((s.p.checkInClosesAt+86400)*1000)]);
  await assert.rejects(db.query('UPDATE registrations SET participant_paid_lamports=1000002 WHERE id=$1',[r]),/check constraint/);
  await assert.rejects(db.query("UPDATE registrations SET policy_snapshot='{}' WHERE id=$1",[r]),/immutable/);
  await db.query('CREATE ROLE '+role);await db.query('GRANT USAGE ON SCHEMA '+(db.schema??'public')+' TO '+role);await db.query('GRANT SELECT ON events TO '+role);await db.query('SET ROLE '+role);
  assert.equal((await db.query('SELECT * FROM events')).rows.length,0);await db.query('RESET ROLE');
 }finally{await db.query('RESET ROLE');await db.query('DROP OWNED BY '+role).catch(()=>{});await db.query('DROP ROLE IF EXISTS '+role);await db.close();}
});
test('wallet challenges bind domain and message, reject wrong signatures and replay; sessions revoke and expire',async()=>{
 const db=await database();try{
  let now=Date.now();const auth=new Auth(db,config,()=>now),w=Keypair.generate(),other=Keypair.generate();
  await assert.rejects(auth.challenge(w.publicKey.toBase58(),'evil.test','http://localhost:5173'),/INVALID_DOMAIN/);
  const c=await auth.challenge(w.publicKey.toBase58(),config.authDomain,config.webOrigin+'/login');
  await assert.rejects(auth.verify(c.challengeId,w.publicKey.toBase58(),walletSign(other,c.message)),/INVALID_SIGNATURE/);
  const s=await auth.verify(c.challengeId,w.publicKey.toBase58(),walletSign(w,c.message));
  assert.equal((await auth.session(s.raw)).wallet,w.publicKey.toBase58());
  assert.throws(()=>auth.checkCsrf('wrong',s.csrfToken),/INVALID_CSRF/);auth.checkCsrf(s.csrfToken,s.csrfToken);
  await assert.rejects(auth.verify(c.challengeId,w.publicKey.toBase58(),walletSign(w,c.message)),/INVALID_CHALLENGE/);
  const stored=(await db.query('SELECT * FROM sessions')).rows[0];assert.notEqual(Buffer.from(stored.token_hash).toString(),s.raw);assert.equal(Buffer.from(stored.token_hash).length,32);
  await auth.logout(s.raw);await assert.rejects(auth.session(s.raw),/SESSION_EXPIRED/);
  const expired=await auth.challenge(w.publicKey.toBase58(),config.authDomain,config.webOrigin);now+=301000;
  await assert.rejects(auth.verify(expired.challengeId,w.publicKey.toBase58(),walletSign(w,expired.message)),/INVALID_CHALLENGE/);
 }finally{await db.close();}
});
test('private discovery, QR authorization and FIFO waitlist outbox are enforced in PostgreSQL',async()=>{
 const db=await database();try{
  const s=await seed(db,'private');
  const chain={programId,account:async name=>name==='Event'?s.state:null};
  const service=new SeatBackService(db,chain,s.gate,config);
  await assert.rejects(service.event(s.id),/EVENT_NOT_FOUND/);
  assert.equal((await service.listEvents(undefined,false,'',50,null)).items.length,0);
  await assert.rejects(service.access(s.id,s.participant.publicKey.toBase58(),'bad'),/EVENT_NOT_FOUND/);
  await service.access(s.id,s.participant.publicKey.toBase58(),'secret-code');
  assert.equal((await service.event(s.id,s.participant.publicKey.toBase58())).id,s.id);
  const joined=await service.waitlist(s.id,s.participant.publicKey.toBase58());assert.equal(joined.position,1);
  const worker=new BackendWorker(service);await Promise.all([worker.queueOffers(),new BackendWorker(service).queueOffers()]);
  assert.equal((await db.query('SELECT * FROM seat_offers')).rows.length,1);assert.equal((await db.query('SELECT * FROM outbox_jobs')).rows.length,1);
  await assert.rejects(service.attendance(s.id,s.participant.publicKey.toBase58(),'a'.repeat(43)),/UNAUTHORIZED_SCANNER/);
  assert.ok(verifyCode('secret-code',hashCode('secret-code',config.codePepper),config.codePepper));
  assert.equal(verifyCode('wrong',hashCode('secret-code',config.codePepper),config.codePepper),false);
 }finally{await db.close();}
});
test('transaction intents merge independent signers, reject tampered message, and persist before ambiguous broadcast',async()=>{
 const db=await database();try{
  const s=await seed(db),user=s.participant,scanner=s.organizer;
  const ix={programId,keys:[{pubkey:user.publicKey,isSigner:true,isWritable:true},{pubkey:scanner.publicKey,isSigner:true,isWritable:false}],data:Buffer.from([7])};
  const chain={programId,connection:{getLatestBlockhash:async()=>({blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:100}),getBlockHeight:async()=>10,sendRawTransaction:async()=>{throw new Error('network timeout');}}};
  const intents=new Intents(db,chain),i=await intents.create('attendance',scanner.publicKey.toBase58(),s.id,ix,{});
  const a=Transaction.from(Buffer.from(i.transactionBase64,'base64'));a.partialSign(scanner);
  const first=await intents.submit(i.intentId,serializePartial(a),scanner.publicKey.toBase58());assert.equal(first.signature,null);
  const b=Transaction.from(Buffer.from(i.transactionBase64,'base64'));b.partialSign(user);
  const changed=Transaction.from(Buffer.from(i.transactionBase64,'base64'));changed.instructions[0].data=Buffer.from([8]);changed.partialSign(user);
  await assert.rejects(intents.submit(i.intentId,serializePartial(changed),user.publicKey.toBase58()),/TRANSACTION_MISMATCH/);
  const last=await intents.submit(i.intentId,serializePartial(b),user.publicKey.toBase58());assert.ok(last.signature);
  assert.equal((await intents.submit(i.intentId,serializePartial(b),user.publicKey.toBase58())).signature,last.signature);
  const stored=(await db.query('SELECT * FROM transaction_intents WHERE id=$1',[i.intentId])).rows[0];assert.equal(stored.signature,last.signature);assert.ok(Transaction.from(Buffer.from(stored.transaction_base64,'base64')).verifySignatures(true));
  assert.throws(()=>mergeSignedTransactions(Transaction.from(Buffer.from(i.transactionBase64,'base64')),b,Keypair.generate().publicKey,programId),/UNEXPECTED_SIGNER/);
 }finally{await db.close();}
});
test('HTTP auth cookies, CSRF, origin checks and logout use real database sessions',async()=>{
 const db=await database(),auth=new Auth(db,config),service={listEvents:async()=>({items:[],nextCursor:null})};
 const server=createApiServer({db,auth,service,config});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port,w=Keypair.generate();
 const post=(path,body,extra={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:config.webOrigin,...extra},body:JSON.stringify(body)});
 try{
  const c=await (await post('/v1/auth/challenge',{wallet:w.publicKey.toBase58(),domain:config.authDomain,uri:config.webOrigin})).json();
  const verified=await post('/v1/auth/verify',{challengeId:c.challengeId,wallet:w.publicKey.toBase58(),signatureBase64:walletSign(w,c.message)});assert.equal(verified.status,200);
  const cookie=verified.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Lax/);const session=await verified.json();
  assert.equal((await fetch(base+'/v1/auth/session',{headers:{Cookie:cookie}})).status,200);
  assert.equal((await post('/v1/auth/logout',{}, {Cookie:cookie})).status,403);
  assert.equal((await post('/v1/auth/logout',{}, {Cookie:cookie,'X-CSRF-Token':session.csrfToken,Origin:'https://evil.test'})).status,403);
  assert.equal((await post('/v1/auth/logout',{}, {Cookie:cookie,'X-CSRF-Token':session.csrfToken})).status,204);
  assert.equal((await fetch(base+'/v1/auth/session',{headers:{Cookie:cookie}})).status,401);
 }finally{await new Promise(r=>server.close(r));await db.close();}
});
test('configuration rejects Mainnet cluster and remote local-validator overrides',()=>{
 const env={SOLANA_CLUSTER:'devnet',WEB_ORIGIN:config.webOrigin,SESSION_SECRET:config.sessionSecret,ACCESS_CODE_PEPPER:config.codePepper,SOLANA_RPC_URL:'https://api.devnet.solana.com',DATABASE_URL:'postgresql://localhost/test',SEATBACK_PROGRAM_ID:programId.toBase58(),GATE_KEYPAIR_PATH:'outside-repo.json',DISPUTE_AUTHORITY:config.disputeAuthority};
 assert.equal(loadConfig(env).localValidator,false);
 assert.throws(()=>loadConfig({...env,SOLANA_CLUSTER:'mainnet-beta'}),/devnet/);
 assert.throws(()=>loadConfig({...env,ALLOW_LOCAL_VALIDATOR:'true'}),/loopback/);
 assert.equal(canonical({b:1,a:2}),canonical({a:2,b:1}));
});
test('QR challenges bind reservation and event, lease once, expire, and require participant co-signing',async()=>{
 const db=await database();try{
  const s=await seed(db),id=randomUUID(),reservation=pda(programId,'reservation',new PublicKey(s.eventPda).toBytes(),s.participant.publicKey.toBytes());let now=Date.now();
  await db.query("INSERT INTO registrations(id,event_id,wallet,reservation_pda,status,policy_snapshot,policy_hash,deposit_lamports,dispute_deadline) VALUES($1,$2,$3,$4,'reserved',$5,$6,1000001,$7)",[id,s.id,s.participant.publicKey.toBase58(),reservation.toBase58(),JSON.stringify(s.p),sha('policy'),new Date((s.p.checkInClosesAt+86400)*1000)]);
  const chain={programId,account:async name=>name==='Event'?s.state:name==='Reservation'?{status:0}:null,
   instruction:(_name,_args,accounts)=>({programId,data:Buffer.from([7]),keys:[{pubkey:accounts.actor,isSigner:true,isWritable:true},{pubkey:accounts.participant_signer,isSigner:true,isWritable:true}]}),
   connection:{getLatestBlockhash:async()=>({blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:100})}};
  const service=new SeatBackService(db,chain,s.gate,config,()=>now);
  await assert.rejects(service.qr(id,s.organizer.publicKey.toBase58()),/FORBIDDEN/);
  const qr=await service.qr(id,s.participant.publicKey.toBase58());
  const wire=await service.attendance(s.id,s.organizer.publicKey.toBase58(),qr.token);
  const tx=Transaction.from(Buffer.from(wire.intent.transactionBase64,'base64'));assert.equal(tx.signatures.length,2);assert.ok(tx.signatures.some(x=>x.publicKey.equals(s.participant.publicKey)));
  assert.equal((await service.attendanceIntents(s.participant.publicKey.toBase58())).items[0].expectedSigner,s.participant.publicKey.toBase58());
  await assert.rejects(service.attendance(s.id,s.organizer.publicKey.toBase58(),qr.token),/QR_EXPIRED_OR_USED/);
  const stored=(await db.query('SELECT * FROM qr_challenges')).rows[0];assert.ok(Buffer.from(stored.token_hash).equals(sha(qr.token)));assert.equal(stored.token,undefined);
  const expired=await service.qr(id,s.participant.publicKey.toBase58());now+=61000;
  await assert.rejects(service.attendance(s.id,s.organizer.publicKey.toBase58(),expired.token),/QR_EXPIRED_OR_USED/);
 }finally{await db.close();}
});
test('finalized account projections persist financial state and reject older slots',async()=>{
 const db=await database();try{
  const s=await seed(db),registrationId=randomUUID(),eventKey=new PublicKey(s.eventPda);
  let slot=200,dispute=null;
  const r={event:eventKey,participant:s.participant.publicKey,status:0,policy_snapshot:policyArgs(s.p),policy_hash:sha('policy'),participant_paid_lamports:'0',organizer_allocated_lamports:'0',organizer_paid_lamports:'0',attended_at:0};
  const e={...s.state,metadata_hash:sha('policy'),terms_locked:true,registrations_created:1,occupied_seats:1,held_offers:0};
  const chain={programId,idl:{accounts:[{name:'Event'},{name:'Reservation'},{name:'Dispute'}]},accounts:{decode:(name)=>name==='Event'?e:name==='Reservation'?r:dispute},connection:{getMultipleAccountsInfoAndContext:async()=>({context:{slot},value:[{owner:programId,data:Buffer.alloc(0)},{owner:programId,data:Buffer.alloc(0)},dispute?{owner:programId,data:Buffer.alloc(0)}:null]})}};
  const service=new SeatBackService(db,chain,s.gate,config),worker=new BackendWorker(service);
  const intent={id:randomUUID(),event_id:s.id,kind:'register',signature:'test-signature',effects:{participant:s.participant.publicKey.toBase58(),registrationId}};
  await worker.project(intent,200);
  assert.equal((await db.query('SELECT status FROM registrations WHERE id=$1',[registrationId])).rows[0].status,'reserved');
  await db.query("INSERT INTO disputes(registration_id,evidence_text,evidence_hash,status) VALUES($1,'private evidence',$2,'pending')",[registrationId,sha('evidence')]);
  r.status=4;r.organizer_allocated_lamports='1000001';e.occupied_seats=0;
  dispute={event:eventKey,reservation:pda(programId,'reservation',eventKey.toBytes(),s.participant.publicKey.toBytes()),participant:s.participant.publicKey,outcome:0,opened_at:s.p.checkInClosesAt,resolved_at:0};slot=201;
  await worker.project({...intent,id:randomUUID(),kind:'open_dispute',signature:'test-dispute'},201);
  assert.equal((await db.query('SELECT status FROM disputes')).rows[0].status,'open');
  slot=199;r.status=0;r.organizer_allocated_lamports='0';e.occupied_seats=1;dispute=null;
  await worker.project({...intent,id:randomUUID(),signature:'stale'},199);
  assert.equal((await db.query('SELECT status FROM registrations WHERE id=$1',[registrationId])).rows[0].status,'disputed');
  assert.equal((await db.query('SELECT occupied_seats FROM events WHERE id=$1',[s.id])).rows[0].occupied_seats,0);
 }finally{await db.close();}
});
test('compiler-generated Anchor IDL encodes real API event/registration and optional accounts',async()=>{
 const db=await database();try{
  const s=await seed(db),connection={getLatestBlockhash:async()=>({blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:100}),getAccountInfo:async()=>null,getGenesisHash:async()=> 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'};
  const chain=new ChainClient(connection,programId);assert.equal(loadIdl().instructions.length,17);await chain.assertNetwork();
  assert.equal(policyDigest({depositLamports:'1000001',rule1Deadline:100,rule2Deadline:200,checkInOpensAt:300,checkInClosesAt:500,eventStartsAt:400,eventEndsAt:600,disputeSeconds:86400}).toString('hex'),'b80baffee9c8c854e351bfc7d12ae3dd43185c523289903ad55161f347ff5bb8');
  const service=new SeatBackService(db,chain,s.gate,{...config,disputeAuthority:s.arbiter.publicKey.toBase58()});
  const result=await service.createEvent(s.organizer.publicKey.toBase58(),{title:'New event',description:'Test',location:'Istanbul',visibility:'public',capacity:1,registrationLimit:3,policy:s.p});
  const created=Transaction.from(Buffer.from(result.intent.transactionBase64,'base64'));
  const decoded=chain.instructions.decode(created.instructions[0].data);assert.equal(decoded.name,'create_event');assert.equal(decoded.data.policy.deposit_lamports.toString(),'1000001');
  const chainAccount=chain.account.bind(chain);chain.account=async(name,key,...rest)=>name==='Event'?s.state:chainAccount(name,key,...rest);
  const reg=await service.reserve(s.id,s.participant.publicKey.toBase58()),tx=Transaction.from(Buffer.from(reg.transactionBase64,'base64'));
  assert.equal(chain.instructions.decode(tx.instructions[0].data).name,'register');assert.ok(tx.signatures.find(x=>x.publicKey.equals(s.gate.publicKey)).signature);assert.ok(tx.verifySignatures(false));
  assert.ok(tx.instructions[0].keys.some(k=>k.pubkey.equals(programId)&&!k.isSigner&&!k.isWritable));
  connection.getGenesisHash=async()=> '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';await assert.rejects(chain.assertNetwork(true),/NON_DEVNET_RPC/);
 }finally{await db.close();}
});
test('outbox retry keeps one offer intent across ambiguous broadcast instead of spending fees twice',async()=>{
 const db=await database();try{
  const s=await seed(db),chain={programId,account:async name=>name==='Event'?s.state:null,
   instruction:()=>({programId,keys:[{pubkey:s.gate.publicKey,isSigner:true,isWritable:true}],data:Buffer.from([4])}),
   connection:{getLatestBlockhash:async()=>({blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:100}),getBlockHeight:async()=>10,sendRawTransaction:async()=>{throw Error('timeout');}}};
  const service=new SeatBackService(db,chain,s.gate,config),worker=new BackendWorker(service);
  await service.waitlist(s.id,s.participant.publicKey.toBase58());await worker.queueOffers();await worker.jobs();
  const first=(await db.query('SELECT * FROM outbox_jobs')).rows[0];assert.equal(first.status,'pending');assert.ok(first.payload.intentId);
  await db.query("UPDATE outbox_jobs SET available_at='2000-01-01'");await worker.jobs();
  assert.equal((await db.query('SELECT * FROM transaction_intents')).rows.length,1);
  assert.equal((await db.query('SELECT payload FROM outbox_jobs')).rows[0].payload.intentId,first.payload.intentId);
 }finally{await db.close();}
});
test('economic HTTP idempotency returns the same real intent and rejects changed payloads',async()=>{
 const db=await database();let server;
 try{
  const s=await seed(db),cfg={...config,disputeAuthority:s.arbiter.publicKey.toBase58()},auth=new Auth(db,cfg);
  const chain=new ChainClient({getLatestBlockhash:async()=>({blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:100})},programId);
  const service=new SeatBackService(db,chain,s.gate,cfg),wallet=s.organizer.publicKey.toBase58();
  const challenge=await auth.challenge(wallet,cfg.authDomain,cfg.webOrigin),session=await auth.verify(challenge.challengeId,wallet,walletSign(s.organizer,challenge.message));
  server=createApiServer({db,auth,service,config:cfg});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const body={title:'Idempotent event',description:'Test',location:'Istanbul',visibility:'public',capacity:1,registrationLimit:3,policy:s.p},key=randomUUID();
  const post=b=>fetch('http://127.0.0.1:'+server.address().port+'/v1/events',{method:'POST',headers:{Origin:cfg.webOrigin,'Content-Type':'application/json',Cookie:auth.cookie(session.raw),'X-CSRF-Token':session.csrfToken,'Idempotency-Key':key},body:JSON.stringify(b)});
  const first=await post(body);assert.equal(first.status,201);const result=await first.json();
  const again=await post(body);assert.equal(again.status,201);assert.deepEqual(await again.json(),result);
  assert.equal((await post({...body,title:'Different'})).status,409);
  assert.equal((await db.query("SELECT * FROM events WHERE title='Idempotent event'")).rows.length,1);
  assert.equal((await db.query('SELECT * FROM transaction_intents')).rows.length,1);
 }finally{if(server)await new Promise(r=>server.close(r));await db.close();}
});
test('startup failures never print credential-bearing database URLs',()=>{
 const secret='do-not-log-this-password';
 const child=spawnSync(process.execPath,['apps/api/dist/index.js'],{encoding:'utf8',timeout:5000,env:{...process.env,SOLANA_CLUSTER:'devnet',WEB_ORIGIN:config.webOrigin,SESSION_SECRET:config.sessionSecret,ACCESS_CODE_PEPPER:config.codePepper,SOLANA_RPC_URL:'https://api.devnet.solana.com',SEATBACK_PROGRAM_ID:programId.toBase58(),GATE_KEYPAIR_PATH:'missing-development-key.json',DISPUTE_AUTHORITY:config.disputeAuthority,DATABASE_URL:'postgresql://username:'+secret+'@[invalid'}});
 assert.equal(child.status,1);assert.match(child.stderr,/BACKEND_STARTUP_FAILED/);assert.ok(!child.stderr.includes(secret));
});
