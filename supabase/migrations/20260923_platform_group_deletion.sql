-- Eliminación explícita de grupos, exclusiva de la administración general.
-- El historial GPS personal se conserva; se elimina su asociación a la actividad.
begin;
create table if not exists public.platform_group_deletions (
 id uuid primary key default gen_random_uuid(),
 group_id uuid not null unique,
 group_name text not null,
 group_owner_id uuid,
 approval_status text not null,
 logo_url text,
 deleted_by uuid not null,
 deleted_at timestamptz not null default now(),
 member_count integer not null,
 activity_count integer not null,
 registration_count integer not null
);
alter table public.platform_group_deletions enable row level security;
revoke all on public.platform_group_deletions from public,anon,authenticated;
grant select on public.platform_group_deletions to authenticated;
drop policy if exists platform_deletions_read on public.platform_group_deletions;
create policy platform_deletions_read on public.platform_group_deletions for select to authenticated
 using(public.is_platform_admin());

create or replace function public.delete_platform_group(p_group_id uuid,p_confirmation_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_group public.groups; v_log public.platform_group_deletions;
begin
 if not public.is_platform_admin() then raise exception 'Solo la administración general puede eliminar grupos.'; end if;
 select * into v_group from public.groups where id=p_group_id for update;
 if not found then raise exception 'El grupo ya no está disponible. Actualiza la lista.'; end if;
 if p_confirmation_name is null or btrim(p_confirmation_name)<>btrim(v_group.name)
 then raise exception 'Escribe el nombre del grupo exactamente para confirmar.'; end if;
 insert into public.platform_group_deletions(group_id,group_name,group_owner_id,approval_status,logo_url,deleted_by,member_count,activity_count,registration_count)
 values(v_group.id,v_group.name,v_group.owner_id,v_group.approval_status,v_group.logo_url,auth.uid(),
  (select count(*) from public.group_memberships where group_id=v_group.id),
  (select count(*) from public.activities where group_id=v_group.id),
  (select count(*) from public.registrations r join public.activities a on a.id=r.activity_id where a.group_id=v_group.id))
 returning * into v_log;
 delete from public.registrations r using public.activities a where r.activity_id=a.id and a.group_id=v_group.id;
 -- user_activities.group_activity_id usa ON DELETE SET NULL: no se borra el GPS.
 delete from public.activities where group_id=v_group.id;
 delete from public.group_memberships where group_id=v_group.id;
 delete from public.groups where id=v_group.id;
 return jsonb_build_object('id',v_log.id,'group_name',v_log.group_name,'deleted_at',v_log.deleted_at);
end $$;

create or replace function public.get_platform_group_deletions() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_platform_admin() then raise exception 'Solo la administración general puede revisar las eliminaciones.'; end if;
 return (select coalesce(jsonb_agg(row_to_json(t) order by t.deleted_at desc),'[]'::jsonb) from (
  select d.id,d.group_name,d.deleted_at,d.member_count,d.activity_count,d.registration_count,
   coalesce(nullif(p.display_name,''),'Administrador general') as administrator_name
  from public.platform_group_deletions d left join public.profiles p on p.id=d.deleted_by
  order by d.deleted_at desc,d.id limit 100
 ) t);
end $$;
revoke all on function public.delete_platform_group(uuid,text),public.get_platform_group_deletions() from public,anon,authenticated;
grant execute on function public.delete_platform_group(uuid,text),public.get_platform_group_deletions() to authenticated;
-- También permite respaldar GPS grabados sin conexión antes de eliminar el grupo.
create or replace function public.clear_missing_group_activity_reference() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.group_activity_id is not null
 and not exists(select 1 from public.activities where id=new.group_activity_id)
 then new.group_activity_id:=null; end if;
 return new;
end $$;
revoke all on function public.clear_missing_group_activity_reference() from public,anon,authenticated;
drop trigger if exists clear_missing_group_activity_reference on public.user_activities;
create trigger clear_missing_group_activity_reference before insert or update of group_activity_id on public.user_activities
 for each row execute function public.clear_missing_group_activity_reference();
notify pgrst,'reload schema';
commit;
