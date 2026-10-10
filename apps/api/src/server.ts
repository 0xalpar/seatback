import {createServer,type IncomingMessage} from "node:http";
import {randomUUID} from "node:crypto";
import {z,ZodError} from "zod";
import {API_VERSION} from "@seatback/contracts";
import type {SeatBackService} from "./service.js";
import {Auth} from "./auth.js";
import type {Config} from "./config.js";
import type {Database} from "./db.js";
import {HttpError,ensure} from "./errors.js";
import {sha,canonical} from "./security.js";
import {eventView} from "./views.js";
import * as v from "./validation.js";
interface Dependencies {service:SeatBackService;auth:Auth;config:Config;db:Database}
async function json(req:IncomingMessage) {
 let bytes=0;const parts:Buffer[]=[];
 for await(const part of req) {const b=Buffer.from(part);bytes+=b.length;ensure(bytes<=65536,413,"BODY_TOO_LARGE");parts.push(b);}
 const raw=Buffer.concat(parts).toString("utf8");
 if(!raw)return {};
 ensure(req.headers["content-type"]?.split(";")[0]==="application/json",415,"JSON_REQUIRED");
 try{return JSON.parse(raw);}catch{throw new HttpError(400,"INVALID_JSON");}
}
const header=(req:IncomingMessage,name:string)=>{const value=req.headers[name];return typeof value==="string"?value:undefined;};
function cookie(req:IncomingMessage) {
 const values=(header(req,"cookie")??"").split(";").map(s=>s.trim()).filter(s=>s.startsWith("seatback_session="));
 if(values.length!==1)return undefined;return values[0]!.slice("seatback_session=".length);
}
export function createApiServer(deps?:Dependencies) {
 return createServer(async(req,res)=>{
  const requestId=randomUUID();res.setHeader("Content-Type","application/json");res.setHeader("Cache-Control","no-store");
  res.setHeader("X-Request-Id",requestId);res.setHeader("X-Content-Type-Options","nosniff");res.setHeader("Vary","Origin");
  const send=(status:number,body?:unknown)=>{res.statusCode=status;res.end(body===undefined?undefined:JSON.stringify(body));};
  try {
   const url=new URL(req.url??"/","http://localhost"),path=url.pathname,method=req.method??"GET";
   if(path==="/health"&&method==="GET")return send(200,{status:"ok",apiVersion:API_VERSION,cluster:"devnet",mode:deps?"backend":"skeleton"});
   if(!deps)throw new HttpError(path.startsWith("/v1/")?501:404,path.startsWith("/v1/")?"NOT_IMPLEMENTED":"NOT_FOUND");
   const {service,auth,config,db}=deps;
   const origin=header(req,"origin");
   if(origin)ensure(origin===config.webOrigin,403,"INVALID_ORIGIN");
   if(origin===config.webOrigin){res.setHeader("Access-Control-Allow-Origin",origin);res.setHeader("Access-Control-Allow-Credentials","true");}
   if(method==="OPTIONS"){ensure(origin===config.webOrigin,403,"INVALID_ORIGIN");res.setHeader("Access-Control-Allow-Headers","Content-Type, X-CSRF-Token, Idempotency-Key");res.setHeader("Access-Control-Allow-Methods","GET, POST, PATCH, DELETE, OPTIONS");return send(204);}
   if(!["GET","HEAD"].includes(method))ensure(origin===config.webOrigin,403,"INVALID_ORIGIN");
   // Shared DB counters rate-limit every process, do not trust spoofable forwarded IP headers.
   const bucket=sha((req.socket.remoteAddress??"unknown")+":"+path.split("/").slice(0,4).join("/")).toString("hex");
   const rate=(await db.query("INSERT INTO rate_limits(bucket,count,resets_at) VALUES($1,1,$2) ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN rate_limits.resets_at<=$3 THEN 1 ELSE rate_limits.count+1 END,resets_at=CASE WHEN rate_limits.resets_at<=$3 THEN $2 ELSE rate_limits.resets_at END RETURNING count",
    [bucket,new Date(Date.now()+60000),new Date()])).rows[0]!;
   ensure(Number(rate.count)<=((path.startsWith("/v1/auth/")||path.endsWith("/access"))?30:120),429,"RATE_LIMITED");
   if(path==="/v1/auth/challenge"&&method==="POST"){const b=v.challenge.parse(await json(req));return send(201,await auth.challenge(b.wallet,b.domain,b.uri));}
   if(path==="/v1/auth/verify"&&method==="POST"){const b=v.verify.parse(await json(req)),s=await auth.verify(b.challengeId,b.wallet,b.signatureBase64);res.setHeader("Set-Cookie",auth.cookie(s.raw));return send(200,{wallet:s.wallet,expiresAt:s.expiresAt,csrfToken:s.csrfToken});}
   if(path==="/v1/events"&&method==="GET"){const p=v.paging(url.searchParams);return send(200,await service.listEvents(undefined,false,(url.searchParams.get("q")??"").slice(0,200),p.limit,p.cursor));}
   const details=path.match(/^\/v1\/events\/([^/]+)$/);
   if(details&&method==="GET"){v.uuid.parse(details[1]);const raw=cookie(req),session=raw?await auth.session(raw):undefined;return send(200,eventView(await service.event(details[1]!,session?.wallet)));}
   const session=await auth.session(cookie(req)),wallet=session.wallet;
   if(!["GET","HEAD"].includes(method))auth.checkCsrf(header(req,"x-csrf-token"),session.csrfToken);
   if(path==="/v1/auth/session"&&method==="GET")return send(200,{wallet,expiresAt:session.expiresAt,csrfToken:session.csrfToken});
   if(path==="/v1/auth/logout"&&method==="POST"){await auth.logout(session.raw);res.setHeader("Set-Cookie",auth.cookie("",true));return send(204);}
   if(path==="/v1/me/attendance-intents"&&method==="GET")return send(200,await service.attendanceIntents(wallet));
   const p=v.paging(url.searchParams);
   if(path==="/v1/me/registrations"&&method==="GET")return send(200,await service.listRegistrations(wallet,undefined,p.limit,p.cursor));
   if(path==="/v1/me/waitlist"&&method==="GET")return send(200,await service.listWaitlist(wallet,p.limit,p.cursor));
   if(path==="/v1/organizer/events"&&method==="GET")return send(200,await service.listEvents(wallet,true,"",p.limit,p.cursor));
   if(["/v1/me/disputes","/v1/arbiter/disputes"].includes(path)&&method==="GET")return send(200,await service.disputes(wallet,path.includes("/arbiter/"),p.limit,p.cursor));
   if(path==="/v1/transactions/submit"&&method==="POST"){const b=v.submit.parse(await json(req));return send(202,await service.intents.submit(b.intentId,b.signedTransactionBase64,wallet));}
   const tx=path.match(/^\/v1\/transactions\/([^/]+)$/);
   if(tx&&method==="GET")return send(200,await service.intents.status(v.uuid.parse(tx[1]),wallet));
   const body=["POST","PATCH"].includes(method)?await json(req):{};
   const economic=async(action:()=>Promise<unknown>,status=201)=>{
    const key=v.uuid.parse(header(req,"idempotency-key")),route=method+" "+path,hash=sha(canonical(body));
    const existing=await db.transaction(async sql=>{
     await sql.query("INSERT INTO idempotency_keys(wallet,route,key,request_hash,expires_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",[wallet,route,key,hash,new Date(Date.now()+86400000)]);
     const row=(await sql.query("SELECT * FROM idempotency_keys WHERE wallet=$1 AND route=$2 AND key=$3 FOR UPDATE",[wallet,route,key])).rows[0]!;
     ensure(Buffer.from(row.request_hash).equals(hash),409,"IDEMPOTENCY_CONFLICT");
     if(row.response)return {response:row.response,status:row.http_status};
     // A request token, not a held SQL lock, claims creation across RPC calls.
     const claim=await sql.query("UPDATE idempotency_keys SET http_status=-1 WHERE wallet=$1 AND route=$2 AND key=$3 AND http_status IS NULL RETURNING key",[wallet,route,key]);
     ensure(claim.rows.length,409,"REQUEST_IN_PROGRESS");return null;
    });
    if(existing)return send(existing.status,existing.response);
    try{const result=await action();await db.query("UPDATE idempotency_keys SET response=$4,http_status=$5 WHERE wallet=$1 AND route=$2 AND key=$3",[wallet,route,key,JSON.stringify(result),status]);return send(status,result);}
    catch(error){await db.query("DELETE FROM idempotency_keys WHERE wallet=$1 AND route=$2 AND key=$3 AND response IS NULL",[wallet,route,key]);throw error;}
   };
   if(path==="/v1/events"&&method==="POST"){const {accessCode,...b}=v.createEvent.parse(body);return await economic(()=>service.createEvent(wallet,{...b,...(accessCode?{accessCode}:{})}));}
   if(details&&method==="PATCH"){const b=v.metadata.parse(body),id=v.uuid.parse(details[1]);return await economic(()=>service.metadata(id,wallet,b));}
   const event=path.match(/^\/v1\/events\/([^/]+)\/(capabilities|access|register|cancel|participants|waitlist|scanners|attendance\/verify)$/);
   if(event) {
    const id=v.uuid.parse(event[1]),action=event[2];
    if(action==="capabilities"&&method==="GET")return send(200,await service.capabilities(id,wallet));
    if(action==="access"&&method==="POST"){const b=z.object({code:z.string().min(1).max(128)}).strict().parse(body);return send(200,await service.access(id,wallet,b.code));}
    if(action==="participants"&&method==="GET")return send(200,await service.listRegistrations(wallet,id,p.limit,p.cursor));
    if(action==="waitlist"&&method==="POST"){v.empty.parse(body);return send(201,await service.waitlist(id,wallet));}
    if(action==="waitlist"&&method==="DELETE"){await service.waitlist(id,wallet,true);return send(204);}
    if(action==="register"&&method==="POST"){v.empty.parse(body);return await economic(()=>service.reserve(id,wallet));}
    if(action==="cancel"&&method==="POST"){v.empty.parse(body);return await economic(()=>service.cancelEvent(id,wallet));}
    if(action==="scanners"&&method==="POST"){const b=z.object({wallet:v.wallet}).strict().parse(body);return await economic(()=>service.scanner(id,wallet,b.wallet,true));}
    if(action==="attendance/verify"&&method==="POST"){const b=z.object({token:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict().parse(body);return await economic(()=>service.attendance(id,wallet,b.token));}
   }
   const scanner=path.match(/^\/v1\/events\/([^/]+)\/scanners\/([^/]+)$/);
   if(scanner&&method==="DELETE"){const id=v.uuid.parse(scanner[1]),address=v.wallet.parse(scanner[2]);return await economic(()=>service.scanner(id,wallet,address,false));}
   const reg=path.match(/^\/v1\/registrations\/([^/]+)\/(cancel|claim-refund|withdraw|qr|disputes)$/);
   if(reg&&method==="POST") {
    const id=v.uuid.parse(reg[1]),action=reg[2];
    if(action==="qr"){v.empty.parse(body);return send(201,await service.qr(id,wallet));}
    if(action==="disputes"){const b=z.object({evidenceText:z.string().min(1).max(4000)}).strict().parse(body);return await economic(()=>service.registrationAction("open_dispute",id,wallet,b));}
    v.empty.parse(body);const kind=action==="cancel"?"cancel_reservation":action==="withdraw"?"withdraw_allocation":"claim_cancelled_event_refund";
    return await economic(()=>service.registrationAction(kind,id,wallet));
   }
   const offer=path.match(/^\/v1\/offers\/([^/]+)\/accept$/);
   if(offer&&method==="POST"){const id=v.uuid.parse(offer[1]);v.empty.parse(body);return await economic(()=>service.acceptOffer(id,wallet));}
   const dispute=path.match(/^\/v1\/disputes\/([^/]+)\/resolve$/);
   if(dispute&&method==="POST"){const id=v.uuid.parse(dispute[1]),b=z.object({outcome:z.enum(["participant","organizer"])}).strict().parse(body);return await economic(()=>service.resolveDispute(id,wallet,b.outcome));}
   throw new HttpError(404,"NOT_FOUND");
  } catch(error) {
   if(res.writableEnded)return;
   const status=error instanceof HttpError?error.status:error instanceof ZodError?400:503;
   const code=error instanceof HttpError?error.code:error instanceof ZodError?"INVALID_INPUT":"SERVICE_UNAVAILABLE";
   // Do not log raw error objects: DB/RPC errors can contain secrets and private request data.
   if(status>=500)console.error(JSON.stringify({requestId,code}));
   send(status,{error:{code,message:code,requestId,retryable:status===503||code==="REQUEST_IN_PROGRESS"}});
  }
 });
}
