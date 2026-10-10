import {LAMPORTS_PER_SOL,U64_MAX,parseLamports} from "@seatback/contracts";
export function lamportsToSol(value:string):string {
  const amount=parseLamports(value); const whole=amount/LAMPORTS_PER_SOL;
  const fraction=(amount%LAMPORTS_PER_SOL).toString().padStart(9,"0").replace(/0+$/g,"");
  return `${new Intl.NumberFormat("en-US").format(whole)}${fraction?`.${fraction}`:""} SOL`;
}
export function solToLamports(value:string):string {
  if(!/^(0|[1-9]\d*)(\.\d{1,9})?$/.test(value)) throw new Error("Use a decimal SOL amount with up to 9 places.");
  const [whole="0",frac=""]=value.split("."); const amount=BigInt(whole)*LAMPORTS_PER_SOL+BigInt((frac+"000000000").slice(0,9));
  if(amount<=0n||amount>U64_MAX)throw new Error("Amount must fit in a non-zero u64 lamport balance."); return amount.toString();
}
