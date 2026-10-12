import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const source=await read('programs/seatback/src/lib.rs');
const program=source.match(/declare_id!\("([^"]+)"\)/)?.[1];
assert.ok(program,'Missing program declaration');
assert.equal(JSON.parse(await read('packages/chain-client/idl/seatback.json')).address,program,'Compiler IDL differs from program');
const anchor=await read('Anchor.toml');
assert.ok(anchor.includes('cluster = "Devnet"'));
let metadata;
try{metadata=JSON.parse(await read('deployment/devnet.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(metadata) {
 assert.equal(metadata.cluster,'devnet');
 assert.equal(metadata.programId,program);
 assert.match(anchor,new RegExp('\\[programs\\.devnet\\]\\s+seatback = "'+program+'"'));
 for(const [path,key] of [['.env.example','SEATBACK_PROGRAM_ID'],['infra/docker/.env.example','SEATBACK_PROGRAM_ID'],['apps/web/.env.example','VITE_PROGRAM_ID']])
  assert.equal((await read(path)).match(new RegExp('^'+key+'=(.*)$','m'))?.[1],program,path);
 console.log('Program, Anchor, compiler IDL and backend/frontend public examples match. This does not prove deployment.');
} else console.log('Development program and IDL match; local operator key generation and real Devnet configuration are still pending.');
// Validate active configuration only when explicitly invoked with --environment. CI has no operator secrets.
if(process.argv.includes('--environment')) {
 assert.ok(metadata,'Configure the locally generated public IDs first');
 for(const key of ['SEATBACK_PROGRAM_ID','VITE_PROGRAM_ID','VITE_SEATBACK_PROGRAM_ID'])
  if(process.env[key])assert.equal(process.env[key],program,key+' differs from compiler IDL');
}
