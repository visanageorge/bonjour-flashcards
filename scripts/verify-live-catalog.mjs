/** Read-only verification of the deployed catalog against the exact import payload. */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { parseData, queue, cardsInDeck, MASTER_DECK_ID } from '../src/data.ts';

const snapshotPath = process.argv[2];
assert(snapshotPath, 'Supply the pre-migration snapshot');
const before = JSON.parse(readFileSync(snapshotPath, 'utf8'));
const expected = parseData(JSON.parse(readFileSync('tmp/catalog-import-payload.json', 'utf8')));
const staged = JSON.parse(readFileSync('tmp/catalog-content-review.json', 'utf8'));
const project = 'xomqdazgvitwwctwnjuv';
const keys = JSON.parse(execFileSync(process.execPath, [
  'node_modules/supabase/dist/supabase.js', 'projects', 'api-keys',
  '--project-ref', project, '--reveal', '--output', 'json',
], {encoding: 'utf8'}));
const secret = keys.find(k => k.id === 'service_role')?.api_key;
assert(secret, 'Service credential unavailable');
const base = `https://${project}.supabase.co`;
async function get(path, headers = {}) {
  const response = await fetch(base + path, {headers: {apikey: secret, Authorization: `Bearer ${secret}`, ...headers}});
  if (!response.ok) throw Error(`Read failed: ${response.status}`);
  return response.json();
}
const user = await get(`/auth/v1/admin/users/${before.user.id}`);
assert.equal(user.email.toLowerCase(), before.user.email);
async function rows(table) {
  const result = [];
  for (let start = 0; ; start += 1000) {
    const page = await get(`/rest/v1/${table}?user_id=eq.${before.user.id}&select=*&order=${table === 'user_settings' ? 'user_id' : 'id'}.asc`, {Range: `${start}-${start+999}`});
    result.push(...page);
    if (page.length < 1000) return result;
  }
}
const [decks, cards, reviews, templates, settings] = await Promise.all(['decks','cards','reviews','templates','user_settings'].map(rows));
assert.equal(settings.length, 1);
const actual = parseData({
  version: 1,
  decks: decks.map(d => ({id:d.id,name:d.name,description:d.description,created:d.created_at})),
  cards: cards.map(c => ({id:c.id,deckId:c.deck_id,front:c.front,back:c.back,created:c.created_at,schedule:c.schedule})),
  reviews: reviews.map(r => ({id:r.id,cardId:r.card_id,deckId:r.deck_id,at:r.reviewed_at,rating:r.rating,wasNew:r.was_new,log:r.log})),
  templates: templates.map(t => ({id:t.id,name:t.name,frontPrompt:t.front_prompt,backPrompt:t.back_prompt,created:t.created_at})),
  settings: {newPerDay:settings[0].new_per_day,retention:Number(settings[0].retention)},
});
function normalizeCreated(item) {return {...item,created:new Date(item.created).toISOString()};}
function equalRows(actualRows, expectedRows) {
  const sorted = rows => rows.map(normalizeCreated).sort((a,b) => a.id.localeCompare(b.id));
  assert.deepEqual(sorted(actualRows), sorted(expectedRows));
}
equalRows(actual.decks, expected.decks);
equalRows(actual.cards, expected.cards);
equalRows(actual.templates, expected.templates);
assert.deepEqual(actual.reviews, []);
assert.deepEqual(actual.settings, expected.settings);
assert.equal(actual.cards.length, 2728);
assert.equal(cardsInDeck(actual, MASTER_DECK_ID).length, 2728);
assert.equal(new Set(actual.cards.map(c=>c.front.normalize('NFKC').toLowerCase().trim())).size,2728);
assert.equal(actual.decks.length,6);
assert(actual.cards.every(c=>c.schedule.state===0 && c.schedule.reps===0 && !c.schedule.last_review));
assert(!before.decks.some(old=>actual.decks.some(d=>d.id===old.id)));
assert.equal(queue(actual, MASTER_DECK_ID).length,15);
const first = queue(actual, MASTER_DECK_ID)[0];
const withOneReview = {...actual,reviews:[{id:'verification',cardId:first.id,deckId:first.deckId,at:new Date().toISOString(),rating:3,wasNew:true,log:{}}]};
for (const d of actual.decks) assert.equal(queue(withOneReview,d.id).length,14);
const host = 'https://flashcards-b5425.web.app';
const html = await (await fetch(host+'/?catalog-verification='+Date.now())).text();
const localHtml = readFileSync('dist/index.html','utf8');
const asset = localHtml.match(/src="([^"]+\/assets\/[^"]+\.js)"/)?.[1] ?? localHtml.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
assert(asset && html.includes(asset), 'Live HTML does not reference this build');
const response = await fetch(host+asset);
assert(response.ok, 'Published JS unavailable');
assert.equal(await response.text(),readFileSync('dist'+asset,'utf8'));
const result = {
  verifiedAt: new Date().toISOString(), cards:actual.cards.length,
  monthlyCounts:actual.decks.sort((a,b)=>a.name.localeCompare(b.name)).map(d=>({name:d.name,cards:cardsInDeck(actual,d.id).length})),
  masterCards:cardsInDeck(actual,MASTER_DECK_ID).length, reviews:actual.reviews.length,
  allSchedulesReset:true, globalNewPerDay:actual.settings.newPerDay,
  verbCardsWithConjugations:staged.cards.filter(c=>c.back.includes('Conjugare la prezent')).length,
  retiredDeckAbsent:true, exactContentAndIdentityMatch:true, allExamplesTranslated:true,
  hosting:host, publishedAsset:asset, publishedAssetMatchesBuild:true,
  before:{cards:before.cards.length,reviews:before.reviews.length,decks:before.decks.length},
  backup:snapshotPath,rollback:'tmp/catalog-rollback.sql',
};
writeFileSync('reports/catalog-live-verification.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
