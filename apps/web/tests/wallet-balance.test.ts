import test from 'node:test';
import assert from 'node:assert/strict';
import {readWalletBalance} from '../src/wallet-balance.ts';
test('wallet balances verify Devnet genesis before reading integer lamports',async()=>{
 const methods:string[]=[];
 const fetcher=(async(_url,options)=>{const body=JSON.parse(String(options?.body));methods.push(body.method);return new Response(JSON.stringify({result:body.method==='getGenesisHash'?'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG':{value:10000000}}));}) as typeof fetch;
 assert.equal(await readWalletBalance('public-address','https://api.devnet.solana.com',false,fetcher),'10000000');
 assert.deepEqual(methods,['getGenesisHash','getBalance']);
});
test('wallet balance refuses wrong networks and remote local overrides',async()=>{
 let calls=0;const fetcher=(async()=>{calls++;return new Response(JSON.stringify({result:'5eykt4UsMainnet'}));}) as typeof fetch;
 await assert.rejects(readWalletBalance('public-address','https://api.devnet.solana.com',false,fetcher),/Wrong Solana network/);assert.equal(calls,1);
 await assert.rejects(readWalletBalance('public-address','https://remote.example',true,fetcher),/loopback/);
 await assert.rejects(readWalletBalance('public-address','http://remote.example',false,fetcher),/HTTPS/);
});
