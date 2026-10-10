// Public configuration only. Private keypairs must be created by the operator outside Git.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const {PublicKey}=require('@solana/web3.js');
const root=fileURLToPath(new URL('../',import.meta.url));
export function validateAddresses(programId,authority) {
 for(const value of [programId,authority]) {
  if(!value || new PublicKey(value).toBase58()!==value || !PublicKey.isOnCurve(new PublicKey(value).toBytes()))
   throw new Error('Expected a locally generated keypair PUBLIC address');
 }
 if(programId===authority)throw new Error('Program and deployment wallet must be distinct');
}
export async function configure(programId,authority) {
 validateAddresses(programId,authority);
 const metadataPath=resolve(root,'deployment/devnet.json');
 let previous;
 try{previous=JSON.parse(await readFile(metadataPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(previous && (previous.programId!==programId || previous.upgradeAuthority!==authority))
  throw new Error('Existing identity differs; refusing automatic program/authority replacement');
 const rustPath=resolve(root,'programs/seatback/src/lib.rs');
 const rust=await readFile(rustPath,'utf8');
 if([...rust.matchAll(/declare_id!\("[^"]+"\);/g)].length!==1)throw new Error('Expected one declare_id');
 let anchor=await readFile(resolve(root,'Anchor.toml'),'utf8');
 if(!anchor.includes('cluster = "Devnet"'))throw new Error('Anchor must remain Devnet-only');
 const block=`[programs.devnet]\nseatback = "${programId}"\n`;
 anchor=anchor.replace(/\n\[programs\.devnet\][\s\S]*?(?=\n\[|$)/,'');
 anchor=anchor.replace(/# No deployed program address[\s\S]*$/,'');
 await writeFile(rustPath,rust.replace(/declare_id!\("[^"]+"\);/,`declare_id!("${programId}");`));
 await writeFile(resolve(root,'Anchor.toml'),anchor.trimEnd()+'\n\n'+block);
 for(const [path,key] of [['.env.example','SEATBACK_PROGRAM_ID'],['infra/docker/.env.example','SEATBACK_PROGRAM_ID'],['apps/web/.env.example','VITE_PROGRAM_ID']]) {
  const full=resolve(root,path),text=await readFile(full,'utf8');
  const expression=new RegExp(`^${key}=.*$`,'m');
  if(!expression.test(text))throw new Error('Missing public configuration setting '+key);
  await writeFile(full,text.replace(expression,`${key}=${programId}`));
 }
 await mkdir(resolve(root,'deployment'),{recursive:true});
 await writeFile(metadataPath,JSON.stringify({cluster:'devnet',programId,upgradeAuthority:authority,
  status:'prepared-not-deployed'},null,2)+'\n');
 console.log('Public identity configured. Regenerate compiler IDL before checks/build/deployment.');
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 try{await configure(process.argv[2],process.argv[3]);}catch(e){console.error(e.message);process.exitCode=1;}
}
