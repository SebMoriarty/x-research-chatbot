/**
 * Morning Brief / Digest mode.
 */

import { get, set } from "./state.js";
import { addMessage } from "./chat.js";
import { refreshUsage } from "./usage.js";

export function initDigest() {
  // Wire up all digest buttons (welcome screen + filter bar)
  document.querySelectorAll("[data-action='digest']").forEach((btn) => {
    btn.addEventListener("click", runDigest);
  });
}

async function runDigest() {
  const state = get();
  if (state.digestLoading) return;

  set({ digestLoading: true });

  // Disable digest buttons
  document.querySelectorAll("[data-action='digest']").forEach((btn) => {
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.setAttribute("aria-label", "Running morning brief...");
  });

  // Hide welcome screen
  const welcome = document.getElementById("welcome");
  if (welcome) welcome.style.display = "none";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 65_000);

    const res = await fetch("/api/digest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeRange: state.timeRange }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const data = await res.json();

    if (data.error) {
      addMessage("error", `Digest error: ${data.error}`);
    } else {
      addMessage("digest", data.response);
    }
  } catch (err) {
    if (err.name === "AbortError") {
      addMessage("error", "Morning brief timed out — X API may be slow. Try again.");
    } else {
      addMessage("error", `Connection error: ${err.message}`);
    }
  } finally {
    set({ digestLoading: false });
    refreshUsage();

    // Re-enable digest buttons
    document.querySelectorAll("[data-action='digest']").forEach((btn) => {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      btn.setAttribute("aria-label", "Run morning brief digest");
    });
  }
}
