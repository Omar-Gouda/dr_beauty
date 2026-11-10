begin;

create table private.current_policy_versions (
  singleton boolean primary key default true check (singleton),
  terms_version text not null check (terms_version ~ '^[a-z0-9-]{1,64}$'),
  privacy_version text not null check (privacy_version ~ '^[a-z0-9-]{1,64}$'),
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);
insert into private.current_policy_versions (singleton, terms_version, privacy_version)
values (true, 'terms-2026-11-10', 'privacy-2026-11-10');
alter table private.current_policy_versions enable row level security;
revoke all privileges on table private.current_policy_versions
  from public, anon, authenticated, service_role;

create table private.account_policy_acceptances (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  terms_version text not null check (terms_version ~ '^[a-z0-9-]{1,64}$'),
  privacy_version text not null check (privacy_version ~ '^[a-z0-9-]{1,64}$'),
  accepted_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (user_id, terms_version, privacy_version)
);
create index account_policy_acceptances_latest_idx
  on private.account_policy_acceptances (user_id, accepted_at desc, id desc);
alter table private.account_policy_acceptances enable row level security;
revoke all privileges on table private.account_policy_acceptances
  from public, anon, authenticated, service_role;

create function private.record_required_policy_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_versions private.current_policy_versions%rowtype;
begin
  select versions.* into strict v_versions
  from private.current_policy_versions as versions
  where versions.singleton is true;

  if new.raw_user_meta_data ->> 'policy_consent' is distinct from 'true'
     or new.raw_user_meta_data ->> 'accepted_terms_version' is distinct from v_versions.terms_version
     or new.raw_user_meta_data ->> 'accepted_privacy_version' is distinct from v_versions.privacy_version then
    raise exception using
      errcode = '23514',
      message = 'Acceptance of the current Terms & Conditions and Privacy Policy is required.';
  end if;

  insert into private.account_policy_acceptances (
    user_id, terms_version, privacy_version, accepted_at
  ) values (
    new.id, v_versions.terms_version, v_versions.privacy_version, pg_catalog.clock_timestamp()
  );
  return new;
end;
$$;
alter function private.record_required_policy_consent() owner to postgres;
revoke all on function private.record_required_policy_consent()
  from public, anon, authenticated, service_role;
create trigger auth_user_record_policy_consent
  after insert on auth.users
  for each row execute function private.record_required_policy_consent();

create function public.get_current_policy_consent_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_versions private.current_policy_versions%rowtype;
  v_acceptance private.account_policy_acceptances%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  select versions.* into strict v_versions
  from private.current_policy_versions as versions
  where versions.singleton is true;

  select acceptance.* into v_acceptance
  from private.account_policy_acceptances as acceptance
  where acceptance.user_id = v_user_id
  order by acceptance.accepted_at desc, acceptance.id desc
  limit 1;

  return pg_catalog.jsonb_build_object(
    'terms_version', v_versions.terms_version,
    'privacy_version', v_versions.privacy_version,
    'accepted_terms_version', v_acceptance.terms_version,
    'accepted_privacy_version', v_acceptance.privacy_version,
    'accepted_at', v_acceptance.accepted_at,
    'needs_acceptance', v_acceptance.id is null
      or v_acceptance.terms_version is distinct from v_versions.terms_version
      or v_acceptance.privacy_version is distinct from v_versions.privacy_version
  );
end;
$$;
alter function public.get_current_policy_consent_status() owner to postgres;
revoke all on function public.get_current_policy_consent_status()
  from public, anon, authenticated, service_role;
grant execute on function public.get_current_policy_consent_status() to authenticated;

create function public.accept_current_policy_versions()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_versions private.current_policy_versions%rowtype;
  v_acceptance private.account_policy_acceptances%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  select versions.* into strict v_versions
  from private.current_policy_versions as versions
  where versions.singleton is true;

  insert into private.account_policy_acceptances (
    user_id, terms_version, privacy_version
  ) values (
    v_user_id, v_versions.terms_version, v_versions.privacy_version
  ) on conflict (user_id, terms_version, privacy_version) do nothing;

  select acceptance.* into strict v_acceptance
  from private.account_policy_acceptances as acceptance
  where acceptance.user_id = v_user_id
    and acceptance.terms_version = v_versions.terms_version
    and acceptance.privacy_version = v_versions.privacy_version;

  return pg_catalog.jsonb_build_object(
    'terms_version', v_acceptance.terms_version,
    'privacy_version', v_acceptance.privacy_version,
    'accepted_at', v_acceptance.accepted_at
  );
end;
$$;
alter function public.accept_current_policy_versions() owner to postgres;
revoke all on function public.accept_current_policy_versions()
  from public, anon, authenticated, service_role;
grant execute on function public.accept_current_policy_versions() to authenticated;

commit;
