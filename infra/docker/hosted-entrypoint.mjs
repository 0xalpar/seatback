// Hosting adapter: platform secrets enter only at runtime, never image layers.
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {configureEnvironment} from './environment.mjs';
try {
  const mode=process.argv[2]??process.env.SEATBACK_SERVICE??'api';
  if(!['api','worker','migrate'].includes(mode))throw new Error('Invalid service');
  await configureEnvironment();
  if(mode!=='migrate' && !process.env.GATE_KEYPAIR_PATH) {
    const secret=JSON.parse(process.env.GATE_KEYPAIR_JSON??'null');
    if(!Array.isArray(secret)||secret.length!==64||!secret.every(n=>Number.isInteger(n)&&n>=0&&n<=255))throw new Error('Gate secret required');
    const directory=mkdtempSync(join(tmpdir(),'seatback-gate-'));
    const path=join(directory,'gate.json');
    writeFileSync(path,JSON.stringify(secret),{mode:0o600,flag:'wx'});
    process.env.GATE_KEYPAIR_PATH=path;
    delete process.env.GATE_KEYPAIR_JSON;
    process.on('exit',()=>rmSync(directory,{recursive:true,force:true}));
  }
  // Advisory-lock/checksum migrations are safe when both services restart together.
  await import('../../scripts/migrate.mjs');
  if(mode!=='migrate') {
    process.argv[2]=mode;
    await import('./entrypoint.mjs');
  }
} catch {
  console.error(JSON.stringify({code:'HOSTED_STARTUP_FAILED',message:'Check protected runtime configuration and migrations.'}));
  process.exit(1);
}
