import test from 'node:test';
import assert from 'node:assert/strict';
import {authenticate} from '../src/authenticate';
const session={wallet:'wallet',csrfToken:'csrf',expiresAt:Math.floor(Date.now()/1000)+300};
const challenge={challengeId:'one-use',message:'domain-bound message',expiresAt:session.expiresAt};
test('login confirms the HttpOnly session before reporting success',async()=>{
 const calls:string[]=[];
 const request=async<T>(path:string,init?:RequestInit):Promise<T>=>{calls.push(path);if(path.endsWith('challenge')){assert.equal(JSON.parse(String(init?.body)).domain,'seatback.example');return challenge as T}return session as T};
 assert.deepEqual(await authenticate('wallet','https://seatback.example',request,async message=>{assert.equal(message,challenge.message);return 'signature'}),session);
 assert.deepEqual(calls,['/v1/auth/challenge','/v1/auth/verify','/v1/auth/session']);
});
test('lost verify response recovers only through a real session, without signature replay',async()=>{
 const calls:string[]=[];const request=async<T>(path:string):Promise<T>=>{calls.push(path);if(path.endsWith('challenge'))return challenge as T;if(path.endsWith('verify'))throw new TypeError('Failed to fetch');return session as T};
 await authenticate('wallet','https://seatback.example',request,async()=> 'signature');
 assert.equal(calls.filter(p=>p.endsWith('verify')).length,1);
});
test('blocked cookies and wallet failures never become successful authentication',async()=>{
 const request=async<T>(path:string):Promise<T>=>{if(path.endsWith('challenge'))return challenge as T;if(path.endsWith('session'))throw Error('UNAUTHENTICATED');return session as T};
 await assert.rejects(authenticate('wallet','https://seatback.example',request,async()=> 'signature'),/Confirming session cookie.*UNAUTHENTICATED/);
 await assert.rejects(authenticate('wallet','https://seatback.example',request,async()=>{throw Error('Failed to fetch')}),/Waiting for wallet message signature: Failed to fetch/);
});
