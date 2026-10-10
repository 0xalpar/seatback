import {readFileSync} from "node:fs";
import {Keypair,PublicKey,Connection,ChainClient} from "@seatback/chain-client";
import {PostgresDatabase} from "./db.js";
import {Auth} from "./auth.js";
import {SeatBackService} from "./service.js";
import {BackendWorker} from "./worker.js";
import {createApiServer} from "./server.js";
import {loadConfig,type Config} from "./config.js";
export async function createBackend(config:Config=loadConfig()) {
 const db=new PostgresDatabase(config.databaseUrl);
 try {
  const gate=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(config.gateKeyPath,"utf8"))));
  const chain=new ChainClient(new Connection(config.rpcUrl,"confirmed"),new PublicKey(config.programId));
  const service=new SeatBackService(db,chain,gate,config);
  await service.initialize();
  const auth=new Auth(db,config),worker=new BackendWorker(service);
  return {db,service,auth,worker,server:createApiServer({db,service,auth,config}),config};
 } catch(error){await db.close();throw error;}
}
