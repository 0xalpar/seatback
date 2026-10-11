import test from 'node:test';import assert from 'node:assert/strict';
import {authTransport} from '../src/auth-transport';
test('transient challenge transport failure retries with credentials intact',async()=>{
 let calls=0;const transport:typeof fetch=async(_url,options)=>{assert.equal(options?.credentials,'include');if(++calls===1)throw new TypeError('Failed to fetch');return new Response('{}')};
 assert.equal((await authTransport('https://seatback.example/v1/auth/challenge',{method:'POST',credentials:'include'},'/v1/auth/challenge',transport)).status,200);assert.equal(calls,2);
});
test('verification transport failure is never blindly retried and HTTP errors stay visible',async()=>{
 let calls=0;await assert.rejects(authTransport('https://seatback.example/v1/auth/verify',{method:'POST'},'/v1/auth/verify',async()=>{calls++;throw TypeError('Failed to fetch')}),/Cannot reach \/v1\/auth\/verify/);assert.equal(calls,1);
 assert.equal((await authTransport('https://seatback.example/v1/auth/challenge',{},'/v1/auth/challenge',async()=>new Response('{}',{status:403}))).status,403);
});
