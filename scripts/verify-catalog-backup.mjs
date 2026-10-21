import { readFileSync, writeFileSync } from "node:fs";
import { parseData } from "../src/data.ts";

const snapshotPath = process.argv[2] ?? "supabase/vlad-before-catalog-replacement.json";
const checkOnly = process.argv.includes("--check-only");
const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
const settings = snapshot.settings[0];
const restored = parseData({
  version: 1,
  decks: snapshot.decks.map((row) => ({
    id: row.id, name: row.name, description: row.description, created: row.created_at,
    ...(row.enabled !== undefined ? {enabled: row.enabled} : {}),
  })),
  cards: snapshot.cards.map((row) => ({
    id: row.id, deckId: row.deck_id, front: row.front, back: row.back,
    created: row.created_at, schedule: row.schedule,
  })),
  reviews: snapshot.reviews.map((row) => ({
    id: row.id, cardId: row.card_id, deckId: row.deck_id,
    at: row.reviewed_at, rating: row.rating, wasNew: row.was_new, log: row.log,
  })),
  templates: snapshot.templates.map((row) => ({
    id: row.id, name: row.name, frontPrompt: row.front_prompt,
    backPrompt: row.back_prompt, created: row.created_at,
  })),
  settings: { newPerDay: settings.new_per_day, retention: Number(settings.retention) },
});

if (restored.cards.length !== snapshot.cards.length || restored.reviews.length !== snapshot.reviews.length) {
  throw new Error("Backup restore validation lost records");
}
const appBackupPath = "supabase/vlad-before-catalog-replacement-app.json";
if (!checkOnly) writeFileSync(appBackupPath, JSON.stringify(restored, null, 2), "utf8");
console.log(JSON.stringify({
  restorableByApp: true,
  snapshot: snapshotPath,
  appBackup: checkOnly ? null : appBackupPath,
  decks: restored.decks.length,
  cards: restored.cards.length,
  reviews: restored.reviews.length,
  templates: restored.templates.length,
  settings: restored.settings,
}));
