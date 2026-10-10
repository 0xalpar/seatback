begin;
alter table public.transaction_intents add column effects jsonb not null default '{}';
alter table public.transaction_intents add column projected_at timestamptz;
alter table public.events add column projection_slot bigint not null default 0;
alter table public.registrations add column projection_slot bigint not null default 0;
alter table public.disputes add column projection_slot bigint not null default 0;
alter table public.outbox_jobs add column lease_token uuid;
create table public.rate_limits (
  bucket text primary key, count integer not null, resets_at timestamptz not null
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from public;
do $$ begin
 if exists(select 1 from pg_roles where rolname='anon') then revoke all on public.rate_limits from anon; end if;
 if exists(select 1 from pg_roles where rolname='authenticated') then revoke all on public.rate_limits from authenticated; end if;
end $$;
create index intents_pending on public.transaction_intents(created_at) where projected_at is null;
create index sessions_cleanup on public.sessions(expires_at);
create index challenges_cleanup on public.auth_challenges(expires_at);
commit;
