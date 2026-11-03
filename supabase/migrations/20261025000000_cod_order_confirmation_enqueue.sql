begin;

-- Queue the confirmation as part of the order INSERT transaction. This trigger
-- sends nothing; it records only the order reference and recipient for a worker.
create function private.enqueue_cod_order_confirmation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.customer_email is null
     or pg_catalog.length(new.customer_email) not between 3 and 320 then
    raise exception using
      errcode = '23514',
      message = 'A valid customer email is required to create this order.';
  end if;

  insert into public.email_deliveries (
    order_id,
    delivery_type,
    recipient_email,
    idempotency_key
  ) values (
    new.id,
    'order_confirmation',
    new.customer_email,
    'order-confirmation:' || new.id::text
  )
  on conflict (order_id, delivery_type) where order_id is not null do nothing;

  return new;
end;
$$;

revoke all on function private.enqueue_cod_order_confirmation()
  from public, anon, authenticated, service_role;

create trigger orders_enqueue_cod_confirmation
  after insert on public.orders
  for each row execute function private.enqueue_cod_order_confirmation();

commit;
