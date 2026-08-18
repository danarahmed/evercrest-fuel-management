-- Add an `actors` array to orders_view.
--
-- "My orders" means every order this account touched in any role. Expressing
-- that as four OR'd equality filters forced a second `or=` query parameter
-- alongside the one the search box already uses, and two top-level or-groups
-- is exactly the kind of thing that is easy to get subtly wrong. A single
-- array column turns the whole condition into one `actors=cs.{uuid}` filter
-- that composes cleanly with every other filter.

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
  o.manifest_no,
  array_remove(
    array[o.created_by, o.decided_by, o.loaded_by, o.delivered_by],
    null
  ) as actors
from public.orders o
  join public.stations s on s.id = o.station_id
  join public.products p on p.id = o.product_id;

revoke all on public.orders_view from public, anon;
grant select on public.orders_view to authenticated;
