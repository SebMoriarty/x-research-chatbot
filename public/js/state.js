/**
 * Central state store with change listeners.
 * Simple observable — no library needed.
 */

const state = {
  messages: [],
  filters: [],
  timeRange: "7d",
  activeRequests: 0,
  usage: null,
  digestLoading: false,
  deepDive: false,
};

const listeners = new Set();

export function get() {
  return state;
}

export function set(patch) {
  Object.assign(state, patch);
  listeners.forEach((fn) => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
