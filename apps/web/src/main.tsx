import React from "react";
import { createRoot } from "react-dom/client";
import { API_VERSION } from "@seatback/contracts";
import "./styles.css";
function App() {
  return <main><span className="badge">SOLANA DEVNET · FOUNDATION</span>
    <h1>SeatBack</h1><p>Reserve a seat. Show up. Get your deposit back.</p>
    <section><h2>Development workspace ready</h2>
    <p>Event browsing, Phantom connection, dashboards, waitlists and QR attendance are planned. No deposits can be made in this skeleton.</p>
    <p>API contract: {API_VERSION}. Read docs/frontend-task.md before implementation.</p></section></main>;
}
const root = document.getElementById("root");
if (!root) throw new Error("Missing root");
createRoot(root).render(<React.StrictMode><App /></React.StrictMode>);
