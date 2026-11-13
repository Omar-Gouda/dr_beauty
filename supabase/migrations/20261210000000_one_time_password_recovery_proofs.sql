begin;

-- Store only a digest of each random recovery nonce. The signed cookie proves
-- issuance; these rows enforce single-use consumption across app instances.
create table private.auth_recovery_proofs (
  nonce_digest bytea primary key
    check (pg_catalog.octet_length(nonce_digest) = 32),
  user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  consumed_at timestamptz,
  check (expires_at > created_at)
);

create index auth_recovery_proofs_expiry_idx
  on private.auth_recovery_proofs (expires_at, nonce_digest);
create unique index auth_recovery_proofs_one_unconsumed_per_user_idx
  on private.auth_recovery_proofs (user_id)
  where consumed_at is null;

alter table private.auth_recovery_proofs enable row level security;
revoke all privileges on table private.auth_recovery_proofs
  from public, anon, authenticated, service_role;

create function public.register_auth_recovery_proof(
  p_nonce_digest text,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_claims jsonb := auth.jwt();
  v_inserted integer;
begin
  if v_user_id is null
     or v_claims is null
     or pg_catalog.jsonb_typeof(v_claims -> 'amr') is distinct from 'array'
     or p_nonce_digest is null
     or p_nonce_digest !~ '^[0-9a-f]{64}$'
     or p_expires_at is null
     or p_expires_at <= pg_catalog.clock_timestamp()
     or p_expires_at > pg_catalog.clock_timestamp() + interval '15 minutes'
     or not exists (
       select 1
       from pg_catalog.jsonb_array_elements(v_claims -> 'amr') as auth_method(value)
       where auth_method.value ->> 'method' = 'recovery'
     ) then
    return false;
  end if;

  -- Serialize registrations for this user. Hash collisions only serialize
  -- unrelated accounts; they cannot weaken uniqueness or user binding.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('dr-beauty:auth-recovery-proof:' || v_user_id::text, 0)
  );

  -- Hold the referenced account against concurrent deletion until this
  -- registration transaction completes.
  perform 1
  from auth.users as account
  where account.id = v_user_id
  for key share;
  if not found then
    return false;
  end if;

  -- Bound cleanup work on each registration. SKIP LOCKED avoids waiting for
  -- another registration/consumer that is already handling an expired row.
  delete from private.auth_recovery_proofs as expired
  where expired.nonce_digest in (
    select candidate.nonce_digest
    from private.auth_recovery_proofs as candidate
    where candidate.expires_at <= pg_catalog.clock_timestamp()
    order by candidate.expires_at, candidate.nonce_digest
    limit 100
    for update skip locked
  );

  -- A newly issued recovery link supersedes any previous one, including an
  -- expired but not yet cleaned-up proof. The partial unique index is the
  -- final integrity guard for all registration paths.
  delete from private.auth_recovery_proofs as previous
  where previous.user_id = v_user_id
    and previous.consumed_at is null;

  insert into private.auth_recovery_proofs (nonce_digest, user_id, expires_at)
  values (pg_catalog.decode(p_nonce_digest, 'hex'), v_user_id, p_expires_at)
  on conflict (nonce_digest) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;
alter function public.register_auth_recovery_proof(text, timestamptz) owner to postgres;
revoke all on function public.register_auth_recovery_proof(text, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.register_auth_recovery_proof(text, timestamptz)
  to authenticated;

create function public.consume_auth_recovery_proof(
  p_nonce_digest text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_claims jsonb := auth.jwt();
  v_consumed boolean := false;
begin
  if v_user_id is null
     or v_claims is null
     or pg_catalog.jsonb_typeof(v_claims -> 'amr') is distinct from 'array'
     or p_nonce_digest is null
     or p_nonce_digest !~ '^[0-9a-f]{64}$'
     or not exists (
       select 1
       from pg_catalog.jsonb_array_elements(v_claims -> 'amr') as auth_method(value)
       where auth_method.value ->> 'method' = 'recovery'
     ) then
    return false;
  end if;

  -- This single conditional UPDATE is the consume operation. Only one
  -- concurrent transaction can change an unconsumed row and receive true.
  update private.auth_recovery_proofs as proof
  set consumed_at = pg_catalog.clock_timestamp()
  where proof.nonce_digest = pg_catalog.decode(p_nonce_digest, 'hex')
    and proof.user_id = v_user_id
    and proof.expires_at > pg_catalog.clock_timestamp()
    and proof.consumed_at is null
  returning true into v_consumed;

  return coalesce(v_consumed, false);
end;
$$;
alter function public.consume_auth_recovery_proof(text) owner to postgres;
revoke all on function public.consume_auth_recovery_proof(text)
  from public, anon, authenticated, service_role;
grant execute on function public.consume_auth_recovery_proof(text)
  to authenticated;

commit;
