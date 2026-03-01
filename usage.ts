/**
 * Daily token + API usage tracking.
 * Stores usage in data/usage.json, auto-resets on new calendar day.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const DATA_DIR = join(import.meta.dir, "data");
const USAGE_FILE = join(DATA_DIR, "usage.json");

// Configurable caps — override via env
const MAX_DAILY_TOKENS = parseInt(process.env.MAX_DAILY_TOKENS || "50000");
const MAX_DAILY_X_CALLS = parseInt(process.env.MAX_DAILY_X_CALLS || "200");

interface UsageData {
  date: string;
  anthropicTokens: number;
  xApiCalls: number;
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function read(): UsageData {
  ensureDir();
  try {
    const data: UsageData = JSON.parse(readFileSync(USAGE_FILE, "utf-8"));
    // Reset if stale date
    if (data.date !== today()) {
      return { date: today(), anthropicTokens: 0, xApiCalls: 0 };
    }
    return data;
  } catch {
    return { date: today(), anthropicTokens: 0, xApiCalls: 0 };
  }
}

function write(data: UsageData) {
  ensureDir();
  writeFileSync(USAGE_FILE, JSON.stringify(data, null, 2));
}

export function trackTokens(input: number, output: number) {
  const data = read();
  data.anthropicTokens += input + output;
  write(data);
}

export function trackXCall() {
  const data = read();
  data.xApiCalls += 1;
  write(data);
}

export function getUsage() {
  const data = read();
  return {
    date: data.date,
    anthropic: { tokens: data.anthropicTokens, limit: MAX_DAILY_TOKENS },
    xApi: { calls: data.xApiCalls, limit: MAX_DAILY_X_CALLS },
  };
}

export function checkBudget(): { ok: boolean; remaining: { tokens: number; xCalls: number } } {
  const data = read();
  return {
    ok: data.anthropicTokens < MAX_DAILY_TOKENS && data.xApiCalls < MAX_DAILY_X_CALLS,
    remaining: {
      tokens: Math.max(0, MAX_DAILY_TOKENS - data.anthropicTokens),
      xCalls: Math.max(0, MAX_DAILY_X_CALLS - data.xApiCalls),
    },
  };
}
