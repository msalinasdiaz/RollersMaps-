import { corsHeaders,jsonResponse,readSmallJson,type StoredObject } from './delete-account-handler.ts';
export type FinalizationDependencies={authorize:(token:string)=>Promise<boolean>;pending:()=>Promise<{user_id:string}[]>;prepare:(userId:string)=>Promise<StoredObject[]>;remove:(bucket:string,paths:string[])=>Promise<void>;deleteUser:(userId:string)=>Promise<void>};
export function createFinalizationHandler(dependencies:FinalizationDependencies){return async(request:Request):Promise<Response>=>{
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders});
 if(request.method!=='POST')return jsonResponse({error:'method_not_allowed'},405);
 const header=request.headers.get('authorization');if(!header?.startsWith('Bearer ')||header.length>20000)return jsonResponse({error:'unauthorized'},401);
 try{
  if(!await dependencies.authorize(header.slice(7)))return jsonResponse({error:'forbidden'},403);
  // No caller may select another identity. Only the private verified queue is used.
  if(request.body){let body:unknown;try{body=await readSmallJson(request);}catch{return jsonResponse({error:'invalid_request'},400);}if(typeof body!=='object'||body===null||Array.isArray(body)||Object.keys(body).length)return jsonResponse({error:'invalid_request'},400);}
  const pending=await dependencies.pending();let completed=0,failed=0;
  for(const {user_id} of pending){try{const objects=await dependencies.prepare(user_id);const buckets=new Map<string,string[]>();for(const object of objects){if(!object.bucket||!object.path)throw new Error('invalid_storage_result');const paths=buckets.get(object.bucket)??[];paths.push(object.path);buckets.set(object.bucket,paths);}for(const[bucket,paths]of buckets)for(let i=0;i<paths.length;i+=100)await dependencies.remove(bucket,paths.slice(i,i+100));await dependencies.deleteUser(user_id);completed++;}catch{failed++;}}
  return jsonResponse({completed,failed});
 }catch{return jsonResponse({error:'finalization_failed'},503);}
};}
