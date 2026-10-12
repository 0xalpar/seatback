// Local, ignored receipt prevents signing an outdated binary after source/identity edits.
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const hash=b=>createHash('sha256').update(b).digest('hex');
async function sources(path) {
 const result=[];
 for(const e of await readdir(new URL(path,root),{withFileTypes:true})) {
  if(e.isDirectory())result.push(...await sources(path+e.name+'/'));
  else result.push(path+e.name);
 }
 return result;
}
const files=['Cargo.toml','Cargo.lock','rust-toolchain.toml','Anchor.toml','deployment/devnet.json',
 'programs/seatback/Cargo.toml','packages/chain-client/idl/seatback.json',...await sources('programs/seatback/src/')].sort();
const sourceHash=hash(Buffer.from((await Promise.all(files.map(async p=>p+':'+hash(await readFile(new URL(p,root)))))).join('\n')));
const binaryHash=hash(await readFile(new URL('target/deploy/seatback.so',root)));
const path=new URL('target/deploy/seatback-build.json',root);
if(process.argv[2]==='record')await writeFile(path,JSON.stringify({sourceHash,binaryHash},null,2)+'\n');
else {
 const previous=JSON.parse(await readFile(path,'utf8'));
 if(previous.sourceHash!==sourceHash || previous.binaryHash!==binaryHash)throw new Error('Source/identity/binary changed: rerun prepare-devnet.sh');
 console.log('Tested local build receipt matches current source, IDL, identity and binary.');
}
