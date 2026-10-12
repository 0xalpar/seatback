import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Only public configuration enters the browser bundle. Wallet/server secrets stay on Railway.
const deployment = JSON.parse(readFileSync(new URL('../deployment/devnet.json', import.meta.url), 'utf8'));
const idl = JSON.parse(readFileSync(new URL('../packages/chain-client/idl/seatback.json', import.meta.url), 'utf8'));
if (deployment.cluster !== 'devnet' || deployment.status !== 'deployed-verified' || idl.address !== deployment.programId) {
  throw new Error('Vercel build requires matching verified Devnet deployment and compiler IDL.');
}
const env = {
  ...process.env,
  VITE_API_BASE: '',
  VITE_API_BASE_URL: '',
  VITE_PROGRAM_ID: deployment.programId,
  VITE_SEATBACK_PROGRAM_ID: deployment.programId,
  VITE_SOLANA_RPC_URL: 'https://api.devnet.solana.com',
  VITE_DEMO_MODE: 'false',
  VITE_LOCAL_VALIDATOR: 'false',
};
for (const name of ['@seatback/contracts', '@seatback/web']) {
  execFileSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['--filter', name, 'build'], {
    env, stdio: 'inherit', shell: process.platform === 'win32',
  });
}
