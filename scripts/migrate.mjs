import {readFile,readdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import {PostgresDatabase} from "../apps/api/dist/db.js";
if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL required");
const db=new PostgresDatabase(process.env.DATABASE_URL);
try {
 await db.query("CREATE TABLE IF NOT EXISTS seatback_migrations(name text primary key,sha256 text not null,applied_at timestamptz default now())");
 for(const name of (await readdir(new URL("../supabase/migrations/",import.meta.url))).filter(n=>n.endsWith(".sql")).sort()) {
  const sql=await readFile(new URL("../supabase/migrations/"+name,import.meta.url),"utf8");
  const digest=createHash("sha256").update(sql).digest("hex");
  const old=(await db.query("SELECT sha256 FROM seatback_migrations WHERE name=$1",[name])).rows[0];
  if(old){if(old.sha256!==digest)throw new Error("Migration checksum changed: "+name);continue;}
  // Migrations contain their own BEGIN/COMMIT; run on one checked-out connection and ledger together.
  await db.transaction(async client=>{
   await client.query("SELECT pg_advisory_xact_lock(769841239)");
   const again=(await client.query("SELECT sha256 FROM seatback_migrations WHERE name=$1",[name])).rows[0];
   if(again){if(again.sha256!==digest)throw new Error("Migration checksum changed");return;}
   await client.query(sql.replace(/\bbegin;\s*/i,"").replace(/commit;\s*$/i,""));
   await client.query("INSERT INTO seatback_migrations(name,sha256) VALUES($1,$2)",[name,digest]);
  });
  console.log("Applied "+name);
 }
} finally {await db.close();}
