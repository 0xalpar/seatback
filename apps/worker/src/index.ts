import {createBackend} from "@seatback/api";
const backend=await createBackend().catch(()=>{
 console.error(JSON.stringify({code:"WORKER_STARTUP_FAILED",message:"Check backend configuration, database, signer and Devnet RPC."}));
 process.exit(1);
});
let stopping=false;
for(const signal of ["SIGINT","SIGTERM"] as const)process.on(signal,()=>{stopping=true;});
try {
 while(!stopping) {
  try{await backend.worker.tick();}catch{console.error(JSON.stringify({code:"WORKER_TICK_RETRY"}));}
  if(!stopping)await new Promise(resolve=>setTimeout(resolve,2000));
 }
} finally {await backend.db.close();}
