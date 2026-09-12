-- RollersMaps 1.3.0
-- Historial privado, asociación a actividades grupales y renombrado.
-- Ejecutar completo en Supabase > SQL Editor > New query > Run.

create table if not exists public.user_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  activity_type text not null,
  group_activity_id uuid references public.activities(id) on delete set null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  distance_km numeric(9, 3) not null default 0 check (distance_km >= 0),
  average_speed_kmh numeric(8, 2) not null default 0 check (average_speed_kmh >= 0),
  route_geojson jsonb,
  source text not null default 'rollersmaps',
  external_provider text check (external_provider is null or external_provider in ('health_connect', 'google_fit')),
  external_record_id text,
  sync_status text not null default 'not_connected' check (sync_status in ('not_connected', 'pending', 'synced', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_activities_time_order check (ended_at >= started_at),
  constraint user_activities_route_object check (route_geojson is null or jsonb_typeof(route_geojson) = 'object')
);

alter table public.user_activities
  add column if not exists group_activity_id uuid references public.activities(id) on delete set null;

alter table public.user_activities
  drop constraint if exists user_activities_activity_type_check;

alter table public.user_activities
  add constraint user_activities_activity_type_check
  check (activity_type in ('group_activity', 'guided_route', 'free_route'));

create index if not exists user_activities_user_started_idx
  on public.user_activities (user_id, started_at desc);

create index if not exists user_activities_group_activity_idx
  on public.user_activities (group_activity_id)
  where group_activity_id is not null;

alter table public.user_activities enable row level security;

drop policy if exists "user_activities_select_own" on public.user_activities;
create policy "user_activities_select_own"
  on public.user_activities for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "user_activities_insert_own" on public.user_activities;
create policy "user_activities_insert_own"
  on public.user_activities for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "user_activities_update_own" on public.user_activities;
create policy "user_activities_update_own"
  on public.user_activities for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "user_activities_delete_own" on public.user_activities;
create policy "user_activities_delete_own"
  on public.user_activities for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on table public.user_activities to authenticated;

create or replace function public.set_user_activities_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_activities_updated_at on public.user_activities;
create trigger set_user_activities_updated_at
before update on public.user_activities
for each row execute function public.set_user_activities_updated_at();

-- Debe devolver una fila con rowsecurity = true y las columnas nuevas.
select
  c.table_name,
  c.column_name,
  c.data_type,
  t.rowsecurity
from information_schema.columns c
join pg_tables t
  on t.schemaname = c.table_schema
 and t.tablename = c.table_name
where c.table_schema = 'public'
  and c.table_name = 'user_activities'
order by c.ordinal_position;
