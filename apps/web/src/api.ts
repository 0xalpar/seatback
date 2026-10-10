import type { DisputeView, EventCapabilities, EventView, Page, RegistrationView, TxIntent, WaitlistView } from "@seatback/contracts";
import { webConfig } from "./config";
export {lamportsToSol,solToLamports} from "./money";

const viteEnv=import.meta.env as ImportMetaEnv|undefined;
// Fixture mode must be opted into explicitly; normal builds always call the backend.
export const DEMO_MODE = viteEnv?.VITE_DEMO_MODE === "true";
export const API_BASE = webConfig.apiBase;
export class ApiFailure extends Error {
  constructor(message: string, readonly status: number, readonly code = "API_ERROR") { super(message); this.name = "ApiFailure"; }
}
export interface SeatBackApi {
  request<T>(path: string, init?: RequestInit): Promise<T>;
  events(query?: string,cursor?:string|null): Promise<Page<EventView>>;
  event(id: string): Promise<EventView>;
  registrations(): Promise<Page<RegistrationView>>;
  waitlist(): Promise<Page<WaitlistView>>;
  organizerEvents(): Promise<Page<EventView>>;
  participants(id: string): Promise<Page<RegistrationView>>;
  disputes(arbiter?: boolean): Promise<Page<DisputeView>>;
  capabilities(id: string): Promise<EventCapabilities>;
  action(path: string, body?: unknown): Promise<TxIntent | WaitlistView | { token: string; expiresAt: number } | { disputeId: string; intent: TxIntent }>;
}
export const isOfferExpired=(expiresAt:number|null,now:number)=>expiresAt===null||expiresAt<=now;
export const requiresSession=(path:string)=>path==="/me"||path.startsWith("/organizer/events")||path.startsWith("/offers/")||path.startsWith("/scan/")||path.startsWith("/registrations/")||path==="/arbiter/disputes";

const now = Math.floor(Date.now() / 1000);
export const DEMO_EVENTS: EventView[] = [
  { id:"evt-design-night", organizer:"9xQeWvG816bUx9EPfEZ2kV9G6Z9FxE5w2GkmfR8R7Z7", title:"Designing for the open web", description:"An evening for people building a more open, human internet. Short talks, long conversations, and a room full of curious makers.", location:"Karaköy, Istanbul", visibility:"public", status:"open", capacity:80, occupiedSeats:62, heldOffers:2, registrationLimit:100, registrationsCreated:76, policy:{depositLamports:"250000000",rule1Deadline:now+86400*3,rule2Deadline:now+86400*7,checkInOpensAt:now+86400*9,eventStartsAt:now+86400*9+3600,eventEndsAt:now+86400*9+14400,checkInClosesAt:now+86400*9+7200,disputeSeconds:86400}, eventPda:null, policyHash:"demo-policy-1" },
  { id:"evt-solana-builders", organizer:"6jKQnQWc6E1mvqPwq3FCJq8F4ZqmU6Z8yGQ7kJPc4k2", title:"Solana builders breakfast", description:"Coffee, demos, and practical conversations for builders shipping on Solana.", location:"Moda, Istanbul", visibility:"public", status:"open", capacity:40, occupiedSeats:40, heldOffers:1, registrationLimit:60, registrationsCreated:47, policy:{depositLamports:"500000000",rule1Deadline:now+86400*5,rule2Deadline:now+86400*8,checkInOpensAt:now+86400*9,eventStartsAt:now+86400*9+1800,eventEndsAt:now+86400*9+9000,checkInClosesAt:now+86400*9+5400,disputeSeconds:86400}, eventPda:null, policyHash:"demo-policy-2" },
  { id:"evt-community-lab", organizer:"8k5N7vcCdqXqWF7vXc9zkTP8tXYXyAJLM2kNW6xH1wv", title:"Community systems lab", description:"A hands-on workshop to prototype better tools for local communities.", location:"Kadıköy, Istanbul", visibility:"public", status:"open", capacity:24, occupiedSeats:12, heldOffers:0, registrationLimit:24, registrationsCreated:12, policy:{depositLamports:"100000000",rule1Deadline:now+86400*2,rule2Deadline:now+86400*4,checkInOpensAt:now+86400*6,eventStartsAt:now+86400*6+3600,eventEndsAt:now+86400*6+10800,checkInClosesAt:now+86400*6+5400,disputeSeconds:86400}, eventPda:null, policyHash:"demo-policy-3" },
];
export const DEMO_REGISTRATIONS: RegistrationView[] = DEMO_EVENTS.slice(0,2).map((event,i)=>({id:`reg-demo-${i+1}`,eventId:event.id,wallet:"9xQeWvG816bUx9EPfEZ2kV9G6Z9FxE5w2GkmfR8R7Z7",status:i===0?"reserved":"attended",policySnapshot:event.policy,policyHash:event.policyHash,reservationPda:"11111111111111111111111111111111",participantRefundLamports:i===0?"0":"500000000",organizerAllocationLamports:"0",disputeDeadline:event.policy.checkInClosesAt+86400,transactionSignature:null}));
const DEMO_WAITLIST: WaitlistView[] = [{id:"wl-demo-1",eventId:DEMO_EVENTS[1]?.id??"evt-solana-builders",status:"offered",position:0,offerId:"offer-demo-1",offerExpiresAt:now+900}];
const DEMO_DISPUTES: DisputeView[] = [{id:"dispute-demo-1",registrationId:"reg-demo-2",eventId:DEMO_EVENTS[1]?.id??"evt-solana-builders",participant:"8k5N7vcCdqXqWF7vXc9zkTP8tXYXyAJLM2kNW6xH1wv",status:"open",evidenceText:"I arrived before check-in closed; the scanner was offline.",outcome:null,openedAt:now-3600,resolvedAt:null,deadline:now+20*3600}];
const page = <T,>(items:T[]): Page<T> => ({items,nextCursor:null});
const queryOf = (path:string) => new URL(path,"http://demo.local").searchParams.get("q")?.toLowerCase() ?? "";

export function createApi(demo = DEMO_MODE): SeatBackApi {
  async function request<T>(path:string, init:RequestInit={}):Promise<T> {
    if (demo) {
      await new Promise(r=>setTimeout(r,120));
      const method=(init.method??"GET").toUpperCase();
      if(method==="GET"&&(path.startsWith("/v1/events?") || path==="/v1/events")) return page(DEMO_EVENTS.filter(e=>e.visibility==="public" && `${e.title} ${e.location} ${e.description}`.toLowerCase().includes(queryOf(path)))) as T;
      if (method==="GET"&&/^\/v1\/events\/[^/]+$/.test(path)) { const id=path.split("/")[3]??""; const e=DEMO_EVENTS.find(x=>x.id===id); if(e)return e as T; throw new ApiFailure("Event not found",404,"NOT_FOUND"); }
      if(path.startsWith("/v1/me/registrations")) return page(DEMO_REGISTRATIONS) as T;
      if(path.startsWith("/v1/me/waitlist")) return page(DEMO_WAITLIST) as T;
      if(path.startsWith("/v1/organizer/events")) return page(DEMO_EVENTS.slice(0,2)) as T;
      if(path.includes("/participants")) return page(DEMO_REGISTRATIONS) as T;
      if(path.startsWith("/v1/me/disputes")||path.startsWith("/v1/arbiter/disputes")) return page(DEMO_DISPUTES) as T;
      if(path==="/v1/me/attendance-intents")return {items:[]} as T;
      if(path.endsWith("/capabilities")) return {canManage:true,canScan:true,canArbitrate:true} as T;
      if(path==="/v1/auth/session") throw new ApiFailure("No active session",401,"NO_SESSION");
      if(path==="/v1/auth/challenge") { const body=JSON.parse(String(init.body??"{}")); return {challengeId:"demo-challenge",message:`seatback.app wants you to sign in with your Solana account:\n${body.wallet}\n\nURI: ${body.uri}\nVersion: 1\nChain ID: devnet\nNonce: demo-only\nIssued At: ${new Date().toISOString()}\nExpiration Time: ${new Date(Date.now()+300000).toISOString()}`} as T; }
      if(path==="/v1/auth/verify") throw new ApiFailure("Authentication is unavailable in demo mode",501,"DEMO_AUTH");
      if(path.startsWith("/v1/")) throw new ApiFailure("Demo mode — no transactions or backend writes",501,"DEMO_READ_ONLY");
      throw new ApiFailure("Not found",404,"NOT_FOUND");
    }
    const method=(init.method??"GET").toUpperCase();
    const headers=new Headers(init.headers); headers.set("Accept","application/json");
    if(init.body && !headers.has("Content-Type")) headers.set("Content-Type","application/json");
    if(method!=="GET"&&method!=="HEAD") { headers.set("X-CSRF-Token",sessionStorage.getItem("seatback.csrf")??""); if(!headers.has("Idempotency-Key"))headers.set("Idempotency-Key",crypto.randomUUID()); }
    const res=await fetch(`${API_BASE}${path}`,{...init,headers,credentials:"include"});
    if(res.status===204)return undefined as T;
    const data=await res.json().catch(()=>null);
    if(!res.ok){if(res.status===401){const hadSession=!!sessionStorage.getItem("seatback.csrf");sessionStorage.removeItem("seatback.csrf");if(path!=="/v1/auth/session"||hadSession)window.dispatchEvent(new CustomEvent("seatback-session-expired"))}throw new ApiFailure(data?.error?.message??`Request failed (${res.status})`,res.status,data?.error?.code)}
    return data as T;
  }
  return {
    request,
    events:(q="",cursor=null)=>request(`/v1/events?q=${encodeURIComponent(q)}&limit=20${cursor?`&cursor=${encodeURIComponent(cursor)}`:""}`),
    event:(id)=>request(`/v1/events/${encodeURIComponent(id)}`),
    registrations:()=>request("/v1/me/registrations?limit=50"), waitlist:()=>request("/v1/me/waitlist?limit=50"),
    organizerEvents:()=>request("/v1/organizer/events?limit=50"), participants:(id)=>request(`/v1/events/${encodeURIComponent(id)}/participants?limit=50`),
    disputes:(arbiter=false)=>request(`/v1/${arbiter?"arbiter":"me"}/disputes?limit=50`), capabilities:(id)=>request(`/v1/events/${encodeURIComponent(id)}/capabilities`),
      action:(path,body={})=>request(path,{method:"POST",body:JSON.stringify(body)})
  };
}

