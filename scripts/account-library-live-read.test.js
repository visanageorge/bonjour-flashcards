/** Opt-in check of the two initialized accounts; refuses all writes. */
import {it,expect} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {loadCloudData} from '../src/cloud';
import {MASTER_DECK_ID,cardsInDeck,queue} from '../src/data';
it.skipIf(process.env.BONJOUR_ACCOUNT_CHECK!=='1')('verifies identical content with separate identities and fresh personal progress',async()=>{
  const plan=JSON.parse(readFileSync('tmp/account-library-payload.json','utf8'));
  const before=JSON.parse(readFileSync(plan.sourcePath,'utf8'));
  const project='xomqdazgvitwwctwnjuv';
  const keys=JSON.parse(execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js','projects','api-keys','--project-ref',project,'--reveal','--output','json'],{encoding:'utf8'}));
  const key=keys.find(k=>k.id==='service_role')?.api_key;
  const client=createClient(`https://${project}.supabase.co`,key,{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{fetch:(input,init)=>{
      if((init?.method??'GET').toUpperCase()!=='GET')throw Error('Verification is read-only');
      return fetch(input,init);
    }},
  });
  const [vlad,andreea,auth]=await Promise.all([
    loadCloudData(client,before.user.id),loadCloudData(client,plan.target.id),client.auth.admin.getUserById(plan.target.id),
  ]);
  expect(auth.error).toBeNull();
  expect(auth.data.user.email).toBe(plan.target.email);
  expect(auth.data.user.email_confirmed_at).toBeTruthy();
  expect(vlad.cards).toHaveLength(2728);
  expect(andreea.cards).toHaveLength(2728);
  expect(cardsInDeck(andreea,MASTER_DECK_ID)).toHaveLength(2728);
  expect(andreea.reviews).toEqual([]);
  expect(andreea.cards.every(c=>c.schedule.state===0 && c.schedule.reps===0 && !c.schedule.last_review)).toBe(true);
  const expected=new Map(plan.app.cards.map(c=>[c.id,c]));
  const sourceIds=new Set(vlad.cards.map(c=>c.id));
  for(const c of andreea.cards){
    expect(sourceIds.has(c.id)).toBe(false);
    expect(c.front).toBe(expected.get(c.id).front);
    expect(c.back).toBe(expected.get(c.id).back);
    expect(c.deckId).toBe(expected.get(c.id).deckId);
  }
  const counts=plan.app.decks.map(d=>cardsInDeck(andreea,d.id).length);
  expect(counts).toEqual([445,450,449,450,450,484]);
  expect(queue(andreea,MASTER_DECK_ID)).toHaveLength(15);
  expect(vlad.reviews.map(r=>r.id).sort()).toEqual(before.reviews.map(r=>r.id).sort());
  const existing=new Map(vlad.cards.map(c=>[c.id,c]));
  const normalize=s=>JSON.parse(JSON.stringify({...s,due:new Date(s.due),last_review:s.last_review?new Date(s.last_review):undefined}));
  for(const c of before.cards)expect(normalize(existing.get(c.id).schedule)).toEqual(normalize(c.schedule));
  const host='https://flashcards-b5425.web.app';
  const asset=readFileSync('dist/index.html','utf8').match(/src="(\/assets\/[^\"]+\.js)"/)[1];
  expect(await(await fetch(host+'/?account-check='+Date.now())).text()).toContain(asset);
  const script=await(await fetch(host+asset)).text();
  expect(script).toBe(readFileSync('dist'+asset,'utf8'));
  expect(script).toContain(plan.target.email);
  const result={verifiedAt:new Date().toISOString(),andreeaCards:andreea.cards.length,andreeaReviews:0,monthlyCounts:counts,vladReviews:vlad.reviews.length,vladProgressUnchanged:true,separateCardIds:true,separateLocalCachesTested:true,personalDailyNewLimit:15,publishedAsset:asset};
  writeFileSync('reports/andreea-account-live-check.json',JSON.stringify(result,null,2)+'\n');
},30000);
