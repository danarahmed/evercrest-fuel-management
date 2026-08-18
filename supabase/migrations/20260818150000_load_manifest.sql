-- Let the yard attach the manifest when it loads a truck, and let the
-- receiving station open it.
--
-- Until now the only document on an order was the one the station uploads at
-- delivery. The yard had nothing to attach, and the storage role could not
-- write to the bucket at all.

-- 1. Where the load manifest lives on the order.
alter table public.orders
  add column if not exists load_manifest_path text,
  add column if not exists load_manifest_no   text;

-- 2. Storage may now upload. Files still have to land in the folder of the
--    station the order belongs to — that is exactly what makes the document
--    readable by that station and by nobody else's station, since
--    manifests_select scopes a station to its own folder.
drop policy if exists manifests_insert on storage.objects;
create policy manifests_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'manifests'
    and (
      public.my_role() = 'admin'
      or public.my_role() = 'storage'
      or (public.my_role() = 'station'
          and (storage.foldername(name))[1] = (public.my_station())::text)
    )
  );

-- 3. mark_loaded carries the manifest. New optional arguments mean the
--    signature changes, and Postgres cannot do that with CREATE OR REPLACE
--    without leaving an ambiguous overload behind, so replace it outright.
drop function if exists public.mark_loaded(uuid, numeric, text, text, text);

create function public.mark_loaded(
  p_order           uuid,
  p_loaded_quantity numeric default null,
  p_truck           text    default null,
  p_driver          text    default null,
  p_note            text    default null,
  p_manifest_path   text    default null,
  p_manifest_no     text    default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role public.user_role; v_status public.order_status;
  v_qty numeric; v_station uuid;
begin
  v_role := public.my_role();
  if v_role not in ('storage', 'admin') then
    raise exception 'Only storage can mark an order as loaded';
  end if;

  select status, quantity, station_id
    into v_status, v_qty, v_station
    from public.orders where id = p_order for update;
  if v_status is null then raise exception 'Order not found'; end if;
  if v_status <> 'approved' then raise exception 'Only approved orders can be loaded'; end if;

  -- Same rule as the delivery manifest: the file must sit in this order's own
  -- station folder, otherwise the station could never open it.
  if coalesce(trim(p_manifest_path), '') <> ''
     and split_part(p_manifest_path, '/', 1) <> v_station::text then
    raise exception 'Manifest does not belong to this station';
  end if;

  update public.orders
     set status = 'loaded', loaded_by = auth.uid(), loaded_at = now(),
         loaded_quantity = coalesce(p_loaded_quantity, v_qty),
         truck_no = nullif(trim(p_truck), ''), driver_name = nullif(trim(p_driver), ''),
         load_note = nullif(trim(p_note), ''),
         load_manifest_path = nullif(trim(p_manifest_path), ''),
         load_manifest_no = nullif(trim(p_manifest_no), '')
   where id = p_order;

  perform public.log_event(p_order, v_status, 'loaded', nullif(trim(p_note), ''));
end $function$;

revoke all on function public.mark_loaded(uuid, numeric, text, text, text, text, text) from public, anon;
grant execute on function public.mark_loaded(uuid, numeric, text, text, text, text, text) to authenticated;

-- 4. Expose the new columns on the view the app reads.
drop view if exists public.orders_view;
create view public.orders_view
with (security_invoker = true) as
select
  o.id, o.order_no, o.status, o.quantity, o.needed_date, o.note, o.created_at,
  o.station_id,
  s.code as station_code, s.name_en as station_name_en, s.name_ku as station_name_ku,
  s.phone as station_phone, s.location as station_location,
  o.product_id,
  p.name_en as product_name_en, p.name_ku as product_name_ku, p.unit as product_unit,
  o.created_by, public.display_name(o.created_by) as created_by_name,
  o.decided_at, o.decision_note,
  o.decided_by, public.display_name(o.decided_by) as decided_by_name,
  o.loaded_at, o.loaded_quantity, o.truck_no, o.driver_name, o.load_note,
  o.load_manifest_path, o.load_manifest_no,
  o.loaded_by, public.display_name(o.loaded_by) as loaded_by_name,
  o.delivered_at, o.received_quantity, o.delivery_note,
  o.delivered_by, public.display_name(o.delivered_by) as delivered_by_name,
  o.manifest_path, o.manifest_no,
  array_remove(array[o.created_by, o.decided_by, o.loaded_by, o.delivered_by], null) as actors
from public.orders o
  join public.stations s on s.id = o.station_id
  join public.products p on p.id = o.product_id;

revoke all on public.orders_view from public, anon;
grant select on public.orders_view to authenticated;
