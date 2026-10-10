# Database
Migration is a proposed schema, not applied automatically. Dev DB only.
Use Supabase CLI migration tooling or psql against a disposable PostgreSQL DB with pgcrypto.
Tables are private; custom wallet sessions are handled by API, not auth.uid().
No RLS policies grant browsers access. Supabase service role remains server-only.
Production grants, connection pooling, backups and retention require separate configuration.
All monetary columns numeric(20,0) map to JSON decimal strings; never cast to JS Number.
DB timestamps map to integer UTC Unix seconds at API boundary. policy_snapshot uses shared camelCase DTO.
Projectors must lock event row, validate confirmed chain state, and update counters/snapshot atomically.
DB constraints protect local consistency, not chain enforcement; on-chain checks remain authoritative.
Private evidence_text is intentionally server-only; encrypt/retention controls are a later requirement.
