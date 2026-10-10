import {writeFile} from "node:fs/promises";
import {setTimeout as delay} from "node:timers/promises";
import {configureEnvironment} from "./environment.mjs";

// Container transport/lifecycle adapter. Business logic remains in the existing backend.
try {
  await configureEnvironment();
  const mode=process.argv[2];
  if(mode==="migrate") {
    await import("../../scripts/migrate.mjs");
  } else {
    if(!["api","worker"].includes(mode))throw new Error("Unknown service");
    const {createBackend}=await import("../../apps/api/dist/bootstrap.js");
    const backend=await createBackend(); // Unmodified config, IDL and Devnet genesis checks.
    let stopping=false;
    const abort=new AbortController();
    const stop=()=>{stopping=true;abort.abort();};
    process.on("SIGTERM",stop);process.on("SIGINT",stop);
    if(mode==="api") {
      await new Promise((resolve,reject)=>{
        backend.server.once("error",reject);
        backend.server.listen(backend.config.port,"0.0.0.0",resolve);
      });
      console.log(JSON.stringify({code:"CONTAINER_API_READY"}));
      const shutdown=()=>{
        backend.server.close(()=>{void backend.db.close().then(()=>process.exit(0));});
        setTimeout(()=>process.exit(1),25000).unref();
      };
      process.on("SIGTERM",shutdown);process.on("SIGINT",shutdown);
    } else {
      console.log(JSON.stringify({code:"CONTAINER_WORKER_READY"}));
      try {
        while(!stopping) {
          try {
            await backend.worker.tick();
            await writeFile("/tmp/seatback-worker-heartbeat",String(Date.now()));
          } catch {console.error(JSON.stringify({code:"WORKER_TICK_RETRY"}));}
          if(!stopping)await delay(2000,undefined,{signal:abort.signal}).catch(()=>{});
        }
      } finally {await backend.db.close();}
    }
  }
} catch {
  // Never print credential-bearing URLs, key material or raw bootstrap exceptions.
  console.error(JSON.stringify({code:"CONTAINER_STARTUP_FAILED",message:"Check mounted secrets, database migrations, IDL and Devnet configuration."}));
  process.exit(1);
}
