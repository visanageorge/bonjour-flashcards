/** Opt-in production check. The fetch wrapper rejects every write request. */
import {it,expect} from 'vitest';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {loadCloudData} from '../src/cloud';
import {cardsInDeck,MASTER_DECK_ID} from '../src/data';
import {AUDITED_CATALOG_DECK_IDS} from '../src/catalog';

it.skipIf(process.env.BONJOUR_LIVE_CHECK!=='1')('loads every live catalog page and preserves the pre-repair progress',async()=>{
  const path=process.env.BONJOUR_BEFORE_BACKUP;
  expect(path).toBeTruthy();
  const before=JSON.parse(readFileSync(path,'utf8'));
  const project='xomqdazgvitwwctwnjuv';
  const keys=JSON.parse(execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js','projects','api-keys','--project-ref',project,'--reveal','--output','json'],{encoding:'utf8'}));
  const secret=keys.find(k=>k.id==='service_role')?.api_key;
  expect(secret).toBeTruthy();
  const offsets=[];
  const client=createClient(`https://${project}.supabase.co`,secret,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:async(input,init)=>{
      if((init?.method??'GET').toUpperCase()!=='GET')throw Error('Live verification is read-only');
      const url=new URL(typeof input==='string'?input:input.url??String(input));
      if(url.pathname==='/rest/v1/cards')offsets.push(Number(url.searchParams.get('offset')??0));
      return fetch(input,init);
    }},
  });
  const data=await loadCloudData(client,before.user.id);
  expect(data.cards).toHaveLength(2728);
  expect(cardsInDeck(data,MASTER_DECK_ID)).toHaveLength(2728);
  const counts=AUDITED_CATALOG_DECK_IDS.map(id=>cardsInDeck(data,id).length);
  expect(counts).toEqual([445,450,449,450,450,484]);
  expect(offsets).toEqual([0,1000,2000]);
  const byId=new Map(data.cards.map(c=>[c.id,c]));
  const schedule=value=>JSON.parse(JSON.stringify({...value,due:new Date(value.due),last_review:value.last_review?new Date(value.last_review):undefined}));
  for(const old of before.cards){
    const actual=byId.get(old.id);
    expect(actual.front).toBe(old.front);
    expect(actual.back).toBe(old.back);
    expect(schedule(actual.schedule)).toEqual(schedule(old.schedule));
  }
  expect(data.reviews.map(r=>r.id).sort()).toEqual(before.reviews.map(r=>r.id).sort());
  for(const old of before.decks)expect(data.decks.find(d=>d.id===old.id).enabled).toBe(old.enabled);
  const host='https://flashcards-b5425.web.app';
  const asset=readFileSync('dist/index.html','utf8').match(/src="(\/assets\/[^\"]+\.js)"/)[1];
  expect(await(await fetch(host+'/?repair-verification='+Date.now())).text()).toContain(asset);
  expect(await(await fetch(host+asset)).text()).toBe(readFileSync('dist'+asset,'utf8'));
  const report={verifiedAt:new Date().toISOString(),cards:data.cards.length,monthlyCounts:counts,reviews:data.reviews.length,existingCardsAndSchedulesPreserved:true,deckOnOffPreserved:true,apiOffsets:offsets,publishedAsset:asset,readOnlyCheck:true,beforeBackup:path};
  writeFileSync('reports/catalog-repair-live-check.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
},30000);
