import { describe, expect, it } from "vitest";
import { formatExamples } from "../supabase/functions/generate-card/examples";

describe("translated AI examples", () => {
  const pair = { french: " Je lis. ", romanian: " Eu citesc. " };
  it("keeps each translation directly below its French sentence", () => {
    expect(formatExamples([pair, { french: "Tu lis.", romanian: "Tu citești." }]))
      .toBe("• Je lis.\n  Eu citesc.\n\n• Tu lis.\n  Tu citești.");
  });
  it("rejects missing translations, legacy strings and incomplete responses", () => {
    for (const invalid of [null, [], [pair], [pair, pair, pair],
      ["Je lis.", "Tu lis."], [pair, null],
      [pair, { french: "Tu lis." }],
      [pair, { french: "Tu lis.", romanian: " " }],
      [pair, { french: " ", romanian: "Tu citesti." }]]) {
      expect(formatExamples(invalid)).toBeNull();
    }
  });
});
