-- RollersMaps 1.4.0. Ejecutar como administrador, tras respaldar la base.
-- Compatible con activities, registrations, profiles y admin_users existentes.
-- No convierte cuentas existentes en miembros ni borra recorridos/inscripciones.
begin;

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 3 and 80),
  description text not null default '' check (char_length(description) <= 600),
  city text not null default '' check (char_length(city) <= 100),
  logo_url text,
  join_policy text not null default 'approval' check (join_policy in ('open','approval')),
  owner_id uuid references auth.users(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.group_memberships (
  group_id uuid not null references public.groups(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  status text not null default 'pending' check (status in ('pending','active','left','rejected','blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id,user_id)
);
create index if not exists group_memberships_user_idx on public.group_memberships(user_id,status,group_id);

insert into public.groups(id,slug,name,description,city,join_policy)
values ('14000000-0000-4000-8000-000000000001','santiago-rollers','Santiago Rollers',
        'Comunidad de patinaje de Santiago. Solicita tu ingreso para acceder a las actividades del grupo.',
        'Santiago','approval') on conflict do nothing;

-- Conserva únicamente los permisos administrativos previamente otorgados.
do $$ begin
  if to_regclass('public.admin_users') is not null then
    update public.groups set owner_id = (select user_id from public.admin_users order by created_at,user_id limit 1)
      where slug='santiago-rollers' and owner_id is null;
    insert into public.group_memberships(group_id,user_id,role,status)
      select g.id,a.user_id,case when g.owner_id=a.user_id then 'owner' else 'admin' end,'active'
      from public.admin_users a cross join public.groups g where g.slug='santiago-rollers'
      on conflict do nothing;
  end if;
end $$;

alter table public.activities add column if not exists group_id uuid references public.groups(id);
update public.activities set group_id='14000000-0000-4000-8000-000000000001' where group_id is null;
alter table public.activities alter column group_id set not null;
alter table public.activities alter column group_id set default '14000000-0000-4000-8000-000000000001';
create index if not exists activities_group_date_idx on public.activities(group_id,starts_at) where status='published';
create index if not exists registrations_activity_status_idx on public.registrations(activity_id,status);
create unique index if not exists registrations_user_activity_v140_idx on public.registrations(user_id,activity_id);

create or replace function public.is_group_member(p_group_id uuid) returns boolean
language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.group_memberships m join public.groups g on g.id=m.group_id
 where m.group_id=p_group_id and m.user_id=auth.uid() and m.status='active' and g.is_active); $$;
create or replace function public.is_group_admin(p_group_id uuid) returns boolean
language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.group_memberships m join public.groups g on g.id=m.group_id
 where m.group_id=p_group_id and m.user_id=auth.uid() and m.status='active' and m.role in ('owner','admin') and g.is_active); $$;

alter table public.groups enable row level security;
alter table public.group_memberships enable row level security;
alter table public.activities enable row level security;
alter table public.registrations enable row level security;

-- Las políticas antiguas se combinan con OR: sustituirlas evita accesos globales.
do $$ declare p record; begin
  for p in select tablename,policyname from pg_policies where schemaname='public'
    and tablename in ('groups','group_memberships','activities','registrations') loop
    execute format('drop policy %I on public.%I',p.policyname,p.tablename);
  end loop;
end $$;
create policy groups_directory on public.groups for select to anon,authenticated using(is_active);
create policy memberships_read on public.group_memberships for select to authenticated
 using(user_id=auth.uid() or public.is_group_admin(group_id));
create policy activities_read on public.activities for select to authenticated
 using(public.is_group_admin(group_id) or (status='published' and public.is_group_member(group_id)));
create policy activities_insert on public.activities for insert to authenticated with check(public.is_group_admin(group_id));
create policy activities_update on public.activities for update to authenticated
 using(public.is_group_admin(group_id)) with check(public.is_group_admin(group_id));
create policy registrations_read on public.registrations for select to authenticated
 using(user_id=auth.uid() or exists(select 1 from public.activities a where a.id=activity_id and public.is_group_admin(a.group_id)));
revoke all on public.groups,public.group_memberships,public.activities,public.registrations from anon,authenticated;
grant select on public.groups to anon,authenticated;
grant select on public.group_memberships,public.activities,public.registrations to authenticated;
grant insert,update on public.activities to authenticated;

-- Catálogo general independiente de calendarios privados.
alter table public.routes enable row level security;
drop policy if exists routes_public_catalog_v140 on public.routes;
create policy routes_public_catalog_v140 on public.routes for select to anon,authenticated using(status='published');
grant select on public.routes to anon,authenticated;

create or replace function public.get_groups() returns jsonb
language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(row_to_json(t) order by t.name),'[]'::jsonb) from (
 select g.id,g.slug,g.name,g.description,g.city,g.logo_url,g.join_policy,
   m.status as membership_status,m.role as membership_role,
   (select count(*)::integer from public.group_memberships x where x.group_id=g.id and x.status='active') as member_count
 from public.groups g left join public.group_memberships m on m.group_id=g.id and m.user_id=auth.uid()
 where g.is_active order by g.name limit 200) t;
$$;

create or replace function public.join_group(p_group_id uuid) returns text
language plpgsql security definer set search_path=public as $$
declare v_policy text; v_status text; begin
 if auth.uid() is null then raise exception 'Inicia sesión para unirte a un grupo.'; end if;
 select join_policy into v_policy from public.groups where id=p_group_id and is_active for update;
 if not found then raise exception 'El grupo no está disponible.'; end if;
 select status into v_status from public.group_memberships where group_id=p_group_id and user_id=auth.uid();
 if v_status='blocked' then raise exception 'Tu acceso a este grupo está suspendido.'; end if;
 if v_status in ('active','pending') then return v_status; end if;
 v_status := case when v_policy='open' then 'active' else 'pending' end;
 insert into public.group_memberships(group_id,user_id,status) values(p_group_id,auth.uid(),v_status)
 on conflict(group_id,user_id) do update set status=excluded.status,role='member',updated_at=now();
 return v_status;
end $$;

create or replace function public.leave_group(p_group_id uuid) returns void
language plpgsql security definer set search_path=public as $$ begin
 perform 1 from public.groups where id=p_group_id for update;
 if exists(select 1 from public.group_memberships where group_id=p_group_id and user_id=auth.uid() and role='owner')
 then raise exception 'Transfiere la propiedad antes de salir del grupo.'; end if;
 update public.group_memberships set status='left',role='member',updated_at=now()
 where group_id=p_group_id and user_id=auth.uid() and status in ('active','pending');
 update public.registrations r set status='cancelled' from public.activities a
 where r.activity_id=a.id and a.group_id=p_group_id and a.starts_at>now() and r.user_id=auth.uid() and r.status='registered';
end $$;

create or replace function public.create_group(p_name text,p_description text,p_city text,p_join_policy text) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid:=gen_random_uuid(); begin
 if auth.uid() is null then raise exception 'Inicia sesión para crear un grupo.'; end if;
 insert into public.groups(id,slug,name,description,city,join_policy,owner_id)
 values(v_id,'grupo-'||v_id::text,trim(p_name),trim(p_description),trim(p_city),p_join_policy,auth.uid());
 insert into public.group_memberships(group_id,user_id,role,status) values(v_id,auth.uid(),'owner','active');
 return v_id;
end $$;

create or replace function public.update_group(p_group_id uuid,p_name text,p_description text,p_city text,p_join_policy text) returns void
language plpgsql security definer set search_path=public as $$ begin
 perform 1 from public.groups where id=p_group_id for update;
 if not public.is_group_admin(p_group_id) then raise exception 'No puedes administrar este grupo.'; end if;
 update public.groups set name=trim(p_name),description=trim(p_description),city=trim(p_city),join_policy=p_join_policy where id=p_group_id;
end $$;

create or replace function public.get_group_members(p_group_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$ begin
 if not public.is_group_admin(p_group_id) then raise exception 'No puedes administrar este grupo.'; end if;
 return (select coalesce(jsonb_agg(row_to_json(t)),'[]'::jsonb) from (
   select m.user_id,m.role,m.status,coalesce(p.display_name,'Patinador') as display_name,m.created_at
   from public.group_memberships m left join public.profiles p on p.id=m.user_id
   where m.group_id=p_group_id and m.status in ('active','pending','blocked') order by m.created_at) t);
end $$;

create or replace function public.manage_group_member(p_group_id uuid,p_user_id uuid,p_action text) returns void
language plpgsql security definer set search_path=public as $$
declare v_target public.group_memberships; v_owner uuid; begin
 select owner_id into v_owner from public.groups where id=p_group_id for update;
 if not public.is_group_admin(p_group_id) then raise exception 'No puedes administrar este grupo.'; end if;
 select * into v_target from public.group_memberships where group_id=p_group_id and user_id=p_user_id for update;
 if not found or v_target.role='owner' then raise exception 'No puedes modificar esta membresía.'; end if;
 if (v_target.role='admin' or p_action in ('promote','demote','transfer')) and v_owner<>auth.uid()
 then raise exception 'Solo el propietario puede cambiar administradores.'; end if;
 if p_action='approve' and v_target.status='pending' then
   update public.group_memberships set status='active',updated_at=now() where group_id=p_group_id and user_id=p_user_id;
 elsif p_action='reject' and v_target.status='pending' then
   update public.group_memberships set status='rejected',updated_at=now() where group_id=p_group_id and user_id=p_user_id;
 elsif p_action in ('remove','block') then
   update public.group_memberships set status=case when p_action='block' then 'blocked' else 'left' end,role='member',updated_at=now() where group_id=p_group_id and user_id=p_user_id;
   update public.registrations r set status='cancelled' from public.activities a where r.activity_id=a.id and a.group_id=p_group_id and a.starts_at>now() and r.user_id=p_user_id;
 elsif p_action='unblock' and v_target.status='blocked' then
   update public.group_memberships set status='left',updated_at=now() where group_id=p_group_id and user_id=p_user_id;
 elsif p_action in ('promote','demote') and v_target.status='active' then
   update public.group_memberships set role=case when p_action='promote' then 'admin' else 'member' end,updated_at=now() where group_id=p_group_id and user_id=p_user_id;
 elsif p_action='transfer' and v_target.status='active' then
   update public.group_memberships set role='admin',updated_at=now() where group_id=p_group_id and user_id=auth.uid();
   update public.group_memberships set role='owner',updated_at=now() where group_id=p_group_id and user_id=p_user_id;
   update public.groups set owner_id=p_user_id where id=p_group_id;
 else raise exception 'La acción no corresponde al estado actual.'; end if;
end $$;

-- La lectura antigua también debe quedar protegida para versiones anteriores.
create or replace function public.get_published_activities()
returns table(id uuid,title text,activity_type text,starts_at timestamptz,ends_at timestamptz,
 meeting_point text,ending_point text,skill_level text,difficulty text,capacity integer,
 description text,notes text,helmet_required boolean,participants integer)
language sql stable security definer set search_path=public as $$
 select a.id,a.title,a.activity_type,a.starts_at,a.ends_at,a.meeting_point,a.ending_point,a.skill_level,
 a.difficulty,a.capacity,a.description,a.notes,a.helmet_required,
 (select count(*)::integer from public.registrations r where r.activity_id=a.id and r.status='registered')
 from public.activities a where a.status='published' and public.is_group_member(a.group_id) order by a.starts_at;
$$;
create or replace function public.get_group_calendar() returns jsonb
language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(row_to_json(t) order by t.starts_at),'[]'::jsonb) from (
 select p.*,a.group_id,g.name as group_name from public.get_published_activities() p
 join public.activities a on a.id=p.id join public.groups g on g.id=a.group_id
 where coalesce(p.ends_at,p.starts_at+interval '3 hours') >= now()-interval '1 day'
 and p.starts_at<now()+interval '6 months' order by p.starts_at limit 500) t;
$$;

create or replace function public.get_group_admin_activities(p_group_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$ begin
 if not public.is_group_admin(p_group_id) then raise exception 'No puedes administrar este grupo.'; end if;
 return (select coalesce(jsonb_agg(row_to_json(t) order by t.starts_at),'[]'::jsonb) from (
   select a.*, (select count(*)::integer from public.registrations r where r.activity_id=a.id and r.status='registered') as participants
   from public.activities a where a.group_id=p_group_id order by a.starts_at desc limit 500) t);
end $$;

-- Reservas y cancelaciones pasan por transacciones en servidor.
drop function if exists public.register_for_activity(uuid);
create function public.register_for_activity(p_activity_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare v_activity public.activities; v_group uuid; begin
 if auth.uid() is null then raise exception 'Inicia sesión para inscribirte.'; end if;
 select group_id into v_group from public.activities where id=p_activity_id;
 perform 1 from public.groups where id=v_group for update;
 select * into v_activity from public.activities where id=p_activity_id for update;
 if not found or v_activity.status<>'published' or v_activity.starts_at<=now() then raise exception 'La inscripción ya no está disponible.'; end if;
 if not public.is_group_member(v_activity.group_id) then raise exception 'Debes ser miembro activo de este grupo.'; end if;
 if exists(select 1 from public.registrations where activity_id=p_activity_id and user_id=auth.uid() and status='registered') then return; end if;
 if (select count(*) from public.registrations where activity_id=p_activity_id and status='registered')>=v_activity.capacity then raise exception 'No quedan cupos.'; end if;
 insert into public.registrations(activity_id,user_id,status) values(p_activity_id,auth.uid(),'registered')
 on conflict(user_id,activity_id) do update set status='registered';
end $$;
drop function if exists public.cancel_registration(uuid);
create function public.cancel_registration(p_activity_id uuid) returns void
language plpgsql security definer set search_path=public as $$ begin
 update public.registrations set status='cancelled' where activity_id=p_activity_id and user_id=auth.uid() and status='registered';
end $$;

create or replace function public.guard_group_activity() returns trigger
language plpgsql security definer set search_path=public as $$ begin
 if TG_OP='UPDATE' and new.group_id<>old.group_id then raise exception 'Una actividad no puede cambiar de grupo.'; end if;
 if new.capacity<1 or new.capacity<(select count(*) from public.registrations where activity_id=new.id and status='registered')
 then raise exception 'El cupo no puede ser menor que las inscripciones confirmadas.'; end if;
 if new.ends_at is not null and new.ends_at<=new.starts_at then raise exception 'El término debe ser posterior al inicio.'; end if;
 return new;
end $$;
drop trigger if exists guard_group_activity on public.activities;
create trigger guard_group_activity before insert or update on public.activities for each row execute function public.guard_group_activity();

-- Un identificador estable de dispositivo evita duplicar guardados al reintentar.
alter table public.user_activities add column if not exists client_record_id text;
create unique index if not exists user_activities_client_record_idx on public.user_activities(user_id,client_record_id);

-- Permisos explícitos: las funciones nuevas no heredan EXECUTE público.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('is_group_member','is_group_admin','get_groups','join_group','leave_group','create_group','update_group','get_group_members','manage_group_member','get_published_activities','get_group_calendar','get_group_admin_activities','register_for_activity','cancel_registration','guard_group_activity') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 if f.signature::text not like 'guard_group_activity%' then execute format('grant execute on function %s to authenticated',f.signature); end if;
 end loop;
end $$;
grant execute on function public.get_groups() to anon;
notify pgrst,'reload schema';
commit;
