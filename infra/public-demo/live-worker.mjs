export function createLiveWorker(assets,transport=fetch) {
  const policy="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://api.devnet.solana.com; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'self'";
  return {async fetch(request,env) {
    const url=new URL(request.url);
    if(url.pathname==='/health'||url.pathname.startsWith('/v1/')) {
      try {
        const backend=new URL(env.SEATBACK_BACKEND_ORIGIN);
        if(!backend.hostname.includes('.')||/^(?:[0-9.]+|\[.*\])$/.test(backend.hostname)||backend.hostname.endsWith('.local')||backend.hostname.endsWith('.internal')||backend.protocol!=='https:'||backend.username||backend.password||backend.pathname!=='/'||backend.search||backend.hash)throw new Error('Invalid backend');
        const headers=new Headers(request.headers);headers.delete('host');
        const response=await transport(new Request(backend.origin+url.pathname+url.search,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,redirect:'manual',duplex:'half'}));
        const resultHeaders=new Headers(response.headers);resultHeaders.set('Cache-Control','no-store');
        return new Response(response.body,{status:response.status,headers:resultHeaders});
      } catch {
        return Response.json({error:{code:'BACKEND_UNAVAILABLE',message:'Live backend unavailable; no transaction success is claimed.'}},{status:503,headers:{'Cache-Control':'no-store'}});
      }
    }
    if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
    const asset=assets[url.pathname]??(!url.pathname.startsWith('/assets/')?assets['/index.html']:undefined);
    if(!asset)return new Response('Not found',{status:404});
    return new Response(request.method==='HEAD'?null:asset.body,{headers:{'Content-Type':asset.type,'Content-Security-Policy':policy,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':url.pathname.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache'}});
  }};
}
