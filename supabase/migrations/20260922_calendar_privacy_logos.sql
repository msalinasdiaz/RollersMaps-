-- Cupos administrativos, calendario semanal e identidad de grupos.
begin;
-- La tabla contiene la capacidad: los miembros consultan el calendario filtrado.
drop policy if exists activities_read on public.activities;
create policy activities_read on public.activities for select to authenticated
 using(public.is_group_admin(group_id));

create or replace function public.get_published_activities()
returns table(id uuid,title text,activity_type text,starts_at timestamptz,ends_at timestamptz,
 meeting_point text,ending_point text,skill_level text,difficulty text,capacity integer,
 description text,notes text,helmet_required boolean,participants integer)
language sql stable security definer set search_path=public as $$
 select a.id,a.title,a.activity_type,a.starts_at,a.ends_at,a.meeting_point,a.ending_point,a.skill_level,
 a.difficulty,case when public.is_group_admin(a.group_id) then a.capacity end,
 a.description,a.notes,a.helmet_required,
 case when public.is_group_admin(a.group_id) then
   (select count(*)::integer from public.registrations r where r.activity_id=a.id and r.status='registered')
 end
 from public.activities a where a.status='published' and public.is_group_member(a.group_id) order by a.starts_at;
$$;
create or replace function public.get_group_calendar() returns jsonb
language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(row_to_json(t) order by t.starts_at),'[]'::jsonb) from (
   select p.*,a.group_id,g.name as group_name,
     (a.starts_at>now() and (select count(*) from public.registrations r where r.activity_id=a.id and r.status='registered')<a.capacity) as registration_open
   from public.get_published_activities() p
   join public.activities a on a.id=p.id join public.groups g on g.id=a.group_id
   where p.starts_at >= date_trunc('week',now() at time zone 'America/Santiago') at time zone 'America/Santiago' - interval '6 months'
     and p.starts_at < now()+interval '6 months'
   order by p.starts_at limit 2000
 ) t;
$$;

-- Almacenamiento privado: solo las cuentas pueden consultar los logos.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('group-logos','group-logos',false,2097152,array['image/png'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.group_logo_group_id(p_path text) returns uuid
language sql immutable set search_path='' as $$
 select case when p_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9]+-[a-z0-9]+[.]png$'
   then split_part(p_path,'/',1)::uuid end;
$$;
revoke all on function public.group_logo_group_id(text) from public,anon;
grant execute on function public.group_logo_group_id(text) to authenticated;

drop policy if exists group_logos_read on storage.objects;
create policy group_logos_read on storage.objects for select to authenticated using(
 bucket_id='group-logos' and exists(select 1 from public.groups g where g.id=public.group_logo_group_id(storage.objects.name) and g.is_active)
);
drop policy if exists group_logos_insert on storage.objects;
create policy group_logos_insert on storage.objects for insert to authenticated with check(
 bucket_id='group-logos' and public.is_group_admin(public.group_logo_group_id(storage.objects.name))
);
drop policy if exists group_logos_delete on storage.objects;
create policy group_logos_delete on storage.objects for delete to authenticated using(
 bucket_id='group-logos' and public.is_group_admin(public.group_logo_group_id(storage.objects.name))
 and not exists(select 1 from public.groups g where g.logo_url=storage.objects.name)
);
-- Los archivos son inmutables. Cada cambio publica un nombre nuevo.
create or replace function public.set_group_logo(p_group_id uuid,p_logo_path text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.groups where id=p_group_id for update;
 if not public.is_group_admin(p_group_id) then raise exception 'No puedes administrar este grupo.'; end if;
 if public.group_logo_group_id(p_logo_path) is distinct from p_group_id then raise exception 'El logo debe pertenecer a este grupo.'; end if;
 if not exists(select 1 from storage.objects where bucket_id='group-logos' and name=p_logo_path
   and metadata->>'mimetype'='image/png' and (metadata->>'size')::bigint between 1 and 2097152)
 then raise exception 'Primero sube una imagen PNG válida de hasta 2 MB.'; end if;
 update public.groups set logo_url=p_logo_path where id=p_group_id;
end;
$$;
revoke all on function public.set_group_logo(uuid,text) from public,anon;
grant execute on function public.set_group_logo(uuid,text) to authenticated;
revoke all on function public.get_published_activities(),public.get_group_calendar() from public,anon;
grant execute on function public.get_published_activities(),public.get_group_calendar() to authenticated;
notify pgrst,'reload schema';
commit;
