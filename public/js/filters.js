/**
 * Filter chip selection and time range management.
 */

import { get, set } from "./state.js";

const FILTERS = [
  { id: "mentions", label: "Mentions" },
  { id: "competitors", label: "Competitors" },
  { id: "tax_news", label: "Tax News" },
  { id: "influencers", label: "Influencers" },
  { id: "sentiment", label: "Sentiment" },
  { id: "opportunities", label: "Opportunities" },
];

const TIME_RANGES = ["1h", "6h", "24h", "3d", "7d"];

export function initFilters() {
  const filterBar = document.getElementById("filter-bar");
  if (!filterBar) return;

  // Render chips
  const chipContainer = document.createElement("div");
  chipContainer.setAttribute("role", "group");
  chipContainer.setAttribute("aria-label", "Search filters");
  chipContainer.style.display = "flex";
  chipContainer.style.gap = "8px";

  for (const filter of FILTERS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.textContent = filter.label;
    btn.setAttribute("aria-pressed", "false");
    btn.dataset.filter = filter.id;

    btn.addEventListener("click", () => {
      const state = get();
      const filters = [...state.filters];
      const idx = filters.indexOf(filter.id);

      if (idx >= 0) {
        filters.splice(idx, 1);
        btn.setAttribute("aria-pressed", "false");
      } else {
        filters.push(filter.id);
        btn.setAttribute("aria-pressed", "true");
      }

      set({ filters });
      updateActiveTags();
    });

    chipContainer.appendChild(btn);
  }

  filterBar.insertBefore(chipContainer, filterBar.firstChild);

  // Render time range
  const timeRange = document.createElement("div");
  timeRange.className = "time-range";
  timeRange.setAttribute("role", "radiogroup");
  timeRange.setAttribute("aria-label", "Time range");

  for (const t of TIME_RANGES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = t;
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", t === get().timeRange ? "true" : "false");
    btn.dataset.time = t;

    if (t === get().timeRange) {
      btn.setAttribute("aria-pressed", "true");
    }

    btn.addEventListener("click", () => {
      // Deselect all
      timeRange.querySelectorAll("button").forEach((b) => {
        b.setAttribute("aria-pressed", "false");
        b.setAttribute("aria-checked", "false");
      });
      btn.setAttribute("aria-pressed", "true");
      btn.setAttribute("aria-checked", "true");
      set({ timeRange: t });
      updateActiveTags();
    });

    timeRange.appendChild(btn);
  }

  filterBar.appendChild(timeRange);

  // Arrow key navigation for chips
  chipContainer.addEventListener("keydown", (e) => {
    const chips = [...chipContainer.querySelectorAll(".chip")];
    const idx = chips.indexOf(document.activeElement);
    if (idx < 0) return;

    if (e.key === "ArrowRight" && idx < chips.length - 1) {
      e.preventDefault();
      chips[idx + 1].focus();
    } else if (e.key === "ArrowLeft" && idx > 0) {
      e.preventDefault();
      chips[idx - 1].focus();
    }
  });

  // Arrow key navigation for time range
  timeRange.addEventListener("keydown", (e) => {
    const buttons = [...timeRange.querySelectorAll("button")];
    const idx = buttons.indexOf(document.activeElement);
    if (idx < 0) return;

    if (e.key === "ArrowRight" && idx < buttons.length - 1) {
      e.preventDefault();
      buttons[idx + 1].focus();
      buttons[idx + 1].click();
    } else if (e.key === "ArrowLeft" && idx > 0) {
      e.preventDefault();
      buttons[idx - 1].focus();
      buttons[idx - 1].click();
    }
  });
}

function updateActiveTags() {
  const container = document.getElementById("active-filters");
  if (!container) return;

  const state = get();
  container.innerHTML = "";

  for (const f of state.filters) {
    const label = FILTERS.find((x) => x.id === f)?.label || f;
    const tag = document.createElement("span");
    tag.className = "filter-tag";
    tag.innerHTML = `${label}<span class="remove" role="button" aria-label="Remove ${label} filter">&times;</span>`;

    tag.querySelector(".remove").addEventListener("click", () => {
      const filters = get().filters.filter((x) => x !== f);
      set({ filters });

      // Update chip button
      const chip = document.querySelector(`.chip[data-filter="${f}"]`);
      if (chip) chip.setAttribute("aria-pressed", "false");

      updateActiveTags();
    });

    container.appendChild(tag);
  }

  if (state.timeRange) {
    const tag = document.createElement("span");
    tag.className = "filter-tag";
    tag.textContent = state.timeRange;
    container.appendChild(tag);
  }
}
