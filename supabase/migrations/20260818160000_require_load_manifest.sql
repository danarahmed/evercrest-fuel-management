-- The load manifest is now mandatory: nothing leaves the yard undocumented.
--
-- Enforced here rather than only in the form, so it holds no matter what
-- calls the API. This mirrors confirm_delivery, which has always refused to
-- record a delivery without the signed manifest.
create or replace function public.mark_loaded(
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

  if coalesce(trim(p_manifest_path), '') = '' then
    raise exception 'Attach the load manifest before marking it loaded';
  end if;
  -- the file must sit in this order's own station folder, which is what makes
  -- it readable by that station and by no other
  if split_part(p_manifest_path, '/', 1) <> v_station::text then
    raise exception 'Manifest does not belong to this station';
  end if;

  update public.orders
     set status = 'loaded', loaded_by = auth.uid(), loaded_at = now(),
         loaded_quantity = coalesce(p_loaded_quantity, v_qty),
         truck_no = nullif(trim(p_truck), ''), driver_name = nullif(trim(p_driver), ''),
         load_note = nullif(trim(p_note), ''),
         load_manifest_path = trim(p_manifest_path),
         load_manifest_no = nullif(trim(p_manifest_no), '')
   where id = p_order;

  perform public.log_event(p_order, v_status, 'loaded', nullif(trim(p_note), ''));
end $function$;
