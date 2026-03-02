/**
 * Noel V2 — Bootstrap and wire all modules.
 */

import { get, set, subscribe } from "./state.js";
import { addMessage } from "./chat.js";
import { initFilters } from "./filters.js";
import { initUsage, refreshUsage } from "./usage.js";
import { initDigest } from "./digest.js";
import { initExport } from "./export.js";

// DOM refs
const input = document.getElementById("input");
const sendBtn = document.getElementById("send-btn");

// Init all modules
initFilters();
initUsage();
initDigest();
initExport();

// Auto-resize textarea
input.addEventListener("input", () => {
  input.style.height = "44px";
  input.style.height = Math.min(input.scrollHeight, 120) + "px";
});

// Enter to send, Shift+Enter for newline
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});

// Wire example buttons
window.sendExample = function (btn) {
  input.value = btn.textContent;
  send();
};

// Send chat message
async function send() {
  const text = input.value.trim();
  const state = get();
  if (!text || state.activeRequests > 0) return;

  set({ activeRequests: state.activeRequests + 1 });
  sendBtn.disabled = true;
  input.value = "";
  input.style.height = "44px";

  addMessage("user", text);

  const messages = [...state.messages, { role: "user", content: text }];
  set({ messages });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35_000);

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        filters: state.filters,
        timeRange: state.timeRange,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const data = await res.json();

    if (data.error) {
      addMessage("error", `Error: ${data.error}`);
    } else {
      addMessage("assistant", data.response);
      set({
        messages: [...get().messages, { role: "assistant", content: data.response }],
      });
    }
  } catch (err) {
    if (err.name === "AbortError") {
      addMessage("error", "Request timed out — try a simpler query.");
    } else {
      addMessage("error", `Connection error: ${err.message}`);
    }
  } finally {
    const s = get();
    set({ activeRequests: Math.max(0, s.activeRequests - 1) });
    refreshUsage();
    sendBtn.disabled = false;
    input.focus();
  }
}

// Focus input on load
input.focus();
