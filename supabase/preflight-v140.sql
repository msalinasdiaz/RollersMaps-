-- Solo lectura. Revisar estos resultados antes de aplicar la migración 1.4.0.
-- No contiene credenciales ni modifica datos. Conservar la exportación en privado.
begin transaction read only;
select current_user, current_database(), current_setting('server_version') as server_version;
select table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns where table_schema='public'
and table_name in ('activities','registrations','profiles','admin_users','routes','user_activities','groups','group_memberships')
order by table_name,ordinal_position;
select c.relname,con.conname,pg_get_constraintdef(con.oid) as definition
from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('activities','registrations','profiles','admin_users','routes','user_activities')
order by c.relname,con.conname;
select tablename,rowsecurity from pg_tables where schemaname='public';
select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public';
select p.oid::regprocedure as signature,p.prosecdef as security_definer,
       p.proacl,pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind='f'
and (p.prosecdef or p.proname in ('get_published_activities','register_for_activity','cancel_registration'));
select viewname,definition from pg_views where schemaname='public';
select event_object_table,trigger_name,action_statement from information_schema.triggers where trigger_schema='public';
select count(*) as duplicate_registration_pairs from (
  select user_id,activity_id from public.registrations group by user_id,activity_id having count(*)>1
) duplicates;
select 'activities' as table_name,count(*) as rows from public.activities
union all select 'registrations',count(*) from public.registrations
union all select 'user_activities',count(*) from public.user_activities;
rollback;
