-- Proposed foundation migration. Apply only to a disposable development database first.
-- API uses server credentials; no browser table access is granted.
begin;
-- gen_random_uuid() is built into supported PostgreSQL (13+); no extension required.
create table public.wallets (
  address text primary key check (address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  created_at timestamptz not null default now()
);
create table public.auth_challenges (
  id uuid primary key default gen_random_uuid(), wallet text not null,
  nonce_hash bytea not null unique, message text not null, domain text not null, uri text not null,
  expires_at timestamptz not null, consumed_at timestamptz, created_at timestamptz not null default now()
);
create table public.sessions (
  id uuid primary key default gen_random_uuid(), wallet text not null references public.wallets(address),
  token_hash bytea not null unique, csrf_hash bytea not null,
  expires_at timestamptz not null, revoked_at timestamptz, created_at timestamptz not null default now()
);
create table public.events (
  id uuid primary key default gen_random_uuid(), organizer text not null references public.wallets(address),
  event_pda text unique, title text not null check (length(title) between 1 and 120),
  description text not null default '' check (length(description)<=10000),
  location text not null check (length(location) between 1 and 500),
  visibility text not null check (visibility in ('public','private')),
  status text not null default 'draft' check (status in ('draft','open','cancelled','closed')),
  access_code_hash text, capacity integer not null check (capacity>0),
  registration_limit integer not null check (registration_limit>=capacity),
  registrations_created integer not null default 0 check (registrations_created>=0),
  occupied_seats integer not null default 0 check (occupied_seats>=0),
  held_offers integer not null default 0 check (held_offers>=0),
  deposit_lamports numeric(20,0) not null check (deposit_lamports between 1 and 18446744073709551615),
  rule1_deadline timestamptz not null, rule2_deadline timestamptz not null,
  check_in_opens_at timestamptz not null, check_in_closes_at timestamptz not null,
  event_starts_at timestamptz not null, event_ends_at timestamptz not null,
  dispute_seconds integer not null default 86400 check (dispute_seconds=86400),
  gate_authority text not null, dispute_authority text not null,
  policy_hash bytea not null check (octet_length(policy_hash)=32),
  metadata_hash bytea not null check (octet_length(metadata_hash)=32),
  terms_locked boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (rule1_deadline<rule2_deadline and rule2_deadline<=check_in_opens_at
    and check_in_opens_at<=event_starts_at and event_starts_at<check_in_closes_at
    and check_in_closes_at<=event_ends_at),
  check (occupied_seats+held_offers<=capacity),
  check (registrations_created+held_offers<=registration_limit),
  check (dispute_authority<>organizer and dispute_authority<>gate_authority),
  check ((visibility='private' and access_code_hash is not null) or visibility='public')
);
create index events_public_search on public.events using gin
  (to_tsvector('simple',title || ' ' || description || ' ' || location)) where visibility='public';
create index events_organizer on public.events(organizer,created_at desc,id);
create table public.event_access (
  event_id uuid not null references public.events(id), wallet text not null references public.wallets(address),
  expires_at timestamptz not null, primary key(event_id,wallet)
);
create table public.registrations (
  id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id),
  wallet text not null references public.wallets(address), reservation_pda text not null unique,
  status text not null check (status in ('reserved','attended','cancelled','no_show','disputed','settled')),
  policy_snapshot jsonb not null, policy_hash bytea not null check (octet_length(policy_hash)=32),
  deposit_lamports numeric(20,0) not null check (deposit_lamports between 1 and 18446744073709551615),
  participant_paid_lamports numeric(20,0) not null default 0 check (participant_paid_lamports>=0),
  organizer_allocated_lamports numeric(20,0) not null default 0 check (organizer_allocated_lamports>=0),
  organizer_paid_lamports numeric(20,0) not null default 0 check (organizer_paid_lamports>=0),
  dispute_deadline timestamptz not null, attended_at timestamptz, transaction_signature text,
  created_at timestamptz not null default now(), unique(event_id,wallet),
  check (participant_paid_lamports+organizer_allocated_lamports<=deposit_lamports),
  check (organizer_paid_lamports<=organizer_allocated_lamports)
);
create index registrations_history on public.registrations(wallet,created_at desc,id);
create table public.waitlist_entries (
  id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id),
  wallet text not null references public.wallets(address), created_at timestamptz not null default now(),
  status text not null default 'queued' check (status in ('queued','offered','accepted','expired','left')),
  unique(event_id,wallet)
);
create index waitlist_fifo on public.waitlist_entries(event_id,created_at,id) where status='queued';
create table public.seat_offers (
  id uuid primary key default gen_random_uuid(), entry_id uuid not null references public.waitlist_entries(id),
  event_id uuid not null references public.events(id), wallet text not null references public.wallets(address),
  offer_pda text unique, expires_at timestamptz not null,
  status text not null check (status in ('pending','active','accepted','expired','cancelled')),
  transaction_signature text, created_at timestamptz not null default now()
);
create unique index one_live_offer on public.seat_offers(entry_id) where status in ('pending','active');
create table public.event_scanners (
  event_id uuid not null references public.events(id), wallet text not null references public.wallets(address),
  active boolean not null default true, scanner_pda text, primary key(event_id,wallet)
);
create table public.transaction_intents (
  id uuid primary key default gen_random_uuid(), wallet text not null references public.wallets(address),
  event_id uuid references public.events(id), kind text not null,
  message_hash bytea not null check (octet_length(message_hash)=32),
  expected_signers text[] not null, transaction_base64 text not null,
  last_valid_block_height bigint not null, expires_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','confirmed','failed','expired')),
  signature text unique, created_at timestamptz not null default now()
);
create table public.qr_challenges (
  id uuid primary key default gen_random_uuid(), registration_id uuid not null references public.registrations(id),
  token_hash bytea not null unique check (octet_length(token_hash)=32),
  expires_at timestamptz not null, lease_expires_at timestamptz, consumed_at timestamptz,
  intent_id uuid references public.transaction_intents(id), created_at timestamptz not null default now()
);
create table public.attendance_records (
  registration_id uuid primary key references public.registrations(id),
  scanner_wallet text not null references public.wallets(address),
  qr_challenge_id uuid not null unique references public.qr_challenges(id),
  signature text not null unique, confirmed_at timestamptz not null
);
create table public.disputes (
  id uuid primary key default gen_random_uuid(), registration_id uuid not null unique references public.registrations(id),
  dispute_pda text unique, evidence_text text not null check (length(evidence_text) between 1 and 4000),
  evidence_hash bytea not null check (octet_length(evidence_hash)=32),
  status text not null check (status in ('pending','open','resolved')),
  outcome text check (outcome in ('participant','organizer')), opened_at timestamptz,
  resolved_at timestamptz, resolution_signature text,
  check ((status='resolved') = (outcome is not null and resolved_at is not null))
);
create table public.idempotency_keys (
  wallet text not null references public.wallets(address), route text not null, key uuid not null,
  request_hash bytea not null, response jsonb, http_status integer, expires_at timestamptz not null,
  primary key(wallet,route,key)
);
create table public.chain_events (
  signature text not null, instruction_index integer not null, slot bigint not null,
  event_pda text not null, event_type text not null, payload jsonb not null,
  commitment text not null check (commitment in ('confirmed','finalized','orphaned')),
  observed_at timestamptz not null default now(), primary key(signature,instruction_index)
);
create table public.outbox_jobs (
  id uuid primary key default gen_random_uuid(), dedupe_key text not null unique,
  kind text not null, payload jsonb not null, status text not null default 'pending'
    check (status in ('pending','leased','done','dead')),
  attempts integer not null default 0 check (attempts>=0),
  available_at timestamptz not null default now(), lease_expires_at timestamptz,
  last_error_code text, created_at timestamptz not null default now()
);
create index outbox_ready on public.outbox_jobs(available_at,id) where status in ('pending','leased');

create function public.prevent_policy_mutation() returns trigger language plpgsql as $$
begin
  if old.terms_locked and (
    row(new.organizer,new.title,new.description,new.location,new.visibility,new.capacity,new.registration_limit,
      new.deposit_lamports,new.rule1_deadline,new.rule2_deadline,new.check_in_opens_at,new.check_in_closes_at,
      new.event_starts_at,new.event_ends_at,new.dispute_seconds,new.gate_authority,new.dispute_authority,
      new.policy_hash,new.metadata_hash,new.terms_locked)
    is distinct from
    row(old.organizer,old.title,old.description,old.location,old.visibility,old.capacity,old.registration_limit,
      old.deposit_lamports,old.rule1_deadline,old.rule2_deadline,old.check_in_opens_at,old.check_in_closes_at,
      old.event_starts_at,old.event_ends_at,old.dispute_seconds,old.gate_authority,old.dispute_authority,
      old.policy_hash,old.metadata_hash,old.terms_locked)) then
    raise exception 'registered event terms are immutable';
  end if;
  return new;
end $$;
create trigger immutable_event_terms before update on public.events
  for each row execute function public.prevent_policy_mutation();
create function public.prevent_snapshot_mutation() returns trigger language plpgsql as $$
begin
  if row(new.event_id,new.wallet,new.reservation_pda,new.policy_snapshot,new.policy_hash,new.deposit_lamports,new.dispute_deadline)
    is distinct from row(old.event_id,old.wallet,old.reservation_pda,old.policy_snapshot,old.policy_hash,old.deposit_lamports,old.dispute_deadline)
  then raise exception 'registration snapshot is immutable'; end if;
  return new;
end $$;
create trigger immutable_registration_snapshot before update on public.registrations
  for each row execute function public.prevent_snapshot_mutation();
-- RLS with no policies = deny all ordinary roles. Service role/server still needs API authorization.
do $$
declare table_name text;
begin
  foreach table_name in array array['wallets','auth_challenges','sessions','events','event_access',
    'registrations','waitlist_entries','seat_offers','event_scanners','transaction_intents',
    'qr_challenges','attendance_records','disputes','idempotency_keys','chain_events','outbox_jobs']
  loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('revoke all on table public.%I from public',table_name);
    if exists(select 1 from pg_roles where rolname='anon') then
      execute format('revoke all on table public.%I from anon',table_name);
    end if;
    if exists(select 1 from pg_roles where rolname='authenticated') then
      execute format('revoke all on table public.%I from authenticated',table_name);
    end if;
  end loop;
end $$;
commit;
