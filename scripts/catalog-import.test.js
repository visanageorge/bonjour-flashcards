import { describe, expect, it } from 'vitest';
import { buildCatalogImport } from './catalog-import.mjs';
import { emptyData, MASTER_DECK_ID, cardsInDeck, State } from '../src/data.ts';

function fixture() {
  const counts=[445,450,449,450,450,484];
  let index=0;
  return {cards:counts.flatMap((count,month)=>Array.from({length:count},()=>({
    catalog_id:`TEST-${++index}`,front:`Fixture ${index}`,back:'Traducere: exemplu\n\nExemple:\n• Bonjour.\n  Bună ziua.\n• Salut.\n  Salut.',
    month:month+1,old_card_id:index===1?'11111111-1111-4111-8111-111111111111':null,
    form_reviewed:true,meaning_reviewed:true,back_reviewed:true,
  })))};
}
describe('approved catalog migration payload',()=>{
  it('creates 2728 stable valid database identities and six monthly subsets with one MASTER view',()=>{
    const input=fixture(),backup=emptyData();
    const data=buildCatalogImport(input,backup);
    expect(data.cards).toHaveLength(2728);
    expect(data.decks.map(d=>data.cards.filter(c=>c.deckId===d.id).length)).toEqual([445,450,449,450,450,484]);
    expect(cardsInDeck(data,MASTER_DECK_ID)).toHaveLength(2728);
    expect(data.decks.some(d=>d.id===MASTER_DECK_ID)).toBe(false);
    expect(new Set(data.cards.map(c=>c.id)).size).toBe(2728);
    for(const row of [...data.decks,...data.cards]) expect(row.id).toMatch(/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/);
    expect(data.cards[0].id).toBe(input.cards[0].old_card_id);
    expect(buildCatalogImport(input,backup).cards.map(c=>c.id)).toEqual(data.cards.map(c=>c.id));
  });
  it('drops old learning data and the old deck, resets every schedule, and enforces 15 globally',()=>{
    const backup={...emptyData(),decks:[{id:'old',name:'Old',description:'',created:new Date().toISOString()}],reviews:[{id:'old-review'}],settings:{newPerDay:99,retention:0.92}};
    const data=buildCatalogImport(fixture(),backup);
    expect(data.decks.map(d=>d.name)).toEqual(['Luna 01','Luna 02','Luna 03','Luna 04','Luna 05','Luna 06']);
    expect(data.reviews).toEqual([]);
    expect(data.settings).toEqual({newPerDay:15,retention:0.92});
    for(const card of data.cards) {
      expect(card.schedule.state).toBe(State.New);
      expect(card.schedule.reps).toBe(0);
      expect(card.schedule.last_review).toBeUndefined();
    }
  });
  it('rejects missing approval, incomplete content, reused duplicate IDs, or an incorrect monthly split',()=>{
    const input=fixture();
    input.cards[0].form_reviewed=false;
    expect(()=>buildCatalogImport(input,emptyData())).toThrow(/reviewed/);
    input.cards[0].form_reviewed=true;
    input.cards[1].old_card_id=input.cards[0].old_card_id;
    expect(()=>buildCatalogImport(input,emptyData())).toThrow(/identity/);
    input.cards[1].old_card_id=null;
    input.cards[1].month=6;
    expect(()=>buildCatalogImport(input,emptyData())).toThrow(/Monthly/);
  });
});
