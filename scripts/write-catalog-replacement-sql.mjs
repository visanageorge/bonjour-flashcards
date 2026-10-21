/** Generate transaction + rollback files only after the content gate passes. */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { buildCatalogImport } from './catalog-import.mjs';
execFileSync('python',['scripts/validate-catalog-content.py'],{stdio:'inherit'});
const snapshotPath=process.argv[2];
if (!snapshotPath) throw Error('An explicit fresh backup path is required');
const snapshot=JSON.parse(readFileSync(snapshotPath,'utf8'));
// Historical backups predate the pause column; those decks were active.
snapshot.decks=snapshot.decks.map(deck=>({...deck,enabled:deck.enabled??true}));
const appBackup=JSON.parse(readFileSync('supabase/vlad-before-catalog-replacement-app.json','utf8'));
const staged=JSON.parse(readFileSync('tmp/catalog-content-review.json','utf8'));
const data=buildCatalogImport(staged,appBackup);
const target=snapshot.user.id;
const uuid=/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
if (!uuid.test(target) || snapshot.user.email!=='vladutvisana@gmail.com') throw Error('Target account mismatch');
if (snapshot.decks.some(deck=>!uuid.test(deck.id))) throw Error('Invalid retired deck identity');
const input={
  decks:data.decks.map(d=>({id:d.id,user_id:target,name:d.name,description:d.description,created_at:d.created,enabled:d.enabled!==false})),
  cards:data.cards.map(c=>({id:c.id,user_id:target,deck_id:c.deckId,front:c.front,back:c.back,schedule:c.schedule,created_at:c.created})),
  reviews:[],templates:snapshot.templates,
  settings:[{user_id:target,new_per_day:15,retention:snapshot.settings[0]?.retention??0.9}],
};
const literal=value=>{
  const json=JSON.stringify(value);
  let delimiter='$bonjour_catalog$';
  while(json.includes(delimiter)) delimiter=delimiter.slice(0,-1)+'x$';
  return delimiter+json+delimiter+'::jsonb';
};
const tableColumns={
  decks:['id','user_id','name','description','created_at','enabled'],
  cards:['id','user_id','deck_id','front','back','schedule','created_at'],
  reviews:['id','user_id','card_id','deck_id','reviewed_at','rating','was_new','log'],
  templates:['id','user_id','name','front_prompt','back_prompt','created_at'],
  user_settings:['user_id','new_per_day','retention'],
};
const keys={decks:'decks',cards:'cards',reviews:'reviews',templates:'templates',user_settings:'settings'};
const restore=(table,variable)=>{
  const columns=tableColumns[table],primary=table==='user_settings'?'user_id':'id';
  return `INSERT INTO public.${table} (${columns.join(',')})
    SELECT ${columns.join(',')} FROM jsonb_populate_recordset(NULL::public.${table},${variable}->'${keys[table]}')
    ON CONFLICT (${primary}) DO UPDATE SET ${columns.filter(c=>c!==primary).map(c=>`${c}=EXCLUDED.${c}`).join(',')};`;
};
const precondition=Object.keys(tableColumns).map(table=>`
  IF EXISTS (
    (SELECT to_jsonb(t) FROM public.${table} t WHERE user_id=target_id)
    EXCEPT (SELECT to_jsonb(b) FROM jsonb_populate_recordset(NULL::public.${table},previous->'${keys[table]}') b)
  ) OR EXISTS (
    (SELECT to_jsonb(b) FROM jsonb_populate_recordset(NULL::public.${table},previous->'${keys[table]}') b)
    EXCEPT (SELECT to_jsonb(t) FROM public.${table} t WHERE user_id=target_id)
  ) THEN RAISE EXCEPTION 'Backup is stale: ${table}. Export a fresh snapshot first.'; END IF;`).join('\n');
const retired=snapshot.decks.map(d=>`'${d.id}'::uuid`).join(',');
const guard=retired?`
CREATE OR REPLACE FUNCTION public.block_retired_catalog_deck()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,auth AS $retired_guard$
BEGIN
  IF auth.role()='authenticated' AND NEW.user_id='${target}'::uuid AND NEW.id IN (${retired}) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Biblioteca a fost inlocuita. Actualizeaza aplicatia inainte de sincronizare.';
  END IF;
  RETURN NEW;
END;
$retired_guard$;
DROP TRIGGER IF EXISTS block_retired_catalog_deck ON public.decks;
CREATE TRIGGER block_retired_catalog_deck BEFORE INSERT OR UPDATE ON public.decks
FOR EACH ROW EXECUTE FUNCTION public.block_retired_catalog_deck();` : '';
const assertions=`
  IF (SELECT count(*) FROM public.cards WHERE user_id=target_id)<>2728 THEN RAISE EXCEPTION 'Card count mismatch'; END IF;
  IF (SELECT count(*) FROM public.decks WHERE user_id=target_id)<>6 THEN RAISE EXCEPTION 'Deck count mismatch'; END IF;
  IF EXISTS(SELECT 1 FROM public.reviews WHERE user_id=target_id) THEN RAISE EXCEPTION 'History was not reset'; END IF;
  IF EXISTS(SELECT 1 FROM public.cards WHERE user_id=target_id AND ((schedule->>'state')::int<>0 OR (schedule->>'reps')::int<>0 OR schedule->>'last_review' IS NOT NULL)) THEN RAISE EXCEPTION 'Schedule was not reset'; END IF;
  IF (SELECT new_per_day FROM public.user_settings WHERE user_id=target_id)<>15 THEN RAISE EXCEPTION 'Daily cap mismatch'; END IF;
  IF EXISTS(
    SELECT 1 FROM jsonb_populate_recordset(NULL::public.cards,replacement->'cards') expected
    LEFT JOIN public.cards actual ON actual.id=expected.id AND actual.user_id=target_id
    WHERE actual.id IS NULL OR (actual.deck_id,actual.front,actual.back,actual.schedule) IS DISTINCT FROM (expected.deck_id,expected.front,expected.back,expected.schedule)
  ) THEN RAISE EXCEPTION 'Imported content mismatch'; END IF;
  IF EXISTS(
    SELECT 1 FROM jsonb_populate_recordset(NULL::public.decks,replacement->'decks') d
    WHERE (SELECT count(*) FROM public.cards WHERE deck_id=d.id AND user_id=target_id)<>
          (SELECT count(*) FROM jsonb_populate_recordset(NULL::public.cards,replacement->'cards') c WHERE c.deck_id=d.id)
  ) THEN RAISE EXCEPTION 'Monthly subset mismatch'; END IF;`;
const sql=`BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='90s';
LOCK TABLE public.decks,public.cards,public.reviews,public.templates,public.user_settings IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE _bonjour_catalog_input (replacement jsonb,previous jsonb) ON COMMIT DROP;
INSERT INTO _bonjour_catalog_input VALUES (${literal(input)},${literal(snapshot)});
DO $catalog_migration$
DECLARE replacement jsonb; previous jsonb; target_id uuid:='${target}';
BEGIN
  SELECT i.replacement,i.previous INTO replacement,previous FROM _bonjour_catalog_input i;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=target_id AND lower(email)='vladutvisana@gmail.com') THEN RAISE EXCEPTION 'Target account mismatch'; END IF;
${precondition}
  IF EXISTS(SELECT 1 FROM public.decks WHERE user_id<>target_id AND id IN(SELECT (value->>'id')::uuid FROM jsonb_array_elements(replacement->'decks'))) THEN RAISE EXCEPTION 'Deck identity belongs to another account'; END IF;
  IF EXISTS(SELECT 1 FROM public.cards WHERE user_id<>target_id AND id IN(SELECT (value->>'id')::uuid FROM jsonb_array_elements(replacement->'cards'))) THEN RAISE EXCEPTION 'Card identity belongs to another account'; END IF;
  DELETE FROM public.reviews WHERE user_id=target_id;
  ${restore('decks','replacement')}
  ${restore('cards','replacement')}
  DELETE FROM public.cards WHERE user_id=target_id AND id NOT IN(SELECT (value->>'id')::uuid FROM jsonb_array_elements(replacement->'cards'));
  DELETE FROM public.decks WHERE user_id=target_id AND id NOT IN(SELECT (value->>'id')::uuid FROM jsonb_array_elements(replacement->'decks'));
  ${restore('user_settings','replacement')}
${assertions}
END;
$catalog_migration$;
${guard}
COMMIT;
`;
const rollback=`BEGIN;
SET LOCAL lock_timeout='10s';
LOCK TABLE public.decks,public.cards,public.reviews,public.templates,public.user_settings IN SHARE ROW EXCLUSIVE MODE;
DO $catalog_rollback$
DECLARE previous jsonb:=${literal(snapshot)}; target_id uuid:='${target}';
BEGIN
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=target_id AND lower(email)='vladutvisana@gmail.com') THEN RAISE EXCEPTION 'Target account mismatch'; END IF;
  -- Reinsert complete records so updated_at is preserved as well. UPDATE triggers
  -- would otherwise replace those backup timestamps with the current time.
  DELETE FROM public.reviews WHERE user_id=target_id;
  DELETE FROM public.cards WHERE user_id=target_id;
  DELETE FROM public.decks WHERE user_id=target_id;
  DELETE FROM public.templates WHERE user_id=target_id;
  DELETE FROM public.user_settings WHERE user_id=target_id;
  ${['decks','cards','reviews','templates','user_settings'].map(table=>`INSERT INTO public.${table} SELECT * FROM jsonb_populate_recordset(NULL::public.${table},previous->'${keys[table]}');`).join('\n  ')}
  IF (SELECT count(*) FROM public.cards WHERE user_id=target_id)<>jsonb_array_length(previous->'cards') THEN RAISE EXCEPTION 'Rollback card count mismatch'; END IF;
  IF (SELECT count(*) FROM public.reviews WHERE user_id=target_id)<>jsonb_array_length(previous->'reviews') THEN RAISE EXCEPTION 'Rollback review count mismatch'; END IF;
END;
$catalog_rollback$;
DROP TRIGGER IF EXISTS block_retired_catalog_deck ON public.decks;
DROP FUNCTION IF EXISTS public.block_retired_catalog_deck();
COMMIT;
`;
if (!process.argv.includes('--rollback-only')) {
  writeFileSync('tmp/catalog-import-payload.json',JSON.stringify(data,null,2));
  writeFileSync('tmp/catalog-replacement.sql',sql);
}
writeFileSync('tmp/catalog-rollback.sql',rollback);
console.log(JSON.stringify({cards:data.cards.length,backup:snapshotPath,migration:'tmp/catalog-replacement.sql',rollback:'tmp/catalog-rollback.sql',sqlBytes:Buffer.byteLength(sql)}));
