import { createApiServer } from "./server.js";
if (process.env.SOLANA_CLUSTER && process.env.SOLANA_CLUSTER !== "devnet") {
  throw new Error("Only devnet is allowed");
}
const port = Number(process.env.PORT ?? "3001");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
createApiServer().listen(port, "127.0.0.1", () => console.log("SeatBack API skeleton: http://localhost:" + port));
