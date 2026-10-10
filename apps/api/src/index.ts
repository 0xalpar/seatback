import {createBackend} from "./bootstrap.js";
const backend=await createBackend();
backend.server.listen(backend.config.port,"127.0.0.1",()=>console.log("SeatBack Devnet API ready on localhost:"+backend.config.port));
for(const signal of ["SIGINT","SIGTERM"] as const)process.on(signal,()=>{
 backend.server.close(()=>{void backend.db.close().then(()=>process.exit(0));});
});
