-- Security + correctness hardening for the fuel dispatch schema.
--
-- 1. Stop leaking the staff directory to every signed-in account.
-- 2. Keep the audit trail readable while that hole is closed.
-- 3. Expose actor ids so the app can build a real "my orders" view.
-- 4. Take the RPC surface away from anonymous callers.
-- 5. Index the columns the order board actually filters on.

-- ---------------------------------------------------------------------------
-- 1. A name resolver that survives a locked-down profiles table.
--    orders_view runs with security_invoker, so once profiles is restricted a
--    plain join would blank out "requested by" for non-admins. This function
--    exposes the one field the UI needs and nothing else.
-- ---------------------------------------------------------------------------
create or replace function public.display_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$ select full_name from public.profiles where id = p_user $$;

revoke all on function public.display_name(uuid) from public, anon;
grant execute on function public.display_name(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. orders_view: keep every existing column, add the actor ids, and resolve
--    names through display_name instead of joining profiles directly.
-- ---------------------------------------------------------------------------
-- CREATE OR REPLACE cannot reorder columns, so replace the view outright.
drop view if exists public.orders_view;
create view public.orders_view
with (security_invoker = true) as
select
  o.id,
  o.order_no,
  o.status,
  o.quantity,
  o.needed_date,
  o.note,
  o.created_at,
  o.station_id,
  s.code                        as station_code,
  s.name_en                     as station_name_en,
  s.name_ku                     as station_name_ku,
  s.phone                       as station_phone,
  s.location                    as station_location,
  o.product_id,
  p.name_en                     as product_name_en,
  p.name_ku                     as product_name_ku,
  p.unit                        as product_unit,
  o.created_by,
  public.display_name(o.created_by)   as created_by_name,
  o.decided_at,
  o.decision_note,
  o.decided_by,
  public.display_name(o.decided_by)   as decided_by_name,
  o.loaded_at,
  o.loaded_quantity,
  o.truck_no,
  o.driver_name,
  o.load_note,
  o.loaded_by,
  public.display_name(o.loaded_by)    as loaded_by_name,
  o.delivered_at,
  o.received_quantity,
  o.delivery_note,
  o.delivered_by,
  public.display_name(o.delivered_by) as delivered_by_name,
  o.manifest_path,
  o.manifest_no
from public.orders o
  join public.stations s on s.id = o.station_id
  join public.products p on p.id = o.product_id;

revoke all on public.orders_view from public, anon;
grant select on public.orders_view to authenticated;

-- ---------------------------------------------------------------------------
-- 3. profiles: a station clerk no longer reads the whole staff directory
--    (names, phone numbers, roles, station assignments of everyone).
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.my_role() in ('admin', 'manager')
  );

-- ---------------------------------------------------------------------------
-- 4. Nothing here is meant for anonymous callers. Every function already
--    checks my_role(), but an unauthenticated caller should not even be able
--    to probe them. Trigger functions are not callable API at all.
-- ---------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'admin_create_user', 'admin_delete_user', 'admin_list_users', 'admin_set_password',
        'cancel_order', 'confirm_delivery', 'decide_order', 'mark_loaded', 'place_order',
        'my_role', 'my_station', 'is_active_user',
        'handle_new_user', 'guard_profile_changes'
      )
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    if f.proname not in ('handle_new_user', 'guard_profile_changes') then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Guard rails on the numbers, so a fat finger cannot write nonsense.
-- ---------------------------------------------------------------------------
alter table public.orders
  drop constraint if exists orders_loaded_quantity_check,
  drop constraint if exists orders_received_quantity_check;

alter table public.orders
  add constraint orders_loaded_quantity_check
    check (loaded_quantity is null or loaded_quantity > 0),
  add constraint orders_received_quantity_check
    check (received_quantity is null or received_quantity >= 0);

-- ---------------------------------------------------------------------------
-- 6. Indexes for the queries the board runs on every load.
-- ---------------------------------------------------------------------------
create index if not exists orders_created_at_idx    on public.orders (created_at desc);
create index if not exists orders_status_idx        on public.orders (status);
create index if not exists orders_station_idx       on public.orders (station_id, created_at desc);
create index if not exists orders_created_by_idx    on public.orders (created_by);
create index if not exists orders_decided_by_idx    on public.orders (decided_by);
create index if not exists orders_loaded_by_idx     on public.orders (loaded_by);
create index if not exists orders_delivered_by_idx  on public.orders (delivered_by);
create index if not exists order_events_order_idx   on public.order_events (order_id, created_at);
