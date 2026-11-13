-- Reconciles the repository migration history with the already-applied
-- Supabase migration 20261113083245_region_village_postal_lookup.
-- The client uses this bounded RPC instead of issuing one postal lookup per village.

create or replace function public.list_region_villages_with_postal_code(
  p_district_id text,
  p_search text default null,
  p_limit integer default 30
)
returns table(id text, name text, area_type text, postal_code text)
language sql
stable
set search_path = ''
as $$
  select v.id, v.name, v.area_type, v.postal_code
  from public.regions_villages v
  where v.district_id = p_district_id
    and (
      nullif(trim(p_search), '') is null
      or lower(v.name) like lower(left(trim(p_search), 60)) || '%'
    )
  order by v.name
  limit greatest(1, least(coalesce(p_limit, 30), 30));
$$;

revoke all on function public.list_region_villages_with_postal_code(text,text,integer) from public;
grant execute on function public.list_region_villages_with_postal_code(text,text,integer) to anon, authenticated;
