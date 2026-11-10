begin;

-- Require users to review and acknowledge the revised legal-policy versions.
update private.current_policy_versions
set terms_version = 'terms-2026-11-10-r2',
    privacy_version = 'privacy-2026-11-10-r2',
    updated_at = pg_catalog.clock_timestamp()
where singleton is true;

-- Public ranking displays a customer name only after an affirmative choice.
alter table public.profiles
  alter column show_public_ranking set default false;

update public.profiles
set show_public_ranking = false
where show_public_ranking is distinct from false;

comment on column public.profiles.show_public_ranking is
  'Optional affirmative consent to display the profile name in public customer rankings. Defaults to false.';

commit;
