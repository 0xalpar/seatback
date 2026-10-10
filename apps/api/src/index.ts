import {createBackend} from "./bootstrap.js";
const backend=await createBackend().catch(()=>{
 console.error(JSON.stringify({code:"BACKEND_STARTUP_FAILED",message:"Check backend configuration, database, signer and Devnet RPC."}));
 process.exit(1);
});
backend.server.listen(backend.config.port,"127.0.0.1",()=>console.log("SeatBack Devnet API ready on localhost:"+backend.config.port));
for(const signal of ["SIGINT","SIGTERM"] as const)process.on(signal,()=>{
 backend.server.close(()=>{void backend.db.close().then(()=>process.exit(0));});
});
