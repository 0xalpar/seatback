const DEVNET='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export async function readWalletBalance(address:string,endpoint:string,local=false,transport:typeof fetch=fetch):Promise<string> {
  const url=new URL(endpoint);
  if(local && !['localhost','127.0.0.1'].includes(url.hostname))throw new Error('Local RPC must be loopback');
  if(url.protocol!=='https:' && !(local&&url.protocol==='http:'))throw new Error('Devnet RPC requires HTTPS');
  const rpc=async(method:string,params:unknown[]=[])=>{
    const response=await transport(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error('Wallet balance RPC unavailable');
    const data=await response.json();if(data.error)throw new Error('Wallet balance RPC rejected request');return data.result;
  };
  const genesis=await rpc('getGenesisHash');
  if(local?(typeof genesis!=='string'||genesis===DEVNET||genesis.startsWith('5eykt4Us')):genesis!==DEVNET)throw new Error('Wrong Solana network; Devnet required');
  const result=await rpc('getBalance',[address,{commitment:'confirmed'}]);
  if(!Number.isSafeInteger(result?.value)||result.value<0)throw new Error('Invalid wallet balance');
  return String(result.value);
}
