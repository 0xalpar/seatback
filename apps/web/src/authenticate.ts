export interface WalletSession {wallet:string;expiresAt:number;csrfToken:string}
type Request = <T>(path:string,init?:RequestInit)=>Promise<T>;
export async function authenticate(wallet:string,origin:string,request:Request,sign:(message:string)=>Promise<string>):Promise<WalletSession> {
 let stage="Requesting /v1/auth/challenge";
 try {
  const challenge=await request<{challengeId:string;message:string;expiresAt:number}>("/v1/auth/challenge",{method:"POST",body:JSON.stringify({wallet,domain:new URL(origin).host,uri:origin})});
  if(challenge.expiresAt<=Math.floor(Date.now()/1000))throw Error("Sign-in challenge expired. Try again.");
  stage="Waiting for wallet message signature";
  const signatureBase64=await sign(challenge.message);
  stage="Verifying /v1/auth/verify";
  let verified:WalletSession;
  try {verified=await request<WalletSession>("/v1/auth/verify",{method:"POST",body:JSON.stringify({challengeId:challenge.challengeId,wallet,signatureBase64})});}
  catch(error){
   // A dropped verification response may already have set the HttpOnly cookie.
   // Never replay the consumed challenge or claim success without a live session.
   if(!(error instanceof TypeError))throw error;
   verified=await request<WalletSession>("/v1/auth/session");
  }
  stage="Confirming session cookie at /v1/auth/session";
  const session=await request<WalletSession>("/v1/auth/session");
  if(verified.wallet!==wallet||session.wallet!==wallet||!session.csrfToken)throw Error("Authenticated session does not match connected wallet.");
  return session;
 } catch(error){throw Error(`${stage}: ${error instanceof Error?error.message:"Sign-in failed"}`);}
}
