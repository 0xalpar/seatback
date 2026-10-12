// Retry only safe authentication reads/new challenges. A verify POST consumes a
// one-use challenge and must never be blindly replayed after an ambiguous response.
export async function authTransport(url:string,init:RequestInit,path:string,transport:typeof fetch=fetch):Promise<Response> {
 const attempts=path==='/v1/auth/challenge'||(path==='/v1/auth/session'&&(init.method??'GET')==='GET')?3:1;
 for(let attempt=0;attempt<attempts;attempt++){
  try{return await transport(url,{...init,signal:init.signal??AbortSignal.timeout(20000)});}
  catch(error){
   if(init.signal?.aborted)throw error;
   if(attempt+1===attempts)throw new TypeError(`Cannot reach ${new URL(url,globalThis.location?.origin??'http://localhost').pathname}. Check your connection or browser request blocking, then retry sign-in.`);
   await new Promise(resolve=>setTimeout(resolve,300*(attempt+1)));
  }
 }
 throw Error('Unreachable');
}
