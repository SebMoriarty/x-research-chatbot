/**
 * Usage bar — polls GET /api/usage and renders in header.
 */

import { set } from "./state.js";

const POLL_INTERVAL_MS = 30_000; // 30s

export function initUsage() {
  fetchUsage();
  setInterval(fetchUsage, POLL_INTERVAL_MS);
}

async function fetchUsage() {
  try {
    const res = await fetch("/api/usage");
    if (!res.ok) return;
    const data = await res.json();
    set({ usage: data });
    renderUsage(data);
  } catch {
    // Silent fail — usage bar just stays stale
  }
}

function renderUsage(data) {
  const bar = document.getElementById("usage-bar");
  if (!bar) return;

  const fill = bar.querySelector(".fill");
  const label = bar.querySelector(".label");
  const track = bar.querySelector(".track");

  if (!fill || !label) return;

  // Show the most constrained resource
  const tokenPct = data.anthropic.limit > 0 ? data.anthropic.tokens / data.anthropic.limit : 0;
  const apiPct = data.xApi.limit > 0 ? data.xApi.calls / data.xApi.limit : 0;

  const pct = Math.max(tokenPct, apiPct);
  const displayPct = Math.min(pct * 100, 100);

  fill.style.width = `${displayPct}%`;
  fill.classList.remove("warning", "critical");

  if (pct >= 0.9) {
    fill.classList.add("critical");
  } else if (pct >= 0.7) {
    fill.classList.add("warning");
  }

  // Show API calls as the label (more intuitive than tokens)
  label.textContent = `${data.xApi.calls}/${data.xApi.limit}`;

  // Accessibility
  track.setAttribute("aria-valuenow", String(Math.round(displayPct)));
  track.setAttribute(
    "aria-label",
    `API usage: ${data.xApi.calls} of ${data.xApi.limit} calls today`
  );
}

// Also refresh usage after any API call
export function refreshUsage() {
  fetchUsage();
}
