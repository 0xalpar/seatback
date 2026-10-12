import {z} from "zod";
import {validatePolicy} from "@seatback/contracts";
import {walletBytes} from "./security.js";
export const wallet=z.string().max(44).refine(s=>{try{walletBytes(s);return true;}catch{return false;}},"Invalid wallet");
export const uuid=z.string().uuid();
const time=z.number().int().safe().nonnegative();
export const policy=z.object({depositLamports:z.string().regex(/^[1-9][0-9]*$/),rule1Deadline:time,
 rule2Deadline:time,checkInOpensAt:time,checkInClosesAt:time,eventStartsAt:time,eventEndsAt:time,
 disputeSeconds:z.literal(86400)}).strict().superRefine((v,c)=>{try{validatePolicy(v);}catch{c.addIssue({code:"custom",message:"Invalid policy"});}});
export const metadata=z.object({title:z.string().trim().min(1).max(120),description:z.string().max(10000),location:z.string().trim().min(1).max(500)}).strict();
export const createEvent=metadata.extend({visibility:z.enum(["public","private"]),accessCode:z.string().min(8).max(128).optional(),
 capacity:z.number().int().min(1).max(100000),registrationLimit:z.number().int().min(1).max(2147483647),policy})
 .superRefine((v,c)=>{if(v.registrationLimit<v.capacity||v.visibility==="private"&&!v.accessCode)c.addIssue({code:"custom",message:"Invalid capacity or missing private code"});});
export const challenge=z.object({wallet,domain:z.string().max(253),uri:z.string().url().max(1000)}).strict();
export const verify=z.object({challengeId:uuid,wallet,signatureBase64:z.string().max(128)}).strict();
export const submit=z.object({intentId:uuid,signedTransactionBase64:z.string().min(1).max(2400)}).strict();
export const empty=z.object({}).strict();
export function paging(params:URLSearchParams) {
 const limit=z.coerce.number().int().min(1).max(50).parse(params.get("limit")??20);
 const cursor=params.get("cursor"); if(cursor)uuid.parse(cursor);
 return {limit,cursor};
}
