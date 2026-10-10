/** No worker runs in this phase. See docs/architecture.md for retry/locking semantics. */
export const plannedJobs = ["index-confirmed-transactions", "expire-seat-offers",
  "promote-waitlist", "mark-no-shows", "retry-outbox"] as const;
