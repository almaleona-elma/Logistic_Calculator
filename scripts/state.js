// ═══════════════════════════════════════════════════════════════
//  state.js — Centralized state management + localStorage
// ═══════════════════════════════════════════════════════════════

import { R2, calcVolume } from "./calc.js";

const STORAGE_KEY = "kalkulatorPEB_state";
let _nextId = Date.now();
function nextId() {
  return _nextId++;
}

/** Application state — single source of truth */
export const state = {
  templates: [],
  items: [],
};

// ── Lookup Maps ──

/** Build Map<tplId, template> for O(1) lookups */
export function buildTplMap() {
  const m = new Map();
  state.templates.forEach((tp) => m.set(tp.id, tp));
  return m;
}

/** Compute allocated qty per template across all items */
export function buildAllocMap() {
  const m = new Map();
  state.items.forEach((it) =>
    it.cartons.forEach((c) =>
      m.set(c.tplId, (m.get(c.tplId) || 0) + c.qty),
    ),
  );
  return m;
}

// ── Factory Functions ──

/** Create new template with auto-ID */
export function createTemplate(name, p, l, t, cbmTarget, qtyTotal) {
  const cbmPerUnit = calcVolume(p, l, t);
  const finalQty = qtyTotal || Math.round(cbmTarget / cbmPerUnit);
  const finalCbm = cbmTarget > 0 ? cbmTarget : R2(cbmPerUnit * finalQty);
  return {
    id: nextId(),
    name,
    p,
    l,
    t,
    cbmTarget: finalCbm,
    qtyTotal: finalQty,
    cbmPerUnit,
  };
}

/** Create new item with auto-ID */
export function createItem(itemNo, targetQty = 0) {
  return {
    id: nextId(),
    itemNo,
    targetQty,
    cartons: [],
    cfrInput: 0,
    fobInput: 0,
    lastItemEdited: "",
  };
}

// ── Persistence ──

/** Save state + global inputs to localStorage */
export function saveState(globalInputs) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        templates: state.templates,
        items: state.items,
        global: globalInputs,
      }),
    );
  } catch (_) {
    /* quota */
  }
}

/** Load state from localStorage. Returns global inputs or null. */
export function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!s) return null;
    if (s.templates) state.templates = s.templates;
    if (s.items) state.items = s.items;
    return s.global || null;
  } catch (_) {
    return null;
  }
}

/** Reset all state and clear localStorage */
export function resetState() {
  state.templates.length = 0;
  state.items.length = 0;
  localStorage.removeItem(STORAGE_KEY);
}
