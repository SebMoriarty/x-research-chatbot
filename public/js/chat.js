/**
 * Chat message rendering and markdown parsing.
 */

import { get, set, subscribe } from "./state.js";

const chatContainer = document.getElementById("chat-container");
const typing = document.getElementById("typing");
const welcome = document.getElementById("welcome");
const liveRegion = document.getElementById("live-region");

// Use marked.js for markdown (loaded via CDN in index.html)
function renderMarkdown(text) {
  if (typeof marked !== "undefined") {
    marked.setOptions({
      breaks: true,
      gfm: true,
    });

    // Create a custom renderer that sanitizes output HTML
    // instead of pre-escaping input (which breaks blockquotes, entities, etc.)
    const renderer = new marked.Renderer();
    const originalLink = renderer.link.bind(renderer);
    renderer.link = function (href, title, linkText) {
      // Ensure all links open in new tab with noopener
      const html = originalLink(href, title, linkText);
      return html
        .replace("<a ", '<a target="_blank" rel="noopener noreferrer" ')
        .replace(/javascript:/gi, "");
    };

    // Strip raw HTML tags from source to prevent XSS,
    // but preserve markdown syntax characters (>, &, etc.)
    const sanitized = text.replace(/<\/?(?:script|iframe|object|embed|form|input|button|style|link|meta|base)[^>]*>/gi, "");
    return marked.parse(sanitized, { renderer });
  }

  // Fallback: basic regex markdown if marked isn't loaded
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html
    .replace(/```(\w*)\n([\s\S]*?)```/g, "<pre><code>$2</code></pre>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^---$/gm, "<hr>")
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    )
    .replace(
      /(^|[^"(=])(https?:\/\/[^\s<)]+)/g,
      '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>'
    )
    .replace(/^[-*] (.+)$/gm, "<li>$1</li>")
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>");

  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");
  html = html.replace(/\n\n/g, "</p><p>");
  html = html.replace(
    /(?<!<\/h[123]>|<\/li>|<\/ul>|<\/pre>|<hr>|<\/p>)\n(?!<)/g,
    "<br>"
  );

  return html;
}

/**
 * Extract <!--suggestions:[...]--\> from text.
 * Returns { cleaned, suggestions: string[] }.
 */
function extractSuggestions(text) {
  const match = text.match(/<!--suggestions:(\[.*?\])-->/s);
  if (!match) return { cleaned: text, suggestions: [] };
  try {
    const suggestions = JSON.parse(match[1]);
    if (!Array.isArray(suggestions)) return { cleaned: text, suggestions: [] };
    const cleaned = text.replace(match[0], "").trimEnd();
    return { cleaned, suggestions: suggestions.map(String).slice(0, 3) };
  } catch {
    return { cleaned: text, suggestions: [] };
  }
}

/**
 * Extract <!--chart:{...}--\> from text.
 * Returns { cleaned, charts: [{ id, payload }] }.
 */
function extractCharts(text) {
  const charts = [];
  const cleaned = text.replace(/<!--chart:(\{.*?\})-->/gs, (full, json) => {
    try {
      const payload = JSON.parse(json);
      if (!payload.type || !payload.labels || !payload.data) return full;
      if (!["bar", "line", "pie"].includes(payload.type)) return full;
      const id = "chart-" + Math.random().toString(36).slice(2, 9);
      charts.push({ id, payload });
      return `<div class="chart-container" id="${id}"><canvas></canvas></div>`;
    } catch {
      return full;
    }
  });
  return { cleaned, charts };
}

/**
 * Initialize a Chart.js chart with cream-on-black theme.
 */
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function initChart(canvasEl, config) {
  if (typeof Chart === "undefined") return;
  const cream40 = "rgba(243,238,217,0.4)";
  const cream08 = "rgba(243,238,217,0.08)";
  const cream20 = "rgba(243,238,217,0.2)";
  const cream60 = "rgba(243,238,217,0.6)";

  const isPie = config.type === "pie";
  const colors = [
    cream60,
    cream40,
    cream20,
    "rgba(243,238,217,0.5)",
    "rgba(243,238,217,0.3)",
    "rgba(243,238,217,0.15)",
    "rgba(243,238,217,0.65)",
    "rgba(243,238,217,0.35)",
    "rgba(243,238,217,0.25)",
    "rgba(243,238,217,0.1)",
  ];

  new Chart(canvasEl, {
    type: config.type,
    data: {
      labels: config.labels.slice(0, 10),
      datasets: [{
        data: config.data.slice(0, 10),
        backgroundColor: isPie ? colors.slice(0, config.data.length) : cream20,
        borderColor: isPie ? cream08 : cream60,
        borderWidth: isPie ? 1 : 2,
        fill: !isPie,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: prefersReducedMotion ? { duration: 0 } : undefined,
      plugins: {
        legend: { display: isPie, labels: { color: cream40, font: { size: 11 } } },
        title: config.title
          ? { display: true, text: config.title, color: cream60, font: { size: 13 } }
          : { display: false },
      },
      scales: isPie ? {} : {
        x: { ticks: { color: cream40, font: { size: 11 } }, grid: { color: cream08 } },
        y: { ticks: { color: cream40, font: { size: 11 } }, grid: { color: cream08 } },
      },
    },
  });
}

export function addMessage(role, content) {
  if (welcome) welcome.style.display = "none";

  // Remove previous suggestion chips so they don't stack up
  const oldSuggestions = chatContainer.querySelectorAll(".suggestions");
  for (const el of oldSuggestions) el.remove();

  const div = document.createElement("div");
  div.className = `message ${role}`;

  let suggestions = [];
  let charts = [];

  if (role === "assistant" || role === "digest") {
    // Extract structured data from HTML comments
    const sugResult = extractSuggestions(content);
    suggestions = sugResult.suggestions;
    let cleaned = sugResult.cleaned;

    const chartResult = extractCharts(cleaned);
    charts = chartResult.charts;
    cleaned = chartResult.cleaned;

    div.innerHTML = renderMarkdown(cleaned);
  } else if (role === "error") {
    div.textContent = content;
  } else {
    div.textContent = content;
  }

  chatContainer.insertBefore(div, typing);

  // Initialize charts after DOM insertion
  for (const chart of charts) {
    const container = document.getElementById(chart.id);
    if (container) {
      const canvas = container.querySelector("canvas");
      if (canvas) {
        // Accessible label for screen readers (canvas is opaque to AT)
        const label = chart.payload.title
          ? `${chart.payload.title} — ${chart.payload.type} chart with ${chart.payload.labels.length} items`
          : `${chart.payload.type} chart with ${chart.payload.labels.length} items`;
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", label);
        initChart(canvas, chart.payload);
      }
    }
  }

  // Render suggestion chips
  if (suggestions.length > 0) {
    const sugDiv = document.createElement("div");
    sugDiv.className = "suggestions";
    sugDiv.setAttribute("role", "group");
    sugDiv.setAttribute("aria-label", "Follow-up suggestions");
    for (const text of suggestions) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "suggestion-chip";
      btn.textContent = text;
      btn.addEventListener("click", () => {
        document.dispatchEvent(
          new CustomEvent("suggestion-click", { bubbles: true, detail: { text } })
        );
      });
      sugDiv.appendChild(btn);
    }
    chatContainer.insertBefore(sugDiv, typing);
  }

  chatContainer.scrollTop = chatContainer.scrollHeight;

  // Announce to screen readers
  if (liveRegion) {
    const announcement =
      role === "error"
        ? content
        : role === "user"
          ? `You said: ${content}`
          : "Noel responded";
    liveRegion.textContent = announcement;
  }
}

export function showTyping() {
  typing.classList.add("visible");
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

export function hideTyping() {
  typing.classList.remove("visible");
}

// Update typing visibility based on active requests
subscribe((state) => {
  if (state.activeRequests > 0 || state.digestLoading) {
    showTyping();
  } else {
    hideTyping();
  }
});
