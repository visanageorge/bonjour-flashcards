/** Prepare an insert-only repair. Never deletes or overwrites existing records. */
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const fullPath=process.argv[2],currentPath=process.argv[3];
assert(fullPath && currentPath,'Supply a complete backup and the current backup');
const full=JSON.parse(readFileSync(fullPath,'utf8'));
const current=JSON.parse(readFileSync(currentPath,'utf8'));
const target=current.user.id;
assert.equal(full.user.id,target);
assert.equal(current.user.email,'vladutvisana@gmail.com');
assert(/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(target));
assert.equal(full.cards.length,2728);
assert.equal(new Set(full.cards.map(c=>c.id)).size,2728);
assert(full.cards.every(c=>c.user_id===target));
const ids=new Set(current.cards.map(c=>c.id));
const missing=full.cards.filter(c=>!ids.has(c.id));
const serialized=JSON.stringify(full.cards);
assert(!serialized.includes('$restore_cards$'));
const sql=`BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='60s';
LOCK TABLE public.cards,public.reviews,public.decks IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE _cards_before_repair ON COMMIT DROP AS SELECT * FROM public.cards WHERE user_id='${target}';
CREATE TEMP TABLE _reviews_before_repair ON COMMIT DROP AS SELECT * FROM public.reviews WHERE user_id='${target}';
CREATE TEMP TABLE _decks_before_repair ON COMMIT DROP AS SELECT * FROM public.decks WHERE user_id='${target}';
DO $insert_missing_cards$
DECLARE backup_cards jsonb:=$restore_cards$${serialized}$restore_cards$::jsonb; inserted integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id='${target}'::uuid AND lower(email)='vladutvisana@gmail.com') THEN RAISE EXCEPTION 'Target account mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_populate_recordset(NULL::public.cards,backup_cards) b JOIN public.cards c ON c.id=b.id WHERE c.user_id<>'${target}'::uuid) THEN RAISE EXCEPTION 'Card identity belongs to another account'; END IF;
 INSERT INTO public.cards(id,user_id,deck_id,front,back,schedule,created_at,updated_at)
 SELECT id,user_id,deck_id,front,back,schedule,created_at,updated_at FROM jsonb_populate_recordset(NULL::public.cards,backup_cards)
 ON CONFLICT(id) DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 IF EXISTS(SELECT 1 FROM jsonb_populate_recordset(NULL::public.cards,backup_cards) b LEFT JOIN public.cards c ON c.id=b.id AND c.user_id='${target}'::uuid WHERE c.id IS NULL) THEN RAISE EXCEPTION 'Some catalog cards are still missing'; END IF;
 IF EXISTS(SELECT to_jsonb(b) FROM _cards_before_repair b EXCEPT SELECT to_jsonb(c) FROM public.cards c WHERE c.user_id='${target}') THEN RAISE EXCEPTION 'An existing card or schedule was changed'; END IF;
 IF EXISTS(SELECT to_jsonb(b) FROM _reviews_before_repair b EXCEPT SELECT to_jsonb(r) FROM public.reviews r WHERE r.user_id='${target}') OR EXISTS(SELECT to_jsonb(r) FROM public.reviews r WHERE r.user_id='${target}' EXCEPT SELECT to_jsonb(b) FROM _reviews_before_repair b) THEN RAISE EXCEPTION 'Review history was changed'; END IF;
 IF EXISTS(SELECT to_jsonb(b) FROM _decks_before_repair b EXCEPT SELECT to_jsonb(d) FROM public.decks d WHERE d.user_id='${target}') OR EXISTS(SELECT to_jsonb(d) FROM public.decks d WHERE d.user_id='${target}' EXCEPT SELECT to_jsonb(b) FROM _decks_before_repair b) THEN RAISE EXCEPTION 'Deck settings were changed'; END IF;
 RAISE NOTICE 'Inserted % missing cards. Existing cards, history and deck settings unchanged.',inserted;
END;
$insert_missing_cards$;
COMMIT;
SELECT d.name,d.enabled,count(c.id) AS cards FROM public.decks d LEFT JOIN public.cards c ON c.deck_id=d.id AND c.user_id=d.user_id WHERE d.user_id='${target}' GROUP BY d.id,d.name,d.enabled ORDER BY d.name;
`;
writeFileSync('tmp/restore-missing-cards.sql',sql);
console.log(JSON.stringify({fullBackup:fullPath,currentBackup:currentPath,currentCards:current.cards.length,missing:missing.length,existingReviews:current.reviews.length,sql:'tmp/restore-missing-cards.sql',mode:'INSERT missing IDs only; ON CONFLICT DO NOTHING'}));
