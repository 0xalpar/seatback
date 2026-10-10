import {readFile} from "node:fs/promises";
import {configureEnvironment} from "./environment.mjs";
try {
  await configureEnvironment();
  const {PostgresDatabase}=await import("../../apps/api/dist/db.js");
  const db=new PostgresDatabase(process.env.DATABASE_URL);
  try {await db.query("SELECT 1 FROM seatback_migrations LIMIT 1");}finally{await db.close();}
  if(process.argv[2]==="api") {
    const response=await fetch(`http://127.0.0.1:${process.env.PORT??3001}/health`,{signal:AbortSignal.timeout(4000)});
    if(!response.ok||(await response.json()).mode!=="backend")throw new Error("Not ready");
  } else if(process.argv[2]==="worker") {
    const age=Date.now()-Number(await readFile("/tmp/seatback-worker-heartbeat","utf8"));
    if(!Number.isFinite(age)||age<0||age>45000)throw new Error("Worker tick stale");
  } else throw new Error("Unknown health mode");
} catch {process.exit(1);}
