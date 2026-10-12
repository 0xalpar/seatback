import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveWorker} from '../../public-demo/live-worker.mjs';
const assets={'/index.html':{type:'text/html',body:'<html>Live</html>'}};
test('same-origin API proxy preserves secure cookies, origin and CSRF without redirects',async()=>{
 let forwarded;const worker=createLiveWorker(assets,async r=>{forwarded=r;return new Response('{}',{headers:{'Set-Cookie':'seatback=test; HttpOnly; Secure; SameSite=Lax'}})});
 const result=await worker.fetch(new Request('https://seatback.example/v1/auth/verify',{method:'POST',headers:{Origin:'https://seatback.example','X-CSRF-Token':'csrf',Cookie:'seatback=existing'},body:'{}'}),{SEATBACK_BACKEND_ORIGIN:'https://backend.example'});
 assert.equal(forwarded.url,'https://backend.example/v1/auth/verify');assert.equal(forwarded.headers.get('Origin'),'https://seatback.example');assert.equal(forwarded.headers.get('X-CSRF-Token'),'csrf');assert.equal(forwarded.headers.get('Cookie'),'seatback=existing');assert.equal(forwarded.redirect,'manual');assert.match(result.headers.get('Set-Cookie'),/HttpOnly; Secure/);assert.equal(result.headers.get('Cache-Control'),'no-store');
});
test('live hosting rejects local backend targets and serves CSP-protected SPA assets',async()=>{
 let called=false;const worker=createLiveWorker(assets,async()=>{called=true;throw Error('must not call')});
 assert.equal((await worker.fetch(new Request('https://seatback.example/health'),{SEATBACK_BACKEND_ORIGIN:'http://127.0.0.1:3001'})).status,503);assert.equal(called,false);
 const page=await worker.fetch(new Request('https://seatback.example/events'),{});assert.equal(await page.text(),'<html>Live</html>');assert.match(page.headers.get('Content-Security-Policy'),/connect-src 'self' https:\/\/api.devnet.solana.com/);
 assert.equal((await worker.fetch(new Request('https://seatback.example/assets/missing.js'),{})).status,404);
});
