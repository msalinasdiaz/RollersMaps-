-- Vista de administración general, independiente de las membresías de grupos.
begin;
create or replace function public.get_platform_groups() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_platform_admin() then
  raise exception 'Solo la administración general puede revisar todos los grupos.';
 end if;
 return (select coalesce(jsonb_agg(row_to_json(t) order by
   case when t.approval_status='pending' then 0 else 1 end,t.created_at desc),'[]'::jsonb)
 from (
  select g.id,g.name,g.description,g.city,g.created_at,g.approval_status,
   g.approval_expires_at,g.reviewed_at,g.is_active,
   coalesce(nullif(p.display_name,''),'Patinador') as requester_name,
   (select count(*)::integer from public.group_memberships m
    where m.group_id=g.id and m.status='active') as member_count
  from public.groups g left join public.profiles p on p.id=g.owner_id
  where g.approval_status='approved' or g.approval_expires_at>now()
 ) t);
end $$;
revoke all on function public.get_platform_groups() from public,anon;
grant execute on function public.get_platform_groups() to authenticated;
notify pgrst,'reload schema';
commit;
