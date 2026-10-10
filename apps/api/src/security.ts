import { createHash,createHmac,randomBytes,scryptSync,timingSafeEqual,createPublicKey,verify } from "node:crypto";
import bs58 from "bs58";
export const sha=(data:string|Uint8Array)=>createHash("sha256").update(data).digest();
export const token=()=>randomBytes(32).toString("base64url");
export const csrf=(session:string,secret:string)=>createHmac("sha256",secret).update("seatback:csrf:"+session).digest("base64url");
export function same(a:Uint8Array,b:Uint8Array) { return a.length===b.length&&timingSafeEqual(a,b); }
export function walletBytes(wallet:string):Uint8Array {
  const bytes=bs58.decode(wallet);
  if(bytes.length!==32)throw new Error("INVALID_WALLET");
  return bytes;
}
export function verifyWallet(wallet:string,message:string,signatureBase64:string):boolean {
  try {
    const raw=walletBytes(wallet), signature=Buffer.from(signatureBase64,"base64");
    if(signature.length!==64||signature.toString("base64")!==signatureBase64)return false;
    const key=createPublicKey({key:Buffer.concat([Buffer.from("302a300506032b6570032100","hex"),Buffer.from(raw)]),format:"der",type:"spki"});
    return verify(null,Buffer.from(message,"utf8"),key,signature);
  } catch { return false; }
}
export function hashCode(code:string,pepper:string):string {
  const salt=randomBytes(16).toString("hex");
  return salt+":"+scryptSync(code+pepper,salt,32).toString("hex");
}
export function verifyCode(code:string,stored:string,pepper:string):boolean {
  const [salt,digest]=stored.split(":");
  if(!salt||!digest)return false;
  return same(scryptSync(code+pepper,salt,32),Buffer.from(digest,"hex"));
}
/** RFC8785-compatible subset for validated JSON strings/integers, no undefined/nonfinite values. */
export function canonical(value:unknown):string {
  if(value===null||typeof value!=="object") {
    const result=JSON.stringify(value);
    if(result===undefined||typeof value==="number"&&!Number.isFinite(value))throw new Error("INVALID_JSON");
    return result;
  }
  if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
  const record=value as Record<string,unknown>;
  return "{"+Object.keys(record).sort().map(k=>JSON.stringify(k)+":"+canonical(record[k])).join(",")+"}";
}
