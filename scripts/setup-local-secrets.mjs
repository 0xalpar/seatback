// Operator-authorized LOCAL setup only. Never run this script in GitHub Actions.
import {mkdir,readFile,writeFile,realpath} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const {Keypair}=require('@solana/web3.js');
if(process.env.CI)throw new Error('Local operator setup must not run in CI');
const directory=process.argv[2];
if(!directory || !isAbsolute(directory))throw new Error('Supply an absolute private directory outside Git');
const repository=await realpath(fileURLToPath(new URL('../',import.meta.url)));
await mkdir(directory,{recursive:true,mode:0o700});
const outside=await realpath(directory);
const rel=relative(repository,outside);
if(!rel || (!rel.startsWith('..')&&!isAbsolute(rel)))throw new Error('Secret directory must be outside Git');
if(process.platform==='win32') {
 const sid=execFileSync('whoami',['/user','/fo','csv','/nh'],{encoding:'utf8'}).match(/S-1-5-[0-9-]+/)?.[0];
 if(!sid)throw new Error('Cannot establish local owner SID');
 execFileSync('icacls',[outside,'/inheritance:r','/grant:r',`*${sid}:(OI)(CI)F`,'*S-1-5-18:(OI)(CI)F'],{stdio:'ignore'});
}
const publicKeys={};
for(const role of ['program','deployer','buffer','gate','arbiter','organizer','participant','replacement','scanner']) {
 const path=resolve(outside,role+'-keypair.json');
 let key;
 try{key=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await readFile(path,'utf8'))));}
 catch(e){if(e.code!=='ENOENT')throw new Error('Existing '+role+' key cannot be validated; preserved');
  key=Keypair.generate();await writeFile(path,JSON.stringify(Array.from(key.secretKey))+'\n',{flag:'wx',mode:0o600});}
 publicKeys[role]=key.publicKey.toBase58();
}
for(const name of ['postgres-password','session-secret','access-code-pepper']) {
 const path=resolve(outside,name);
 try{if((await readFile(path,'utf8')).trim().length<32)throw new Error('Existing secret too short; preserved');}
 catch(e){if(e.code!=='ENOENT')throw new Error('Existing '+name+' secret cannot be validated; preserved');
  await writeFile(path,randomBytes(32).toString('hex'),{flag:'wx',mode:0o600});}
}
// Only public addresses are emitted. Existing files are always reused and never overwritten.
console.log(JSON.stringify({directory:outside,publicKeys},null,2));
