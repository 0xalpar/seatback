export interface WebEnvironment {
  VITE_PROGRAM_ID?: string;
  VITE_SEATBACK_PROGRAM_ID?: string;
  VITE_API_BASE?: string;
  VITE_API_BASE_URL?: string;
}

// Canonical names are shared by API requests and transaction submission. Older examples
// remain compatible, but conflicting aliases must never select a different signing program.
export function resolveWebConfig(env: WebEnvironment) {
  const primary = env.VITE_PROGRAM_ID?.trim();
  const alias = env.VITE_SEATBACK_PROGRAM_ID?.trim();
  if (primary && alias && primary !== alias) throw new Error("Conflicting SeatBack program IDs in frontend configuration.");
  const normalizeBase = (value: string) => value.replace(/\/$/, "");
  if (env.VITE_API_BASE !== undefined && env.VITE_API_BASE_URL !== undefined &&
      normalizeBase(env.VITE_API_BASE) !== normalizeBase(env.VITE_API_BASE_URL)) {
    throw new Error("Conflicting API base URLs in frontend configuration.");
  }
  return {
    programId: primary || alias,
    // An explicitly empty base is intentional: use the browser origin through Nginx.
    apiBase: normalizeBase(env.VITE_API_BASE ?? env.VITE_API_BASE_URL ?? "http://localhost:3001"),
  };
}

export const webConfig = resolveWebConfig((import.meta as ImportMeta & {env?: WebEnvironment}).env ?? {});
