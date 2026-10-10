\set ON_ERROR_STOP on
DO $$
DECLARE expected text[] := ARRAY['wallets','auth_challenges','sessions','events','event_access',
 'registrations','waitlist_entries','seat_offers','event_scanners','transaction_intents',
 'qr_challenges','attendance_records','disputes','idempotency_keys','chain_events','outbox_jobs','rate_limits'];
BEGIN
 IF current_setting('server_version_num')::integer NOT BETWEEN 160000 AND 169999 THEN
  RAISE EXCEPTION 'PostgreSQL 16 required';
 END IF;
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname=ANY(expected) AND c.relkind='r' AND c.relrowsecurity) <> 17 THEN
  RAISE EXCEPTION 'Application tables missing or RLS disabled';
 END IF;
 IF (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O'
     AND tgname IN ('immutable_event_terms','immutable_registration_snapshot')) <> 2 THEN
  RAISE EXCEPTION 'Immutability triggers missing';
 END IF;
 IF (SELECT count(*) FROM seatback_migrations WHERE name IN
     ('202610100001_foundation.sql','202610100002_backend.sql') AND length(sha256)=64) <> 2 THEN
  RAISE EXCEPTION 'Migration ledger incomplete';
 END IF;
 IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema='public'
     AND table_name='outbox_jobs' AND column_name='lease_token') THEN
  RAISE EXCEPTION 'Worker lease migration missing';
 END IF;
END $$;
SELECT 'PostgreSQL 16 schema, 17 RLS tables, policy triggers and migrations verified' AS result;
