import type { SupabaseClient } from "@supabase/supabase-js";
import { emptyData, parseData, type Data } from "./data";

type CloudDeck = {
  id: string;
  name: string;
  description: string;
  created_at: string;
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

type CloudSettings = {
  new_per_day: number;
  retention: number | string;
};

const jsonValue = (value: unknown) => JSON.parse(JSON.stringify(value));

export function dataIsEmpty(data: Data) {
  return data.decks.length === 0 && data.cards.length === 0;
}

/** Combines two first-sync libraries without discarding cards from either one. */
export function mergeData(cloud: Data, local: Data): Data {
  const mergeById = <T extends { id: string }>(older: T[], newer: T[]) => {
    const rows = new Map(older.map((row) => [row.id, row]));
    newer.forEach((row) => rows.set(row.id, row));
    return [...rows.values()];
  };

  return {
    version: 1,
    decks: mergeById(cloud.decks, local.decks),
    cards: mergeById(cloud.cards, local.cards),
    reviews: mergeById(cloud.reviews, local.reviews),
    settings: local.settings,
  };
}

export async function loadCloudData(
  client: SupabaseClient,
  userId: string,
): Promise<Data | null> {
  const [decksResult, cardsResult, reviewsResult, settingsResult] =
    await Promise.all([
      client
        .from("decks")
        .select("id,name,description,created_at")
        .eq("user_id", userId)
        .order("created_at"),
      client
        .from("cards")
        .select("id,deck_id,front,back,created_at,schedule")
        .eq("user_id", userId)
        .order("created_at"),
      client
        .from("reviews")
        .select("id,card_id,deck_id,reviewed_at,rating,was_new,log")
        .eq("user_id", userId)
        .order("reviewed_at"),
      client
        .from("user_settings")
        .select("new_per_day,retention")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

  const error =
    decksResult.error ??
    cardsResult.error ??
    reviewsResult.error ??
    settingsResult.error;
  if (error) throw error;

  const decks = (decksResult.data ?? []) as CloudDeck[];
  const cards = (cardsResult.data ?? []) as CloudCard[];
  const reviews = (reviewsResult.data ?? []) as CloudReview[];
  const settings = settingsResult.data as CloudSettings | null;

  if (!decks.length && !cards.length && !reviews.length && !settings)
    return null;

  const defaults = emptyData();
  return parseData({
    version: 1,
    decks: decks.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      created: row.created_at,
    })),
    cards: cards.map((row) => ({
      id: row.id,
      deckId: row.deck_id,
      front: row.front,
      back: row.back,
      created: row.created_at,
      schedule: row.schedule,
    })),
    reviews: reviews.map((row) => ({
      id: row.id,
      cardId: row.card_id,
      deckId: row.deck_id,
      at: row.reviewed_at,
      rating: row.rating,
      wasNew: row.was_new,
      log: row.log,
    })),
    settings: settings
      ? {
          newPerDay: settings.new_per_day,
          retention: Number(settings.retention),
        }
      : defaults.settings,
  });
}

async function deleteRowsMissingLocally(
  client: SupabaseClient,
  table: "reviews" | "cards" | "decks",
  userId: string,
  localIds: string[],
) {
  const existing = await client.from(table).select("id").eq("user_id", userId);
  if (existing.error) throw existing.error;

  const local = new Set(localIds);
  const stale = (existing.data ?? [])
    .map((row: { id: string }) => row.id)
    .filter((id: string) => !local.has(id));
  if (!stale.length) return;

  const removed = await client
    .from(table)
    .delete()
    .eq("user_id", userId)
    .in("id", stale);
  if (removed.error) throw removed.error;
}

/** Mirrors one local library to the authenticated user's Supabase rows. */
export async function saveCloudData(
  client: SupabaseClient,
  userId: string,
  data: Data,
) {
  if (data.decks.length) {
    const result = await client.from("decks").upsert(
      data.decks.map((deck) => ({
        id: deck.id,
        user_id: userId,
        name: deck.name,
        description: deck.description,
        created_at: deck.created,
      })),
    );
    if (result.error) throw result.error;
  }

  if (data.cards.length) {
    const result = await client.from("cards").upsert(
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
    if (result.error) throw result.error;
  }

  if (data.reviews.length) {
    const result = await client.from("reviews").upsert(
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
    if (result.error) throw result.error;
  }

  const settings = await client.from("user_settings").upsert({
    user_id: userId,
    new_per_day: data.settings.newPerDay,
    retention: data.settings.retention,
  });
  if (settings.error) throw settings.error;

  // Children are removed first so foreign keys always remain valid.
  await deleteRowsMissingLocally(
    client,
    "reviews",
    userId,
    data.reviews.map((review) => review.id),
  );
  await deleteRowsMissingLocally(
    client,
    "cards",
    userId,
    data.cards.map((card) => card.id),
  );
  await deleteRowsMissingLocally(
    client,
    "decks",
    userId,
    data.decks.map((deck) => deck.id),
  );
}
