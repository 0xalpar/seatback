import test from "node:test";
import assert from "node:assert/strict";
import { createApiServer } from "../apps/api/dist/server.js";
test("health works and business writes fail closed", async () => {
  const server=createApiServer();
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  try {
    const base="http://127.0.0.1:"+server.address().port;
    const health=await fetch(base+"/health");
    assert.equal(health.status,200);
    assert.equal((await health.json()).mode,"skeleton");
    const write=await fetch(base+"/v1/events",{method:"POST"});
    assert.equal(write.status,501);
    assert.equal((await write.json()).error.code,"NOT_IMPLEMENTED");
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
