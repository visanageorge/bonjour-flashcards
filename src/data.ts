import { createEmptyCard, fsrs, Rating, State, type Card } from "ts-fsrs";
export { Rating, State };
export type Deck = {
  id: string;
  name: string;
  description: string;
  created: string;
  enabled?: boolean;
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
  deleted?: DeletionLog;
};
export const COLLECTIONS = ["decks", "cards", "reviews", "templates"] as const;
export type DeletionLog = Record<(typeof COLLECTIONS)[number], string[]>;
export function mergeDeleted(...logs: (DeletionLog | undefined)[]): DeletionLog {
  return Object.fromEntries(COLLECTIONS.map(table => [table, [...new Set(logs.flatMap(log => log?.[table] ?? []))]])) as DeletionLog;
}
/** Only removals made while editing a known local library are deletions. */
export function trackDeletions(before: Data, next: Data): Data {
  const deleted = mergeDeleted(before.deleted, next.deleted);
  for (const table of COLLECTIONS) {
    const remaining = new Set(next[table].map(row => row.id));
    deleted[table] = [...new Set([...deleted[table], ...before[table].filter(row => !remaining.has(row.id)).map(row => row.id)])]
      .filter(id => !remaining.has(id));
  }
  return COLLECTIONS.some(table => deleted[table].length) ? { ...next, deleted } : { ...next, deleted: undefined };
}
export const MASTER_DECK_ID = "__master__";
export function cardsInDeck(data: Data, deckId: string) {
  return deckId === MASTER_DECK_ID
    ? data.cards
    : data.cards.filter((card) => card.deckId === deckId);
}
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
  front: normalizeCardText(front),
  back: normalizeCardText(back),
  created: new Date().toISOString(),
  schedule: createEmptyCard(),
});
export const dayKey = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

export function normalizeCardText(value: string) {
  return value
    .replace(/\\?<br\s*\/?\s*>/gi, "\n")
    .replace(/&lt;br\s*\/?&gt;/gi, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
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
export function queue(
  data: Data,
  deckId: string,
  now = new Date(),
  random: () => number = Math.random,
) {
  const introduced = new Set(
    data.reviews
      .filter((r) => r.wasNew && dayKey(new Date(r.at)) === dayKey(now))
      .map((r) => r.cardId),
  ).size;
  const activeDecks = new Set(data.decks.filter((deck) => deck.enabled !== false).map((deck) => deck.id));
  const cards = cardsInDeck(data, deckId).filter((card) => activeDecks.has(card.deckId));
  const due = cards
    .filter((c) => c.schedule.state !== State.New && c.schedule.due <= now)
    .sort((a, b) => +a.schedule.due - +b.schedule.due);
  const newCards = cards.filter((c) => c.schedule.state === State.New);
  const fresh = (deckId === MASTER_DECK_ID
    ? data.decks.flatMap((deck) =>
        shuffleCards(newCards.filter((card) => card.deckId === deck.id), random),
      )
    : shuffleCards(newCards, random)
  ).slice(0, Math.max(0, Math.min(15, data.settings.newPerDay) - introduced));
  return [...due, ...fresh];
}

export function shuffledDeckCards(
  data: Data,
  deckId: string,
  random: () => number = Math.random,
) {
  const cards = cardsInDeck(data, deckId);
  return shuffleCards(cards, random);
}

export function reviewedDeckCards(data: Data, deckId: string) {
  return cardsInDeck(data, deckId).filter((card) => card.schedule.reps > 0);
}

export function shuffledReviewedDeckCards(
  data: Data,
  deckId: string,
  random: () => number = Math.random,
) {
  return shuffleCards(reviewedDeckCards(data, deckId), random);
}

function shuffleCards(cards: Flashcard[], random: () => number) {
  const shuffled = [...cards];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }
  return shuffled;
}

export function masteryLevel(card: Card) {
  if (card.state === State.New || card.reps === 0) return 0;
  const thresholdsInDays = [1, 3, 7, 14, 30, 60, 120, 240];
  return (
    1 +
    thresholdsInDays.filter((threshold) => card.stability >= threshold).length
  );
}

export function quizPrompt(back: string) {
  const firstLine = normalizeCardText(back).split("\n")[0] ?? "";
  return firstLine.replace(/^(?:\*\*)?traducere(?:\*\*)?\s*:\s*/iu, "").trim();
}

function comparableFrench(value: string) {
  return normalizeCardText(value)
    .toLocaleLowerCase("fr")
    .replace(/[’‘]/g, "'")
    .replace(/['"]\s+/g, "'")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s*\((?:m|f|masculin|féminin|feminin)\.?\)\s*$/giu, "")
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function quizAnswerCorrect(answer: string, front: string) {
  return comparableFrench(answer) === comparableFrench(front);
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
  if (d.deleted && COLLECTIONS.some(table =>
    !Array.isArray(d.deleted?.[table]) || d.deleted[table].some(id => typeof id !== "string" || !id.trim() || (table === "templates" ? templates : d[table]).some(row => row.id === id))
  )) throw Error("Lista de ștergeri din backup este invalidă.");
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
        (x.enabled !== undefined && typeof x.enabled !== "boolean") ||
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
    return {
      ...c,
      front: normalizeCardText(c.front),
      back: normalizeCardText(c.back),
      schedule: { ...s, due, last_review: last },
    };
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
export async function readData(userId?: string): Promise<Data> {
  const raw = await readLocalDataRaw(userId);
  return raw == null ? emptyData() : parseData(typeof raw === "string" ? JSON.parse(raw) : raw);
}

/** Migrate the old shared slot only for its recorded owner, keeping the original. */
export async function readAccountData(userId: string, legacyOwner: string | null): Promise<Data> {
  if (legacyOwner === userId) {
    const db = await database();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("app", "readwrite");
        const store = tx.objectStore("app");
        const key = `data:${userId}`;
        const existing = store.get(key);
        existing.onsuccess = () => {
          if (existing.result != null) return;
          const legacy = store.get("data");
          legacy.onsuccess = () => {
            if (legacy.result != null) store.put(legacy.result, key);
          };
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? Error("Migrarea copiei locale a fost anulată."));
      });
    } finally { db.close(); }
  }
  return readData(userId);
}

/** Read without parsing so a damaged library can still be backed up. */
export async function readLocalDataRaw(userId?: string): Promise<unknown> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction("app").objectStore("app").get(userId ? `data:${userId}` : "data");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** Archive the original and replace it atomically; never writes to cloud. */
export async function restoreLocalData(
  data: Data,
  context: { userId: string; reason: string; hadUnsyncedChanges: boolean },
  storageUserId?: string,
) {
  const validated = parseData(data);
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("app", "readwrite");
      const store = tx.objectStore("app");
      const key = storageUserId ? `data:${storageUserId}` : "data";
      const original = store.get(key);
      original.onsuccess = () => {
        if (original.result != null) {
          store.add({ raw: original.result, ...context, archivedAt: new Date().toISOString() }, `recovery:${uid()}`);
        }
        store.put(JSON.stringify(validated), key);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? Error("Recuperarea locală a fost anulată; datele anterioare au fost păstrate."));
    });
  } finally {
    db.close();
  }
  return validated;
}
export async function writeData(data: Data, userId?: string) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("app", "readwrite");
      tx.objectStore("app").put(JSON.stringify(data), userId ? `data:${userId}` : "data");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
