// CI transport fixture ONLY: no Solana validator, balances, transactions or deployment.
import https from "node:https";
import {readFileSync} from "node:fs";
https.createServer({key:readFileSync("/fixture/tls.key"),cert:readFileSync("/fixture/tls.crt")},(req,res)=>{
  let data="";req.on("data",chunk=>{data+=chunk;});
  req.on("end",()=>{
    const request=JSON.parse(data);
    const result=req.url==="/mainnet"?"5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp":"EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
    res.setHeader("Content-Type","application/json");
    res.end(JSON.stringify(request.method==="getGenesisHash"?{jsonrpc:"2.0",id:request.id,result}:{jsonrpc:"2.0",id:request.id,error:{code:-32601,message:"Fixture supports genesis only"}}));
  });
}).listen(8899,"0.0.0.0");
