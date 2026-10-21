import type { SupabaseClient } from "@supabase/supabase-js";
import { emptyData, parseData, mergeDeleted, type Data } from "./data";

type CloudDeck = {
  id: string;
  name: string;
  description: string;
  created_at: string;
  enabled?: boolean;
};

type CloudCard = {
  id: string;
  deck_id: string;
  front: string;
  back: string;
  created_at: string;
  schedule: unknown;
};

type CloudReview = {
  id: string;
  card_id: string;
  deck_id: string;
  reviewed_at: string;
  rating: number;
  was_new: boolean;
  log: unknown;
};

type CloudTemplate = {
  id: string;
  name: string;
  front_prompt: string;
  back_prompt: string;
  created_at: string;
};

type CloudSettings = {
  new_per_day: number;
  retention: number | string;
};

const jsonValue = (value: unknown) => JSON.parse(JSON.stringify(value));
import { AUDITED_CATALOG_DECK_IDS } from "./catalog";
export { AUDITED_CATALOG_MARKER } from "./catalog";
export function isAuditedCatalog(data: Data) {
  return AUDITED_CATALOG_DECK_IDS.every(id => data.decks.some(deck => deck.id === id));
}
const PAGE_SIZE = 1000;
const WRITE_BATCH_SIZE = 200;
const DELETE_BATCH_SIZE = 100;

async function loadRows(
  client: SupabaseClient,
  table: "decks" | "cards" | "reviews" | "templates",
  userId: string,
  columns: string,
  orderColumn: string,
) {
  const rows: unknown[] = [];
  const seen = new Set<string>();
  let total: number | null = null;
  for (let start = 0; ; ) {
    const result = await client
      .from(table)
      .select(columns, { count: "exact" })
      .eq("user_id", userId)
      .order(orderColumn)
      .order("id")
      .range(start, start + PAGE_SIZE - 1);
    if (result.error) throw result.error;
    const page = (result.data ?? []) as unknown as { id: string }[];
    if (typeof result.count === "number") {
      if (total !== null && total !== result.count) throw Error("Biblioteca s-a schimbat în timpul încărcării. Reîncearcă sincronizarea.");
      total = result.count;
    }
    if (!page.length) {
      if (total !== null && rows.length !== total) throw Error("Biblioteca nu a fost încărcată complet. Datele locale au fost păstrate.");
      break;
    }
    for (const row of page) {
      if (typeof row.id !== "string" || !row.id) throw Error("Serverul a returnat un rând fără identificator.");
      if (seen.has(row.id)) throw Error("Serverul a repetat o pagină. Sincronizarea a fost oprită pentru a păstra datele.");
      seen.add(row.id);
    }
    rows.push(...page);
    start += page.length;
    if (total !== null && rows.length >= total) {
      if (rows.length !== total) throw Error("Numărul cardurilor încărcate nu corespunde serverului.");
      break;
    }
  }
  return rows;
}

async function upsertRows(
  client: SupabaseClient,
  table: "decks" | "cards" | "reviews" | "templates",
  rows: Record<string, unknown>[],
) {
  for (let start = 0; start < rows.length; start += WRITE_BATCH_SIZE) {
    const result = await client
      .from(table)
      .upsert(rows.slice(start, start + WRITE_BATCH_SIZE));
    if (result.error) throw result.error;
  }
}

export function dataIsEmpty(data: Data) {
  return (
    data.decks.length === 0 &&
    data.cards.length === 0 &&
    data.templates.length === 0
  );
}

/** Combines two first-sync libraries without discarding cards from either one. */
export function mergeData(cloud: Data, local: Data): Data {
  const mergeById = <T extends { id: string }>(older: T[], newer: T[]) => {
    const rows = new Map(older.map((row) => [row.id, row]));
    newer.forEach((row) => rows.set(row.id, row));
    return [...rows.values()];
  };

  const deleted = mergeDeleted(cloud.deleted, local.deleted);
  const decks = mergeById(cloud.decks, local.decks).filter(row => !deleted.decks.includes(row.id));
  const deckIds = new Set(decks.map(row => row.id));
  const cards = mergeById(cloud.cards, local.cards).filter(row => deckIds.has(row.deckId) && !deleted.cards.includes(row.id));
  const cardIds = new Set(cards.map(row => row.id));
  return {
    version: 1,
    decks,
    cards,
    reviews: mergeById(cloud.reviews, local.reviews).filter(row => cardIds.has(row.cardId) && deckIds.has(row.deckId) && !deleted.reviews.includes(row.id)),
    templates: mergeById(cloud.templates, local.templates).filter(row => !deleted.templates.includes(row.id)),
    settings: local.settings,
    deleted,
  };
}

export async function loadCloudData(
  client: SupabaseClient,
  userId: string,
): Promise<Data | null> {
  const [decks, cards, reviews, templates, settingsResult] = await Promise.all([
    loadRows(client, "decks", userId, "id,name,description,created_at,enabled", "created_at"),
    loadRows(client, "cards", userId, "id,deck_id,front,back,created_at,schedule", "created_at"),
    loadRows(client, "reviews", userId, "id,card_id,deck_id,reviewed_at,rating,was_new,log", "reviewed_at"),
    loadRows(client, "templates", userId, "id,name,front_prompt,back_prompt,created_at", "created_at"),
    client
      .from("user_settings")
      .select("new_per_day,retention")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (settingsResult.error) throw settingsResult.error;
  const settings = settingsResult.data as CloudSettings | null;

  if (
    !decks.length &&
    !cards.length &&
    !reviews.length &&
    !templates.length &&
    !settings
  )
    return null;

  const defaults = emptyData();
  return parseData({
    version: 1,
    decks: (decks as CloudDeck[]).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      created: row.created_at,
      enabled: row.enabled ?? true,
    })),
    cards: (cards as CloudCard[]).map((row) => ({
      id: row.id,
      deckId: row.deck_id,
      front: row.front,
      back: row.back,
      created: row.created_at,
      schedule: row.schedule,
    })),
    reviews: (reviews as CloudReview[]).map((row) => ({
      id: row.id,
      cardId: row.card_id,
      deckId: row.deck_id,
      at: row.reviewed_at,
      rating: row.rating,
      wasNew: row.was_new,
      log: row.log,
    })),
    templates: (templates as CloudTemplate[]).map((row) => ({
      id: row.id,
      name: row.name,
      frontPrompt: row.front_prompt,
      backPrompt: row.back_prompt,
      created: row.created_at,
    })),
    settings: settings
      ? {
          newPerDay: settings.new_per_day,
          retention: Number(settings.retention),
        }
      : defaults.settings,
  });
}

async function deleteExplicitRows(
  client: SupabaseClient,
  table: "reviews" | "cards" | "decks" | "templates",
  userId: string,
  ids: string[],
) {
  for (let start = 0; start < ids.length; start += DELETE_BATCH_SIZE) {
    const removed = await client
      .from(table)
      .delete()
      .eq("user_id", userId)
      .in("id", ids.slice(start, start + DELETE_BATCH_SIZE));
    if (removed.error) throw removed.error;
  }
}

/** Merge incomplete local copies safely; delete only explicitly removed IDs. */
export async function saveCloudData(
  client: SupabaseClient,
  userId: string,
  data: Data,
) {
  parseData(data);
  const remote = await loadCloudData(client, userId);
  data = remote ? parseData(mergeData(remote, data)) : data;
  if (data.decks.length) {
    await upsertRows(client, "decks",
      data.decks.map((deck) => ({
        id: deck.id,
        user_id: userId,
        name: deck.name,
        description: deck.description,
        created_at: deck.created,
        enabled: deck.enabled !== false,
      })),
    );
  }

  if (data.cards.length) {
    await upsertRows(client, "cards",
      data.cards.map((card) => ({
        id: card.id,
        user_id: userId,
        deck_id: card.deckId,
        front: card.front,
        back: card.back,
        created_at: card.created,
        schedule: jsonValue(card.schedule),
      })),
    );
  }

  if (data.reviews.length) {
    await upsertRows(client, "reviews",
      data.reviews.map((review) => ({
        id: review.id,
        user_id: userId,
        card_id: review.cardId,
        deck_id: review.deckId,
        reviewed_at: review.at,
        rating: review.rating,
        was_new: review.wasNew,
        log: jsonValue(review.log),
      })),
    );
  }

  if (data.templates.length) {
    await upsertRows(client, "templates",
      data.templates.map((template) => ({
        id: template.id,
        user_id: userId,
        name: template.name,
        front_prompt: template.frontPrompt,
        back_prompt: template.backPrompt,
        created_at: template.created,
      })),
    );
  }

  const settings = await client.from("user_settings").upsert({
    user_id: userId,
    new_per_day: data.settings.newPerDay,
    retention: data.settings.retention,
  });
  if (settings.error) throw settings.error;

  // Children are removed first so foreign keys always remain valid.
  await deleteExplicitRows(
    client,
    "reviews",
    userId,
    data.deleted?.reviews ?? [],
  );
  await deleteExplicitRows(
    client,
    "cards",
    userId,
    data.deleted?.cards ?? [],
  );
  await deleteExplicitRows(
    client,
    "templates",
    userId,
    data.deleted?.templates ?? [],
  );
  await deleteExplicitRows(
    client,
    "decks",
    userId,
    data.deleted?.decks ?? [],
  );
  return data;
}
