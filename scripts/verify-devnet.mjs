// Read-only verification: no wallet loading, faucet calls, signatures or chain writes.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const {PublicKey}=require('@solana/web3.js');
const bs58=require('bs58').default;
export const DEVNET_GENESIS='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const LOADER='BPFLoaderUpgradeab1e11111111111111111111111';
const bytes=account=>Buffer.from(account.data[0],'base64');
export function inspectProgram(programAccount,dataAccount,programId,authority,elf) {
 assert.ok(programAccount?.executable,'Program missing or not executable');
 assert.equal(programAccount.owner,LOADER,'Wrong program loader');
 const program=bytes(programAccount);
 assert.equal(program.length,36,'Invalid program account');
 assert.equal(program.readUInt32LE(0),2,'Expected upgradeable Program state');
 const dataAddress=new PublicKey(program.subarray(4,36)).toBase58();
 assert.equal(dataAddress,PublicKey.findProgramAddressSync([new PublicKey(programId).toBytes()],new PublicKey(LOADER))[0].toBase58(),'Wrong ProgramData PDA');
 assert.ok(dataAccount,'ProgramData missing');
 assert.equal(dataAccount.owner,LOADER,'Wrong ProgramData owner');
 assert.equal(dataAccount.executable,false);
 const data=bytes(dataAccount);
 assert.ok(data.length>=45+elf.length,'Truncated deployed binary');
 assert.equal(data.readUInt32LE(0),3,'Expected ProgramData state');
 assert.equal(data[12],1,'Upgrade authority unexpectedly removed');
 assert.equal(new PublicKey(data.subarray(13,45)).toBase58(),authority,'Unexpected upgrade authority');
 assert.deepEqual(data.subarray(45,45+elf.length),elf,'Deployed bytecode differs from local SBF');
 assert.ok(data.subarray(45+elf.length).every(b=>b===0),'Unexpected bytecode after local ELF');
 return {dataAddress,slot:Number(data.readBigUInt64LE(4)),sha256:createHash('sha256').update(elf).digest('hex')};
}
export function inspectTransaction(tx,programId,dataAddress,authority,slot) {
 assert.ok(tx && tx.meta && tx.meta.err===null,'Deployment transaction absent or failed');
 assert.equal(tx.slot,slot,'Transaction differs from latest deployment slot');
 const message=tx.transaction.message;
 const keys=message.accountKeys.map(k=>typeof k==='string'?k:k.pubkey);
 const signerCount=message.header.numRequiredSignatures;
 assert.ok(keys.slice(0,signerCount).includes(authority),'Upgrade authority did not sign');
 assert.ok(message.instructions.some(ix=>{
  if(keys[ix.programIdIndex]!==LOADER)return false;
  const data=Buffer.from(bs58.decode(ix.data));
  return data.length>=4 && [2,3].includes(data.readUInt32LE(0)) &&
   ix.accounts.map(i=>keys[i]).includes(programId) && ix.accounts.map(i=>keys[i]).includes(dataAddress);
 }),'No matching loader deploy/upgrade instruction');
}
export async function verify(elfPath,signature) {
 const metadata=JSON.parse(await readFile(new URL('../deployment/devnet.json',import.meta.url),'utf8'));
 assert.equal(metadata.cluster,'devnet');
 assert.equal(JSON.parse(await readFile(new URL('../packages/chain-client/idl/seatback.json',import.meta.url),'utf8')).address,metadata.programId);
 const elf=await readFile(elfPath);
 assert.equal(elf.subarray(0,4).toString('hex'),'7f454c46','Not an ELF binary');
 let id=0;
 const rpc=async(method,params=[])=>{
  const response=await fetch('https://api.devnet.solana.com',{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params}),signal:AbortSignal.timeout(30000)});
  assert.ok(response.ok,'Devnet RPC HTTP failure');
  const body=await response.json();assert.ok(!body.error,'Devnet RPC rejected '+method);return body.result;
 };
 assert.equal(await rpc('getGenesisHash'),DEVNET_GENESIS,'NON_DEVNET_RPC');
 const account=async(address,minContextSlot)=>{
  const config={encoding:'base64',commitment:'finalized',...(minContextSlot?{minContextSlot}:{})};
  return rpc('getAccountInfo',[address,config]);
 };
 const programResult=await account(metadata.programId);
 assert.ok(programResult.value?.executable,'Program is not deployed/executable on Devnet');
 const raw=bytes(programResult.value);
 assert.equal(raw.length,36);
 const dataAddress=new PublicKey(raw.subarray(4,36)).toBase58();
 const dataResult=await account(dataAddress,programResult.context.slot);
 const proof=inspectProgram(programResult.value,dataResult.value,metadata.programId,metadata.upgradeAuthority,elf);
 let signatures;
 if(signature){assert.equal(bs58.decode(signature).length,64);signatures=[signature];}
 else signatures=(await rpc('getSignaturesForAddress',[dataAddress,{commitment:'finalized',limit:20}]))
  .filter(r=>r.slot===proof.slot && r.err===null).map(r=>r.signature);
 let verifiedSignature;
 for(const candidate of signatures) {
  const tx=await rpc('getTransaction',[candidate,{encoding:'json',commitment:'finalized',maxSupportedTransactionVersion:0}]);
  try{inspectTransaction(tx,metadata.programId,dataAddress,metadata.upgradeAuthority,proof.slot);verifiedSignature=candidate;break;}catch(e){if(signature)throw e;}
 }
 assert.ok(verifiedSignature,'No verified deployment transaction in recent RPC history; supply its actual signature');
 // Re-read to detect a concurrent upgrade while checking the transaction.
 const finalData=await account(dataAddress,dataResult.context.slot);
 const finalProof=inspectProgram(programResult.value,finalData.value,metadata.programId,metadata.upgradeAuthority,elf);
 assert.equal(finalProof.slot,proof.slot,'Program changed during verification');
 return {cluster:'devnet',programId:metadata.programId,upgradeAuthority:metadata.upgradeAuthority,...proof,
  signature:verifiedSignature,explorer:`https://explorer.solana.com/tx/${verifiedSignature}?cluster=devnet`,
  verified:'finalized account, loader, authority, bytecode and deployment transaction; no financial instructions executed'};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 try{console.log(JSON.stringify(await verify(process.argv[2]??'target/deploy/seatback.so',process.argv[3]),null,2));}
 catch(e){console.error('Devnet verification failed: '+e.message);process.exitCode=1;}
}
