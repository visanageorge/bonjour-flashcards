import { describe, expect, it } from "vitest";
import { emptyData, newCard } from "./data";
import { AI_DAILY_LIMIT, formatBytes, localUsage, usagePercent } from "./usage";

describe("usage estimates", () => {
  it("uses one shared daily limit and counts local records", () => {
    const data = emptyData();
    data.decks.push({
      id: "deck",
      name: "Franceză",
      description: "",
      created: new Date().toISOString(),
    });
    data.cards.push(newCard("deck", "a merge", "aller"));

    const usage = localUsage(data);
    expect(usage.dailyLimit).toBe(AI_DAILY_LIMIT);
    expect(usage.databaseRows).toBe(3);
    expect(usage.databaseBytes).toBeGreaterThan(0);
  });

  it("caps progress and formats small database estimates", () => {
    expect(usagePercent(150, 100)).toBe(100);
    expect(usagePercent(25, 100)).toBe(25);
    expect(formatBytes(1536)).toBe("1.5 KB");
  });
});
