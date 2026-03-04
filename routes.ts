/**
 * Route handlers for all API endpoints.
 * Extracted from server.ts for V2 — keeps server.ts thin.
 */

import { chat, digest, type ChatMessage } from "./agent";
import { checkRateLimit } from "./ratelimit";
import { getUsage, checkBudget } from "./usage";
import { isValidFilter, isValidTimeRange, type FilterName } from "./filters";

const MAX_BODY_SIZE = 512 * 1024; // 512 KB
const MAX_MESSAGES = 50;
const MAX_MESSAGE_LENGTH = 10_000; // chars per message

type Handler = (req: Request, ip: string) => Promise<Response>;

const routes: Record<string, Record<string, Handler>> = {
  "/api/chat": {
    POST: handleChat,
  },
  "/api/digest": {
    POST: handleDigest,
  },
  "/api/usage": {
    GET: handleUsage,
  },
};

export function matchRoute(pathname: string, method: string): Handler | null {
  return routes[pathname]?.[method] || null;
}

async function handleChat(req: Request, ip: string): Promise<Response> {
  // Rate limit
  const limit = checkRateLimit(ip);
  if (!limit.allowed) {
    return Response.json(
      { error: limit.reason },
      { status: 429, headers: limit.retryAfter ? { "Retry-After": String(limit.retryAfter) } : {} }
    );
  }

  // Budget check
  const budget = checkBudget();
  if (!budget.ok) {
    return Response.json({ error: "Daily usage limit reached. Try again tomorrow." }, { status: 429 });
  }

  // Body size guard
  const contentLength = parseInt(req.headers.get("content-length") || "0");
  if (contentLength > MAX_BODY_SIZE) {
    return Response.json({ error: "Request too large" }, { status: 413 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const messages: ChatMessage[] = body.messages || [];

  if (!Array.isArray(body.messages) || messages.length === 0) {
    return Response.json({ error: "No messages provided" }, { status: 400 });
  }

  if (messages.length > MAX_MESSAGES) {
    return Response.json({ error: `Too many messages (max ${MAX_MESSAGES})` }, { status: 400 });
  }

  // Validate message shape
  for (const msg of messages) {
    if (!msg.role || !msg.content || typeof msg.content !== "string") {
      return Response.json({ error: "Invalid message format" }, { status: 400 });
    }
    if (msg.role !== "user" && msg.role !== "assistant") {
      return Response.json({ error: "Invalid message role" }, { status: 400 });
    }
    if (msg.content.length > MAX_MESSAGE_LENGTH) {
      return Response.json({ error: `Message too long (max ${MAX_MESSAGE_LENGTH} chars)` }, { status: 400 });
    }
  }

  // Validate optional filters
  const filters: FilterName[] = [];
  if (Array.isArray(body.filters)) {
    for (const f of body.filters) {
      if (typeof f === "string" && isValidFilter(f)) {
        filters.push(f);
      }
    }
  }

  // Validate optional time range
  let timeRange: string | undefined;
  if (typeof body.timeRange === "string" && isValidTimeRange(body.timeRange)) {
    timeRange = body.timeRange;
  }

  // Deep dive mode
  const deepDive = body.deepDive === true;

  // Execute with timeout — deep dive gets 45s, normal chat 30s
  try {
    const controller = new AbortController();
    const timeoutMs = deepDive ? 45_000 : 30_000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await chat(messages, {
      filters,
      timeRange,
      deepDive,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return Response.json({ response });
  } catch (err: any) {
    if (err.name === "AbortError" || err.message === "Request timeout") {
      return Response.json({ error: "Request timed out — try a simpler query" }, { status: 504 });
    }
    console.error("Chat error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}

async function handleDigest(req: Request, ip: string): Promise<Response> {
  // Rate limit (digest counts as 1 request)
  const limit = checkRateLimit(ip);
  if (!limit.allowed) {
    return Response.json(
      { error: limit.reason },
      { status: 429, headers: limit.retryAfter ? { "Retry-After": String(limit.retryAfter) } : {} }
    );
  }

  const budget = checkBudget();
  if (!budget.ok) {
    return Response.json({ error: "Daily usage limit reached. Try again tomorrow." }, { status: 429 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // No body is fine — use defaults
  }

  const timeRange = (typeof body.timeRange === "string" && isValidTimeRange(body.timeRange))
    ? body.timeRange
    : "24h";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000); // Digest gets 60s

    const response = await digest(timeRange, controller.signal);

    clearTimeout(timeout);
    return Response.json({ response });
  } catch (err: any) {
    if (err.name === "AbortError" || err.message === "Request timeout") {
      return Response.json({ error: "Digest timed out — X API may be slow" }, { status: 504 });
    }
    console.error("Digest error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}

async function handleUsage(_req: Request, _ip: string): Promise<Response> {
  return Response.json(getUsage());
}
