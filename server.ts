/**
 * X Research Chatbot — Bun HTTP server.
 * Serves the chat UI and /api/chat endpoint.
 */

import { readFileSync } from "fs";
import { join, resolve } from "path";
import { chat, type ChatMessage } from "./agent";

const PORT = 3456;
const PUBLIC_DIR = join(import.meta.dir, "public");

// Load env vars from global.env
try {
  const envFile = readFileSync(
    `${process.env.HOME}/.config/env/global.env`,
    "utf-8"
  );
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Z_][A-Z0-9_]*)=["']?([^"'\n]+)["']?$/);
    if (match) {
      process.env[match[1]] = match[2];
    }
  }
} catch (e) {
  console.warn("Failed to load global.env:", (e as Error).message);
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // API endpoint
    if (url.pathname === "/api/chat" && req.method === "POST") {
      let body: any;
      try {
        body = await req.json();
      } catch {
        return Response.json({ error: "Invalid JSON" }, { status: 400 });
      }

      try {
        const messages: ChatMessage[] = body.messages || [];

        if (!Array.isArray(body.messages) || messages.length === 0) {
          return Response.json({ error: "No messages provided" }, { status: 400 });
        }

        // Validate message shape
        for (const msg of messages) {
          if (!msg.role || !msg.content || typeof msg.content !== "string") {
            return Response.json({ error: "Invalid message format" }, { status: 400 });
          }
          if (msg.role !== "user" && msg.role !== "assistant") {
            return Response.json({ error: "Invalid message role" }, { status: 400 });
          }
        }

        const response = await chat(messages);
        return Response.json({ response });
      } catch (err: any) {
        console.error("Chat error:", err);
        return Response.json(
          { error: "Internal error" },
          { status: 500 }
        );
      }
    }

    // Serve static files
    let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
    const fullPath = resolve(join(PUBLIC_DIR, filePath));

    // Prevent path traversal — resolved path must stay inside PUBLIC_DIR
    if (!fullPath.startsWith(PUBLIC_DIR)) {
      return new Response("Forbidden", { status: 403 });
    }

    try {
      const file = Bun.file(fullPath);
      if (await file.exists()) {
        return new Response(file);
      }
    } catch {}

    return new Response("Not found", { status: 404 });
  },
});

console.log(`X Research Chatbot running at http://localhost:${PORT}`);
