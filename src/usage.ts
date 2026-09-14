import type { SupabaseClient } from "@supabase/supabase-js";
import type { Data } from "./data";

export const AI_DAILY_LIMIT = 100;
export const SUPABASE_DATABASE_LIMIT_BYTES = 500 * 1024 * 1024;
export const SUPABASE_EDGE_FUNCTION_LIMIT = 500_000;

export type UsageSummary = {
  aiToday: number;
  aiThisMonth: number;
  dailyLimit: number;
  inputTokensThisMonth: number;
  outputTokensThisMonth: number;
  edgeInvocationsThisMonth: number;
  databaseBytes: number;
  databaseRows: number;
  shared: boolean;
};

export type UsageState = {
  status: "idle" | "loading" | "ready" | "error";
  summary: UsageSummary;
};

const numeric = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

export function localUsage(data: Data): UsageSummary {
  return {
    aiToday: 0,
    aiThisMonth: 0,
    dailyLimit: AI_DAILY_LIMIT,
    inputTokensThisMonth: 0,
    outputTokensThisMonth: 0,
    edgeInvocationsThisMonth: 0,
    databaseBytes: new TextEncoder().encode(JSON.stringify(data)).byteLength,
    databaseRows:
      data.decks.length + data.cards.length + data.reviews.length + 1,
    shared: false,
  };
}

export async function loadSharedUsage(
  client: SupabaseClient,
  fallback: Data,
): Promise<UsageSummary> {
  const result = await client.rpc("get_shared_usage");
  if (result.error) throw result.error;

  const raw = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!raw || typeof raw !== "object")
    throw new Error("Supabase nu a returnat datele de utilizare.");

  const row = raw as Record<string, unknown>;
  const local = localUsage(fallback);
  return {
    aiToday: numeric(row.ai_today),
    aiThisMonth: numeric(row.ai_this_month),
    dailyLimit: numeric(row.daily_limit) || AI_DAILY_LIMIT,
    inputTokensThisMonth: numeric(row.input_tokens_this_month),
    outputTokensThisMonth: numeric(row.output_tokens_this_month),
    edgeInvocationsThisMonth: numeric(row.edge_invocations_this_month),
    databaseBytes: numeric(row.database_bytes) || local.databaseBytes,
    databaseRows: numeric(row.database_rows) || local.databaseRows,
    shared: true,
  };
}

export const usagePercent = (used: number, limit: number) =>
  limit > 0 ? Math.min(100, Math.max(0, (used / limit) * 100)) : 0;

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export const formatCount = (value: number) =>
  new Intl.NumberFormat("ro-RO", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
