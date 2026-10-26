/** Create an authorized passwordless account and prepare an insert-only library seed. */
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {cloneAccountLibrary} from './account-library.mjs';
const [sourcePath,emailArg]=process.argv.slice(2);
assert(sourcePath && emailArg,'Supply source backup and target email');
const email=emailArg.trim().toLowerCase();
assert(/^[a-z0-9._+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/.test(email),'Invalid email');
const source=JSON.parse(readFileSync(sourcePath,'utf8'));
assert.equal(source.cards.length,2728);
assert.equal(source.decks.length,6);
assert.notEqual(source.user.email.toLowerCase(),email);
const project='xomqdazgvitwwctwnjuv';
const keys=JSON.parse(execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js','projects','api-keys','--project-ref',project,'--reveal','--output','json'],{encoding:'utf8'}));
const secret=keys.find(k=>k.id==='service_role')?.api_key;
assert(secret,'Service credential unavailable');
const client=createClient(`https://${project}.supabase.co`,secret,{auth:{autoRefreshToken:false,persistSession:false}});
let target;
for(let page=1;;page++){
  const {data,error}=await client.auth.admin.listUsers({page,perPage:1000});
  if(error)throw error;
  target=data.users.find(u=>u.email?.toLowerCase()===email);
  if(target || data.users.length<1000)break;
}
let created=false;
if(!target){
  if(!process.argv.includes('--create-account'))throw Error('Account does not exist; explicit --create-account required');
  const {data,error}=await client.auth.admin.createUser({email,email_confirm:true,user_metadata:{full_name:'Andreea'}});
  if(error)throw error;
  target=data.user;
  created=true;
}
assert(target?.id && target.id!==source.user.id);
const uuid=/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
assert(uuid.test(target.id) && uuid.test(source.user.id));
const previous={user:{id:target.id,email},exportedAt:new Date().toISOString()};
for(const table of ['decks','cards','reviews','templates','user_settings']){
  const all=[];
  for(let start=0;;){
    const {data,error,count}=await client.from(table).select('*',{count:'exact'}).eq('user_id',target.id).order(table==='user_settings'?'user_id':'id').range(start,start+999);
    if(error)throw error;
    all.push(...data);start+=data.length;
    if(start>=count)break;
    if(!data.length)throw Error(`Incomplete backup: ${table}`);
  }
  previous[table==='user_settings'?'settings':table]=all;
}
const backup=`supabase/account-library-before-${previous.exportedAt.replace(/[:.]/g,'-')}.json`;
writeFileSync(backup,JSON.stringify(previous,null,2));
assert(['decks','cards','reviews','templates','settings'].every(key=>previous[key].length===0),'Target account already has data; refusing to overwrite it');
const app=cloneAccountLibrary(source,target.id);
const payload={
  decks:app.decks.map(d=>({id:d.id,user_id:target.id,name:d.name,description:d.description,enabled:d.enabled,created_at:d.created})),
  cards:app.cards.map(c=>({id:c.id,user_id:target.id,deck_id:c.deckId,front:c.front,back:c.back,schedule:c.schedule,created_at:c.created})),
  templates:app.templates.map(t=>({id:t.id,user_id:target.id,name:t.name,front_prompt:t.frontPrompt,back_prompt:t.backPrompt,created_at:t.created})),
  settings:[{user_id:target.id,new_per_day:app.settings.newPerDay,retention:app.settings.retention}],
};
const literal=value=>{
  const json=JSON.stringify(value);let tag='$account_seed$';
  while(json.includes(tag))tag=tag.slice(0,-1)+'x$';
  return tag+json+tag+'::jsonb';
};
const tables=['decks','cards','reviews','templates','user_settings'];
const state=(user,alias)=>tables.map(table=>`SELECT '${table}' AS kind,to_jsonb(${alias}) AS data FROM public.${table} ${alias} WHERE user_id='${user}'::uuid`).join('\nUNION ALL\n');
const sql=`BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='90s';
LOCK TABLE public.decks,public.cards,public.reviews,public.templates,public.user_settings IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE _source_account_before ON COMMIT DROP AS ${state(source.user.id,'s')};
CREATE TEMP TABLE _account_input(payload jsonb) ON COMMIT DROP;
INSERT INTO _account_input VALUES(${literal(payload)});
DO $seed_account$
DECLARE p jsonb;
BEGIN
 SELECT payload INTO p FROM _account_input;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id='${target.id}'::uuid AND lower(email)='${email}') THEN RAISE EXCEPTION 'Target account mismatch'; END IF;
 IF EXISTS(${state(target.id,'t')}) THEN RAISE EXCEPTION 'Target account is not empty; no data replaced'; END IF;
 INSERT INTO public.decks(id,user_id,name,description,enabled,created_at) SELECT id,user_id,name,description,enabled,created_at FROM jsonb_populate_recordset(NULL::public.decks,p->'decks');
 INSERT INTO public.cards(id,user_id,deck_id,front,back,schedule,created_at) SELECT id,user_id,deck_id,front,back,schedule,created_at FROM jsonb_populate_recordset(NULL::public.cards,p->'cards');
 INSERT INTO public.templates(id,user_id,name,front_prompt,back_prompt,created_at) SELECT id,user_id,name,front_prompt,back_prompt,created_at FROM jsonb_populate_recordset(NULL::public.templates,p->'templates');
 INSERT INTO public.user_settings(user_id,new_per_day,retention) SELECT user_id,new_per_day,retention FROM jsonb_populate_recordset(NULL::public.user_settings,p->'settings');
 IF (SELECT count(*) FROM public.cards WHERE user_id='${target.id}')<>2728 OR (SELECT count(*) FROM public.decks WHERE user_id='${target.id}')<>6 THEN RAISE EXCEPTION 'Target library count mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM public.cards WHERE user_id='${target.id}' AND ((schedule->>'reps')::int<>0 OR (schedule->>'state')::int<>0 OR schedule->>'last_review' IS NOT NULL)) OR EXISTS(SELECT 1 FROM public.reviews WHERE user_id='${target.id}') THEN RAISE EXCEPTION 'Source progress was copied'; END IF;
 IF EXISTS(SELECT * FROM _source_account_before EXCEPT (${state(source.user.id,'s')})) OR EXISTS((${state(source.user.id,'s')}) EXCEPT SELECT * FROM _source_account_before) THEN RAISE EXCEPTION 'Source account changed'; END IF;
END;
$seed_account$;
COMMIT;
SELECT d.name,d.enabled,count(c.id) AS cards FROM public.decks d LEFT JOIN public.cards c ON c.deck_id=d.id AND c.user_id=d.user_id WHERE d.user_id='${target.id}' GROUP BY d.id,d.name,d.enabled ORDER BY d.name;
`;
writeFileSync('tmp/account-library-payload.json',JSON.stringify({sourcePath,target:{id:target.id,email},app,payload},null,2));
writeFileSync('tmp/account-library-seed.sql',sql);
console.log(JSON.stringify({accountCreated:created,target:{id:target.id,email},backup,cards:app.cards.length,decks:app.decks.length,sql:'tmp/account-library-seed.sql',sourceReviewsCopied:0,sourceDataWrites:0}));
