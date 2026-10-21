/** Require complete sentence pairs so untranslated examples never reach a card. */
export function formatExamples(value: unknown): string | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const pairs: string[] = [];
  for (const item of value) {
    if (
      !item ||
      typeof item.french !== "string" ||
      typeof item.romanian !== "string" ||
      !item.french.trim() ||
      !item.romanian.trim()
    ) return null;
    pairs.push(`• ${item.french.trim()}\n  ${item.romanian.trim()}`);
  }
  return pairs.join("\n\n");
}
