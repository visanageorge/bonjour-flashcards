import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { emptyData, readData, writeData, newCard, grade, Rating } from "./data";
it("persists cards and FSRS history across independent database connections", async () => {
  const d = emptyData();
  d.decks = [
    {
      id: "storage-test",
      name: "Test",
      description: "",
      created: new Date().toISOString(),
    },
  ];
  d.cards = [newCard("storage-test", "mulțumesc", "merci")];
  const reviewed = grade(d, d.cards[0].id, Rating.Easy);
  await writeData(reviewed);
  const restored = await readData();
  expect(JSON.stringify(restored)).toEqual(JSON.stringify(reviewed));
  expect(restored.cards[0].schedule.due).toBeInstanceOf(Date);
  expect(restored.cards[0].schedule.last_review).toBeInstanceOf(Date);
});
it("replaces the collection with an imported empty backup", async () => {
  await writeData(emptyData());
  expect(await readData()).toEqual(emptyData());
});
