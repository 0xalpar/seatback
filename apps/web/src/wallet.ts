import type { Transaction } from "@solana/web3.js";
export type WalletKind = "phantom" | "solflare";
export type WalletProvider = {
  publicKey?: { toBase58(): string };
  isPhantom?: boolean;
  connect(): Promise<{publicKey: {toBase58(): string}} | void>;
  disconnect(): Promise<void>;
  on?(event: "accountChanged" | "disconnect", callback: (key?: {toBase58(): string} | null) => void): void;
  removeListener?(event: "accountChanged" | "disconnect", callback: (key?: {toBase58(): string} | null) => void): void;
  signMessage?(message: Uint8Array, encoding?: "utf8"): Promise<{signature: Uint8Array} | Uint8Array>;
  signTransaction?(transaction: Transaction): Promise<Transaction>;
};
export type WalletScope = {phantom?: {solana?: WalletProvider}; solana?: WalletProvider; solflare?: WalletProvider};
let selected: WalletKind = "phantom";
export function selectWallet(kind: WalletKind) { selected = kind; }
export function injectedWallet(kind: WalletKind, scope: WalletScope): WalletProvider | undefined {
  if (kind === "solflare") return scope.solflare;
  return scope.phantom?.solana ?? (scope.solana?.isPhantom ? scope.solana : undefined);
}
export function walletProvider() { return injectedWallet(selected, window as Window & WalletScope); }
export function messageSignature(signed: {signature: Uint8Array} | Uint8Array): Uint8Array {
  const bytes = signed instanceof Uint8Array ? signed : signed.signature;
  if (!(bytes instanceof Uint8Array) || bytes.length !== 64) throw new Error("Wallet returned an invalid message signature.");
  return bytes;
}
