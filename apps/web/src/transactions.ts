import { PublicKey, Transaction } from "@solana/web3.js";
import type { TxIntent, TxReceipt } from "@seatback/contracts";
import idl from "../../../packages/chain-client/idl/seatback.json";

type WalletSigner = { walletAddress: string; signTransaction(tx: Transaction): Promise<Transaction> };
const configuredProgram = (import.meta as ImportMeta & {env?:{VITE_PROGRAM_ID?:string;VITE_API_BASE?:string}}).env?.VITE_PROGRAM_ID;
const apiBase = ((import.meta as ImportMeta & {env?:{VITE_API_BASE?:string}}).env?.VITE_API_BASE ?? "http://localhost:3001").replace(/\/$/, "");
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

/** Signs only backend-prepared, single-instruction SeatBack Devnet intents. */
export async function signAndSubmit(intent: TxIntent, wallet: WalletSigner): Promise<TxReceipt> {
  if (intent.cluster !== "devnet") throw new Error("This transaction is not for Devnet.");
  if (intent.expiresAt <= Math.floor(Date.now() / 1000)) throw new Error("This transaction expired. Request a new one.");
  if (!configuredProgram || configuredProgram !== idl.address) throw new Error("SeatBack program ID is not configured to match the generated IDL.");
  const publicKey = new PublicKey(wallet.walletAddress);
  if (publicKey.toBase58() !== intent.expectedSigner) throw new Error("Connect the wallet requested to sign this transaction.");
  const tx = Transaction.from(Uint8Array.from(atob(intent.transactionBase64), c => c.charCodeAt(0)));
  if (tx.instructions.length !== 1 || tx.instructions[0]?.programId.toBase58() !== configuredProgram) throw new Error("The prepared transaction does not match the SeatBack program.");
  const expectedSigners = tx.signatures.map(s => s.publicKey.toBase58());
  if (!expectedSigners.includes(publicKey.toBase58())) throw new Error("The connected wallet is not a required signer.");
  const signed = await wallet.signTransaction(tx);
  if (!signed.serializeMessage().equals(tx.serializeMessage())) throw new Error("Wallet changed the transaction message. Nothing was submitted.");
  if (!signed.verifySignatures(false)) throw new Error("Transaction signatures are invalid. Nothing was submitted.");
  const signedTransactionBase64 = encode(signed.serialize({ requireAllSignatures: false, verifySignatures: true }));
  const response = await fetch(`${apiBase}/v1/transactions/submit`, {
    method: "POST", credentials: "include", headers: {
      Accept: "application/json", "Content-Type": "application/json",
      "X-CSRF-Token": sessionStorage.getItem("seatback.csrf") ?? "", "Idempotency-Key": crypto.randomUUID(),
    }, body: JSON.stringify({ intentId: intent.intentId, signedTransactionBase64 }),
  });
  const receipt = await response.json() as TxReceipt | { error?: { message?: string } };
  if (!response.ok) throw new Error((receipt as {error?:{message?:string}}).error?.message ?? `Transaction submission failed (${response.status}).`);
  return receipt as TxReceipt;
}

export async function waitForReceipt(intent: TxIntent, initial: TxReceipt, api: (path: string) => Promise<TxReceipt>, onPending?: (receipt: TxReceipt) => void): Promise<TxReceipt> {
  let receipt = initial;
  while (receipt.status === "pending" && Date.now() < intent.expiresAt * 1000) {
    onPending?.(receipt);
    await new Promise(resolve => setTimeout(resolve, 1800));
    receipt = await api(`/v1/transactions/${encodeURIComponent(intent.intentId)}`);
  }
  if (receipt.status === "pending") throw new Error("Transaction is still pending or expired. Check your dashboard before requesting a replacement.");
  if (receipt.status === "failed") throw new Error("The network rejected this transaction. Your account state was not marked successful.");
  return receipt;
}
