import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {validateAddresses} from '../scripts/configure-devnet.mjs';
import {inspectProgram,inspectTransaction,LOADER} from '../scripts/verify-devnet.mjs';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const {PublicKey}=require('@solana/web3.js');
const bs58=require('bs58').default;
// Public test identities only. No private keypair is generated or loaded by these tests.
const program='Fg6PaFpoGXkYsidMpWxTWqkZqA1QJRF9q8RJkZ8fCkU';
const authority='11111111111111111111111111111111';
test('Devnet configuration rejects malformed addresses and reused authority',()=>{
 assert.throws(()=>validateAddresses('mainnet',authority));
 assert.throws(()=>validateAddresses(authority,authority));
});
test('deployment verification checks loader, PDA, authority, exact bytecode and signed finalized transaction',()=>{
 const dataAddress=PublicKey.findProgramAddressSync([new PublicKey(program).toBytes()],new PublicKey(LOADER))[0].toBase58();
 const programData=Buffer.alloc(36);programData.writeUInt32LE(2);new PublicKey(dataAddress).toBuffer().copy(programData,4);
 const elf=Buffer.from('7f454c4601020304','hex'),data=Buffer.alloc(45+elf.length);
 data.writeUInt32LE(3);data.writeBigUInt64LE(123n,4);data[12]=1;new PublicKey(authority).toBuffer().copy(data,13);elf.copy(data,45);
 const account={executable:true,owner:LOADER,data:[programData.toString('base64'),'base64']};
 const dataAccount={executable:false,owner:LOADER,data:[data.toString('base64'),'base64']};
 assert.equal(inspectProgram(account,dataAccount,program,authority,elf).slot,123);
 assert.throws(()=>inspectProgram({...account,executable:false},dataAccount,program,authority,elf));
 assert.throws(()=>inspectProgram({...account,owner:authority},dataAccount,program,authority,elf));
 assert.throws(()=>inspectProgram(account,dataAccount,program,program,elf));
 assert.throws(()=>inspectProgram(account,dataAccount,program,authority,Buffer.alloc(elf.length)));
 const opcode=Buffer.alloc(4);opcode.writeUInt32LE(2);
 const tx={slot:123,meta:{err:null},transaction:{message:{header:{numRequiredSignatures:1},
  accountKeys:[authority,program,dataAddress,LOADER],instructions:[{programIdIndex:3,accounts:[1,2],data:bs58.encode(opcode)}]}}};
 inspectTransaction(tx,program,dataAddress,authority,123);
 assert.throws(()=>inspectTransaction({...tx,meta:{err:'failed'}},program,dataAddress,authority,123));
 assert.throws(()=>inspectTransaction(tx,program,dataAddress,authority,124));
 assert.throws(()=>inspectTransaction(tx,program,dataAddress,program,123));
 opcode.writeUInt32LE(1);tx.transaction.message.instructions[0].data=bs58.encode(opcode);
 assert.throws(()=>inspectTransaction(tx,program,dataAddress,authority,123));
});
