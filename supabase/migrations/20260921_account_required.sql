-- Aplicar después de 20260920_groups_v140.sql. No cambia miembros ni actividades.
begin;

revoke select on public.groups, public.routes from public, anon;
grant select on public.groups, public.routes to authenticated;
revoke execute on function public.get_groups() from public, anon;
grant execute on function public.get_groups() to authenticated;

drop policy if exists groups_directory on public.groups;
create policy groups_directory on public.groups for select to authenticated
  using (is_active and auth.uid() is not null);

drop policy if exists routes_public_catalog_v140 on public.routes;
drop policy if exists routes_account_catalog_v140 on public.routes;
create policy routes_account_catalog_v140 on public.routes for select to authenticated
  using (status = 'published' and auth.uid() is not null);

commit;
