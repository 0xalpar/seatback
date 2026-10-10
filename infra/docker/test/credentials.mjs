// Disposable CI secrets outside Git. Never use these wallets/credentials for deployment.
import {generateKeyPairSync,randomBytes} from "node:crypto";
import {mkdir,writeFile,readFile} from "node:fs/promises";
import {resolve,relative} from "node:path";
const dir=resolve(process.argv[2]??"");
if(!process.argv[2]||!relative(process.cwd(),dir).startsWith(".."))throw new Error("CI secrets directory must be outside checkout");
await mkdir(dir,{recursive:true});
const {publicKey,privateKey}=generateKeyPairSync("ed25519");
const key=Buffer.concat([privateKey.export({format:"der",type:"pkcs8"}).subarray(-32),publicKey.export({format:"der",type:"spki"}).subarray(-32)]);
await writeFile(resolve(dir,"gate.json"),JSON.stringify([...key]),{mode:0o444});
for(const name of ["postgres","session","pepper"])await writeFile(resolve(dir,name),randomBytes(32).toString("hex"),{mode:0o444});
const idl=JSON.parse(await readFile("packages/chain-client/idl/seatback.json","utf8"));
await writeFile(resolve(dir,"compose.env"),[
  `SEATBACK_PROGRAM_ID=${idl.address}`, // Compiler IDL fixture; not a deployed program claim.
  "DISPUTE_AUTHORITY=11111111111111111111111111111111",
  `POSTGRES_PASSWORD_FILE=${dir}/postgres`, `SESSION_SECRET_FILE=${dir}/session`,
  `ACCESS_CODE_PEPPER_FILE=${dir}/pepper`,`GATE_KEYPAIR_FILE=${dir}/gate.json`,
  `DOCKER_FIXTURE_DIR=${dir}`,"WEB_PORT=5173","WEB_ORIGIN=http://localhost:5173"
].join("\n")+"\n",{mode:0o600});
