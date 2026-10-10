import assert from "node:assert/strict";
let input="";
for await (const chunk of process.stdin)input+=chunk;
const {services}=JSON.parse(input);
const args=services.web.build.args;
assert.equal(args.VITE_PROGRAM_ID,services.api.environment.SEATBACK_PROGRAM_ID);
assert.equal(args.VITE_SEATBACK_PROGRAM_ID,args.VITE_PROGRAM_ID);
assert.equal(args.VITE_API_BASE,"");
assert.equal(args.VITE_API_BASE_URL,"");
for(const name of ["api","worker"]) {
  assert.equal(services[name].environment.SOLANA_CLUSTER,"devnet");
  assert.equal(services[name].environment.ALLOW_LOCAL_VALIDATOR,"false");
}
assert.equal(services.db.ports?.length??0,0);
console.log("Compose frontend/API environment alignment and Devnet-only configuration passed.");
