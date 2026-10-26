import {it,expect} from 'vitest';
import {cloneAccountLibrary} from './account-library.mjs';
import {newCard,grade,Rating,emptyData} from '../src/data';

function source(){
  let d=emptyData();
  d.decks=[{id:'source-deck',name:'Luna 01',description:'Catalog',created:new Date().toISOString(),enabled:true}];
  d.cards=[newCard('source-deck','un arbre','un copac')];
  d=grade(d,d.cards[0].id,Rating.Easy);
  return {user:{id:'vlad'},decks:d.decks.map(x=>({...x,created_at:x.created})),cards:d.cards.map(x=>({...x,deck_id:x.deckId,created_at:x.created})),reviews:d.reviews,templates:[],settings:[{new_per_day:15,retention:0.9}]};
}
it('copies content while keeping IDs, scheduling, reviews and preferences independent',()=>{
  const original=source();
  const before=JSON.stringify(original);
  const copy=cloneAccountLibrary(original,'andreea');
  expect(copy.cards[0].front).toBe(original.cards[0].front);
  expect(copy.cards[0].back).toBe(original.cards[0].back);
  expect(copy.cards[0].id).not.toBe(original.cards[0].id);
  expect(copy.cards[0].deckId).not.toBe(original.decks[0].id);
  expect(copy.cards[0].schedule).toMatchObject({state:0,reps:0,lapses:0});
  expect(copy.cards[0].schedule.last_review).toBeUndefined();
  expect(copy.reviews).toEqual([]);
  expect(grade(copy,copy.cards[0].id,Rating.Good).reviews).toHaveLength(1);
  expect(JSON.stringify(original)).toBe(before);
});
it('uses stable identities per account and cannot seed the source account',()=>{
  const original=source();
  const a=cloneAccountLibrary(original,'andreea');
  expect(cloneAccountLibrary(original,'andreea').cards[0].id).toBe(a.cards[0].id);
  expect(cloneAccountLibrary(original,'other').cards[0].id).not.toBe(a.cards[0].id);
  expect(()=>cloneAccountLibrary(original,'vlad')).toThrow();
});
