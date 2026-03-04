/**
 * Saved Searches — localStorage-backed named filter presets.
 */

import { get, set, subscribe } from "./state.js";
import { updateActiveTags } from "./filters.js";

const STORAGE_KEY = "noel_saved_searches";
const MAX_SAVED = 10;

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveSaved(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function saveCurrent(name) {
  const state = get();
  const items = loadSaved();
  if (items.length >= MAX_SAVED) items.shift();
  items.push({
    id: Date.now().toString(36),
    name,
    filters: [...state.filters],
    timeRange: state.timeRange,
  });
  saveSaved(items);
  renderSavedRow();
}

function deleteSaved(id) {
  const items = loadSaved().filter((item) => item.id !== id);
  saveSaved(items);
  renderSavedRow();
}

function applySaved(item) {
  set({ filters: [...item.filters], timeRange: item.timeRange });

  // Sync filter chip DOM
  document.querySelectorAll(".chip[data-filter]").forEach((btn) => {
    const pressed = item.filters.includes(btn.dataset.filter);
    btn.setAttribute("aria-pressed", String(pressed));
  });

  // Sync time range DOM
  document.querySelectorAll(".time-range button[data-time]").forEach((btn) => {
    const checked = btn.dataset.time === item.timeRange;
    btn.setAttribute("aria-checked", String(checked));
    btn.tabIndex = checked ? 0 : -1;
  });

  updateActiveTags();
}

function renderSavedRow() {
  const container = document.getElementById("saved-searches");
  if (!container) return;

  const items = loadSaved();
  container.innerHTML = "";

  for (const item of items) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "saved-chip";

    const label = document.createElement("span");
    label.textContent = item.name;
    chip.appendChild(label);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "saved-chip-delete";
    del.textContent = "\u00d7";
    del.setAttribute("aria-label", `Remove ${item.name}`);
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteSaved(item.id);
    });
    chip.appendChild(del);

    chip.addEventListener("click", () => applySaved(item));
    container.appendChild(chip);
  }

  // Save button — only show when filters are active
  const state = get();
  if (state.filters.length > 0 || state.timeRange !== "7d") {
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn-save-search";
    saveBtn.textContent = "\u2606 Save";
    saveBtn.setAttribute("aria-label", "Save current filters");
    saveBtn.addEventListener("click", () => {
      const name = window.prompt("Name this search:");
      if (name && name.trim()) {
        saveCurrent(name.trim());
      }
    });
    container.appendChild(saveBtn);
  }
}

export function initSavedSearches() {
  renderSavedRow();
  // Re-render when filters/timeRange change so Save button appears/disappears
  let prev = { filters: get().filters.length, timeRange: get().timeRange };
  subscribe((state) => {
    if (state.filters.length !== prev.filters || state.timeRange !== prev.timeRange) {
      prev = { filters: state.filters.length, timeRange: state.timeRange };
      renderSavedRow();
    }
  });
}
