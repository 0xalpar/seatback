import { randomUUID } from "node:crypto";
import type { Database } from "./db.js";
import type { Config } from "./config.js";
import { ensure,HttpError } from "./errors.js";
import { csrf,sha,same,token,verifyWallet,walletBytes } from "./security.js";
export class Auth {
  constructor(readonly db:Database,readonly config:Config,readonly now=()=>Date.now()) {}
  async challenge(wallet:string,domain:string,uri:string) {
    try { walletBytes(wallet); } catch { throw new HttpError(400,"INVALID_WALLET"); }
    let url:URL;try{url=new URL(uri);}catch{throw new HttpError(400,"INVALID_URI");}
    ensure(domain===this.config.authDomain&&url.origin===this.config.webOrigin&&!/[\r\n]/.test(uri),400,"INVALID_DOMAIN");
    const challengeId=randomUUID(),nonce=token(),expiresAt=Math.floor(this.now()/1000)+300;
    const message=domain+" wants you to sign in with your Solana account:\n"+wallet+
      "\n\nSign in to SeatBack. This does not authorize a transaction.\n\nURI: "+uri+
      "\nVersion: 1\nChain ID: solana:devnet\nNonce: "+nonce+"\nIssued At: "+
      new Date(this.now()).toISOString()+"\nExpiration Time: "+new Date(expiresAt*1000).toISOString();
    await this.db.query("INSERT INTO auth_challenges(id,wallet,nonce_hash,message,domain,uri,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [challengeId,wallet,sha(nonce),message,domain,uri,new Date(expiresAt*1000)]);
    return {challengeId,message,expiresAt};
  }
  async verify(challengeId:string,wallet:string,signatureBase64:string) {
    return this.db.transaction(async sql=>{
      const row=(await sql.query("SELECT * FROM auth_challenges WHERE id=$1 FOR UPDATE",[challengeId])).rows[0];
      ensure(row&&row.wallet===wallet&&!row.consumed_at&&new Date(row.expires_at).getTime()>this.now(),401,"INVALID_CHALLENGE");
      ensure(verifyWallet(wallet,row.message,signatureBase64),401,"INVALID_SIGNATURE");
      await sql.query("UPDATE auth_challenges SET consumed_at=$2 WHERE id=$1",[challengeId,new Date(this.now())]);
      await sql.query("INSERT INTO wallets(address) VALUES($1) ON CONFLICT DO NOTHING",[wallet]);
      const raw=token(),csrfToken=csrf(raw,this.config.sessionSecret),expiresAt=Math.floor(this.now()/1000)+86400;
      await sql.query("INSERT INTO sessions(wallet,token_hash,csrf_hash,expires_at) VALUES($1,$2,$3,$4)",
        [wallet,sha(raw),sha(csrfToken),new Date(expiresAt*1000)]);
      return {wallet,expiresAt,csrfToken,raw};
    });
  }
  async session(raw:string|undefined) {
    ensure(raw&&/^[A-Za-z0-9_-]{43}$/.test(raw),401,"UNAUTHENTICATED");
    const row=(await this.db.query("SELECT * FROM sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>$2",
      [sha(raw),new Date(this.now())])).rows[0];
    ensure(row,401,"SESSION_EXPIRED");
    return {wallet:String(row.wallet),expiresAt:Math.floor(new Date(row.expires_at).getTime()/1000),
      csrfToken:csrf(raw,this.config.sessionSecret),raw};
  }
  async logout(raw:string) { await this.db.query("UPDATE sessions SET revoked_at=$2 WHERE token_hash=$1",[sha(raw),new Date(this.now())]); }
  cookie(raw:string,clear=false) {
    return "seatback_session="+(clear?"":raw)+"; HttpOnly; Path=/; SameSite=Lax; Max-Age="+(clear?0:86400)+(this.config.secureCookies?"; Secure":"");
  }
  checkCsrf(received:string|undefined,expected:string) { ensure(received&&same(sha(received),sha(expected)),403,"INVALID_CSRF"); }
}
