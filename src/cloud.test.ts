import { describe, expect, it } from "vitest";
import { createEmptyCard } from "ts-fsrs";
import { emptyData, type Data } from "./data";
import { dataIsEmpty, mergeData } from "./cloud";

const library = (id: string, name: string): Data => ({
  ...emptyData(),
  decks: [{ id, name, description: "", created: "2026-01-01T00:00:00Z" }],
  cards: [
    {
      id: `card-${id}`,
      deckId: id,
      front: name,
      back: `${name}-back`,
      created: "2026-01-01T00:00:00Z",
      schedule: createEmptyCard(),
    },
  ],
});

describe("cloud first sync", () => {
  it("detects a library without decks and cards as empty", () => {
    expect(dataIsEmpty(emptyData())).toBe(true);
    expect(dataIsEmpty(library("local", "Local"))).toBe(false);
    const templateOnly = emptyData();
    templateOnly.templates.push({
      id: "template",
      name: "AI",
      frontPrompt: "Front",
      backPrompt: "Back",
      created: "2026-01-01T00:00:00Z",
    });
    expect(dataIsEmpty(templateOnly)).toBe(false);
  });

  it("keeps records from both cloud and local libraries", () => {
    const merged = mergeData(
      library("cloud", "Cloud"),
      library("local", "Local"),
    );

    expect(merged.decks.map((deck) => deck.id)).toEqual(["cloud", "local"]);
    expect(merged.cards).toHaveLength(2);
  });

  it("prefers the local copy when the same record exists", () => {
    const merged = mergeData(
      library("same", "Versiunea cloud"),
      library("same", "Versiunea locală"),
    );

    expect(merged.decks).toHaveLength(1);
    expect(merged.decks[0].name).toBe("Versiunea locală");
  });
});
