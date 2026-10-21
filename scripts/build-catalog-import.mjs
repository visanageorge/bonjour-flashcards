/** Build a complete, app-compatible import file. Does not connect to Supabase. */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { buildCatalogImport } from "./catalog-import.mjs";

// The validator exits nonzero until every entry has been reviewed. Do not
// downgrade this failure to a warning or make a partial import.
execFileSync("python", ["scripts/validate-catalog-content.py"], {
  stdio: "inherit",
});

const staged = JSON.parse(readFileSync("tmp/catalog-content-review.json", "utf8"));
const backup = JSON.parse(readFileSync("supabase/vlad-before-catalog-replacement-app.json", "utf8"));
const data = buildCatalogImport(staged, backup);
writeFileSync("tmp/catalog-import-payload.json", JSON.stringify(data, null, 2), "utf8");
console.log(JSON.stringify({
  payload: "tmp/catalog-import-payload.json",
  cards: data.cards.length,
  monthlyCounts: data.decks.map((deck) => data.cards.filter((card) => card.deckId === deck.id).length),
  reviews: data.reviews.length,
  globalNewPerDay: data.settings.newPerDay,
}));
