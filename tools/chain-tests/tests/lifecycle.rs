use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use solana_program_test::{ProgramTest, ProgramTestContext};
use solana_sdk::{account::Account, clock::Clock, instruction::Instruction,
    pubkey::Pubkey, signature::{Keypair, Signer}, transaction::Transaction, system_program,
    compute_budget::ComputeBudgetInstruction};
use seatback::{state::{Policy, Event, Reservation}, accounts as a, instruction as i};

fn addr(prefix:&[u8], seeds:&[&[u8]]) -> Pubkey {
    let mut all=vec![prefix];all.extend_from_slice(seeds);
    Pubkey::find_program_address(&all,&seatback::id()).0
}
fn ix(accounts:impl ToAccountMetas,data:impl InstructionData)->Instruction {
    Instruction {program_id:seatback::id(),accounts:accounts.to_account_metas(None),data:data.data()}
}
struct Harness {ctx:ProgramTestContext,nonce:u32}
impl Harness {
 async fn clock(&mut self,now:i64) {
    let mut clock:Clock=self.ctx.banks_client.get_sysvar().await.unwrap();
    clock.unix_timestamp=now;self.ctx.set_sysvar(&clock);
 }
 async fn send(&mut self,instruction:Instruction,signers:&[&Keypair])->bool {
    self.nonce+=1;
    let blockhash=self.ctx.banks_client.get_latest_blockhash().await.unwrap();
    let mut all=vec![&self.ctx.payer];all.extend_from_slice(signers);
    let tx=Transaction::new_signed_with_payer(&[ComputeBudgetInstruction::set_compute_unit_limit(300000+self.nonce),instruction],
        Some(&self.ctx.payer.pubkey()),&all,blockhash);
    self.ctx.banks_client.process_transaction(tx).await.is_ok()
 }
 async fn event(&mut self,key:Pubkey)->Event {
    let acc=self.ctx.banks_client.get_account(key).await.unwrap().unwrap();
    Event::try_deserialize(&mut acc.data.as_slice()).unwrap()
 }
 async fn reservation(&mut self,key:Pubkey)->Reservation {
    let acc=self.ctx.banks_client.get_account(key).await.unwrap().unwrap();
    Reservation::try_deserialize(&mut acc.data.as_slice()).unwrap()
 }
 async fn lamports(&mut self,key:Pubkey)->u64 {
    self.ctx.banks_client.get_account(key).await.unwrap().unwrap().lamports
 }
}
fn common(event:Pubkey,participant:Pubkey,organizer:Pubkey,actor:Pubkey)->a::Settlement {
 let reservation=addr(b"reservation",&[event.as_ref(),participant.as_ref()]);
 a::Settlement{event,reservation,vault:addr(b"vault",&[reservation.as_ref()]),participant,organizer,actor}
}
fn policy()->Policy {Policy{deposit_lamports:1_000_001,rule1_deadline:100,rule2_deadline:200,
 check_in_opens_at:300,event_starts_at:400,check_in_closes_at:500,event_ends_at:600,dispute_seconds:86400}}
async fn make_event(h:&mut Harness,n:u8,organizer:&Keypair,gate:&Keypair,arbiter:&Keypair,capacity:u32)->Pubkey {
 h.clock(1).await;
 let event=addr(b"event",&[organizer.pubkey().as_ref(),&[n;16]]);
 assert!(h.send(ix(a::CreateEvent{event,organizer:organizer.pubkey(),system_program:system_program::id()},
    i::CreateEvent{event_id:[n;16],policy:policy(),capacity,registration_limit:10,
        metadata_hash:[1;32],gate_authority:gate.pubkey(),dispute_authority:arbiter.pubkey()}),&[organizer]).await);
 event
}
async fn register(h:&mut Harness,event:Pubkey,p:&Keypair,gate:&Keypair,offer:Option<Pubkey>)->bool {
 let reservation=addr(b"reservation",&[event.as_ref(),p.pubkey().as_ref()]);
 let accounts=a::Register{event,reservation,vault:addr(b"vault",&[reservation.as_ref()]),
    participant:p.pubkey(),gate:gate.pubkey(),offer,system_program:system_program::id()};
 let data=if offer.is_some(){i::AcceptSeatOffer{}.data()}else{i::Register{admission_nonce_hash:[1;32]}.data()};
 h.send(Instruction{program_id:seatback::id(),accounts:accounts.to_account_metas(None),data},&[p,gate]).await
}
#[tokio::test]
async fn escrow_and_adversarial_lifecycle() {
 let organizer=Keypair::new();let gate=Keypair::new();let arbiter=Keypair::new();
 let alice=Keypair::new();let bob=Keypair::new();let attacker=Keypair::new();
 // Execute the compiled SBF artifact, including actual system-program CPI.
 let mut test=ProgramTest::new("seatback",seatback::id(),None);
 for key in [&organizer,&gate,&arbiter,&alice,&bob,&attacker] {
  test.add_account(key.pubkey(),Account{lamports:10_000_000_000,data:vec![],owner:system_program::id(),executable:false,rent_epoch:0});
 }
 let mut h=Harness{ctx:test.start_with_context().await,nonce:0};
 // Partial cancellation keeps organizer entitlement escrowed, then event cancellation restores all.
 let event=make_event(&mut h,1,&organizer,&gate,&arbiter,1).await;
 assert!(register(&mut h,event,&alice,&gate,None).await);
 assert!(!register(&mut h,event,&bob,&gate,None).await); // capacity race loser
 assert!(!register(&mut h,event,&alice,&gate,None).await); // lifetime duplicate
 let c=common(event,alice.pubkey(),organizer.pubkey(),alice.pubkey());
 let reservation=c.reservation;let vault=c.vault;let funded=h.lamports(vault).await;
 h.clock(100).await;
 assert!(h.send(ix(c,i::CancelReservation{}),&[&alice]).await);
 let r=h.reservation(reservation).await;
 assert_eq!(r.participant_paid_lamports,300000);
 assert_eq!(r.organizer_allocated_lamports,700001);
 assert_eq!(h.lamports(vault).await,funded-300000);
 assert!(!h.send(ix(common(event,alice.pubkey(),organizer.pubkey(),organizer.pubkey()),i::WithdrawAllocation{}),&[&organizer]).await);
 assert!(!h.send(ix(a::ManageEvent{event,organizer:organizer.pubkey()},i::UpdateEventMetadata{metadata_hash:[2;32]}),&[&organizer]).await);
 assert!(h.send(ix(a::ManageEvent{event,organizer:organizer.pubkey()},i::CancelEvent{}),&[&organizer]).await);
 let refund=a::CancelledRefund{event,reservation,vault,participant:alice.pubkey(),organizer:organizer.pubkey(),actor:attacker.pubkey(),dispute:None};
 assert!(h.send(ix(refund,i::ClaimCancelledEventRefund{}),&[&attacker]).await);
 assert_eq!(h.reservation(reservation).await.participant_paid_lamports,1000001);
 assert_eq!(h.lamports(vault).await,funded-1000001);
 let dup=a::CancelledRefund{event,reservation,vault,participant:alice.pubkey(),organizer:organizer.pubkey(),actor:attacker.pubkey(),dispute:None};
 assert!(!h.send(ix(dup,i::ClaimCancelledEventRefund{}),&[&attacker]).await);
 // Attendance requires the authorized scanner AND participant; replay cannot pay twice.
 let event=make_event(&mut h,2,&organizer,&gate,&arbiter,1).await;
 assert!(register(&mut h,event,&alice,&gate,None).await);h.clock(300).await;
 let c=common(event,alice.pubkey(),organizer.pubkey(),attacker.pubkey());
 let attendance=a::Attendance{event,reservation:c.reservation,vault:c.vault,participant:c.participant,organizer:c.organizer,actor:c.actor,
    participant_signer:alice.pubkey(),scanner_authorization:None};
 assert!(!h.send(ix(attendance,i::VerifyAttendance{qr_nonce_hash:[4;32]}),&[&alice,&attacker]).await);
 let c=common(event,alice.pubkey(),organizer.pubkey(),organizer.pubkey());
 let reservation=c.reservation;
 let attendance=a::Attendance{event,reservation:c.reservation,vault:c.vault,participant:c.participant,organizer:c.organizer,actor:c.actor,
    participant_signer:alice.pubkey(),scanner_authorization:None};
 assert!(h.send(ix(attendance,i::VerifyAttendance{qr_nonce_hash:[4;32]}),&[&alice,&organizer]).await);
 assert_eq!(h.reservation(reservation).await.participant_paid_lamports,1000001);
 // An unresolved dispute blocks every organizer allocation, not only its own reservation.
 let event=make_event(&mut h,3,&organizer,&gate,&arbiter,2).await;
 assert!(register(&mut h,event,&alice,&gate,None).await);assert!(register(&mut h,event,&bob,&gate,None).await);
 h.clock(500).await;
 let c=common(event,alice.pubkey(),organizer.pubkey(),alice.pubkey());
 let dispute=addr(b"dispute",&[c.reservation.as_ref()]);
 let open=a::OpenDispute{event,reservation:c.reservation,vault:c.vault,participant:c.participant,organizer:c.organizer,actor:c.actor,dispute,system_program:system_program::id()};
 assert!(h.send(ix(open,i::OpenDispute{evidence_hash:[9;32]}),&[&alice]).await);
 assert!(h.send(ix(common(event,bob.pubkey(),organizer.pubkey(),attacker.pubkey()),i::MarkNoShow{}),&[&attacker]).await);
 h.clock(86900).await; // exactly 500+86400
 assert!(!h.send(ix(common(event,bob.pubkey(),organizer.pubkey(),organizer.pubkey()),i::WithdrawAllocation{}),&[&organizer]).await);
 let c=common(event,alice.pubkey(),organizer.pubkey(),attacker.pubkey());
 let bad=a::ResolveDispute{event,reservation:c.reservation,vault:c.vault,participant:c.participant,organizer:c.organizer,actor:c.actor,dispute};
 assert!(!h.send(ix(bad,i::ResolveDispute{outcome:1}),&[&attacker]).await);
 let c=common(event,alice.pubkey(),organizer.pubkey(),arbiter.pubkey());
 let resolve=a::ResolveDispute{event,reservation:c.reservation,vault:c.vault,participant:c.participant,organizer:c.organizer,actor:c.actor,dispute};
 assert!(h.send(ix(resolve,i::ResolveDispute{outcome:1}),&[&arbiter]).await);
 assert_eq!(h.event(event).await.outstanding_disputes,0);
 assert!(h.send(ix(common(event,bob.pubkey(),organizer.pubkey(),organizer.pubkey()),i::WithdrawAllocation{}),&[&organizer]).await);
 assert!(!h.send(ix(common(event,bob.pubkey(),organizer.pubkey(),organizer.pubkey()),i::WithdrawAllocation{}),&[&organizer]).await);
 assert!(!h.send(ix(a::ManageEvent{event,organizer:organizer.pubkey()},i::CancelEvent{}),&[&organizer]).await);
 // Seat offers hold capacity; expiry is exact, wrong wallets cannot consume them.
 let event=make_event(&mut h,4,&organizer,&gate,&arbiter,1).await;
 let offer=addr(b"offer",&[event.as_ref(),&[7;16]]);
 assert!(h.send(ix(a::CreateOffer{event,offer,gate:gate.pubkey(),system_program:system_program::id()},
    i::CreateSeatOffer{offer_id:[7;16],participant:alice.pubkey(),expires_at:50}),&[&gate]).await);
 assert!(!register(&mut h,event,&bob,&gate,None).await);
 assert!(!register(&mut h,event,&bob,&gate,Some(offer)).await);
 h.clock(50).await;
 assert!(!register(&mut h,event,&alice,&gate,Some(offer)).await);
 assert!(h.send(ix(a::ExpireOffer{event,offer},i::ExpireSeatOffer{}),&[]).await);
 assert_eq!(h.event(event).await.held_offers,0);
 assert!(register(&mut h,event,&bob,&gate,None).await);
 // Exact early/late boundaries, payout substitution, wrong gate and arbiter exclusion.
 let event=make_event(&mut h,5,&organizer,&gate,&arbiter,2).await;
 assert!(!register(&mut h,event,&alice,&attacker,None).await);
 assert!(!register(&mut h,event,&arbiter,&gate,None).await);
 assert!(register(&mut h,event,&alice,&gate,None).await);
 assert!(register(&mut h,event,&bob,&gate,None).await);
 let mut forged=common(event,alice.pubkey(),organizer.pubkey(),alice.pubkey());forged.participant=attacker.pubkey();
 assert!(!h.send(ix(forged,i::CancelReservation{}),&[&alice]).await);
 let mut substituted=common(event,alice.pubkey(),organizer.pubkey(),alice.pubkey());
 substituted.vault=common(event,bob.pubkey(),organizer.pubkey(),bob.pubkey()).vault;
 assert!(!h.send(ix(substituted,i::CancelReservation{}),&[&alice]).await);
 assert!(!h.send(ix(common(event,alice.pubkey(),organizer.pubkey(),attacker.pubkey()),i::CancelReservation{}),&[&attacker]).await);
 h.clock(99).await;
 let c=common(event,alice.pubkey(),organizer.pubkey(),alice.pubkey());let r=c.reservation;
 assert!(h.send(ix(c,i::CancelReservation{}),&[&alice]).await);
 assert_eq!(h.reservation(r).await.participant_paid_lamports,1000001);
 h.clock(200).await;
 let c=common(event,bob.pubkey(),organizer.pubkey(),bob.pubkey());let r=c.reservation;let vault=c.vault;let before=h.lamports(vault).await;
 assert!(h.send(ix(c,i::CancelReservation{}),&[&bob]).await);
 assert_eq!(h.reservation(r).await.participant_paid_lamports,0);
 assert_eq!(h.reservation(r).await.organizer_allocated_lamports,1000001);
 h.clock(86899).await;
 assert!(!h.send(ix(common(event,bob.pubkey(),organizer.pubkey(),organizer.pubkey()),i::WithdrawAllocation{}),&[&organizer]).await);
 h.clock(86900).await;
 assert!(h.send(ix(a::FinalizeEvent{event},i::FinalizeEvent{}),&[]).await);
 assert!(h.send(ix(common(event,bob.pubkey(),organizer.pubkey(),organizer.pubkey()),i::WithdrawAllocation{}),&[&organizer]).await);
 assert_eq!(h.lamports(vault).await,before-1000001);
 assert_eq!(h.event(event).await.outstanding_lamports,0);
 // A valid offer is consumed once, including both held and occupied counters.
 let event=make_event(&mut h,6,&organizer,&gate,&arbiter,1).await;
 let offer=addr(b"offer",&[event.as_ref(),&[8;16]]);
 assert!(h.send(ix(a::CreateOffer{event,offer,gate:gate.pubkey(),system_program:system_program::id()},
    i::CreateSeatOffer{offer_id:[8;16],participant:alice.pubkey(),expires_at:50}),&[&gate]).await);
 h.clock(49).await;assert!(register(&mut h,event,&alice,&gate,Some(offer)).await);
 assert_eq!(h.event(event).await.held_offers,0);assert_eq!(h.event(event).await.occupied_seats,1);
 assert!(!register(&mut h,event,&alice,&gate,Some(offer)).await);
 assert!(!h.send(ix(a::ExpireOffer{event,offer},i::ExpireSeatOffer{}),&[]).await);
 // Delegated scanner revocation and mandatory participant signature.
 let event=make_event(&mut h,7,&organizer,&gate,&arbiter,2).await;
 assert!(register(&mut h,event,&alice,&gate,None).await);assert!(register(&mut h,event,&bob,&gate,None).await);
 let scanner=addr(b"scanner",&[event.as_ref(),attacker.pubkey().as_ref()]);
 let set=||a::SetScanner{event,organizer:organizer.pubkey(),scanner,system_program:system_program::id()};
 assert!(h.send(ix(set(),i::SetScanner{wallet:attacker.pubkey(),active:false}),&[&organizer]).await);
 h.clock(300).await;
 let attend=|p:Pubkey|{let c=common(event,p,organizer.pubkey(),attacker.pubkey());a::Attendance{event,reservation:c.reservation,vault:c.vault,participant:p,organizer:c.organizer,actor:c.actor,participant_signer:p,scanner_authorization:Some(scanner)}};
 assert!(!h.send(ix(attend(alice.pubkey()),i::VerifyAttendance{qr_nonce_hash:[4;32]}),&[&alice,&attacker]).await);
 assert!(h.send(ix(set(),i::SetScanner{wallet:attacker.pubkey(),active:true}),&[&organizer]).await);
 let mut missing=ix(attend(bob.pubkey()),i::VerifyAttendance{qr_nonce_hash:[5;32]});
 for meta in &mut missing.accounts {if meta.pubkey==bob.pubkey(){meta.is_signer=false;}}
 assert!(!h.send(missing,&[&attacker]).await);
 assert!(h.send(ix(attend(alice.pubkey()),i::VerifyAttendance{qr_nonce_hash:[4;32]}),&[&alice,&attacker]).await);
 assert!(!h.send(ix(attend(alice.pubkey()),i::VerifyAttendance{qr_nonce_hash:[4;32]}),&[&alice,&attacker]).await);
 // Cancellation resolves open disputes with full refund; dispute cutoff is strict.
 h.clock(500).await;
 let c=common(event,bob.pubkey(),organizer.pubkey(),bob.pubkey());let reservation=c.reservation;let vault=c.vault;
 let dispute=addr(b"dispute",&[reservation.as_ref()]);
 assert!(h.send(ix(a::OpenDispute{event,reservation,vault,participant:bob.pubkey(),organizer:organizer.pubkey(),actor:bob.pubkey(),dispute,system_program:system_program::id()},i::OpenDispute{evidence_hash:[6;32]}),&[&bob]).await);
 h.clock(86900).await;assert!(!h.send(ix(a::FinalizeEvent{event},i::FinalizeEvent{}),&[]).await);
 h.clock(86899).await; // Test-controlled clock for the before-cutoff cancellation path.
 assert!(h.send(ix(a::ManageEvent{event,organizer:organizer.pubkey()},i::CancelEvent{}),&[&organizer]).await);
 assert!(h.send(ix(a::CancelledRefund{event,reservation,vault,participant:bob.pubkey(),organizer:organizer.pubkey(),actor:attacker.pubkey(),dispute:Some(dispute)},i::ClaimCancelledEventRefund{}),&[&attacker]).await);
 assert_eq!(h.event(event).await.outstanding_disputes,0);
 assert_eq!(h.reservation(reservation).await.participant_paid_lamports,1000001);
 // Lifetime cap remains consumed after a full refund.
 let event=addr(b"event",&[organizer.pubkey().as_ref(),&[9;16]]);h.clock(1).await;
 assert!(h.send(ix(a::CreateEvent{event,organizer:organizer.pubkey(),system_program:system_program::id()},i::CreateEvent{event_id:[9;16],policy:policy(),capacity:1,registration_limit:1,metadata_hash:[1;32],gate_authority:gate.pubkey(),dispute_authority:arbiter.pubkey()}),&[&organizer]).await);
 assert!(register(&mut h,event,&alice,&gate,None).await);
 assert!(h.send(ix(common(event,alice.pubkey(),organizer.pubkey(),alice.pubkey()),i::CancelReservation{}),&[&alice]).await);
 assert!(!register(&mut h,event,&bob,&gate,None).await);
 // Organizer arbitration outcome and strict dispute cutoff, including lazy no-show settlement.
 let event=make_event(&mut h,10,&organizer,&gate,&arbiter,2).await;
 assert!(register(&mut h,event,&alice,&gate,None).await);assert!(register(&mut h,event,&bob,&gate,None).await);
 h.clock(499).await;assert!(!h.send(ix(common(event,bob.pubkey(),organizer.pubkey(),attacker.pubkey()),i::MarkNoShow{}),&[&attacker]).await);
 h.clock(500).await;
 let c=common(event,alice.pubkey(),organizer.pubkey(),alice.pubkey());let reservation=c.reservation;let vault=c.vault;
 let dispute=addr(b"dispute",&[reservation.as_ref()]);
 assert!(h.send(ix(a::OpenDispute{event,reservation,vault,participant:alice.pubkey(),organizer:organizer.pubkey(),actor:alice.pubkey(),dispute,system_program:system_program::id()},i::OpenDispute{evidence_hash:[7;32]}),&[&alice]).await);
 let resolve=||a::ResolveDispute{event,reservation,vault,participant:alice.pubkey(),organizer:organizer.pubkey(),actor:arbiter.pubkey(),dispute};
 assert!(h.send(ix(resolve(),i::ResolveDispute{outcome:2}),&[&arbiter]).await);
 assert!(!h.send(ix(resolve(),i::ResolveDispute{outcome:1}),&[&arbiter]).await);
 h.clock(86900).await;
 let c=common(event,bob.pubkey(),organizer.pubkey(),bob.pubkey());let bob_dispute=addr(b"dispute",&[c.reservation.as_ref()]);
 assert!(!h.send(ix(a::OpenDispute{event,reservation:c.reservation,vault:c.vault,participant:bob.pubkey(),organizer:organizer.pubkey(),actor:bob.pubkey(),dispute:bob_dispute,system_program:system_program::id()},i::OpenDispute{evidence_hash:[8;32]}),&[&bob]).await);
 assert!(h.send(ix(common(event,bob.pubkey(),organizer.pubkey(),attacker.pubkey()),i::SettleNoShow{}),&[&attacker]).await);
 assert!(h.send(ix(common(event,alice.pubkey(),organizer.pubkey(),organizer.pubkey()),i::WithdrawAllocation{}),&[&organizer]).await);
 assert!(h.send(ix(common(event,bob.pubkey(),organizer.pubkey(),organizer.pubkey()),i::WithdrawAllocation{}),&[&organizer]).await);
 assert_eq!(h.event(event).await.outstanding_lamports,0);
}
