import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
for(const path of ["README.md","AGENTS.md","docs/architecture.md","docs/onchain.md","docs/api-contract.md",
"docs/frontend-task.md","docs/security.md","docs/testing.md","docs/roadmap.md"]) assert.ok(read(path).length>100,path);
const api=JSON.parse(read("docs/openapi.json"));
assert.equal(api.openapi,"3.1.0");
assert.ok(Object.keys(api.paths).length>=25);
for(const [path,methods] of Object.entries(api.paths)) {
  for(const [method,operation] of Object.entries(methods)) {
    assert.ok(operation.responses,path+" "+method);
    for(const match of path.matchAll(/\{([^}]+)\}/g)) {
      assert.ok(operation.parameters?.some(p=>p.in==="path"&&p.name===match[1]),path+" missing path param");
    }
  }
}
const schemas=api.components.schemas;
function visit(value) {
  if(!value || typeof value!=="object") return;
  if(value.$ref?.startsWith("#/components/schemas/")) assert.ok(schemas[value.$ref.split("/").at(-1)],value.$ref);
  Object.values(value).forEach(v=>Array.isArray(v)?v.forEach(visit):visit(v));
}
visit(api);
const sql=read("supabase/migrations/202610100001_foundation.sql");
const tables=[...sql.matchAll(/create table public\.([a-z_]+)/g)].map(m=>m[1]);
assert.equal(tables.length,16);
for(const table of tables) assert.ok(sql.includes("'"+table+"'"),"RLS list missing "+table);
assert.ok(read("Anchor.toml").includes('cluster = "Devnet"'));
assert.ok(!read("apps/web/.env.example").includes("SERVICE_ROLE"));
console.log("Foundation structure, OpenAPI references/parameters, 16-table RLS inventory and devnet config passed.");
