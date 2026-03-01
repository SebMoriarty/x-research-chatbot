/**
 * Noel — X Research Chatbot for Netrunner Tax.
 * Bun HTTP server. Thin entry point — routes in routes.ts.
 */

import { readFileSync } from "fs";
import { join, resolve } from "path";
import { matchRoute } from "./routes";

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
  async fetch(req, server) {
    const url = new URL(req.url);
    const ip = server.requestIP(req)?.address || "unknown";

    // API routes
    const handler = matchRoute(url.pathname, req.method);
    if (handler) {
      return handler(req, ip);
    }

    // Serve static files
    let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
    const fullPath = resolve(join(PUBLIC_DIR, filePath));

    // Prevent path traversal
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

console.log(`Noel (X Research Chatbot) running at http://localhost:${PORT}`);
