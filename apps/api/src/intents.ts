import {randomUUID} from "node:crypto";
import bs58 from "bs58";
import {Transaction,PublicKey,serializePartial,mergeSignedTransactions,ChainClient,Keypair} from "@seatback/chain-client";
import type {TransactionInstruction} from "@solana/web3.js";
import type {TxIntent,TxReceipt} from "@seatback/contracts";
import type {Database} from "./db.js";
import {sha} from "./security.js";
import {ensure,HttpError} from "./errors.js";
export class Intents {
 constructor(readonly db:Database,readonly chain:ChainClient,readonly now=()=>Date.now()) {}
 async create(kind:string,wallet:string,eventId:string,ix:TransactionInstruction,effects:Record<string,unknown>,cosigner?:Keypair):Promise<TxIntent> {
  const latest=await this.chain.connection.getLatestBlockhash("confirmed");
  const tx=new Transaction({feePayer:new PublicKey(wallet),recentBlockhash:latest.blockhash}).add(ix);
  if(cosigner)tx.partialSign(cosigner);
  const wire=serializePartial(tx),intentId=randomUUID(),expiresAt=Math.floor(this.now()/1000)+90;
  const msg=tx.compileMessage(),signers=msg.accountKeys.slice(0,msg.header.numRequiredSignatures).map(k=>k.toBase58());
  await this.db.query("INSERT INTO transaction_intents(id,wallet,event_id,kind,message_hash,expected_signers,transaction_base64,last_valid_block_height,expires_at,effects) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [intentId,wallet,eventId,kind,sha(tx.serializeMessage()),signers,wire,latest.lastValidBlockHeight,new Date(expiresAt*1000),JSON.stringify(effects)]);
  return {intentId,cluster:"devnet",transactionBase64:wire,expiresAt,lastValidBlockHeight:latest.lastValidBlockHeight,expectedSigner:wallet};
 }
 view(r:any):TxIntent {return {intentId:r.id,cluster:"devnet",transactionBase64:r.transaction_base64,
  expiresAt:Math.floor(new Date(r.expires_at).getTime()/1000),lastValidBlockHeight:Number(r.last_valid_block_height),expectedSigner:r.wallet};}
 async row(id:string,wallet:string) {
  const r=(await this.db.query("SELECT * FROM transaction_intents WHERE id=$1",[id])).rows[0];
  ensure(r&&r.expected_signers.includes(wallet),404,"INTENT_NOT_FOUND");return r;
 }
 async submit(id:string,wire:string,wallet:string):Promise<TxReceipt> {
  // Validate before the row lock; locks protect signature merging only, never RPC calls.
  const before=await this.row(id,wallet);
  if(before.signature)return {intentId:id,signature:before.signature,status:before.status==="failed"?"failed":before.status==="confirmed"?"confirmed":"pending"};
  ensure(new Date(before.expires_at).getTime()>this.now(),410,"INTENT_EXPIRED");
  ensure(await this.chain.connection.getBlockHeight("confirmed")<=Number(before.last_valid_block_height),410,"BLOCKHASH_EXPIRED");
  let incoming:Transaction;try{incoming=Transaction.from(Buffer.from(wire,"base64"));}catch{throw new HttpError(422,"INVALID_TRANSACTION");}
  const merged=await this.db.transaction(async sql=>{
   const r=(await sql.query("SELECT * FROM transaction_intents WHERE id=$1 FOR UPDATE",[id])).rows[0]!;
   if(r.signature)return {signature:String(r.signature),tx:null};
   ensure(r.status==="pending"&&new Date(r.expires_at).getTime()>this.now(),410,"INTENT_EXPIRED");
   let tx:Transaction;
   try{tx=mergeSignedTransactions(Transaction.from(Buffer.from(r.transaction_base64,"base64")),incoming,new PublicKey(wallet),this.chain.programId);}
   catch{throw new HttpError(422,"TRANSACTION_MISMATCH");}
   ensure(sha(tx.serializeMessage()).equals(Buffer.from(r.message_hash)),422,"INTENT_CORRUPTED");
   const complete=tx.signatures.every(s=>s.signature!==null);
   const signature=complete?bs58.encode(tx.signatures[0]!.signature!):null;
   await sql.query("UPDATE transaction_intents SET transaction_base64=$2,signature=$3 WHERE id=$1",[id,serializePartial(tx),signature]);
   return {signature,tx};
  });
  if(merged.tx&&merged.signature) {
   // Persist signature BEFORE broadcast, so retry/crash recovery resends identical bytes.
   try{await this.chain.connection.sendRawTransaction(merged.tx.serialize(),{skipPreflight:false,maxRetries:3});}
   catch{ /* Reconciliation determines authoritative outcome; timeout is not a failure. */ }
  }
  return {intentId:id,signature:merged.signature,status:"pending"};
 }
 async status(id:string,wallet:string):Promise<TxReceipt> {
  const r=await this.row(id,wallet);return {intentId:id,signature:r.signature??null,
   status:r.status==="confirmed"?"confirmed":r.status==="failed"||r.status==="expired"?"failed":"pending"};
 }
}
