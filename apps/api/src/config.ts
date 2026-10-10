export interface Config {
  webOrigin:string; authDomain:string; databaseUrl:string; sessionSecret:string; codePepper:string;
  rpcUrl:string; programId:string; gateKeyPath:string; disputeAuthority:string; port:number;
  secureCookies:boolean; localValidator:boolean;
}
export function loadConfig(env:NodeJS.ProcessEnv=process.env):Config {
  const required=(name:string)=>{const v=env[name];if(!v)throw new Error("Missing "+name);return v;};
  if(env.SOLANA_CLUSTER!=="devnet")throw new Error("SOLANA_CLUSTER must be devnet");
  const webOrigin=new URL(required("WEB_ORIGIN")).origin;
  const sessionSecret=required("SESSION_SECRET"),codePepper=required("ACCESS_CODE_PEPPER");
  if(sessionSecret.length<32||codePepper.length<32)throw new Error("Secrets must be at least 32 characters");
  const rpcUrl=required("SOLANA_RPC_URL");
  const localValidator=env.ALLOW_LOCAL_VALIDATOR==="true";
  const rpc=new URL(rpcUrl);
  if(localValidator&&!["localhost","127.0.0.1"].includes(rpc.hostname))throw new Error("Local validator override requires loopback RPC");
  if(!["https:","http:"].includes(rpc.protocol))throw new Error("Invalid RPC URL");
  if(rpc.protocol==="http:" && !(localValidator&&["localhost","127.0.0.1"].includes(rpc.hostname)))throw new Error("HTTP RPC requires explicit local validator");
  const port=Number(env.PORT??3001);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error("Invalid PORT");
  return {webOrigin,authDomain:new URL(webOrigin).host,databaseUrl:required("DATABASE_URL"),
    sessionSecret,codePepper,rpcUrl,programId:required("SEATBACK_PROGRAM_ID"),
    gateKeyPath:required("GATE_KEYPAIR_PATH"),disputeAuthority:required("DISPUTE_AUTHORITY"),
    secureCookies:!["localhost","127.0.0.1"].includes(new URL(webOrigin).hostname),localValidator,port};
}
