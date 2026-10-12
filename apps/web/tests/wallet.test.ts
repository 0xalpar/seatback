import test from 'node:test';
import assert from 'node:assert/strict';
import {injectedWallet,messageSignature,type WalletProvider} from '../src/wallet.ts';
import {createApi} from '../src/api.ts';
test('injected Phantom and Solflare stay distinct when both are installed',()=>{
 const phantom={isPhantom:true} as WalletProvider,solflare={} as WalletProvider;
 assert.equal(injectedWallet('phantom',{phantom:{solana:phantom},solana:solflare,solflare}),phantom);
 assert.equal(injectedWallet('solflare',{phantom:{solana:phantom},solflare}),solflare);
 assert.equal(injectedWallet('phantom',{solana:solflare}),undefined);
});
test('wallet message signature normalization supports both provider result shapes',()=>{
 const bytes=new Uint8Array(64);assert.equal(messageSignature(bytes),bytes);assert.equal(messageSignature({signature:bytes}),bytes);
 assert.throws(()=>messageSignature(new Uint8Array(63)));
});
test('public demo rejects every mutation including authentication and fixture data routes',async()=>{
 for(const path of ['/v1/auth/challenge','/v1/me/registrations','/v1/organizer/events','/v1/transactions/submit'])
  await assert.rejects(createApi(true).request(path,{method:'POST',body:'{}'}),/Read-only demo/);
});
