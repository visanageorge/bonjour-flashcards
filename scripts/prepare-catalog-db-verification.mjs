/** Prepare rollback rehearsal and stale-client guard checks; never executes them. */
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const snapshot=JSON.parse(readFileSync(process.argv[2],'utf8'));
const uuid=/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
assert(uuid.test(snapshot.user.id));
const target=snapshot.user.id;
const checks=Object.entries({decks:'decks',cards:'cards',reviews:'reviews',templates:'templates',user_settings:'settings'}).map(([table,key])=>`
 IF EXISTS(
   (SELECT to_jsonb(t) FROM public.${table} t WHERE user_id=target_id)
   EXCEPT (SELECT to_jsonb(b) FROM jsonb_populate_recordset(NULL::public.${table},previous->'${key}') b)
 ) OR EXISTS(
   (SELECT to_jsonb(b) FROM jsonb_populate_recordset(NULL::public.${table},previous->'${key}') b)
   EXCEPT (SELECT to_jsonb(t) FROM public.${table} t WHERE user_id=target_id)
 ) THEN RAISE EXCEPTION 'Restored rows differ from backup: ${table}'; END IF;`).join('\n');
let rollback=readFileSync('tmp/catalog-rollback.sql','utf8');
assert(rollback.endsWith('COMMIT;\n'));
rollback=rollback.replace("\nEND;\n$catalog_rollback$;",checks+"\nEND;\n$catalog_rollback$;");
rollback=rollback.slice(0,-'COMMIT;\n'.length)+"ROLLBACK;\nSELECT 'Full backup restoration verified inside a rolled-back transaction' AS result;\n";
writeFileSync('tmp/catalog-rollback-rehearsal.sql',rollback);
const old=snapshot.decks[0];
assert(uuid.test(old.id));
const claims=JSON.stringify({role:'authenticated',sub:target});
const guard=`BEGIN;
SELECT set_config('request.jwt.claims','${claims}',true);
DO $guard_test$
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION 'Test authentication role mismatch'; END IF;
 BEGIN
  INSERT INTO public.decks(id,user_id,name,description,created_at) VALUES('${old.id}','${target}','Retired deck verification','',now());
  RAISE EXCEPTION 'Stale client was allowed to recreate the retired deck';
 EXCEPTION WHEN check_violation THEN
  IF SQLERRM <> 'Biblioteca a fost inlocuita. Actualizeaza aplicatia inainte de sincronizare.' THEN RAISE; END IF;
 END;
END;
$guard_test$;
ROLLBACK;
SELECT 'Retired deck blocked for authenticated clients' AS result;
`;
writeFileSync('tmp/catalog-guard-verification.sql',guard);
console.log('Prepared rollback rehearsal and retired-deck guard verification.');
