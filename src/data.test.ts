import { describe, it, expect } from "vitest";
import {
  emptyData,
  newCard,
  grade,
  queue,
  MASTER_DECK_ID,
  cardsInDeck,
  parseData,
  outcomes,
  normalizeCardText,
  Rating,
  State,
  BACKUP_INTERVAL_MS,
  backupReminderVisible,
  masteryLevel,
  shuffledDeckCards,
  shuffledReviewedDeckCards,
  quizPrompt,
  quizAnswerCorrect,
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
  it("excludes paused decks from both daily queues and MASTER without changing cards or history", () => {
    let d = fixture();
    d = grade(d,d.cards[0].id,Rating.Again,now);
    d.decks[0].enabled = false;
    d.decks.push({id:"active",name:"Luna 02",description:"",created:now.toISOString()});
    const active = newCard("active","un arbre","un copac");
    d.cards.push(active);
    const stored = JSON.stringify(d);
    const later = new Date(+d.cards[0].schedule.due+1);
    expect(queue(d,"d",later)).toEqual([]);
    expect(queue(d,MASTER_DECK_ID,later).map(c=>c.id)).toEqual([active.id]);
    expect(cardsInDeck(d,MASTER_DECK_ID)).toHaveLength(3);
    expect(JSON.stringify(d)).toBe(stored);
    d.decks[0].enabled = true;
    expect(queue(d,"d",later)[0].id).toBe(d.cards[0].id);
    expect(d.cards[0].schedule.reps).toBe(1);
    expect(d.reviews).toHaveLength(1);
  });
  it("shows no daily work when all decks are OFF and still counts previous introductions toward the global limit", () => {
    let d = fixture();
    d.settings.newPerDay = 1;
    d = grade(d,d.cards[0].id,Rating.Easy,now);
    d.decks[0].enabled = false;
    expect(queue(d,MASTER_DECK_ID,now)).toEqual([]);
    d.decks.push({id:"active",name:"Luna 02",description:"",created:now.toISOString(),enabled:true});
    d.cards.push(newCard("active","la maison","casa"));
    expect(queue(d,"active",now)).toEqual([]);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate()+1);
    expect(queue(d,MASTER_DECK_ID,tomorrow).map(c=>c.deckId)).toEqual(["active"]);
  });
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
  it("limits new cards globally while keeping all due reviews in MASTER", () => {
    let d = fixture();
    d.decks.push({ id: "second", name: "Luna 02", description: "", created: now.toISOString() });
    d.cards.push(newCard("second", "le chat", "pisică"));
    d.settings.newPerDay = 1;
    d = grade(d, d.cards[0].id, Rating.Again, now);
    expect(queue(d, "second", now)).toHaveLength(0);
    const later = new Date(+d.cards[0].schedule.due + 1);
    const master = queue(d, MASTER_DECK_ID, later);
    expect(master.map((card) => card.id)).toEqual([d.cards[0].id]);
    expect(cardsInDeck(d, MASTER_DECK_ID)).toHaveLength(3);
    expect(d.cards).toHaveLength(3);
  });
  it("introduces MASTER cards in deck order and never creates copies", () => {
    const d = fixture();
    d.decks.push({ id: "second", name: "Luna 02", description: "", created: now.toISOString() });
    const second = newCard("second", "le chat", "pisică");
    d.cards.push(second);
    d.settings.newPerDay = 2;
    expect(queue(d, MASTER_DECK_ID, now, () => 0).map((card) => card.id)).toEqual([
      d.cards[1].id,
      d.cards[0].id,
    ]);
    expect(cardsInDeck(d, MASTER_DECK_ID)[2]).toBe(second);
  });
  it("never offers more than 15 new cards even when an older backup requests more", () => {
    const d = fixture();
    d.cards = Array.from({ length: 30 }, (_, index) => newCard("d", `mot ${index}`, `cuvânt ${index}`));
    d.settings.newPerDay = 100;
    expect(queue(d, MASTER_DECK_ID, now)).toHaveLength(15);
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

  it("selects new cards randomly before applying the daily limit", () => {
    const d = fixture();
    d.settings.newPerDay = 1;
    const originalOrder = d.cards.map((card) => card.id);
    d.cards.push(newCard("other", "other", "other"));
    expect(queue(d, "d", now, () => 0).map((card) => card.id)).toEqual([
      originalOrder[1],
    ]);
    expect(queue(d, "d", now, () => 0.99).map((card) => card.id)).toEqual([
      originalOrder[0],
    ]);
    expect(d.cards.slice(0, 2).map((card) => card.id)).toEqual(originalOrder);
    d.settings.newPerDay = 10;
    const selected = queue(d, "d", now, () => 0);
    expect(selected).toHaveLength(2);
    expect(new Set(selected.map((card) => card.id))).toEqual(new Set(originalOrder));
  });

  it("builds a shuffled free-practice queue without changing the deck", () => {
    const d = fixture();
    const originalOrder = d.cards.map((card) => card.id);
    const practice = shuffledDeckCards(d, "d", () => 0);
    expect(practice.map((card) => card.id)).toEqual([
      originalOrder[1],
      originalOrder[0],
    ]);
    expect(d.cards.map((card) => card.id)).toEqual(originalOrder);
    expect(new Set(practice.map((card) => card.id))).toEqual(
      new Set(originalOrder),
    );
  });

  it("allows practice and RO-FR tests only after a spaced-repetition review, even before due", () => {
    let d = fixture();
    expect(shuffledReviewedDeckCards(d, "d")).toEqual([]);
    const first = d.cards[0].id;
    const second = d.cards[1].id;
    d = grade(d, first, Rating.Again, now);
    expect(d.cards[0].schedule.due > now).toBe(true);
    expect(shuffledReviewedDeckCards(d, "d").map((card) => card.id)).toEqual([first]);
    d = grade(d, second, Rating.Easy, now);
    const other = newCard("other", "autre", "altul");
    d.cards.push(other);
    d = grade(d, other.id, Rating.Good, now);
    d.cards.push(newCard("d", "nouveau", "nou"));
    const original = JSON.stringify(d);
    expect(shuffledReviewedDeckCards(d, "d", () => 0).map((card) => card.id)).toEqual([
      second, first,
    ]);
    expect(JSON.stringify(d)).toBe(original);
  });

  it("derives a 0-9 memory level from the FSRS stability", () => {
    const card = newCard("d", "dire", "a spune").schedule;
    expect(masteryLevel(card)).toBe(0);
    expect(
      masteryLevel({ ...card, state: State.Learning, reps: 1, stability: 0.5 }),
    ).toBe(1);
    expect(
      masteryLevel({ ...card, state: State.Review, reps: 5, stability: 30 }),
    ).toBe(6);
    expect(
      masteryLevel({ ...card, state: State.Review, reps: 12, stability: 240 }),
    ).toBe(9);
  });

  it("extracts the Romanian prompt from structured and older card backs", () => {
    expect(
      quizPrompt("Traducere: a spune, a zice\n\nConjugare la prezent:\nje dis"),
    ).toBe("a spune, a zice");
    expect(quizPrompt("scaun\n\nExemple:\nUne chaise rouge.")).toBe("scaun");
  });

  it("checks French answers while requiring the article and accents", () => {
    expect(quizAnswerCorrect("L’école", "l'école (f.)")).toBe(true);
    expect(quizAnswerCorrect("  le chat. ", "le chat (m.)")).toBe(true);
    expect(quizAnswerCorrect("chat", "le chat (m.)")).toBe(false);
    expect(quizAnswerCorrect("l'ecole", "l'école (f.)")).toBe(false);
  });
});
describe("Card text formatting", () => {
  it("turns HTML and escaped break tags into real line breaks", () => {
    expect(
      normalizeCardText(
        String.raw`a spune, a zice<br><br>Présent :\<br>je dis&lt;br&gt;Exemples :`,
      ),
    ).toBe("a spune, a zice\n\nPrésent :\nje dis\nExemples :");
  });

  it("collapses excessive blank lines and trims trailing spaces", () => {
    expect(normalizeCardText("mot  \r\n\r\n\r\nexemple  ")).toBe(
      "mot\n\nexemple",
    );
  });
});

describe("Backup integrity", () => {
  it("round-trips the deck pause flag and treats older backups as enabled", () => {
    const old = fixture();
    expect(queue(parseData(JSON.parse(JSON.stringify(old))),MASTER_DECK_ID,now)).toHaveLength(2);
    old.decks[0].enabled = false;
    const restored = parseData(JSON.parse(JSON.stringify(old)));
    expect(restored.decks[0].enabled).toBe(false);
    expect(queue(restored,MASTER_DECK_ID,now)).toEqual([]);
    const invalid = JSON.parse(JSON.stringify(old));
    invalid.decks[0].enabled = "false";
    expect(()=>parseData(invalid)).toThrow("Deck invalid");
  });
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
