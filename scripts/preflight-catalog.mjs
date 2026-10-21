import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const projectRef = "xomqdazgvitwwctwnjuv";
const targetEmail = "vladutvisana@gmail.com";
const previous = JSON.parse(readFileSync("supabase/vlad-before-catalog-replacement.json", "utf8"));
const userId = previous.user.id;
const keys = JSON.parse(execFileSync(process.execPath, [
  "node_modules/supabase/dist/supabase.js", "projects", "api-keys",
  "--project-ref", projectRef, "--reveal", "--output", "json",
], { encoding: "utf8" }));
const key = keys.find((entry) => entry.id === "service_role")?.api_key;
if (!key) throw new Error("Service role key unavailable");
const base = `https://${projectRef}.supabase.co`;
const headers = { apikey: key, Authorization: `Bearer ${key}` };
async function get(path, extraHeaders = {}) {
  const res = await fetch(base + path, { headers: { ...headers, ...extraHeaders } });
  if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}
async function rows(table, order) {
  const result = [];
  for (let start = 0; ; start += 1000) {
    const page = await get(`/rest/v1/${table}?user_id=${filter}&select=*&order=${order},id.asc`, {
      Range: `${start}-${start + 999}`,
    });
    result.push(...page);
    if (page.length < 1000) break;
  }
  return result;
}
const user = await get(`/auth/v1/admin/users/${userId}`);
if (user.email?.toLowerCase() !== targetEmail) throw new Error("Target account mismatch");
const filter = encodeURIComponent(`eq.${userId}`);
const [decks, cards, reviews, templates, settings] = await Promise.all([
  rows("decks", "created_at.asc"),
  rows("cards", "created_at.asc"),
  rows("reviews", "reviewed_at.asc"),
  rows("templates", "created_at.asc"),
  get(`/rest/v1/user_settings?user_id=${filter}&select=*`),
]);
const snapshot = { exportedAt: new Date().toISOString(), user: { id: userId, email: targetEmail }, decks, cards, reviews, templates, settings };
const path = `supabase/vlad-before-catalog-replacement-${snapshot.exportedAt.replace(/[:.]/g, "-")}.json`;
writeFileSync(path, JSON.stringify(snapshot, null, 2), "utf8");
const cardCounts = decks.map((deck) => ({ name: deck.name, count: cards.filter((card) => card.deck_id === deck.id).length }));
console.log(JSON.stringify({ backup: path, decks: cardCounts, cards: cards.length, reviews: reviews.length, templates: templates.length, settings: settings.length }));
