import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { API_VERSION } from "@seatback/contracts";
export function createApiServer() {
  return createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    const requestId = randomUUID();
    res.setHeader("X-Request-Id", requestId);
    if (req.method === "GET" && req.url === "/health") {
      res.end(JSON.stringify({ status: "ok", apiVersion: API_VERSION, cluster: "devnet", mode: "skeleton" }));
      return;
    }
    // Fail closed: no simulated authentication, deposits, or successful writes.
    res.statusCode = req.url?.startsWith("/v1/") ? 501 : 404;
    res.end(JSON.stringify({ error: { code: res.statusCode === 501 ? "NOT_IMPLEMENTED" : "NOT_FOUND",
      message: "See docs/api-contract.md", requestId, retryable: false } }));
  });
}
