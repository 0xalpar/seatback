// Public static preview only: no API/database/RPC tunnel, credentials or wallet signing.
import {spawnSync} from 'node:child_process';
import {mkdir,cp,writeFile,readFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const root=resolve(new URL('../',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
const env={...process.env,VITE_DEMO_MODE:'true',VITE_LOCAL_VALIDATOR:'false',VITE_API_BASE:'',VITE_API_BASE_URL:'',VITE_SOLANA_RPC_URL:'https://api.devnet.solana.com'};
const build=spawnSync(process.platform==='win32'?'pnpm.cmd':'pnpm',['--filter','@seatback/web','build'],{cwd:root,env,stdio:'inherit',shell:process.platform==='win32'});
if(build.status!==0)process.exit(build.status??1);
const target=join(root,'.cache/public-site');await mkdir(join(target,'.openai'),{recursive:true});
await cp(join(root,'apps/web/dist'),join(target,'dist'),{recursive:true});
await cp(join(root,'infra/public-demo/hosting.json'),join(target,'.openai/hosting.json'));
const indexPath=join(target,'dist/index.html');
const policy="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'none'";
await writeFile(indexPath,(await readFile(indexPath,'utf8')).replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="'+policy+'">'));
await writeFile(join(target,'README.md'),'# SeatBack public read-only preview\nGenerated from 0xalpar/seatback release/mvp. Example data only. No backend, wallet signing, local RPC, secrets or financial transactions.\n');
await writeFile(join(target,'dist/_headers'),'/*\n  Content-Security-Policy: default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\' https://fonts.googleapis.com; font-src \'self\' https://fonts.gstatic.com; img-src \'self\' data:; connect-src \'none\'; object-src \'none\'; frame-src \'none\'; base-uri \'self\'; form-action \'none\'\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n');
await writeFile(join(target,'dist/_redirects'),'/* /index.html 200\n');
for(const f of await readdir(join(target,'dist/assets'))){if(/\.(js|css)$/.test(f)&&/127\.0\.0\.1:8899|localhost:8899/.test(await readFile(join(target,'dist/assets',f),'utf8')))throw new Error('Local validator endpoint must never enter the public build');}
console.log('Public read-only assets prepared; outbound API/RPC connections disabled by CSP.');
