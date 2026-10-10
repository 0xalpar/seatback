import {randomUUID} from "node:crypto";
import {PublicKey,Transaction,pda,policyView,uuidBytes,serializePartial} from "@seatback/chain-client";
import type {Database} from "./db.js";
import type {SeatBackService} from "./service.js";
import {ensure} from "./errors.js";
import {sha} from "./security.js";
const statuses=["reserved","attended","cancelled","no_show","disputed","settled"] as const;
export class BackendWorker {
 constructor(readonly service:SeatBackService,readonly now=()=>Date.now()) {}
 get db():Database{return this.service.db;}
 async reconcile() {
  const intents=(await this.db.query("SELECT * FROM transaction_intents WHERE projected_at IS NULL AND status='pending' ORDER BY created_at LIMIT 100")).rows;
  const discovered=new Map<string,any[]>(),transactions=new Map<string,any>();
  for(const r of intents) {
   try {
    const rpc=this.service.chain.connection;
    if(!r.signature) {
     // Recover an approved intent broadcast directly by a wallet, or a crash before
     // /submit. Match the entire approved message, never an amount or wallet alone.
     let signatures=discovered.get(r.event_id);
     if(!signatures) {
      const event=await this.service.rawEvent(r.event_id);
      signatures=await rpc.getSignaturesForAddress(new PublicKey(event.event_pda),{limit:50},"confirmed");
      discovered.set(r.event_id,signatures);
     }
     for(const candidate of signatures) {
      let tx=transactions.get(candidate.signature);
      if(tx===undefined){tx=await rpc.getTransaction(candidate.signature,{commitment:"confirmed",maxSupportedTransactionVersion:0});transactions.set(candidate.signature,tx??null);}
      if(tx?.version!=="legacy"||!sha(tx.transaction.message.serialize()).equals(Buffer.from(r.message_hash)))continue;
      r.signature=candidate.signature;
      const full=Transaction.populate(tx.transaction.message,tx.transaction.signatures);
      ensure(full.verifySignatures(true),422,"CHAIN_SIGNATURE_MISMATCH");
      await this.db.query("UPDATE transaction_intents SET signature=$2,transaction_base64=$3 WHERE id=$1 AND signature IS NULL",[r.id,r.signature,serializePartial(full)]);
      break;
     }
     if(!r.signature) {
      // Keep a grace period for RPC history/finality lag after the signing window.
      if(new Date(r.expires_at).getTime()+120000<=this.now()&&await rpc.getBlockHeight("finalized")>Number(r.last_valid_block_height))
       await this.db.query("UPDATE transaction_intents SET status='expired' WHERE id=$1 AND signature IS NULL",[r.id]);
      continue;
     }
    }
    const status=(await rpc.getSignatureStatuses([r.signature],{searchTransactionHistory:true})).value[0];
    if(status?.err) {await this.db.query("UPDATE transaction_intents SET status='failed' WHERE id=$1",[r.id]);continue;}
    if(status?.confirmationStatus==="finalized") {
     const tx=await rpc.getTransaction(r.signature,{commitment:"finalized",maxSupportedTransactionVersion:0});
     ensure(tx&&!tx.meta?.err&&tx.version==="legacy"&&sha(tx.transaction.message.serialize()).equals(Buffer.from(r.message_hash)),422,"CHAIN_TRANSACTION_MISMATCH");
     await this.project(r,status.slot);continue;
    }
    const height=await rpc.getBlockHeight("confirmed");
    if(!status&&height>Number(r.last_valid_block_height)) {
     await this.db.query("UPDATE transaction_intents SET status='expired' WHERE id=$1",[r.id]);continue;
    }
    if(!status&&height<=Number(r.last_valid_block_height)) {
     const tx=Transaction.from(Buffer.from(r.transaction_base64,"base64"));
     if(tx.verifySignatures(true))await rpc.sendRawTransaction(tx.serialize(),{maxRetries:2});
    }
   } catch {console.error(JSON.stringify({code:"RECONCILE_RETRY",intentId:r.id}));}
  }
 }
 async project(intent:any,minSlot:number) {
  const effects=intent.effects,row=await this.service.rawEvent(intent.event_id),chain=this.service.chain;
  const eventKey=new PublicKey(row.event_pda);
  const participant=effects.participant?new PublicKey(effects.participant):null;
  const reservation=participant?pda(chain.programId,"reservation",eventKey.toBytes(),participant.toBytes()):null;
  const disputeKey=reservation?pda(chain.programId,"dispute",reservation.toBytes()):null;
  const scannerKey=effects.scannerWallet?pda(chain.programId,"scanner",eventKey.toBytes(),new PublicKey(effects.scannerWallet).toBytes()):null;
  const keys=[eventKey,...(reservation?[reservation,disputeKey!]:[]),...(scannerKey?[scannerKey]:[])];
  const snapshot=await chain.connection.getMultipleAccountsInfoAndContext(keys,{commitment:"finalized",minContextSlot:minSlot});
  const decode=(name:string,info:any)=>{
   ensure(info&&info.owner.equals(chain.programId),422,"INVALID_ACCOUNT_OWNER");
   const n=chain.idl.accounts?.find(a=>a.name.toLowerCase()===name.toLowerCase())?.name;
   ensure(n,503,"INVALID_IDL");return chain.accounts.decode(n,info.data) as any;
  };
  const e=decode("Event",snapshot.value[0]),r=reservation?decode("Reservation",snapshot.value[1]):null;
  ensure(e.organizer.toBase58()===row.organizer,422,"INVALID_EVENT_OWNER");
  if(r)ensure(r.event.equals(eventKey)&&r.participant.equals(participant!),422,"INVALID_RESERVATION");
  const dispute=reservation&&snapshot.value[2]?decode("Dispute",snapshot.value[2]):null;
  const scanner=scannerKey?decode("Scanner",snapshot.value[reservation?3:1]):null;
  if(dispute)ensure(dispute.event.equals(eventKey)&&dispute.reservation.equals(reservation!)&&dispute.participant.equals(participant!),422,"INVALID_DISPUTE");
  await this.db.transaction(async sql=>{
   const locked=(await sql.query("SELECT * FROM events WHERE id=$1 FOR UPDATE",[row.id])).rows[0]!;
   // A registration can finalize before the earlier metadata intent is projected. Apply the
   // matching already-approved metadata before persisting the first terms lock.
   if(!locked.terms_locked&&Buffer.from(locked.metadata_hash).toString('hex')!==Buffer.from(e.metadata_hash).toString('hex')) {
    const pending=(await sql.query("SELECT effects FROM transaction_intents WHERE event_id=$1 AND effects->>'metadataHash'=$2 ORDER BY created_at DESC LIMIT 1",[row.id,Buffer.from(e.metadata_hash).toString('hex')])).rows[0];
    ensure(pending?.effects.metadata,503,"METADATA_RECONCILIATION_REQUIRED");
    const m=pending.effects.metadata;
    await sql.query("UPDATE events SET title=$2,description=$3,location=$4,metadata_hash=$5 WHERE id=$1",[row.id,m.title,m.description,m.location,Buffer.from(e.metadata_hash)]);
   }
   if(effects.metadata&&Buffer.from(e.metadata_hash).toString("hex")===effects.metadataHash) {
    await sql.query("UPDATE events SET title=$2,description=$3,location=$4,metadata_hash=$5 WHERE id=$1",
     [row.id,effects.metadata.title,effects.metadata.description,effects.metadata.location,Buffer.from(e.metadata_hash)]);
   }
   if(Number(locked.projection_slot)<=snapshot.context.slot)await sql.query(
    "UPDATE events SET status=$2,registrations_created=$3,occupied_seats=$4,held_offers=$5,terms_locked=$6,projection_slot=$7,updated_at=$8 WHERE id=$1",
    [row.id,e.status===1?"open":e.status===2?"cancelled":"closed",e.registrations_created,e.occupied_seats,e.held_offers,e.terms_locked,snapshot.context.slot,new Date(this.now())]);
   if(r) {
    const id=effects.registrationId??randomUUID(),p=policyView(r.policy_snapshot);
    await sql.query("INSERT INTO registrations(id,event_id,wallet,reservation_pda,status,policy_snapshot,policy_hash,deposit_lamports,participant_paid_lamports,organizer_allocated_lamports,organizer_paid_lamports,dispute_deadline,attended_at,transaction_signature,projection_slot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT(event_id,wallet) DO UPDATE SET status=excluded.status,participant_paid_lamports=excluded.participant_paid_lamports,organizer_allocated_lamports=excluded.organizer_allocated_lamports,organizer_paid_lamports=excluded.organizer_paid_lamports,attended_at=excluded.attended_at,transaction_signature=excluded.transaction_signature,projection_slot=excluded.projection_slot WHERE registrations.projection_slot<=excluded.projection_slot",
     [id,row.id,r.participant.toBase58(),reservation!.toBase58(),statuses[r.status],JSON.stringify(p),Buffer.from(r.policy_hash),
      p.depositLamports,r.participant_paid_lamports.toString(),r.organizer_allocated_lamports.toString(),r.organizer_paid_lamports.toString(),
      new Date((p.checkInClosesAt+86400)*1000),Number(r.attended_at)>0?new Date(Number(r.attended_at)*1000):null,intent.signature,snapshot.context.slot]);
    if(intent.kind==="register") {
     await sql.query("UPDATE waitlist_entries SET status='accepted' WHERE event_id=$1 AND wallet=$2",[row.id,r.participant.toBase58()]);
     if(effects.offerId)await sql.query("UPDATE seat_offers SET status='accepted' WHERE id=$1",[effects.offerId]);
    }
    if(dispute)await sql.query("UPDATE disputes SET status=$1,outcome=$2,opened_at=$3,resolved_at=$4,resolution_signature=$5,projection_slot=$8 WHERE registration_id=(SELECT id FROM registrations WHERE event_id=$6 AND wallet=$7) AND projection_slot<=$8",
     [dispute.outcome===0?"open":"resolved",dispute.outcome===0?null:dispute.outcome===1?"participant":"organizer",
      new Date(Number(dispute.opened_at)*1000),dispute.outcome===0?null:new Date(Number(dispute.resolved_at)*1000),
      dispute.outcome===0?null:intent.signature,row.id,r.participant.toBase58(),snapshot.context.slot]);
    if(effects.qrId&&r.status===1) {
     const qr=(await sql.query("UPDATE qr_challenges SET consumed_at=$2 WHERE id=$1 AND token_hash=$3 AND consumed_at IS NULL RETURNING id",[effects.qrId,new Date(this.now()),Buffer.from(r.qr_nonce_hash)])).rows[0];
     if(qr)await sql.query("INSERT INTO attendance_records(registration_id,scanner_wallet,qr_challenge_id,signature,confirmed_at) VALUES((SELECT id FROM registrations WHERE event_id=$1 AND wallet=$2),$3,$4,$5,$6) ON CONFLICT DO NOTHING",
      [row.id,r.participant.toBase58(),effects.scanner,qr.id,intent.signature,new Date(this.now())]);
    }
   }
   if(scanner)await sql.query("INSERT INTO event_scanners(event_id,wallet,active,scanner_pda) VALUES($1,$2,$3,$4) ON CONFLICT(event_id,wallet) DO UPDATE SET active=excluded.active",
    [row.id,effects.scannerWallet,scanner.active,pda(chain.programId,"scanner",eventKey.toBytes(),new PublicKey(effects.scannerWallet).toBytes()).toBase58()]);
   await sql.query("INSERT INTO chain_events(signature,instruction_index,slot,event_pda,event_type,payload,commitment) VALUES($1,0,$2,$3,$4,$5,'finalized') ON CONFLICT DO NOTHING",
    [intent.signature,minSlot,row.event_pda,intent.kind,JSON.stringify({intentId:intent.id})]);
   await sql.query("UPDATE transaction_intents SET status='confirmed',projected_at=$2 WHERE id=$1",[intent.id,new Date(this.now())]);
  });
 }
 async queueOffers() {
  const events=(await this.db.query("SELECT * FROM events WHERE status='open' AND check_in_opens_at>$1",[new Date(this.now())])).rows;
  for(const row of events) {
   const e=await this.service.chainEvent(row);
   if(e.status!==1)continue;
   // Chain snapshot before transaction; pending jobs additionally reserve local scheduling capacity.
   await this.db.transaction(async sql=>{
    await sql.query("SELECT id FROM events WHERE id=$1 FOR UPDATE",[row.id]);
    const pending=Number((await sql.query("SELECT count(*) AS n FROM seat_offers WHERE event_id=$1 AND status='pending'",[row.id])).rows[0]!.n);
    if(Number(e.occupied_seats)+Number(e.held_offers)+pending>=Number(e.capacity)||
       Number(e.registrations_created)+Number(e.held_offers)+pending>=Number(e.registration_limit))return;
    const next=(await sql.query("SELECT w.* FROM waitlist_entries w WHERE w.event_id=$1 AND w.status='queued' AND NOT EXISTS(SELECT 1 FROM registrations r WHERE r.event_id=w.event_id AND r.wallet=w.wallet) ORDER BY w.created_at,w.id FOR UPDATE OF w SKIP LOCKED LIMIT 1",[row.id])).rows[0];
    if(!next)return;
    const offerId=randomUUID(),expiresAt=Math.min(Math.floor(this.now()/1000)+900,Number(e.policy.check_in_opens_at));
    if(expiresAt<=this.now()/1000)return;
    await sql.query("INSERT INTO seat_offers(id,entry_id,event_id,wallet,expires_at,status) VALUES($1,$2,$3,$4,$5,'pending')",[offerId,next.id,row.id,next.wallet,new Date(expiresAt*1000)]);
    await sql.query("UPDATE waitlist_entries SET status='offered' WHERE id=$1",[next.id]);
    await sql.query("INSERT INTO outbox_jobs(dedupe_key,kind,payload) VALUES($1,'offer',$2) ON CONFLICT DO NOTHING",["offer:"+offerId,JSON.stringify({offerId,eventId:row.id,wallet:next.wallet,expiresAt})]);
   });
  }
 }
 async jobs() {
  const jobs=await this.db.transaction(async sql=>{
   const rows=(await sql.query("SELECT * FROM outbox_jobs WHERE (status='pending' AND available_at<=$1) OR (status='leased' AND lease_expires_at<=$1) ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 20",[new Date(this.now())])).rows;
   for(const row of rows) {
    row.lease_token=randomUUID();
    await sql.query("UPDATE outbox_jobs SET status='leased',lease_token=$2,lease_expires_at=$3,attempts=attempts+1 WHERE id=$1",[row.id,row.lease_token,new Date(this.now()+60000)]);
   }
   return rows;
  });
  for(const job of jobs) {
   try {
    const {offerId,eventId,wallet,expiresAt}=job.payload,chain=this.service.chain,row=await this.service.rawEvent(eventId);
    const event=new PublicKey(row.event_pda),offer=pda(chain.programId,"offer",event.toBytes(),uuidBytes(offerId));
    let state=await chain.account("SeatOffer",offer);
    if(!state) {
     ensure(expiresAt>this.now()/1000,410,"OFFER_EXPIRED");
     if(job.payload.intentId) {
      const previous=(await this.db.query("SELECT status FROM transaction_intents WHERE id=$1",[job.payload.intentId])).rows[0];
      if(previous?.status==='pending'||previous?.status==='confirmed')throw new Error("AWAITING_CHAIN");
     }
     const ix=chain.instruction("create_seat_offer",{offer_id:[...uuidBytes(offerId)],participant:new PublicKey(wallet),expires_at:new (await import("@seatback/chain-client")).BN(expiresAt)},
      {event,offer,gate:this.service.gate.publicKey,system_program:new PublicKey("11111111111111111111111111111111")});
     const intent=await this.service.intents.create("offer",this.service.gate.publicKey.toBase58(),eventId,ix,{offerId},this.service.gate);
     await this.db.query("UPDATE outbox_jobs SET payload=payload||$3::jsonb WHERE id=$1 AND lease_token=$2",[job.id,job.lease_token,JSON.stringify({intentId:intent.intentId})]);
     const tx=Transaction.from(Buffer.from(intent.transactionBase64,"base64"));tx.partialSign(this.service.gate);
     await this.service.intents.submit(intent.intentId,serializePartial(tx),this.service.gate.publicKey.toBase58());
     // Job retry probes PDA; it never creates a second offer UUID.
     throw new Error("AWAITING_CHAIN");
    }
    state=await chain.account("SeatOffer",offer,"finalized");
    if(!state)throw new Error("AWAITING_FINALITY");
    await this.db.transaction(async sql=>{
     const lease=(await sql.query("SELECT id FROM outbox_jobs WHERE id=$1 AND lease_token=$2 AND status='leased' FOR UPDATE",[job.id,job.lease_token])).rows[0];
     if(!lease)return;
     await sql.query("UPDATE seat_offers SET status=$2,offer_pda=$3 WHERE id=$1",[offerId,state.status===0?"active":state.status===1?"accepted":"expired",offer.toBase58()]);
     await sql.query("UPDATE outbox_jobs SET status='done' WHERE id=$1",[job.id]);
    });
   } catch {
    const dead=Number(job.attempts)>=20;
    await this.db.query("UPDATE outbox_jobs SET status=$3,available_at=$4,last_error_code='RETRY' WHERE id=$1 AND lease_token=$2 AND status='leased'",
     [job.id,job.lease_token,dead?"dead":"pending",new Date(this.now()+Math.min(60000,1000*2**Math.min(Number(job.attempts),6)))]);
    if(dead&&job.kind==="offer") {
     // No chain hold may be assumed absent just because retries exhausted. Keep pending for operator reconciliation.
     console.error(JSON.stringify({code:"OUTBOX_NEEDS_RECONCILIATION",jobId:job.id}));
    }
   }
  }
 }
 async expireOffers() {
  const offers=(await this.db.query("SELECT * FROM seat_offers WHERE status IN ('active','pending') AND expires_at<=$1",[new Date(this.now())])).rows;
  for(const o of offers) {
   const row=await this.service.rawEvent(o.event_id),chain=this.service.chain,event=new PublicKey(row.event_pda);
   const offer=pda(chain.programId,"offer",event.toBytes(),uuidBytes(o.id)),state=await chain.account("SeatOffer",offer);
   if(state?.status===0) {
    if((await this.db.query("SELECT 1 FROM transaction_intents WHERE kind='expire_offer' AND effects->>'offerId'=$1 AND status='pending'",[o.id])).rows.length)continue;
    const ix=chain.instruction("expire_seat_offer",{},{event,offer});
    const intent=await this.service.intents.create("expire_offer",this.service.gate.publicKey.toBase58(),o.event_id,ix,{offerId:o.id},this.service.gate);
    const tx=Transaction.from(Buffer.from(intent.transactionBase64,"base64"));tx.partialSign(this.service.gate);
    await this.service.intents.submit(intent.intentId,serializePartial(tx),this.service.gate.publicKey.toBase58());
    continue;
   }
   const final=await chain.account("SeatOffer",offer,"finalized");
   if(final?.status===1)continue;
   if(final?.status===2||!state) {
    await this.db.transaction(async sql=>{
     await sql.query("UPDATE seat_offers SET status='expired' WHERE id=$1 AND status IN ('active','pending')",[o.id]);
     await sql.query("UPDATE waitlist_entries SET status='expired' WHERE id=$1 AND status='offered'",[o.entry_id]);
    });
   }
  }
 }
 async noShows() {
  const rows=(await this.db.query("SELECT r.*,e.event_pda,e.organizer FROM registrations r JOIN events e ON e.id=r.event_id WHERE r.status='reserved' AND e.status IN ('open','closed') AND e.check_in_closes_at<=$1 LIMIT 50",[new Date(this.now())])).rows;
  for(const r of rows) {
   const chain=this.service.chain,reservation=new PublicKey(r.reservation_pda),state=await chain.account("Reservation",reservation);
   if(state?.status!==0)continue;
   if((await this.db.query("SELECT 1 FROM transaction_intents WHERE kind='mark_no_show' AND effects->>'registrationId'=$1 AND status='pending'",[r.id])).rows.length)continue;
   const ix=chain.instruction("mark_no_show",{},{event:new PublicKey(r.event_pda),reservation,
    vault:pda(chain.programId,"vault",reservation.toBytes()),participant:new PublicKey(r.wallet),
    organizer:new PublicKey(r.organizer),actor:this.service.gate.publicKey});
   const intent=await this.service.intents.create("mark_no_show",this.service.gate.publicKey.toBase58(),r.event_id,ix,{registrationId:r.id,participant:r.wallet},this.service.gate);
   const tx=Transaction.from(Buffer.from(intent.transactionBase64,"base64"));tx.partialSign(this.service.gate);
   await this.service.intents.submit(intent.intentId,serializePartial(tx),this.service.gate.publicKey.toBase58());
  }
 }
 async tick() {await this.reconcile();await this.expireOffers();await this.noShows();await this.queueOffers();await this.jobs();}
}
