import { describe, it, expect } from "vitest";
import {
  emptyData,
  newCard,
  grade,
  queue,
  parseData,
  outcomes,
  Rating,
  State,
  BACKUP_INTERVAL_MS,
  backupReminderVisible,
} from "./data";
const now = new Date("2026-09-12T12:00:00Z");
function fixture() {
  const d = emptyData();
  d.decks = [
    { id: "d", name: "Franceză", description: "", created: now.toISOString() },
  ];
  d.cards = [
    newCard("d", "a merge", "aller"),
    newCard("d", "bună ziua", "bonjour"),
  ];
  return d;
}
describe("Study scheduling", () => {
  it("limits only new cards and keeps due reviews available", () => {
    let d = fixture();
    d.settings.newPerDay = 1;
    const c = d.cards[0];
    d = grade(d, c.id, Rating.Again, now);
    expect(queue(d, "d", now)).toHaveLength(0);
    const later = new Date(+d.cards[0].schedule.due + 1);
    expect(queue(d, "d", later).map((x) => x.id)).toEqual([c.id]);
  });
  it("renews the daily new-card allowance on the next local day", () => {
    let d = fixture();
    d.settings.newPerDay = 1;
    d = grade(d, d.cards[0].id, Rating.Easy, now);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(queue(d, "d", tomorrow).some((c) => c.id === d.cards[1].id)).toBe(
      true,
    );
  });
  it("stores the actual FSRS result and review history without mutating input", () => {
    const d = fixture(),
      c = d.cards[0],
      result = outcomes(c, 0.9, now)[Rating.Good];
    const updated = grade(d, c.id, Rating.Good, now);
    expect(updated.cards[0].schedule).toEqual(result.card);
    expect(updated.reviews[0].wasNew).toBe(true);
    expect(d.cards[0].schedule.state).toBe(State.New);
    expect(d.reviews).toHaveLength(0);
  });
  it("does not count relearning as another new introduction", () => {
    let d = fixture();
    d = grade(d, d.cards[0].id, Rating.Again, now);
    d = grade(d, d.cards[0].id, Rating.Good, new Date(+now + 600000));
    expect(d.reviews.filter((r) => r.wasNew)).toHaveLength(1);
  });
  it("orders due reviews before new cards and excludes future cards", () => {
    let d = fixture();
    d = grade(d, d.cards[1].id, Rating.Again, now);
    const later = new Date(+d.cards[1].schedule.due + 1);
    expect(queue(d, "d", later)[0].id).toBe(d.cards[1].id);
    expect(queue(d, "d", now).map((c) => c.id)).toEqual([d.cards[0].id]);
  });
});
describe("Backup integrity", () => {
  it("shows the reminder after seven days until it is dismissed", () => {
    const start = now.toISOString();
    const after = new Date(+now + BACKUP_INTERVAL_MS);
    expect(backupReminderVisible(start, null, after, true)).toBe(true);
    expect(backupReminderVisible(start, start, after, true)).toBe(false);
    expect(backupReminderVisible(start, null, now, true)).toBe(false);
    expect(backupReminderVisible(start, null, after, false)).toBe(false);
  });
  it("rehydrates dates and can schedule after a JSON round trip", () => {
    const d = fixture();
    const restored = parseData(JSON.parse(JSON.stringify(d)));
    expect(restored.cards[0].schedule.due).toBeInstanceOf(Date);
    expect(() => outcomes(restored.cards[0], 0.9, now)).not.toThrow();
  });
  it("accepts older backups that do not contain templates", () => {
    const raw = JSON.parse(JSON.stringify(fixture()));
    delete raw.templates;
    expect(parseData(raw).templates).toEqual([]);
  });
  it("round-trips a reviewed card and its history", () => {
    let d = fixture();
    d = grade(d, d.cards[0].id, Rating.Easy, now);
    const restored = parseData(JSON.parse(JSON.stringify(d)));
    expect(restored.cards[0].schedule.last_review).toEqual(now);
    expect(restored.reviews).toHaveLength(1);
  });
  it("rejects orphan cards, corrupt scheduling, and unsupported backups", () => {
    const d = fixture();
    expect(() => parseData({ ...d, version: 2 })).toThrow();
    expect(() => parseData({ ...d, decks: [] })).toThrow();
    const raw = JSON.parse(JSON.stringify(d));
    raw.cards[0].schedule.due = "invalid";
    expect(() => parseData(raw)).toThrow();
  });
  it("rejects invalid settings and duplicate IDs", () => {
    const d = fixture();
    expect(() =>
      parseData({ ...d, settings: { newPerDay: -1, retention: 0.9 } }),
    ).toThrow();
    expect(() =>
      parseData({ ...d, cards: [d.cards[0], d.cards[0]] }),
    ).toThrow();
  });
});
