-- Apply only after reviewing the deployed baseline and running privacy SQL tests.
begin;
create schema if not exists private;
revoke all on schema private from public,anon,authenticated;
create table private.account_deletion_requests(user_id uuid primary key references auth.users(id) on delete cascade,requested_at timestamptz not null default now());
create table public.terms_acceptances(user_id uuid primary key references auth.users(id) on delete cascade,version text not null,accepted_at timestamptz not null default now());
create table public.user_blocks(blocker_id uuid not null references auth.users(id) on delete cascade,blocked_id uuid not null references auth.users(id) on delete cascade,created_at timestamptz not null default now(),primary key(blocker_id,blocked_id),check(blocker_id<>blocked_id));
create table public.content_reports(id uuid primary key default gen_random_uuid(),reporter_id uuid references auth.users(id) on delete set null,kind text not null check(kind in ('group','activity','user')),target_id uuid,reported_user_id uuid references auth.users(id) on delete set null,reason text not null check(reason in ('harassment','sexual_content','violence','discrimination','privacy','fraud','other')),details text not null default '' check(length(details)<=1000),status text not null default 'pending' check(status in ('pending','dismissed','actioned')),created_at timestamptz not null default now(),resolved_at timestamptz,resolved_by uuid references auth.users(id) on delete set null);
create index content_reports_pending_idx on public.content_reports(status,created_at);
create table public.group_logo_reviews(id uuid primary key default gen_random_uuid(),group_id uuid not null references public.groups(id) on delete cascade,uploader_id uuid references auth.users(id) on delete cascade,object_path text not null unique,status text not null default 'pending' check(status in ('pending','approved','rejected')),created_at timestamptz not null default now(),reviewed_at timestamptz,reviewed_by uuid references auth.users(id) on delete set null);
create index group_logo_reviews_pending_idx on public.group_logo_reviews(status,created_at);
create table private.account_suspensions(user_id uuid primary key references auth.users(id) on delete cascade,created_at timestamptz not null default now());
-- A reserved path cannot be reused or approved while Storage removes it.
create table private.group_logo_cleanup_paths(object_path text primary key,reserved_at timestamptz not null default now());
alter table private.group_logo_cleanup_paths enable row level security;
alter table private.account_deletion_requests enable row level security;
alter table private.account_suspensions enable row level security;
alter table public.terms_acceptances enable row level security;
alter table public.user_blocks enable row level security;
alter table public.content_reports enable row level security;
alter table public.group_logo_reviews enable row level security;
revoke all on public.terms_acceptances,public.user_blocks,public.content_reports,public.group_logo_reviews from public,anon,authenticated;
grant select on public.terms_acceptances,public.user_blocks,public.content_reports,public.group_logo_reviews to authenticated;

create function public.account_is_active() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from auth.users u where u.id=auth.uid())
 and not exists(select 1 from private.account_deletion_requests d where d.user_id=auth.uid())
 and not exists(select 1 from private.account_suspensions s where s.user_id=auth.uid()); $$;
revoke all on function public.account_is_active() from public,anon;
grant execute on function public.account_is_active() to authenticated;
create or replace function public.is_platform_admin() returns boolean language sql stable security definer set search_path='' as $$
 select public.account_is_active() and exists(select 1 from public.admin_users a where a.user_id=auth.uid()); $$;
create or replace function public.is_group_member(p_group_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.account_is_active() and exists(select 1 from public.group_memberships m join public.groups g on g.id=m.group_id where m.group_id=p_group_id and m.user_id=auth.uid() and m.status='active' and g.is_active and g.approval_status='approved'); $$;
create or replace function public.is_group_admin(p_group_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.account_is_active() and exists(select 1 from public.group_memberships m join public.groups g on g.id=m.group_id where m.group_id=p_group_id and m.user_id=auth.uid() and m.status='active' and m.role in ('owner','admin') and g.is_active and g.approval_status='approved'); $$;
revoke all on function public.is_platform_admin(),public.is_group_member(uuid),public.is_group_admin(uuid) from public,anon;
grant execute on function public.is_platform_admin(),public.is_group_member(uuid),public.is_group_admin(uuid) to authenticated;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select public.account_is_active() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'); $$;
create or replace function public.is_rollersmaps_admin() returns boolean language sql stable security definer set search_path='' as $$ select public.is_platform_admin(); $$;
revoke all on function public.is_admin(),public.is_rollersmaps_admin() from public,anon;
grant execute on function public.is_admin(),public.is_rollersmaps_admin() to authenticated;
-- A user's own profile UPDATE must never grant legacy administrative rights.
create function private.guard_profile_role() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is not null and not public.is_platform_admin() and ((tg_op='INSERT' and new.role::text is distinct from 'member') or (tg_op='UPDATE' and new.role is distinct from old.role)) then raise exception 'No puedes modificar permisos administrativos.';end if;return new;end $$;
revoke all on function private.guard_profile_role() from public,anon,authenticated;
create trigger profiles_guard_role before insert or update of role on public.profiles for each row execute function private.guard_profile_role();

create function public.has_accepted_terms() returns boolean language sql stable security definer set search_path='' as $$
 select public.account_is_active() and exists(select 1 from public.terms_acceptances t where t.user_id=auth.uid() and t.version='2026-10-06'); $$;
create function public.accept_terms(p_version text) returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.account_is_active() then raise exception 'La cuenta no está disponible.'; end if;
 if p_version is distinct from '2026-10-06' then raise exception 'Revisa la versión vigente de los términos.'; end if;
 insert into public.terms_acceptances(user_id,version) values(auth.uid(),p_version) on conflict(user_id) do update set version=excluded.version,accepted_at=now(); end $$;
create function private.capture_signup_terms() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.raw_user_meta_data->>'terms_version'='2026-10-06' then insert into public.terms_acceptances(user_id,version) values(new.id,'2026-10-06') on conflict(user_id) do nothing; end if; return new; end $$;
revoke all on function private.capture_signup_terms() from public,anon,authenticated;
create trigger rollersmaps_capture_signup_terms after insert on auth.users for each row execute function private.capture_signup_terms();
revoke all on function public.has_accepted_terms(),public.accept_terms(text) from public,anon;
grant execute on function public.has_accepted_terms(),public.accept_terms(text) to authenticated;

create function public.is_user_blocked_by_me(p_user_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select p_user_id is not null and exists(select 1 from public.user_blocks b where b.blocker_id=auth.uid() and b.blocked_id=p_user_id); $$;
create function public.set_user_block(p_user_id uuid,p_blocked boolean) returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.account_is_active() or p_user_id=auth.uid() or p_user_id is null then raise exception 'No se puede bloquear esta cuenta.'; end if;
 if p_blocked is null then raise exception 'Acción inválida.'; end if;
 if p_blocked then insert into public.user_blocks(blocker_id,blocked_id) values(auth.uid(),p_user_id) on conflict do nothing;
 else delete from public.user_blocks where blocker_id=auth.uid() and blocked_id=p_user_id; end if; end $$;
revoke all on function public.is_user_blocked_by_me(uuid),public.set_user_block(uuid,boolean) from public,anon;
grant execute on function public.is_user_blocked_by_me(uuid),public.set_user_block(uuid,boolean) to authenticated;
create function public.get_my_blocked_users() returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 if not public.account_is_active() then raise exception 'Inicia sesión para revisar bloqueos.';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('blocked_id',b.blocked_id,'display_name',p.display_name) order by b.created_at),'[]'::jsonb) from public.user_blocks b left join public.profiles p on p.id=b.blocked_id where b.blocker_id=auth.uid());end $$;
revoke all on function public.get_my_blocked_users() from public,anon;
grant execute on function public.get_my_blocked_users() to authenticated;
create policy terms_read_own on public.terms_acceptances for select to authenticated using(user_id=auth.uid());
create policy blocks_read_own on public.user_blocks for select to authenticated using(blocker_id=auth.uid());
create policy reports_read on public.content_reports for select to authenticated using(reporter_id=auth.uid() or public.is_platform_admin());
create policy logo_reviews_read on public.group_logo_reviews for select to authenticated using(uploader_id=auth.uid() or public.is_platform_admin());

create function public.submit_content_report(p_kind text,p_target_id uuid,p_reason text,p_details text default '') returns uuid language plpgsql security definer set search_path='' as $$
 declare v_author uuid;v_id uuid;begin
 if not public.account_is_active() then raise exception 'Inicia sesión para reportar.'; end if;
 if p_kind='group' then select g.owner_id into v_author from public.groups g where g.id=p_target_id and ((g.is_active and g.approval_status='approved') or g.owner_id=auth.uid());
 elsif p_kind='activity' then select a.created_by into v_author from public.activities a where a.id=p_target_id and public.is_group_member(a.group_id);
 elsif p_kind='user' then select u.id into v_author from auth.users u where u.id=p_target_id;
 else raise exception 'Contenido inválido.'; end if;
 if not found then raise exception 'El contenido no está disponible.'; end if;
 if p_reason not in ('harassment','sexual_content','violence','discrimination','privacy','fraud','other') or p_reason is null or length(coalesce(p_details,''))>1000 then raise exception 'Revisa el motivo del reporte.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,42));
 if (select count(*) from public.content_reports where reporter_id=auth.uid() and created_at>now()-interval '1 day')>=20 then raise exception 'Alcanzaste el límite de reportes del día.'; end if;
 insert into public.content_reports(reporter_id,kind,target_id,reported_user_id,reason,details) values(auth.uid(),p_kind,p_target_id,v_author,p_reason,trim(coalesce(p_details,''))) returning id into v_id;return v_id;end $$;
create function public.resolve_content_report(p_report_id uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$
 declare v_report public.content_reports;begin
 if not public.is_platform_admin() then raise exception 'Solo la administración puede revisar reportes.'; end if;
 select * into v_report from public.content_reports where id=p_report_id for update;
 if not found or v_report.status<>'pending' then raise exception 'El reporte ya no está pendiente.'; end if;
 if p_action='suspend_user' then
   if v_report.reported_user_id is null or v_report.reported_user_id=auth.uid() or exists(select 1 from public.admin_users where user_id=v_report.reported_user_id) then raise exception 'Esta suspensión necesita revisión de soporte.';end if;
   insert into private.account_suspensions(user_id) values(v_report.reported_user_id) on conflict do nothing;
 elsif p_action='remove_content' then
   if v_report.kind='group' then update public.groups set is_active=false where id=v_report.target_id;
   elsif v_report.kind='activity' then update public.activities set status='cancelled' where id=v_report.target_id;
   else raise exception 'Selecciona suspender usuario o descartar.';end if;
 elsif p_action<>'dismiss' or p_action is null then raise exception 'Acción inválida.';end if;
 update public.content_reports set status=case when p_action='dismiss' then 'dismissed' else 'actioned' end,resolved_at=now(),resolved_by=auth.uid() where id=p_report_id;end $$;
revoke all on function public.submit_content_report(text,uuid,text,text),public.resolve_content_report(uuid,text) from public,anon;
grant execute on function public.submit_content_report(text,uuid,text,text),public.resolve_content_report(uuid,text) to authenticated;

create function public.get_moderation_reports() returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 if not public.is_platform_admin() then raise exception 'Solo la administración puede revisar reportes.';end if;
 return (select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from (
 select r.id,r.kind,r.target_id,r.reason,r.details,r.created_at,r.reported_user_id,
 case r.kind when 'group' then g.name when 'activity' then a.title when 'user' then p.display_name end as content_title,
 case r.kind when 'group' then g.description when 'activity' then concat_ws(E'\n',a.description,a.notes,a.meeting_point,a.ending_point) when 'user' then p.display_name end as content_text
 from public.content_reports r left join public.groups g on r.kind='group' and g.id=r.target_id
 left join public.activities a on r.kind='activity' and a.id=r.target_id
 left join public.profiles p on r.kind='user' and p.id=r.target_id
 where r.status='pending' order by r.created_at limit 100) t);end $$;
revoke all on function public.get_moderation_reports() from public,anon;
grant execute on function public.get_moderation_reports() to authenticated;

-- Preserve owner/group semantics, and hide personally blocked authors server-side.
create or replace function public.get_groups() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(row_to_json(t) order by t.name),'[]'::jsonb) from (
 select g.id,g.slug,g.name,g.description,g.city,g.logo_url,g.join_policy,g.owner_id,g.approval_status,g.approval_expires_at,m.status as membership_status,m.role as membership_role,
 (select count(*)::integer from public.group_memberships x where x.group_id=g.id and x.status='active') as member_count
 from public.groups g left join public.group_memberships m on m.group_id=g.id and m.user_id=auth.uid()
 where public.account_is_active() and not public.is_user_blocked_by_me(g.owner_id) and ((g.is_active and g.approval_status='approved') or (g.owner_id=auth.uid() and g.approval_status in ('pending','rejected') and g.approval_expires_at>now())) order by g.name limit 200) t; $$;
create or replace function public.get_published_activities() returns table(id uuid,title text,activity_type text,starts_at timestamptz,ends_at timestamptz,meeting_point text,ending_point text,skill_level text,difficulty text,capacity integer,description text,notes text,helmet_required boolean,participants integer)
language sql stable security definer set search_path='' as $$
 select a.id,a.title,a.activity_type,a.starts_at,a.ends_at,a.meeting_point,a.ending_point,a.skill_level,a.difficulty,case when public.is_group_admin(a.group_id) then a.capacity end,a.description,a.notes,a.helmet_required,
 case when public.is_group_admin(a.group_id) then (select count(*)::integer from public.registrations r where r.activity_id=a.id and r.status='registered') end
 from public.activities a join public.groups g on g.id=a.group_id where a.status='published' and public.is_group_member(a.group_id) and not public.is_user_blocked_by_me(a.created_by) and not public.is_user_blocked_by_me(g.owner_id) order by a.starts_at; $$;
create policy groups_personal_block on public.groups as restrictive for select to authenticated using(not public.is_user_blocked_by_me(owner_id));
create policy activities_personal_block on public.activities as restrictive for select to authenticated using(not public.is_user_blocked_by_me(created_by));

create function private.check_public_content() returns trigger language plpgsql security definer set search_path='' as $$
 declare v_text text;v_column text;begin
 if auth.uid() is not null and tg_argv[0]='terms' and not public.has_accepted_terms() and not public.is_platform_admin() then raise exception 'Acepta los términos antes de publicar contenido.';end if;
 foreach v_column in array tg_argv[1:] loop
   v_text:=coalesce(to_jsonb(new)->>v_column,'');
   if length(v_text)>4000 or v_text ~* '(pornograf[ií]a|pornogr[aá]fic[oa]|contenido sexual expl[ií]cito|<script|javascript:)' then raise exception 'El contenido requiere revisión. Consulta las reglas de comunidad.';end if;
 end loop;return new;end $$;
revoke all on function private.check_public_content() from public,anon,authenticated;
create trigger groups_terms_filter before insert or update of name,description,city on public.groups for each row execute function private.check_public_content('terms','name','description','city');
create trigger activities_terms_filter before insert or update of title,description,notes,meeting_point,ending_point on public.activities for each row execute function private.check_public_content('terms','title','description','notes','meeting_point','ending_point');
create trigger profile_content_filter before insert or update of display_name on public.profiles for each row execute function private.check_public_content('profile','display_name');

create or replace function public.set_group_logo(p_group_id uuid,p_logo_path text) returns void language plpgsql security definer set search_path='' as $$ begin
 perform 1 from public.groups where id=p_group_id for update;
 if not public.is_group_admin(p_group_id) then raise exception 'No puedes administrar este grupo.';end if;
 if not public.has_accepted_terms() then raise exception 'Acepta los términos antes de subir contenido.';end if;
 if public.group_logo_group_id(p_logo_path) is distinct from p_group_id then raise exception 'El logo debe pertenecer a este grupo.';end if;
 perform 1 from storage.objects where bucket_id='group-logos' and name=p_logo_path for update;
 if exists(select 1 from private.group_logo_cleanup_paths where object_path=p_logo_path) then raise exception 'Esta imagen está en limpieza. Sube una imagen nueva.';end if;
 if not exists(select 1 from storage.objects where bucket_id='group-logos' and name=p_logo_path and owner_id=auth.uid()::text and metadata->>'mimetype'='image/png' and (metadata->>'size')::bigint between 1 and 2097152) then raise exception 'Primero sube una imagen PNG propia válida de hasta 2 MB.';end if;
 if (select count(*) from public.group_logo_reviews where group_id=p_group_id and status='pending')>=3 then raise exception 'Ya hay logos pendientes de revisión.';end if;
 insert into public.group_logo_reviews(group_id,uploader_id,object_path) values(p_group_id,auth.uid(),p_logo_path) on conflict(object_path) do nothing;end $$;
create function public.review_group_logo(p_review_id uuid,p_approve boolean) returns void language plpgsql security definer set search_path='' as $$ declare v_review public.group_logo_reviews;begin
 if not public.is_platform_admin() or p_approve is null then raise exception 'Solo la administración puede revisar logos.';end if;
 -- Auth deletion locks user before cascading review rows. Follow that same order.
 if p_approve then
   perform 1 from auth.users u join public.group_logo_reviews r on r.uploader_id=u.id where r.id=p_review_id for key share of u;
   if not found then raise exception 'La cuenta que subió la imagen ya no está disponible.';end if;
 end if;
 select * into v_review from public.group_logo_reviews where id=p_review_id for update;
 if not found or v_review.status<>'pending' then raise exception 'El logo ya fue revisado.';end if;
 if p_approve then
   perform 1 from storage.objects where bucket_id='group-logos' and name=v_review.object_path for update;
   if exists(select 1 from private.group_logo_cleanup_paths where object_path=v_review.object_path) or exists(select 1 from private.account_deletion_requests where user_id=v_review.uploader_id) or exists(select 1 from private.account_suspensions where user_id=v_review.uploader_id) then raise exception 'La imagen ya no se puede aprobar.';end if;
   if not exists(select 1 from storage.objects where bucket_id='group-logos' and name=v_review.object_path and owner_id=v_review.uploader_id::text) then raise exception 'La imagen ya no está disponible.';end if;
   update public.groups set logo_url=v_review.object_path where id=v_review.group_id and is_active and approval_status='approved';
   if not found then raise exception 'El grupo no está activo.';end if;
 end if;
 update public.group_logo_reviews set status=case when p_approve then 'approved' else 'rejected' end,reviewed_at=now(),reviewed_by=auth.uid() where id=v_review.id;end $$;
revoke all on function public.review_group_logo(uuid,boolean) from public,anon;
grant execute on function public.review_group_logo(uuid,boolean) to authenticated;
create function public.is_group_logo_reserved(p_path text) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from private.group_logo_cleanup_paths where object_path=p_path); $$;
revoke all on function public.is_group_logo_reserved(text) from public,anon;
grant execute on function public.is_group_logo_reserved(text) to authenticated;
drop policy group_logos_read on storage.objects;
create policy group_logos_read on storage.objects for select to authenticated using(bucket_id='group-logos' and public.account_is_active() and (owner_id=auth.uid()::text or public.is_platform_admin() or exists(select 1 from public.groups g where g.logo_url=storage.objects.name and g.is_active and g.approval_status='approved' and not public.is_user_blocked_by_me(g.owner_id))));
drop policy group_logos_insert on storage.objects;
create policy group_logos_insert on storage.objects for insert to authenticated with check(bucket_id='group-logos' and public.has_accepted_terms() and not public.is_group_logo_reserved(name) and public.is_group_admin(public.group_logo_group_id(storage.objects.name)));
drop policy group_logos_delete on storage.objects;
create policy group_logos_delete on storage.objects for delete to authenticated using(bucket_id='group-logos' and (public.is_platform_admin() or public.is_group_admin(public.group_logo_group_id(storage.objects.name))) and not exists(select 1 from public.groups g where g.logo_url=storage.objects.name) and not exists(select 1 from public.group_logo_reviews r where r.object_path=storage.objects.name and r.status='pending'));

create function private.check_active_writer() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is not null and not public.account_is_active() then raise exception 'La cuenta no está disponible.';end if;return new;end $$;
revoke all on function private.check_active_writer() from public,anon,authenticated;
do $$ declare v_table text;begin
 foreach v_table in array array['profiles','groups','group_memberships','registrations','activities','user_activities','routes','admin_users','platform_group_deletions','terms_acceptances','user_blocks','content_reports','group_logo_reviews'] loop
   execute format('create policy active_account_guard on public.%I as restrictive for all to authenticated using(public.account_is_active()) with check(public.account_is_active())',v_table);
   execute format('create trigger active_account_writer before insert or update on public.%I for each row execute function private.check_active_writer()',v_table);
 end loop;end $$;
create function private.check_group_owner() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.owner_id is not null then
   perform 1 from auth.users where id=new.owner_id for key share;
   if exists(select 1 from private.account_deletion_requests where user_id=new.owner_id) or exists(select 1 from private.account_suspensions where user_id=new.owner_id) then raise exception 'No puedes transferir a una cuenta no disponible.';end if;
 end if;return new;end $$;
revoke all on function private.check_group_owner() from public,anon,authenticated;
create trigger prevent_deleted_group_owner before insert or update of owner_id on public.groups for each row execute function private.check_group_owner();

create function public.get_account_deletion_status() returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 if auth.uid() is null then raise exception 'Inicia sesión para administrar tu cuenta.';end if;
 return jsonb_build_object('pending',exists(select 1 from private.account_deletion_requests where user_id=auth.uid()),'owned_groups',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name)),'[]'::jsonb) from public.groups where owner_id=auth.uid()));end $$;
revoke all on function public.get_account_deletion_status() from public,anon;
grant execute on function public.get_account_deletion_status() to authenticated;

-- Service-only: Edge must derive both IDs from a server-validated bearer JWT.
create function public.prepare_account_deletion(p_user_id uuid,p_session_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$ begin
 perform 1 from auth.users where id=p_user_id for update;
 if not found then raise exception 'La cuenta ya no está disponible.';end if;
 if not exists(select 1 from private.account_deletion_requests where user_id=p_user_id) and not exists(select 1 from auth.sessions where id=p_session_id and user_id=p_user_id) then raise exception 'Inicia sesión nuevamente antes de eliminar.';end if;
 perform 1 from public.groups where owner_id=p_user_id for update;
 if found then raise exception 'Transfiere primero los grupos de los que eres dueño.';end if;
 insert into private.account_deletion_requests(user_id) values(p_user_id) on conflict do nothing;
 update public.groups set logo_url=null where logo_url in(select name from storage.objects where bucket_id='group-logos' and owner_id=p_user_id::text);
 delete from public.content_reports where reporter_id=p_user_id or reported_user_id=p_user_id;
 update public.content_reports set resolved_by=null where resolved_by=p_user_id;
 update public.platform_group_deletions set group_owner_id=null where group_owner_id=p_user_id;
 update public.platform_group_deletions set deleted_by=null where deleted_by=p_user_id;
 return (select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket_id,'path',name)),'[]'::jsonb) from storage.objects where owner_id=p_user_id::text);end $$;
alter table public.platform_group_deletions alter column deleted_by drop not null;
revoke all on function public.prepare_account_deletion(uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_account_deletion(uuid,uuid) to service_role;

-- Recovery derives identities only from a prior, verified deletion request.
create function public.get_pending_account_deletions() returns jsonb language sql stable security definer set search_path='' as $$ select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from (select user_id from private.account_deletion_requests order by requested_at limit 20) t; $$;
revoke all on function public.get_pending_account_deletions() from public,anon,authenticated;
grant execute on function public.get_pending_account_deletions() to service_role;

create function public.get_unused_group_logos() returns jsonb language plpgsql security definer set search_path='' as $$ declare v_object record;v_result jsonb:='[]';begin
 for v_object in select o.name from storage.objects o where o.bucket_id='group-logos' and o.created_at<now()-interval '1 day' and not exists(select 1 from public.groups g where g.logo_url=o.name) and not exists(select 1 from public.group_logo_reviews r where r.object_path=o.name and r.status='pending') order by o.created_at limit 500 for update of o skip locked loop
   if not exists(select 1 from public.groups g where g.logo_url=v_object.name) and not exists(select 1 from public.group_logo_reviews r where r.object_path=v_object.name and r.status='pending') then
     insert into private.group_logo_cleanup_paths(object_path) values(v_object.name) on conflict do nothing;
     v_result:=v_result||jsonb_build_array(jsonb_build_object('bucket','group-logos','path',v_object.name));
   end if;
 end loop;return v_result;end $$;
revoke all on function public.get_unused_group_logos() from public,anon,authenticated;
grant execute on function public.get_unused_group_logos() to service_role;
create function private.purge_moderation_retention() returns void language plpgsql security definer set search_path='' as $$ begin
 delete from public.content_reports where created_at<now()-interval '90 days';
 delete from public.platform_group_deletions where deleted_at<now()-interval '90 days';
 update public.group_logo_reviews set status='rejected',reviewed_at=now() where status='pending' and created_at<now()-interval '7 days';
 delete from public.group_logo_reviews where status<>'pending' and created_at<now()-interval '90 days';end $$;
revoke all on function private.purge_moderation_retention() from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_extension where extname='pg_cron') then perform cron.schedule('rollersmaps-moderation-retention','17 3 * * *','select private.purge_moderation_retention();');end if;end $$;
-- Least-privilege cleanup: these are not mobile Data API operations.
revoke truncate,references,trigger on public.profiles,public.routes,public.user_activities,public.admin_users from anon,authenticated;
revoke all on public.profiles,public.routes,public.user_activities,public.admin_users from anon;
notify pgrst,'reload schema';
commit;
