-- Nuevos grupos: aprobación central y vencimiento a las 48 horas.
begin;
alter table public.groups add column if not exists approval_status text not null default 'approved'
 check(approval_status in ('pending','approved','rejected'));
alter table public.groups add column if not exists approval_expires_at timestamptz;
alter table public.groups add column if not exists reviewed_at timestamptz;
alter table public.groups add column if not exists reviewed_by uuid references auth.users(id) on delete set null;
create index if not exists groups_expiring_requests_idx on public.groups(approval_expires_at)
 where approval_status in ('pending','rejected');

-- La administración general es independiente del rol de dueño de un grupo.
revoke insert,update,delete on public.admin_users from anon,authenticated;
create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.admin_users where user_id=auth.uid());
$$;
create or replace function public.is_group_member(p_group_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.group_memberships m join public.groups g on g.id=m.group_id
 where m.group_id=p_group_id and m.user_id=auth.uid() and m.status='active' and g.is_active and g.approval_status='approved');
$$;
create or replace function public.is_group_admin(p_group_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.group_memberships m join public.groups g on g.id=m.group_id
 where m.group_id=p_group_id and m.user_id=auth.uid() and m.status='active'
 and m.role in ('owner','admin') and g.is_active and g.approval_status='approved');
$$;
drop policy if exists groups_directory on public.groups;
create policy groups_directory on public.groups for select to authenticated using(
 (is_active and approval_status='approved') or
 (owner_id=auth.uid() and approval_status in ('pending','rejected') and approval_expires_at>now())
);
create or replace function public.get_groups() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(row_to_json(t) order by t.name),'[]'::jsonb) from (
 select g.id,g.slug,g.name,g.description,g.city,g.logo_url,g.join_policy,
 g.approval_status,g.approval_expires_at,
 m.status as membership_status,m.role as membership_role,
 (select count(*)::integer from public.group_memberships x where x.group_id=g.id and x.status='active') as member_count
 from public.groups g left join public.group_memberships m on m.group_id=g.id and m.user_id=auth.uid()
 where (g.is_active and g.approval_status='approved')
 or (g.owner_id=auth.uid() and g.approval_status in ('pending','rejected') and g.approval_expires_at>now())
 order by g.name limit 200) t;
$$;
create or replace function public.create_group(p_name text,p_description text,p_city text,p_join_policy text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid:=gen_random_uuid(); begin
 if auth.uid() is null then raise exception 'Inicia sesión para solicitar un grupo.'; end if;
 -- Serializa solicitudes de una cuenta, incluso si llegan al mismo tiempo.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if exists(select 1 from public.groups where owner_id=auth.uid()
   and approval_status in ('pending','rejected') and approval_expires_at>now())
 then raise exception 'Ya tienes una solicitud de grupo. Espera su revisión o el vencimiento de las 48 horas.'; end if;
 insert into public.groups(id,slug,name,description,city,join_policy,owner_id,is_active,approval_status,approval_expires_at)
 values(v_id,'grupo-'||v_id::text,trim(p_name),trim(p_description),trim(p_city),p_join_policy,auth.uid(),false,'pending',now()+interval '48 hours');
 insert into public.group_memberships(group_id,user_id,role,status) values(v_id,auth.uid(),'owner','pending');
 return v_id;
end $$;
create or replace function public.get_group_creation_requests() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_platform_admin() then raise exception 'Solo la administración general puede revisar nuevos grupos.'; end if;
 return (select coalesce(jsonb_agg(row_to_json(t) order by t.created_at),'[]'::jsonb) from (
  select g.id,g.name,g.description,g.city,g.created_at,g.approval_status,g.approval_expires_at,
    coalesce(p.display_name,'Patinador') as requester_name
  from public.groups g left join public.profiles p on p.id=g.owner_id
  where g.approval_status in ('pending','rejected') and g.approval_expires_at>now()
 ) t);
end $$;
create or replace function public.review_group_creation(p_group_id uuid,p_decision text) returns void
language plpgsql security definer set search_path='' as $$
declare v_group public.groups; begin
 if not public.is_platform_admin() then raise exception 'Solo la administración general puede revisar nuevos grupos.'; end if;
 if p_decision not in ('approve','reject') or p_decision is null then raise exception 'Decisión inválida.'; end if;
 select * into v_group from public.groups where id=p_group_id for update;
 if not found or v_group.approval_status<>'pending' or v_group.approval_expires_at<=now()
 then raise exception 'La solicitud ya fue resuelta o venció.'; end if;
 update public.groups set approval_status=case when p_decision='approve' then 'approved' else 'rejected' end,
 is_active=(p_decision='approve'),reviewed_at=now(),reviewed_by=auth.uid()
 where id=p_group_id;
 if p_decision='approve' then
  update public.group_memberships set status='active',updated_at=now()
   where group_id=p_group_id and user_id=v_group.owner_id and role='owner';
 end if;
end $$;

-- Solo elimina solicitudes que nunca estuvieron habilitadas, sin actividades.
-- El bloqueo impide que una aprobación concurrente sea borrada.
create or replace function public.purge_expired_group_requests() returns integer
language plpgsql security definer set search_path='' as $$
declare v_group record; v_count integer:=0; begin
 for v_group in select g.id from public.groups g
   where g.approval_status in ('pending','rejected') and not g.is_active and g.approval_expires_at<=now()
   and not exists(select 1 from public.activities a where a.group_id=g.id)
   for update of g skip locked
 loop
   delete from public.group_memberships where group_id=v_group.id;
   delete from public.groups where id=v_group.id;
   v_count:=v_count+1;
 end loop;
 return v_count;
end $$;
revoke all on function public.purge_expired_group_requests() from public,anon,authenticated;
revoke all on function public.is_platform_admin(),public.get_group_creation_requests(),public.review_group_creation(uuid,text) from public,anon;
grant execute on function public.is_platform_admin(),public.get_group_creation_requests(),public.review_group_creation(uuid,text) to authenticated;

-- En Supabase, pg_cron ejecuta la limpieza con el rol que instala la migración.
-- Los entornos de pruebas sin pg_cron validan el mismo limpiador directamente.
do $$
begin
 if exists(select 1 from pg_available_extensions where name='pg_cron') then
   execute 'create extension if not exists pg_cron with schema pg_catalog';
 end if;
 if exists(select 1 from pg_extension where extname='pg_cron') then
   perform cron.schedule('rollersmaps-expired-group-requests','* * * * *','select public.purge_expired_group_requests();');
 end if;
end $$;
notify pgrst,'reload schema';
commit;
