import { createEmptyCard, fsrs, Rating, State, type Card } from "ts-fsrs";
export { Rating, State };
export type Deck = {
  id: string;
  name: string;
  description: string;
  created: string;
};
export type Flashcard = {
  id: string;
  deckId: string;
  front: string;
  back: string;
  created: string;
  schedule: Card;
};
export type Review = {
  id: string;
  cardId: string;
  deckId: string;
  at: string;
  rating: number;
  wasNew: boolean;
  log: unknown;
};
export type CardTemplate = {
  id: string;
  name: string;
  frontPrompt: string;
  backPrompt: string;
  created: string;
};
export type Data = {
  version: 1;
  decks: Deck[];
  cards: Flashcard[];
  reviews: Review[];
  templates: CardTemplate[];
  settings: { newPerDay: number; retention: number };
};
export const emptyData = (): Data => ({
  version: 1,
  decks: [],
  cards: [],
  reviews: [],
  templates: [],
  settings: { newPerDay: 15, retention: 0.9 },
});
export const uid = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
export const newCard = (
  deckId: string,
  front: string,
  back: string,
): Flashcard => ({
  id: uid(),
  deckId,
  front,
  back,
  created: new Date().toISOString(),
  schedule: createEmptyCard(),
});
export const dayKey = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
export const BACKUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
export function backupReminderVisible(
  lastBackupAt: string | null | undefined,
  dismissedAt: string | null | undefined,
  now = new Date(),
  hasCards = true,
) {
  if (!hasCards || !lastBackupAt) return false;
  const last = Date.parse(lastBackupAt);
  if (!Number.isFinite(last) || +now - last < BACKUP_INTERVAL_MS) return false;
  return dismissedAt !== lastBackupAt;
}
export function queue(data: Data, deckId: string, now = new Date()) {
  const introduced = data.reviews.filter(
    (r) =>
      r.deckId === deckId && r.wasNew && dayKey(new Date(r.at)) === dayKey(now),
  ).length;
  const cards = data.cards.filter((c) => c.deckId === deckId);
  const due = cards
    .filter((c) => c.schedule.state !== State.New && c.schedule.due <= now)
    .sort((a, b) => +a.schedule.due - +b.schedule.due);
  const fresh = cards
    .filter((c) => c.schedule.state === State.New)
    .slice(0, Math.max(0, data.settings.newPerDay - introduced));
  return [...due, ...fresh];
}
export function outcomes(card: Flashcard, retention: number, now: Date) {
  return fsrs({ request_retention: retention, enable_fuzz: false }).repeat(
    card.schedule,
    now,
  );
}
export function grade(
  data: Data,
  cardId: string,
  rating: Rating.Again | Rating.Hard | Rating.Good | Rating.Easy,
  now = new Date(),
): Data {
  const card = data.cards.find((c) => c.id === cardId);
  if (!card) return data;
  const result = outcomes(card, data.settings.retention, now)[rating];
  return {
    ...data,
    cards: data.cards.map((c) =>
      c.id === cardId ? { ...c, schedule: result.card } : c,
    ),
    reviews: [
      ...data.reviews,
      {
        id: uid(),
        cardId,
        deckId: card.deckId,
        at: now.toISOString(),
        rating,
        wasNew: card.schedule.state === State.New,
        log: result.log,
      },
    ],
  };
}
export function interval(due: Date, now: Date) {
  const minutes = Math.max(1, Math.round((+due - +now) / 60000));
  return minutes < 60
    ? `${minutes} min`
    : minutes < 1440
      ? `${Math.round(minutes / 60)} ore`
      : `${Math.round(minutes / 1440)} zile`;
}
export function parseData(raw: unknown): Data {
  const d = raw as Data;
  if (
    !d ||
    d.version !== 1 ||
    !Array.isArray(d.decks) ||
    !Array.isArray(d.cards) ||
    !Array.isArray(d.reviews) ||
    !d.settings
  )
    throw Error("Fișierul nu este un backup Bonjour valid.");
  const templates = Array.isArray(d.templates) ? d.templates : [];
  const validText = (v: unknown) =>
    typeof v === "string" && v.trim().length > 0;
  const validDate = (v: unknown) =>
    typeof v === "string" && Number.isFinite(Date.parse(v));
  const unique = (list: { id: string }[]) =>
    new Set(list.map((x) => x.id)).size === list.length;
  if (
    !unique(d.decks) ||
    !unique(d.cards) ||
    !unique(d.reviews) ||
    !unique(templates)
  )
    throw Error("Backupul conține identificatori duplicați.");
  if (
    !Number.isInteger(d.settings.newPerDay) ||
    d.settings.newPerDay < 0 ||
    d.settings.newPerDay > 100 ||
    !Number.isFinite(d.settings.retention) ||
    d.settings.retention < 0.8 ||
    d.settings.retention > 0.97
  )
    throw Error("Setări invalide în backup.");
  if (
    d.decks.some(
      (x) =>
        !validText(x.id) ||
        !validText(x.name) ||
        typeof x.description !== "string" ||
        !validDate(x.created),
    )
  )
    throw Error("Deck invalid în backup.");
  if (
    templates.some(
      (template) =>
        !validText(template.id) ||
        !validText(template.name) ||
        !validText(template.frontPrompt) ||
        !validText(template.backPrompt) ||
        !validDate(template.created),
    )
  )
    throw Error("Template invalid în backup.");
  const ids = new Set(d.decks.map((x) => x.id));
  const cards = d.cards.map((c) => {
    if (
      !validText(c.id) ||
      !ids.has(c.deckId) ||
      !validText(c.front) ||
      !validText(c.back) ||
      !validDate(c.created) ||
      !c.schedule
    )
      throw Error("Card invalid în backup.");
    const s = c.schedule;
    const due = new Date(s.due);
    const last = s.last_review ? new Date(s.last_review) : undefined;
    if (
      !Number.isFinite(+due) ||
      (last && !Number.isFinite(+last)) ||
      ![0, 1, 2, 3].includes(s.state) ||
      [
        "stability",
        "difficulty",
        "elapsed_days",
        "scheduled_days",
        "reps",
        "lapses",
        "learning_steps",
      ].some(
        (k) =>
          !Number.isFinite((s as unknown as Record<string, number>)[k]) ||
          (s as unknown as Record<string, number>)[k] < 0,
      )
    )
      throw Error("Programare invalidă în backup.");
    return { ...c, schedule: { ...s, due, last_review: last } };
  });
  if (
    d.reviews.some(
      (r) =>
        !validText(r.id) ||
        !cards.some((c) => c.id === r.cardId && c.deckId === r.deckId) ||
        !validDate(r.at) ||
        ![1, 2, 3, 4].includes(r.rating) ||
        typeof r.wasNew !== "boolean",
    )
  )
    throw Error("Istoric invalid în backup.");
  return { ...d, templates, cards };
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("bonjour-local", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("app");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function readData(): Promise<Data> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction("app").objectStore("app").get("data");
      req.onsuccess = () => {
        try {
          resolve(req.result ? parseData(JSON.parse(req.result)) : emptyData());
        } catch (e) {
          reject(e);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
export async function writeData(data: Data) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("app", "readwrite");
      tx.objectStore("app").put(JSON.stringify(data), "data");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
