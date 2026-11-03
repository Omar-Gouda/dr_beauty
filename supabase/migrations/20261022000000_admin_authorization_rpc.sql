begin;

-- The role table remains private to PostgREST. This narrow RPC lets the
-- authenticated server session verify its own admin status without exposing
-- role rows or accepting a caller-supplied user ID.
create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.is_admin(), false);
$$;

revoke all on function public.is_current_user_admin() from public, anon, service_role;
grant execute on function public.is_current_user_admin() to authenticated;

commit;
