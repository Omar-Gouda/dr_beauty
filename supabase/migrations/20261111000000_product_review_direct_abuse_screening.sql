begin;

-- Extend the existing deterministic baseline screen. Low ratings and negative
-- product feedback remain allowed; only direct threats or person-directed
-- abuse are rejected. The existing trigger, ownership policy and grants stay
-- unchanged because CREATE OR REPLACE preserves the function ACL.
create or replace function private.validate_product_review_content()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_content text := coalesce(new.title, '') || ' ' || new.body;
begin
  if tg_op = 'UPDATE'
     and new.title is not distinct from old.title
     and new.body is not distinct from old.body then
    return new;
  end if;

  if v_content ~* '(^|[^[:alnum:]_])(i|we)[[:space:]]+(will|am going to|are going to|want to)[[:space:]]+(kill|hurt|attack|harm|rape|stab|shoot)[[:space:]]+(you|him|her|them|someone|somebody)($|[^[:alnum:]_])'
     or v_content ~* '(^|[^[:alnum:]_])(i|we)[[:space:]]+(will|am going to|are going to)[[:space:]]+(burn|destroy)[[:space:]]+(your|their|his|her)[[:space:]]+(home|house|store|business)($|[^[:alnum:]_])'
     or v_content ~* '(^|[^[:alnum:]_])you([[:space:]]+are|''re)?[[:space:]]+(a[[:space:]]+|an[[:space:]]+)?(worthless|idiot|moron|stupid|bastard|bitch|whore|scammer)($|[^[:alnum:]_])'
     or v_content ~* '(^|[^[:alnum:]_])(shut[[:space:]]+up|fuck[[:space:]]+off|f[u*]ck[[:space:]]+you)($|[^[:alnum:]_])' then
    raise exception using errcode = '22023',
      message = 'Review content is not allowed.';
  end if;
  return new;
end;
$$;

commit;
