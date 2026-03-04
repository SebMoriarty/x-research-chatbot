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

export function addMessage(role, content) {
  if (welcome) welcome.style.display = "none";

  const div = document.createElement("div");
  div.className = `message ${role}`;

  if (role === "assistant" || role === "digest") {
    div.innerHTML = renderMarkdown(content);
  } else if (role === "error") {
    div.textContent = content;
  } else {
    div.textContent = content;
  }

  chatContainer.insertBefore(div, typing);
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
