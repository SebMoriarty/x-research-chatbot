/**
 * Export conversation to clipboard as markdown.
 */

import { get } from "./state.js";

export function initExport() {
  const btn = document.getElementById("export-btn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const state = get();
    if (state.messages.length === 0) return;

    const markdown = state.messages
      .map((m) => {
        const prefix = m.role === "user" ? "**You:**" : "**Noel:**";
        return `${prefix}\n${m.content}`;
      })
      .join("\n\n---\n\n");

    const header = `# Noel — X Research Chat Export\n**Date:** ${new Date().toISOString().split("T")[0]}\n\n---\n\n`;

    try {
      await navigator.clipboard.writeText(header + markdown);

      // Flash icon to checkmark
      const icon = btn.querySelector("svg");
      const original = icon.innerHTML;
      icon.innerHTML =
        '<polyline points="20 6 9 17 4 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
      btn.setAttribute("aria-label", "Copied!");

      setTimeout(() => {
        icon.innerHTML = original;
        btn.setAttribute("aria-label", "Copy conversation to clipboard");
      }, 1500);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement("textarea");
      ta.value = header + markdown;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  });
}
