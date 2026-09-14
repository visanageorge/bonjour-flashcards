import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCardText, type CardTemplate } from "./data";

export type GeneratedCard = {
  front: string;
  back: string;
  usage?: {
    usedToday: number;
    remainingToday: number;
    inputTokens: number;
    outputTokens: number;
  };
};

export async function generateCard(
  client: SupabaseClient,
  input: string,
  template: CardTemplate,
): Promise<GeneratedCard> {
  const result = await client.functions.invoke("generate-card", {
    body: {
      input,
      frontPrompt: template.frontPrompt,
      backPrompt: template.backPrompt,
    },
  });

  if (result.error) {
    let message = "Generarea nu a reușit.";
    const context = (result.error as { context?: Response }).context;
    if (context) {
      try {
        const payload = await context.clone().json();
        if (typeof payload?.error === "string") message = payload.error;
      } catch {
        // Folosim mesajul sigur de mai sus.
      }
    }
    throw new Error(message);
  }

  const data = result.data as Partial<GeneratedCard> | null;
  if (
    !data ||
    typeof data.front !== "string" ||
    typeof data.back !== "string" ||
    !data.front.trim() ||
    !data.back.trim()
  )
    throw new Error("Gemini a returnat un card invalid.");

  return {
    ...data,
    front: normalizeCardText(data.front),
    back: normalizeCardText(data.back),
  };
}
