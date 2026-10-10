import {randomUUID} from "node:crypto";
import {PublicKey,Keypair,ChainClient,pda,uuidBytes,policyArgs,policyDigest,policyView,systemProgram} from "@seatback/chain-client";
import {validatePolicy,type CreateEventInput,type TxIntent} from "@seatback/contracts";
import type {Database} from "./db.js";
import type {Config} from "./config.js";
import {ensure,HttpError} from "./errors.js";
import {hashCode,verifyCode,sha,canonical,token} from "./security.js";
import {eventView,registrationView,waitlistView,disputeView} from "./views.js";
import {Intents} from "./intents.js";
const sec=(v:any)=>Math.floor(new Date(v).getTime()/1000);
export class SeatBackService {
 readonly intents:Intents;
 constructor(readonly db:Database,readonly chain:ChainClient,readonly gate:Keypair,readonly config:Config,readonly now=()=>Date.now()) {
  this.intents=new Intents(db,chain,now);
 }
 async initialize() {
  await this.chain.assertNetwork(this.config.localValidator);
  await this.db.query("INSERT INTO wallets(address) VALUES($1) ON CONFLICT DO NOTHING",[this.gate.publicKey.toBase58()]);
 }
 async rawEvent(id:string) {
  const row=(await this.db.query("SELECT * FROM events WHERE id=$1",[id])).rows[0];ensure(row,404,"EVENT_NOT_FOUND");return row;
 }
 async event(id:string,wallet?:string) {
  const row=await this.rawEvent(id);
  if(row.organizer===wallet)return row;
  ensure(row.status!=="draft",404,"EVENT_NOT_FOUND");
  if(row.visibility==="private") {
   ensure(wallet,404,"EVENT_NOT_FOUND");
   const allowed=(await this.db.query("SELECT 1 FROM event_access WHERE event_id=$1 AND wallet=$2 AND expires_at>$3 UNION ALL SELECT 1 FROM registrations WHERE event_id=$1 AND wallet=$2 UNION ALL SELECT 1 FROM waitlist_entries WHERE event_id=$1 AND wallet=$2 AND status IN ('queued','offered','accepted')",
    [id,wallet,new Date(this.now())])).rows.length>0;
   ensure(allowed,404,"EVENT_NOT_FOUND");
  }
  return row;
 }
 async chainEvent(row:any) {
  ensure(row.event_pda,409,"EVENT_NOT_PUBLISHED");
  const e=await this.chain.account("Event",new PublicKey(row.event_pda));
  ensure(e&&e.organizer.toBase58()===row.organizer,409,"EVENT_NOT_PUBLISHED");
  return e;
 }
 async capabilities(id:string,wallet:string) {
  const row=await this.rawEvent(id),e=await this.chainEvent(row);
  const scanner=await this.chain.account("Scanner",pda(this.chain.programId,"scanner",new PublicKey(row.event_pda).toBytes(),new PublicKey(wallet).toBytes()));
  return {canManage:e.organizer.toBase58()===wallet,canScan:e.organizer.toBase58()===wallet||!!scanner?.active,
   canArbitrate:e.dispute_authority.toBase58()===wallet};
 }
 async listEvents(wallet:string|undefined,organizer:boolean,q:string,limit:number,cursor:string|null) {
  const values:any[]=[cursor,limit+1,q];
  let filter="visibility='public' AND status<>'draft'";
  if(organizer){ensure(wallet,401,"UNAUTHENTICATED");values.push(wallet);filter="organizer=$4";}
  const rows=(await this.db.query("SELECT * FROM events WHERE "+filter+
   " AND ($1::uuid IS NULL OR id>$1) AND ($3='' OR to_tsvector('simple',title||' '||description||' '||location) @@ plainto_tsquery('simple',$3)) ORDER BY id LIMIT $2",values)).rows;
  return {items:rows.slice(0,limit).map(eventView),nextCursor:rows.length>limit?rows[limit-1]!.id:null};
 }
 async access(id:string,wallet:string,code:string) {
  const row=await this.rawEvent(id);
  ensure(row.status!=="draft"&&row.visibility==="private"&&verifyCode(code,row.access_code_hash,this.config.codePepper),404,"EVENT_NOT_FOUND");
  const expiresAt=Math.floor(this.now()/1000)+3600;
  await this.db.query("INSERT INTO event_access(event_id,wallet,expires_at) VALUES($1,$2,$3) ON CONFLICT(event_id,wallet) DO UPDATE SET expires_at=excluded.expires_at",
   [id,wallet,new Date(expiresAt*1000)]);return {eventId:id,expiresAt};
 }
 async createEvent(wallet:string,input:CreateEventInput) {
  validatePolicy(input.policy);ensure(input.policy.rule1Deadline>this.now()/1000,422,"DEADLINE_IN_PAST");
  ensure(input.registrationLimit>=input.capacity,422,"INVALID_CAPACITY");
  ensure(wallet!==this.config.disputeAuthority&&this.gate.publicKey.toBase58()!==this.config.disputeAuthority,422,"INVALID_ARBITER");
  const id=randomUUID(),organizer=new PublicKey(wallet);
  const event=pda(this.chain.programId,"event",organizer.toBytes(),uuidBytes(id));
  const metadataHash=sha(canonical({title:input.title,description:input.description,location:input.location,visibility:input.visibility}));
  const p=input.policy;
  await this.db.query("INSERT INTO events(id,organizer,event_pda,title,description,location,visibility,access_code_hash,capacity,registration_limit,deposit_lamports,rule1_deadline,rule2_deadline,check_in_opens_at,check_in_closes_at,event_starts_at,event_ends_at,gate_authority,dispute_authority,policy_hash,metadata_hash) VALUES("+Array.from({length:21},(_,i)=>"$"+(i+1)).join(",")+")",
   [id,wallet,event.toBase58(),input.title,input.description,input.location,input.visibility,input.visibility==="private"?hashCode(input.accessCode!,this.config.codePepper):null,
    input.capacity,input.registrationLimit,p.depositLamports,...[p.rule1Deadline,p.rule2Deadline,p.checkInOpensAt,p.checkInClosesAt,p.eventStartsAt,p.eventEndsAt].map(v=>new Date(v*1000)),
    this.gate.publicKey.toBase58(),this.config.disputeAuthority,policyDigest(p),metadataHash]);
  const ix=this.chain.instruction("create_event",{event_id:[...uuidBytes(id)],policy:policyArgs(p),capacity:input.capacity,
   registration_limit:input.registrationLimit,metadata_hash:[...metadataHash],gate_authority:this.gate.publicKey,dispute_authority:new PublicKey(this.config.disputeAuthority)},
   {event,organizer,system_program:systemProgram});
  return {eventId:id,intent:await this.intents.create("create_event",wallet,id,ix,{})};
 }
 async metadata(id:string,wallet:string,input:{title:string;description:string;location:string}) {
  const row=await this.rawEvent(id),e=await this.chainEvent(row);
  ensure(e.organizer.toBase58()===wallet,403,"FORBIDDEN");ensure(!e.terms_locked,409,"TERMS_LOCKED");
  const metadataHash=sha(canonical({...input,visibility:row.visibility}));
  const ix=this.chain.instruction("update_event_metadata",{metadata_hash:[...metadataHash]},
   {event:new PublicKey(row.event_pda),organizer:new PublicKey(wallet)});
  return this.intents.create("metadata",wallet,id,ix,{metadata:input,metadataHash:metadataHash.toString("hex")});
 }
 async registration(id:string,wallet:string,organizer=false) {
  const r=(await this.db.query("SELECT * FROM registrations WHERE id=$1",[id])).rows[0];ensure(r,404,"REGISTRATION_NOT_FOUND");
  const e=await this.rawEvent(r.event_id);
  ensure(organizer?e.organizer===wallet:r.wallet===wallet,403,"FORBIDDEN");return {r,e};
 }
 async reserve(id:string,wallet:string,offerId?:string):Promise<TxIntent> {
  const row=await this.event(id,wallet),e=await this.chainEvent(row),event=new PublicKey(row.event_pda),participant=new PublicKey(wallet);
  ensure(!participant.equals(e.dispute_authority),403,"ARBITER_CANNOT_PARTICIPATE");
  ensure(e.status===1&&Number(e.policy.check_in_opens_at)>this.now()/1000,409,"EVENT_CLOSED");
  ensure(e.gate_authority.equals(this.gate.publicKey),503,"GATE_UNAVAILABLE");
  const reservation=pda(this.chain.programId,"reservation",event.toBytes(),participant.toBytes());
  ensure(!(await this.chain.account("Reservation",reservation)),409,"ALREADY_REGISTERED");
  let offer:PublicKey|null=null;
  if(offerId) {
   const o=(await this.db.query("SELECT * FROM seat_offers WHERE id=$1 AND wallet=$2 AND event_id=$3 AND status='active'",[offerId,wallet,id])).rows[0];
   ensure(o&&sec(o.expires_at)>this.now()/1000,410,"OFFER_EXPIRED");
   offer=new PublicKey(o.offer_pda);
  }
  const ix=this.chain.instruction(offerId?"accept_seat_offer":"register",offerId?{}:{admission_nonce_hash:[...sha(token())]},
   {event,reservation,vault:pda(this.chain.programId,"vault",reservation.toBytes()),participant,gate:this.gate.publicKey,offer,system_program:systemProgram});
  return this.intents.create("register",wallet,id,ix,{registrationId:randomUUID(),participant:wallet,...(offerId?{offerId}:{})},this.gate);
 }
 async registrationAction(kind:string,id:string,wallet:string,extra:Record<string,unknown>={}) {
  const {r,e}=await this.registration(id,wallet,kind==="withdraw_allocation");
  await this.chainEvent(e);
  const event=new PublicKey(e.event_pda),reservation=new PublicKey(r.reservation_pda);
  const accounts:Record<string,PublicKey|null>={event,reservation,vault:pda(this.chain.programId,"vault",reservation.toBytes()),
   participant:new PublicKey(r.wallet),organizer:new PublicKey(e.organizer),actor:new PublicKey(wallet)};
  let args:Record<string,unknown>={},effects:Record<string,unknown>={registrationId:id,participant:r.wallet};
  if(kind==="claim_cancelled_event_refund") {
   const d=await this.chain.account("Dispute",pda(this.chain.programId,"dispute",reservation.toBytes()));
   accounts.dispute=d?pda(this.chain.programId,"dispute",reservation.toBytes()):null;
  }
  if(kind==="open_dispute") {
   const disputeId=randomUUID(),evidenceText=String(extra.evidenceText),evidenceHash=sha(evidenceText);
   accounts.dispute=pda(this.chain.programId,"dispute",reservation.toBytes());accounts.system_program=systemProgram;
   await this.db.query("INSERT INTO disputes(id,registration_id,dispute_pda,evidence_text,evidence_hash,status) VALUES($1,$2,$3,$4,$5,'pending') ON CONFLICT(registration_id) DO NOTHING",
    [disputeId,id,accounts.dispute.toBase58(),evidenceText,evidenceHash]);
   const actual=(await this.db.query("SELECT * FROM disputes WHERE registration_id=$1",[id])).rows[0]!;
   ensure(actual.status==='pending'&&Buffer.from(actual.evidence_hash).equals(evidenceHash),409,"DISPUTE_ALREADY_EXISTS");
   args={evidence_hash:[...evidenceHash]};effects={...effects,disputeId:actual.id};
  }
  const intent=await this.intents.create(kind,wallet,e.id,this.chain.instruction(kind,args,accounts),effects);
  return kind==="open_dispute"?{disputeId:effects.disputeId,intent}:intent;
 }
 async cancelEvent(id:string,wallet:string) {
  const row=await this.rawEvent(id),e=await this.chainEvent(row);ensure(e.organizer.toBase58()===wallet,403,"FORBIDDEN");
  const ix=this.chain.instruction("cancel_event",{},{event:new PublicKey(row.event_pda),organizer:new PublicKey(wallet)});
  return this.intents.create("cancel_event",wallet,id,ix,{});
 }
 async scanner(id:string,wallet:string,scannerWallet:string,active:boolean) {
  const row=await this.rawEvent(id),e=await this.chainEvent(row);ensure(e.organizer.toBase58()===wallet,403,"FORBIDDEN");
  const event=new PublicKey(row.event_pda),scanner=new PublicKey(scannerWallet);
  await this.db.query("INSERT INTO wallets(address) VALUES($1) ON CONFLICT DO NOTHING",[scannerWallet]);
  const ix=this.chain.instruction("set_scanner",{wallet:scanner,active},{event,organizer:new PublicKey(wallet),
   scanner:pda(this.chain.programId,"scanner",event.toBytes(),scanner.toBytes()),system_program:systemProgram});
  return this.intents.create("scanner",wallet,id,ix,{scannerWallet,active});
 }
 async listRegistrations(wallet:string,eventId:string|undefined,limit:number,cursor:string|null) {
  if(eventId) {const c=await this.capabilities(eventId,wallet);ensure(c.canManage||c.canScan,403,"FORBIDDEN");}
  const rows=(await this.db.query("SELECT * FROM registrations WHERE "+(eventId?"event_id=$1":"wallet=$1")+
   " AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3",[eventId??wallet,cursor,limit+1])).rows;
  return {items:rows.slice(0,limit).map(registrationView),nextCursor:rows.length>limit?rows[limit-1]!.id:null};
 }
 async waitlist(id:string,wallet:string,leave=false) {
  const row=await this.event(id,wallet),e=await this.chainEvent(row);
  if(leave) {
   await this.db.query("UPDATE waitlist_entries SET status='left' WHERE event_id=$1 AND wallet=$2 AND status IN ('queued','offered')",[id,wallet]);
   return null; // Existing on-chain hold expires; leaving does not bypass its clock.
  }
  ensure(e.status===1&&Number(e.policy.check_in_opens_at)>this.now()/1000,409,"EVENT_CLOSED");
  ensure(Number(e.registrations_created)<Number(e.registration_limit),409,"REGISTRATION_LIMIT_REACHED");
  const rp=pda(this.chain.programId,"reservation",new PublicKey(row.event_pda).toBytes(),new PublicKey(wallet).toBytes());
  ensure(!(await this.chain.account("Reservation",rp)),409,"ALREADY_REGISTERED");
  await this.db.query("INSERT INTO waitlist_entries(event_id,wallet) VALUES($1,$2) ON CONFLICT(event_id,wallet) DO NOTHING",[id,wallet]);
  const result=(await this.db.query("SELECT w.*,(SELECT count(*) FROM waitlist_entries q WHERE q.event_id=w.event_id AND q.status='queued' AND (q.created_at,q.id)<=(w.created_at,w.id)) AS position FROM waitlist_entries w WHERE w.event_id=$1 AND w.wallet=$2",[id,wallet])).rows[0]!;
  ensure(result.status==='queued'||result.status==='offered',409,"WAITLIST_ENTRY_CLOSED");
  return waitlistView(result);
 }
 async listWaitlist(wallet:string,limit:number,cursor:string|null) {
  const rows=(await this.db.query("SELECT w.*,o.id AS offer_id,o.expires_at AS offer_expires_at,"+
   "(SELECT count(*) FROM waitlist_entries q WHERE q.event_id=w.event_id AND q.status='queued' AND (q.created_at,q.id)<=(w.created_at,w.id)) AS position "+
   "FROM waitlist_entries w LEFT JOIN seat_offers o ON o.entry_id=w.id AND o.status='active' WHERE w.wallet=$1 "+
   "AND ($2::uuid IS NULL OR w.id>$2) ORDER BY w.id LIMIT $3",[wallet,cursor,limit+1])).rows;
  return {items:rows.slice(0,limit).map(waitlistView),nextCursor:rows.length>limit?rows[limit-1]!.id:null};
 }
 async acceptOffer(id:string,wallet:string) {
  const o=(await this.db.query("SELECT * FROM seat_offers WHERE id=$1 AND wallet=$2",[id,wallet])).rows[0];
  ensure(o,404,"OFFER_NOT_FOUND");return this.reserve(o.event_id,wallet,id);
 }
 async qr(id:string,wallet:string) {
  const {r,e}=await this.registration(id,wallet);
  const state=await this.chain.account("Reservation",new PublicKey(r.reservation_pda));
  ensure(state?.status===0&&e.status==="open",409,"INVALID_REGISTRATION_STATE");
  const raw=token(),expiresAt=Math.floor(this.now()/1000)+60;
  await this.db.query("INSERT INTO qr_challenges(registration_id,token_hash,expires_at) VALUES($1,$2,$3)",[id,sha(raw),new Date(expiresAt*1000)]);
  return {token:raw,expiresAt};
 }
 async attendance(id:string,scanner:string,raw:string) {
  const caps=await this.capabilities(id,scanner);ensure(caps.canScan,403,"UNAUTHORIZED_SCANNER");
  const leased=await this.db.transaction(async sql=>{
   const q=(await sql.query("SELECT q.*,r.wallet,r.reservation_pda,r.event_id,r.id AS registration_id FROM qr_challenges q JOIN registrations r ON r.id=q.registration_id WHERE q.token_hash=$1 FOR UPDATE OF q",[sha(raw)])).rows[0];
   ensure(q&&q.event_id===id&&!q.consumed_at&&sec(q.expires_at)>this.now()/1000&&(!q.lease_expires_at||sec(q.lease_expires_at)<=this.now()/1000),410,"QR_EXPIRED_OR_USED");
   await sql.query("UPDATE qr_challenges SET lease_expires_at=$2 WHERE id=$1",[q.id,new Date(this.now()+120000)]);return q;
  });
  const e=await this.rawEvent(id),event=new PublicKey(e.event_pda),reservation=new PublicKey(leased.reservation_pda);
  const ix=this.chain.instruction("verify_attendance",{qr_nonce_hash:[...sha(raw)]},{event,reservation,
   vault:pda(this.chain.programId,"vault",reservation.toBytes()),participant:new PublicKey(leased.wallet),
   organizer:new PublicKey(e.organizer),actor:new PublicKey(scanner),participant_signer:new PublicKey(leased.wallet),
   scanner_authorization:caps.canManage?null:pda(this.chain.programId,"scanner",event.toBytes(),new PublicKey(scanner).toBytes())});
  const intent=await this.intents.create("attendance",scanner,id,ix,{registrationId:leased.registration_id,participant:leased.wallet,qrId:leased.id,scanner});
  await this.db.query("UPDATE qr_challenges SET intent_id=$2 WHERE id=$1",[leased.id,intent.intentId]);
  return {intent,participant:leased.wallet};
 }
 async attendanceIntents(wallet:string) {
  const rows=(await this.db.query("SELECT * FROM transaction_intents WHERE kind='attendance' AND $1=ANY(expected_signers) AND status='pending' AND expires_at>$2",[wallet,new Date(this.now())])).rows;
  return {items:rows.map(r=>({...this.intents.view(r),expectedSigner:wallet}))};
 }
 async disputes(wallet:string,arbiter:boolean,limit:number,cursor:string|null) {
  const rows=(await this.db.query("SELECT d.*,r.wallet,r.event_id,r.dispute_deadline FROM disputes d JOIN registrations r ON r.id=d.registration_id JOIN events e ON e.id=r.event_id "+
   "WHERE "+(arbiter?"e.dispute_authority":"r.wallet")+"=$1 AND ($2::uuid IS NULL OR d.id>$2) ORDER BY d.id LIMIT $3",[wallet,cursor,limit+1])).rows;
  return {items:rows.slice(0,limit).map(disputeView),nextCursor:rows.length>limit?rows[limit-1]!.id:null};
 }
 async resolveDispute(id:string,wallet:string,outcome:"participant"|"organizer") {
  const d=(await this.db.query("SELECT d.*,r.event_id,r.wallet,r.reservation_pda FROM disputes d JOIN registrations r ON r.id=d.registration_id WHERE d.id=$1",[id])).rows[0];
  ensure(d,404,"DISPUTE_NOT_FOUND");const e=await this.rawEvent(d.event_id),state=await this.chainEvent(e);
  ensure(state.dispute_authority.toBase58()===wallet,403,"FORBIDDEN");
  const reservation=new PublicKey(d.reservation_pda);
  const ix=this.chain.instruction("resolve_dispute",{outcome:outcome==="participant"?1:2},{event:new PublicKey(e.event_pda),reservation,
   vault:pda(this.chain.programId,"vault",reservation.toBytes()),participant:new PublicKey(d.wallet),organizer:new PublicKey(e.organizer),
   actor:new PublicKey(wallet),dispute:new PublicKey(d.dispute_pda)});
  return this.intents.create("resolve_dispute",wallet,e.id,ix,{registrationId:d.registration_id,participant:d.wallet,disputeId:id});
 }
}
