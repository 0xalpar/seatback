import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {BorshAccountsCoder,BorshInstructionCoder,BN,type Idl} from "@coral-xyz/anchor";
import {PublicKey,SystemProgram,Transaction,TransactionInstruction,Connection,Keypair} from "@solana/web3.js";
import type {Policy} from "@seatback/contracts";
export {PublicKey,Transaction,Connection,Keypair,BN};
export function loadIdl():Idl { return JSON.parse(readFileSync(new URL("../idl/seatback.json",import.meta.url),"utf8")); }
export const uuidBytes=(id:string)=>Buffer.from(id.replaceAll("-",""),"hex");
export function pda(programId:PublicKey,prefix:string,...seeds:Uint8Array[]):PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from(prefix),...seeds],programId)[0];
}
export const policyArgs=(p:Policy)=>({deposit_lamports:new BN(p.depositLamports),
  rule1_deadline:new BN(p.rule1Deadline),rule2_deadline:new BN(p.rule2Deadline),
  check_in_opens_at:new BN(p.checkInOpensAt),check_in_closes_at:new BN(p.checkInClosesAt),
  event_starts_at:new BN(p.eventStartsAt),event_ends_at:new BN(p.eventEndsAt),dispute_seconds:86400});
export function policyDigest(p:Policy):Buffer {
  const bytes=Buffer.alloc(60);bytes.writeBigUInt64LE(BigInt(p.depositLamports),0);
  [p.rule1Deadline,p.rule2Deadline,p.checkInOpensAt,p.checkInClosesAt,p.eventStartsAt,p.eventEndsAt]
    .forEach((t,i)=>bytes.writeBigInt64LE(BigInt(t),8+i*8));
  bytes.writeUInt32LE(86400,56);
  return createHash("sha256").update("seatback:policy:v1").update(bytes).digest();
}
export function policyView(p:any):Policy {
  return {depositLamports:p.deposit_lamports.toString(),rule1Deadline:Number(p.rule1_deadline),
    rule2Deadline:Number(p.rule2_deadline),checkInOpensAt:Number(p.check_in_opens_at),
    checkInClosesAt:Number(p.check_in_closes_at),eventStartsAt:Number(p.event_starts_at),
    eventEndsAt:Number(p.event_ends_at),disputeSeconds:86400};
}
export class ChainClient {
  readonly instructions:BorshInstructionCoder;readonly accounts:BorshAccountsCoder;
  constructor(readonly connection:Connection,readonly programId:PublicKey,readonly idl:Idl=loadIdl()) {
    if(idl.address!==programId.toBase58())throw new Error("PROGRAM_ID_IDL_MISMATCH");
    this.instructions=new BorshInstructionCoder(idl);this.accounts=new BorshAccountsCoder(idl);
  }
  instruction(name:string,args:Record<string,unknown>,accounts:Record<string,PublicKey|null>):TransactionInstruction {
    const spec=this.idl.instructions.find(i=>i.name===name);
    if(!spec)throw new Error("UNKNOWN_INSTRUCTION "+name);
    const keys=spec.accounts.map(a=>{
      if("accounts" in a)throw new Error("NESTED_ACCOUNTS_UNSUPPORTED");
      const value=accounts[a.name]??(a.address?new PublicKey(a.address):null);
      if(!value&&!a.optional)throw new Error("MISSING_ACCOUNT "+a.name);
      return {pubkey:value??this.programId,isSigner:value?!!a.signer:false,isWritable:value?!!a.writable:false};
    });
    return new TransactionInstruction({programId:this.programId,keys,data:this.instructions.encode(name,args)});
  }
  async account(name:string,address:PublicKey,commitment:"confirmed"|"finalized"="confirmed"):Promise<any|null> {
    const info=await this.connection.getAccountInfo(address,commitment);
    if(!info)return null;
    if(!info.owner.equals(this.programId))throw new Error("INVALID_ACCOUNT_OWNER");
    const type=this.idl.accounts?.find(a=>a.name.toLowerCase()===name.toLowerCase())?.name;
    if(!type)throw new Error("UNKNOWN_ACCOUNT_TYPE");
    return this.accounts.decode(type,info.data);
  }
  async assertNetwork(local=false):Promise<void> {
    const genesis=await this.connection.getGenesisHash();
    if(genesis.startsWith("5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp") ||
      (!local&&genesis!=="EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG"))throw new Error("NON_DEVNET_RPC");
  }
}
export function mergeSignedTransactions(expected:Transaction,incoming:Transaction,caller:PublicKey,programId:PublicKey):Transaction {
  if(!expected.serializeMessage().equals(incoming.serializeMessage()))throw new Error("TRANSACTION_MESSAGE_CHANGED");
  if(expected.instructions.length!==1||!expected.instructions[0]!.programId.equals(programId))throw new Error("INVALID_PROGRAM");
  if(!expected.signatures.some(s=>s.publicKey.equals(caller)))throw new Error("UNEXPECTED_SIGNER");
  const callerSignature=incoming.signatures.find(s=>s.publicKey.equals(caller))?.signature;
  if(!callerSignature||!incoming.verifySignatures(false))throw new Error("INVALID_SIGNATURE");
  for(const s of incoming.signatures) {
    if(s.signature)expected.addSignature(s.publicKey,s.signature);
  }
  if(!expected.verifySignatures(false))throw new Error("INVALID_COMBINED_SIGNATURES");
  return expected;
}
export const serializePartial=(tx:Transaction)=>tx.serialize({requireAllSignatures:false,verifySignatures:true}).toString("base64");
export const systemProgram=SystemProgram.programId;
