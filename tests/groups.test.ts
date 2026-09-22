import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = new PGlite();
const owner='00000000-0000-4000-8000-000000000001';
const member='00000000-0000-4000-8000-000000000002';
const stranger='00000000-0000-4000-8000-000000000003';
const sr='14000000-0000-4000-8000-000000000001';
let other:string;
async function as(user:string|null,sql:string,params:unknown[]=[]) {
  return db.transaction(async(tx)=>{
    await tx.exec(`set local role ${user?'authenticated':'anon'}`);
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[user??'']);
    return tx.query(sql,params);
  });
}
beforeAll(async()=>{
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
    insert into auth.users values('${owner}'),('${member}'),('${stranger}');
    create table profiles(id uuid primary key references auth.users,display_name text);
    insert into profiles values('${owner}','Organizador'),('${member}','Miembro'),('${stranger}','Otro patinador');
    create table admin_users(user_id uuid primary key references auth.users,created_at timestamptz default now());
    insert into admin_users(user_id) values('${owner}');
    create table activities(id uuid primary key default gen_random_uuid(),title text,activity_type text default 'ruta',starts_at timestamptz default now()+interval '1 day',ends_at timestamptz,meeting_point text,ending_point text,skill_level text,difficulty text,capacity integer default 1,description text,notes text,helmet_required boolean default true,status text default 'published',created_at timestamptz default now(),updated_at timestamptz default now());
    create table registrations(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users,activity_id uuid references activities,status text default 'registered',unique(user_id,activity_id));
    create table routes(id uuid primary key default gen_random_uuid(),status text);
    create table user_activities(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users);
    alter table activities enable row level security;
    create policy old_public_leak on activities for select using(true);
    grant all on activities,registrations to authenticated;
    insert into activities(id,title,meeting_point) values('20000000-0000-4000-8000-000000000001','Salida SR','Punto privado');
  `);
  await db.exec(readFileSync('supabase/migrations/20260920_groups_v140.sql','utf8'));
    await db.exec(readFileSync('supabase/migrations/20260921_account_required.sql','utf8'));
});
afterAll(async()=>{await db.close()});
describe('Permisos reales de PostgreSQL y membresías',()=>{
  it('migración repetible conserva actividades y no afilia todas las cuentas',async()=>{
    await db.exec(readFileSync('supabase/migrations/20260920_groups_v140.sql','utf8'));
    await db.exec(readFileSync('supabase/migrations/20260921_account_required.sql','utf8'));
    const result=await db.query('select user_id from group_memberships');
    expect(result.rows).toEqual([{user_id:owner}]);
    expect((await db.query('select count(*)::int as n from activities')).rows).toEqual([{n:1}]);
  });
  it('el directorio requiere cuenta sin exigir membresía y no abre calendarios',async()=>{
    await expect(as(null,'select get_groups()')).rejects.toThrow(/permission denied/);
    await expect(as(null,'select * from groups')).rejects.toThrow(/permission denied/);
    await expect(as(null,'select * from routes')).rejects.toThrow(/permission denied/);
    const result=await as(member,'select get_groups() as groups');
    expect((result.rows[0] as {groups:{name:string}[]}).groups[0].name).toBe('Santiago Rollers');
    await expect(as(null,'select * from activities')).rejects.toThrow(/permission denied/);
    await expect(as(null,'select get_published_activities()')).rejects.toThrow(/permission denied/);
  });
  it('el catálogo publicado requiere una cuenta y admite usuarios sin grupos',async()=>{
    await db.exec("insert into routes(status) values('published'),('draft')");
    expect((await as(member,'select * from routes')).rows).toHaveLength(1);
    await expect(as(null,'select * from routes')).rejects.toThrow(/permission denied/);
  });
  it('un extraño no ve el calendario incluso por la función antigua',async()=>{
    expect((await as(member,'select * from activities')).rows).toHaveLength(0);
    expect((await as(member,'select * from get_published_activities()')).rows).toHaveLength(0);
  });
  it('solicitud pendiente no habilita acceso ni permite autoaprobarse',async()=>{
    expect((await as(member,'select join_group($1) as state',[sr])).rows).toEqual([{state:'pending'}]);
    expect((await as(member,'select * from activities')).rows).toHaveLength(0);
    await expect(as(member,"update group_memberships set status='active' where user_id=$1",[member])).rejects.toThrow(/permission denied/);
    await expect(as(member,"select manage_group_member($1,$2,'approve')",[sr,member])).rejects.toThrow(/administrar/);
  });
  it('aprobar habilita solo el calendario del grupo',async()=>{
    await as(owner,"select manage_group_member($1,$2,'approve')",[sr,member]);
    expect((await as(member,'select * from get_published_activities()')).rows).toHaveLength(1);
    const result=await as(stranger,"select create_group('Otro grupo','Patinaje independiente','Valparaíso','open') as id");
    other=(result.rows[0] as {id:string}).id;
    await as(stranger,"insert into activities(title,meeting_point,group_id) values('Otra salida','Lugar B',$1)",[other]);
    expect((await as(member,'select * from activities')).rows).toHaveLength(1);
    expect((await as(stranger,'select * from get_published_activities()')).rows).toHaveLength(1);
    await expect(as(owner,'select get_group_members($1)',[other])).rejects.toThrow(/administrar/);
  });
  it('las reservas directas y la administración cruzada son rechazadas',async()=>{
    await expect(as(stranger,"insert into registrations(user_id,activity_id) values($1,'20000000-0000-4000-8000-000000000001')",[stranger])).rejects.toThrow(/permission denied/);
    await expect(as(stranger,"select register_for_activity('20000000-0000-4000-8000-000000000001')")).rejects.toThrow(/miembro/);
    expect((await as(stranger,"update activities set title='Intrusión' where group_id=$1 returning id",[sr])).rows).toHaveLength(0);
  });
  it('último cupo, repetición idempotente y cancelación liberan exactamente una plaza',async()=>{
    const sql="select register_for_activity('20000000-0000-4000-8000-000000000001')";
    await as(member,sql);await as(member,sql);
    await expect(as(owner,sql)).rejects.toThrow(/cupos/);
    expect((await db.query("select count(*)::int n from registrations where status='registered'")).rows).toEqual([{n:1}]);
    await as(member,"select cancel_registration('20000000-0000-4000-8000-000000000001')");
    await as(owner,sql);
  });
  it('el resumen administrativo calcula cupos en servidor sin exponerlos a terceros',async()=>{
    const rows=(await as(owner,'select get_group_admin_activities($1) as items',[sr])).rows as {items:{participants:number;id:string}[]}[];
    expect(rows[0].items.find(a=>a.id==='20000000-0000-4000-8000-000000000001')?.participants).toBe(1);
    await expect(as(member,'select get_group_admin_activities($1)',[sr])).rejects.toThrow(/administrar/);
    await expect(as(stranger,'select get_group_admin_activities($1)',[sr])).rejects.toThrow(/administrar/);
  });
  it('un propietario no puede salir sin transferir',async()=>{
    await expect(as(owner,'select leave_group($1)',[sr])).rejects.toThrow(/Transfiere/);
  });
  it('salir y bloquear revocan los permisos sin borrar historial de inscripciones',async()=>{
    await as(member,'select leave_group($1)',[sr]);
    expect((await as(member,'select * from get_published_activities()')).rows).toHaveLength(0);
    expect((await as(member,'select * from registrations')).rows).toHaveLength(1);
    await as(owner,"select manage_group_member($1,$2,'block')",[sr,member]);
    await expect(as(member,'select join_group($1)',[sr])).rejects.toThrow(/suspendido/);
  });
  it('un grupo abierto habilita acceso al unirse y admite múltiples membresías',async()=>{
    expect((await as(member,'select join_group($1) as state',[other])).rows).toEqual([{state:'active'}]);
    expect((await as(member,'select * from activities')).rows).toHaveLength(1);
  });
});
