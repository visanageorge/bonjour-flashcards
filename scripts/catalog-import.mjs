/** Pure payload builder. It has no network or filesystem side effects. */
import { createHash } from 'node:crypto';
import { newCard, parseData, State } from '../src/data.ts';
import { AUDITED_CATALOG_DECK_IDS, AUDITED_CATALOG_MARKER } from '../src/catalog.ts';
export const CATALOG_MARKER = AUDITED_CATALOG_MARKER;
const MONTH_COUNTS = [445, 450, 449, 450, 450, 484];
export function catalogUuid(value) {
  const bytes = createHash('sha256').update(`bonjour-audited-catalog:${value}`).digest().subarray(0,16);
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const h = bytes.toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
export function buildCatalogImport(staged, backup, created = new Date()) {
  if (staged.cards.length !== 2728 || staged.cards.some(item =>
    item.form_reviewed !== true || item.meaning_reviewed !== true || item.back_reviewed !== true || !item.back?.trim())) {
    throw Error('Only a complete, reviewed catalog can be built');
  }
  const decks = MONTH_COUNTS.map((_,index) => ({
    id: AUDITED_CATALOG_DECK_IDS[index],
    name: `Luna ${String(index+1).padStart(2,'0')}`,
    description: `Catalog auditat; etapa ${index+1} din 6.`,
    created: new Date(+created+index).toISOString(),
  }));
  const cards = staged.cards.map(item => {
    if (!decks[item.month-1]) throw Error('Invalid catalog month');
    return {
      ...newCard(decks[item.month-1].id,item.front,item.back),
      id: item.old_card_id ?? catalogUuid(item.catalog_id),
      created: created.toISOString(),
    };
  });
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (cards.some(card => !uuid.test(card.id)) || new Set(cards.map(card=>card.id)).size !== cards.length) {
    throw Error('Invalid or duplicate database card identity');
  }
  const data = parseData({
    version: 1, decks, cards, reviews: [], templates: backup.templates,
    settings: {...backup.settings,newPerDay:15},
  });
  if (data.decks.some((deck,index) => data.cards.filter(card=>card.deckId===deck.id).length !== MONTH_COUNTS[index])) {
    throw Error('Monthly counts do not match the approved catalog');
  }
  if (data.cards.some(card=>card.schedule.state!==State.New || card.schedule.reps!==0 || card.schedule.last_review)) {
    throw Error('SRS reset mismatch');
  }
  return data;
}
