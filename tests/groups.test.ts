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
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets,name text,metadata jsonb,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,anon;
    grant select,insert,update,delete on storage.objects to authenticated;
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
    create table user_activities(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users, group_activity_id uuid references activities(id) on delete set null, title text, route_geojson jsonb);
    alter table activities enable row level security;
    create policy old_public_leak on activities for select using(true);
    grant all on activities,registrations to authenticated;
    insert into activities(id,title,meeting_point) values('20000000-0000-4000-8000-000000000001','Salida SR','Punto privado');
  `);
  await db.exec(readFileSync('supabase/migrations/20260920_groups_v140.sql','utf8'));
    await db.exec(readFileSync('supabase/migrations/20260921_account_required.sql','utf8'));
    await db.exec(readFileSync('supabase/migrations/20260922_calendar_privacy_logos.sql','utf8'));
    await db.exec(readFileSync('supabase/migrations/20260922_group_approval.sql','utf8'));
    await db.exec(readFileSync('supabase/migrations/20260922_platform_groups.sql','utf8'));
    await db.exec(readFileSync('supabase/migrations/20260923_platform_group_deletion.sql','utf8'));
});
afterAll(async()=>{await db.close()});
describe('Permisos reales de PostgreSQL y membresías',()=>{
  it('migración repetible conserva actividades y no afilia todas las cuentas',async()=>{
    await db.exec(readFileSync('supabase/migrations/20260920_groups_v140.sql','utf8'));
    await db.exec(readFileSync('supabase/migrations/20260921_account_required.sql','utf8'));
    await db.exec(readFileSync('supabase/migrations/20260922_calendar_privacy_logos.sql','utf8'));
    await db.exec(readFileSync('supabase/migrations/20260922_group_approval.sql','utf8'));
    await db.exec(readFileSync('supabase/migrations/20260922_platform_groups.sql','utf8'));
    await db.exec(readFileSync('supabase/migrations/20260923_platform_group_deletion.sql','utf8'));
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
    await as(owner,"select review_group_creation($1,'approve')",[other]);
    await as(stranger,"insert into activities(title,meeting_point,group_id) values('Otra salida','Lugar B',$1)",[other]);
    expect((await as(member,'select * from activities')).rows).toHaveLength(0);
    expect((await as(member,'select * from get_published_activities()')).rows).toHaveLength(1);
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

  it('oculta cantidades a miembros en ambas APIs, incluso si administran otro grupo',async()=>{
    const event='20000000-0000-4000-8000-000000000001';
    const legacy=(await as(member,'select * from get_published_activities()')).rows as {capacity:number|null;participants:number|null}[];
    expect(legacy[0].capacity).toBeNull();expect(legacy[0].participants).toBeNull();
    const calendar=(await as(member,'select get_group_calendar() as items')).rows as {items:{id:string;capacity:number|null;participants:number|null;registration_open:boolean}[]}[];
    expect(calendar[0].items.find(a=>a.id===event)).toMatchObject({capacity:null,participants:null,registration_open:false});
    const adminRows=(await as(owner,'select get_group_calendar() as items')).rows as {items:{id:string;capacity:number;participants:number}[]}[];
    expect(adminRows[0].items.find(a=>a.id===event)).toMatchObject({capacity:1,participants:1});
    await as(stranger,'select join_group($1)',[sr]);
    await as(owner,"select manage_group_member($1,$2,'approve')",[sr,stranger]);
    expect((await as(stranger,'select capacity,participants from get_published_activities() where id=$1',[event])).rows).toEqual([{capacity:null,participants:null}]);
    await as(owner,"select manage_group_member($1,$2,'remove')",[sr,stranger]);
  });
  it('solo el administrador de cada grupo puede subir y asignar su logo',async()=>{
    const path=sr+'/1790000000000-prueba.png';
    const upload="insert into storage.objects(bucket_id,name,metadata) values('group-logos',$1,'{\"mimetype\":\"image/png\",\"size\":1024}')";
    await expect(as(member,upload,[path])).rejects.toThrow(/row-level/);
    await expect(as(stranger,upload,[path])).rejects.toThrow(/row-level/);
    await as(owner,upload,[path]);
    await expect(as(member,'select set_group_logo($1,$2)',[sr,path])).rejects.toThrow(/administrar/);
    await expect(as(stranger,'select set_group_logo($1,$2)',[sr,path])).rejects.toThrow(/administrar/);
    await expect(as(owner,'select set_group_logo($1,$2)',[sr,other+'/1-logo.png'])).rejects.toThrow(/pertenecer/);
    await expect(as(owner,'select set_group_logo($1,$2)',[sr,sr+'/1-missing.png'])).rejects.toThrow(/PNG/);
    await expect(as(null,'select set_group_logo($1,$2)',[sr,path])).rejects.toThrow(/permission/);
    await as(owner,'select set_group_logo($1,$2)',[sr,path]);
    expect((await db.query('select logo_url from groups where id=$1',[sr])).rows).toEqual([{logo_url:path}]);
    expect((await as(member,"select name from storage.objects where name=$1",[path])).rows).toHaveLength(1);
    expect((await as(owner,"delete from storage.objects where name=$1 returning name",[path])).rows).toHaveLength(0);
    expect((await as(owner,"update storage.objects set metadata='{}' where name=$1 returning name",[path])).rows).toHaveLength(0);
    await as(owner,"select manage_group_member($1,$2,'promote')",[sr,member]);
    const adminPath=sr+'/1790000000001-admin.png';
    await as(member,upload,[adminPath]);
    await as(member,'select set_group_logo($1,$2)',[sr,adminPath]);
    await as(owner,"select manage_group_member($1,$2,'demote')",[sr,member]);
    await expect(as(member,upload,[sr+'/1790000000002-revoked.png'])).rejects.toThrow(/row-level/);
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
    expect((await as(member,'select * from activities')).rows).toHaveLength(0);
    expect((await as(member,'select * from get_published_activities()')).rows).toHaveLength(1);
  });
});

describe('Aprobación central y vencimiento de grupos nuevos',()=>{
  let pending:string;
  it('crear grupo deja solo una solicitud privada de 48 horas sin administración habilitada',async()=>{
    pending=((await as(stranger,"select create_group('Comunidad nueva','Descripción','Santiago','open') id")).rows[0] as {id:string}).id;
    const stored=(await db.query('select is_active,approval_status,extract(epoch from (approval_expires_at-created_at))::int seconds from groups where id=$1',[pending])).rows;
    expect(stored).toEqual([{is_active:false,approval_status:'pending',seconds:172800}]);
    expect((await as(stranger,'select is_group_admin($1) allowed',[pending])).rows).toEqual([{allowed:false}]);
    const own=(await as(stranger,'select get_groups() items')).rows as {items:{id:string}[]}[];
    const others=(await as(member,'select get_groups() items')).rows as {items:{id:string}[]}[];
    expect(own[0].items.some(g=>g.id===pending)).toBe(true);
    expect(others[0].items.some(g=>g.id===pending)).toBe(false);
    await expect(as(member,'select join_group($1)',[pending])).rejects.toThrow(/disponible/);
    await expect(as(stranger,"insert into activities(title,meeting_point,group_id) values('No autorizada','Parque',$1)",[pending])).rejects.toThrow(/row-level/);
    await expect(as(stranger,"insert into storage.objects(bucket_id,name,metadata) values('group-logos',$1,'{}')",[pending+'/1-logo.png'])).rejects.toThrow(/row-level/);
    await expect(as(stranger,"select create_group('Otra petición','','','open')")).rejects.toThrow(/Ya tienes una solicitud/);
  });
  it('solo la administración general puede ver solicitudes y aprobarlas',async()=>{
    await expect(as(stranger,'select get_group_creation_requests()')).rejects.toThrow(/administración general/);
    await expect(as(stranger,"select review_group_creation($1,'approve')",[pending])).rejects.toThrow(/administración general/);
    await expect(as(member,"insert into admin_users(user_id) values($1)",[member])).rejects.toThrow(/permission/);
    const rows=(await as(owner,'select get_group_creation_requests() items')).rows as {items:{id:string}[]}[];
    expect(rows[0].items.some(g=>g.id===pending)).toBe(true);
    await as(owner,"select review_group_creation($1,'approve')",[pending]);
    expect((await as(stranger,'select is_group_admin($1) allowed',[pending])).rows).toEqual([{allowed:true}]);
    await db.query("update groups set approval_expires_at=now()-interval '1 second' where id=$1",[pending]);
    await db.query('select purge_expired_group_requests()');
    expect((await db.query('select id from groups where id=$1',[pending])).rows).toHaveLength(1);
  });
  it('rechazados desaparecen al cumplir 48 horas y la limpieza no toca grupos aprobados',async()=>{
    const id=((await as(member,"select create_group('No aprobado','','','approval') id")).rows[0] as {id:string}).id;
    await as(owner,"select review_group_creation($1,'reject')",[id]);
    await db.query('update groups set approval_expires_at=now() where id=$1',[id]);
    const listed=(await as(member,'select get_groups() items')).rows as {items:{id:string}[]}[];
    expect(listed[0].items.some(g=>g.id===id)).toBe(false);
    expect((await as(member,'select id from groups where id=$1',[id])).rows).toHaveLength(0);
    await expect(as(owner,"select review_group_creation($1,'approve')",[id])).rejects.toThrow(/resuelta o venció/);
    await expect(as(member,'select purge_expired_group_requests()')).rejects.toThrow(/permission/);
    expect((await db.query('select purge_expired_group_requests() n')).rows).toEqual([{n:1}]);
    expect((await db.query('select group_id from group_memberships where group_id=$1',[id])).rows).toHaveLength(0);
    expect((await db.query("select id from groups where id in ($1,$2,$3)",[sr,other,pending])).rows).toHaveLength(3);
  });
  it('las solicitudes sin respuesta vencen igual y permiten volver a solicitar después',async()=>{
    const id=((await as(member,"select create_group('Sin respuesta','','','approval') id")).rows[0] as {id:string}).id;
    await db.query("update groups set approval_expires_at=now()-interval '1 second' where id=$1",[id]);
    expect((await db.query('select purge_expired_group_requests() n')).rows).toEqual([{n:1}]);
    expect((await db.query('select id from groups where id=$1',[id])).rows).toHaveLength(0);
    const retry=(await as(member,"select create_group('Nuevo intento','','','approval') id")).rows;
    expect(retry).toHaveLength(1);
  });

  it('la administración general ve grupos de otros creadores y todos los estados sin ampliar permisos de grupo',async()=>{
    const pending=(await db.query("select id from groups where owner_id=$1 and approval_status='pending'",[member])).rows[0] as {id:string};
    const rejected=(await as(stranger,"select create_group('Solicitud rechazada','Descripción','Valparaíso','approval') as id")).rows[0] as {id:string};
    await as(owner,"select review_group_creation($1,'reject')",[rejected.id]);
    const all=(await as(owner,'select get_platform_groups() items')).rows[0] as {items:{id:string;approval_status:string;requester_name:string}[]};
    expect(all.items.find(g=>g.id===other)).toMatchObject({approval_status:'approved',requester_name:'Otro patinador'});
    expect(all.items.find(g=>g.id===pending.id)).toMatchObject({approval_status:'pending',requester_name:'Miembro'});
    expect(all.items.find(g=>g.id===rejected.id)).toMatchObject({approval_status:'rejected'});
    await expect(as(member,'select get_platform_groups()')).rejects.toThrow(/administración general/);
    await expect(as(stranger,'select get_platform_groups()')).rejects.toThrow(/administración general/);
    await expect(as(null,'select get_platform_groups()')).rejects.toThrow(/permission denied/);
    await expect(as(owner,'select get_group_members($1)',[other])).rejects.toThrow(/administrar/);
    await as(owner,"select review_group_creation($1,'approve')",[pending.id]);
    const approved=(await as(owner,'select get_platform_groups() items')).rows[0] as {items:{id:string;approval_status:string;member_count:number}[]};
    expect(approved.items.find(g=>g.id===pending.id)).toMatchObject({approval_status:'approved',member_count:1});
    await db.query("update groups set approval_expires_at=now()-interval '1 second' where id=$1",[rejected.id]);
    const expired=(await as(owner,'select get_platform_groups() items')).rows[0] as {items:{id:string}[]};
    expect(expired.items.some(g=>g.id===rejected.id)).toBe(false);
    await db.query("select purge_expired_group_requests()");
  });
  it('la administración general funciona incluso sin ser miembro de ningún grupo',async()=>{
    await db.transaction(async tx=>{
      await tx.exec("delete from group_memberships where user_id='"+owner+"'");
      await tx.exec('set local role authenticated');
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
      expect((await tx.query<{admin:boolean}>("select is_platform_admin() admin")).rows[0].admin).toBe(true);
      expect((await tx.query<{items:unknown[]}>("select get_platform_groups() items")).rows[0].items.length).toBeGreaterThan(1);
    });
  });
});

describe('Eliminación de grupos con historial',()=>{
 it('un dueño de grupo sin rol general, un miembro y un anónimo no pueden eliminar ni leer el historial',async()=>{
   await expect(as(stranger,"select delete_platform_group($1,'Grupo ajeno')",[other])).rejects.toThrow(/administración general/);
   await expect(as(member,"select delete_platform_group($1,'Santiago Rollers')",[sr])).rejects.toThrow(/administración general/);
   await expect(as(null,"select delete_platform_group($1,'Santiago Rollers')",[sr])).rejects.toThrow(/permission denied/);
   await expect(as(member,'select get_platform_group_deletions()')).rejects.toThrow(/administración general/);
   expect((await as(member,'select * from platform_group_deletions')).rows).toEqual([]);
   await expect(as(owner,"delete from platform_group_deletions")).rejects.toThrow(/permission denied/);
   expect((await db.query('select id from groups where id=$1',[sr])).rows).toHaveLength(1);
 });
 it('exige nombre exacto y elimina un grupo ajeno conservando el GPS personal y el registro de quién lo eliminó',async()=>{
   const id='30000000-0000-4000-8000-000000000001', activity='30000000-0000-4000-8000-000000000002', gps='30000000-0000-4000-8000-000000000003';
   await db.query("insert into groups(id,slug,name,owner_id) values($1,'prueba-eliminacion','Grupo para eliminar',$2)",[id,stranger]);
   await db.query("insert into group_memberships(group_id,user_id,role,status) values($1,$2,'owner','active'),($1,$3,'member','active')",[id,stranger,member]);
   await db.query("insert into activities(id,title,group_id) values($1,'Actividad de prueba',$2)",[activity,id]);
   await db.query('insert into registrations(user_id,activity_id) values($1,$2)',[member,activity]);
   const geometry={type:'LineString',coordinates:[[-70,-33],[-70.01,-33.01]]};
   await db.query('insert into user_activities(id,user_id,group_activity_id,title,route_geojson) values($1,$2,$3,$4,$5)',[gps,member,activity,'Mi recorrido',JSON.stringify(geometry)]);
   await expect(as(owner,"select delete_platform_group($1,'Nombre incorrecto')",[id])).rejects.toThrow(/nombre/);
   expect((await db.query('select id from groups where id=$1',[id])).rows).toHaveLength(1);
   expect((await db.query('select id from platform_group_deletions where group_id=$1',[id])).rows).toHaveLength(0);
   const unrelated=(await db.query('select count(*)::int n from activities where group_id<>$1',[id])).rows;
   await as(owner,"select delete_platform_group($1,'Grupo para eliminar')",[id]);
   for(const table of ['groups','group_memberships','activities']) {
     const column=table==='groups'?'id':'group_id';
     expect((await db.query('select count(*)::int n from '+table+' where '+column+'=$1',[id])).rows).toEqual([{n:0}]);
   }
   expect((await db.query('select count(*)::int n from registrations where activity_id=$1',[activity])).rows).toEqual([{n:0}]);
   expect((await db.query('select group_activity_id,title,route_geojson from user_activities where id=$1',[gps])).rows).toEqual([{group_activity_id:null,title:'Mi recorrido',route_geojson:geometry}]);
   expect((await db.query('select count(*)::int n from activities where group_id<>$1',[id])).rows).toEqual(unrelated);
   expect((await db.query('select deleted_by,group_name,member_count,activity_count,registration_count from platform_group_deletions where group_id=$1',[id])).rows).toEqual([{deleted_by:owner,group_name:'Grupo para eliminar',member_count:2,activity_count:1,registration_count:1}]);
   const history=(await as(owner,'select get_platform_group_deletions() items')).rows[0] as {items:{group_name:string}[]};
   expect(history.items.some(item=>item.group_name==='Grupo para eliminar')).toBe(true);
   await expect(as(owner,"select delete_platform_group($1,'Grupo para eliminar')",[id])).rejects.toThrow(/ya no/);
   const offline=crypto.randomUUID();
   await db.query('insert into user_activities(id,user_id,group_activity_id,title,route_geojson) values($1,$2,$3,$4,$5)',[offline,member,activity,'GPS pendiente sin conexión',JSON.stringify(geometry)]);
   expect((await db.query('select group_activity_id,route_geojson from user_activities where id=$1',[offline])).rows).toEqual([{group_activity_id:null,route_geojson:geometry}]);
 });
 it('también elimina solicitudes pendientes y rechazadas sin habilitarlas',async()=>{
   for(const status of ['pending','rejected']){
     const id=crypto.randomUUID();
     await db.query("insert into groups(id,slug,name,owner_id,is_active,approval_status,approval_expires_at) values($1,$2,$3,$4,false,$5,now()+interval '1 day')",[id,'prueba-'+id,'Solicitud '+status,member,status]);
     await as(owner,'select delete_platform_group($1,$2)',[id,'Solicitud '+status]);
     expect((await db.query('select approval_status from platform_group_deletions where group_id=$1',[id])).rows).toEqual([{approval_status:status}]);
   }
 });
});
