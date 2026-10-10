import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {configureEnvironment} from "../environment.mjs";

test("runtime secrets are loaded from files and database passwords are URL encoded",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"seatback-infra-"));
  try {
    const password="@:/?#%".repeat(8);
    for(const [name,value] of [["db",password],["session","s".repeat(64)],["pepper","p".repeat(64)]])await writeFile(join(dir,name),value+"\n");
    const env={POSTGRES_PASSWORD_FILE:join(dir,"db"),SESSION_SECRET_FILE:join(dir,"session"),ACCESS_CODE_PEPPER_FILE:join(dir,"pepper")};
    await configureEnvironment(env);
    const url=new URL(env.DATABASE_URL);
    assert.equal(decodeURIComponent(url.password),password);
    assert.equal(url.hostname,"db");assert.equal(url.pathname,"/seatback");
    assert.equal(env.SESSION_SECRET,"s".repeat(64));assert.equal(env.ACCESS_CODE_PEPPER,"p".repeat(64));
    await writeFile(join(dir,"db"),"short");
    await assert.rejects(configureEnvironment(env),/Invalid database secret/);
    await assert.rejects(configureEnvironment({POSTGRES_PASSWORD_FILE:join(dir,"missing")}));
  } finally {await rm(dir,{recursive:true,force:true});}
});
