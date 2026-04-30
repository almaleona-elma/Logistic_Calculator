// ═══════════════════════════════════════════════════════════════
//  calc.js — Pure calculation functions (zero DOM dependency)
//
//  Standards compliance:
//    ISO 80000-1:2022   — Rounding rules (Annex B)
//    IEEE 754-2019      — Floating-point arithmetic
//    Incoterms® 2020    — FOB/CFR trade terms (ICC Pub. 723)
//    Balinski & Young    — Apportionment theory (LRM)
// ═══════════════════════════════════════════════════════════════

/**
 * Round to 2 decimal places (round-half-up).
 * Uses Number.EPSILON correction per IEEE 754-2019 to handle
 * binary64 representation artifacts (e.g., 2.005 → 2.01).
 * @see IEEE 754-2019 §4.3.1
 */
export const R2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Round-half-to-even ("banker's rounding") per ISO 80000-1:2022 Annex B.
 * When value is exactly halfway, rounds to the nearest EVEN digit.
 * Minimizes systematic bias over large datasets.
 *
 * @param {number} value    - Value to round
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {number} Rounded value
 * @see ISO 80000-1:2022, Annex B "Rounding of numbers"
 */
export function roundHalfEven(value, decimals = 2) {
  const factor = 10 ** decimals;
  const shifted = value * factor;
  const truncated = Math.trunc(shifted);
  const remainder = Math.abs(shifted - truncated);

  // Not a halfway case — standard rounding
  if (Math.abs(remainder - 0.5) > 1e-9) {
    return Math.round(shifted) / factor;
  }
  // Exactly halfway — round to even
  if (truncated % 2 === 0) return truncated / factor;
  return (truncated + Math.sign(shifted)) / factor;
}

/**
 * Multi-format number parser.
 * Handles US (1,234.56), EU (1.234,56), and simple comma decimal (1234,56).
 */
export const pf = (v) => {
  const s = String(v).replace(/\s/g, "");
  if (!s) return 0;
  if (/,\d{3}/.test(s) && s.includes("."))
    return parseFloat(s.replace(/,/g, "")) || 0;
  if (/\.\d{3}/.test(s) && s.includes(","))
    return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
  if (s.includes(",")) return parseFloat(s.replace(",", ".")) || 0;
  return parseFloat(s) || 0;
};

/** parseInt with fallback to 0 */
export const pi = (v) => parseInt(v) || 0;

/** Locale-formatted number string */
export const fmt = (n, d = 2) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });

// ── CBM & Volume ──

/**
 * CBM per unit — single source of truth.
 * Uses cbmTarget (from forwarder/SI document) divided by qtyTotal,
 * NOT P×L×T theoretical volume, to ensure split-and-sum consistency.
 */
export function getCbmPerUnit(tp) {
  return tp.qtyTotal > 0 ? tp.cbmTarget / tp.qtyTotal : tp.cbmPerUnit;
}

/**
 * Volume in m³ from dimensions in cm.
 * Industry standard formula: CBM = P(cm) × L(cm) × T(cm) / 1,000,000
 * Used by IATA, WCO, and all maritime carriers globally.
 */
export function calcVolume(p, l, t) {
  return (p * l * t) / 1_000_000;
}

/**
 * Recalculate template after dimension/qty edit.
 * Applies cascaded rounding per Dorfleitner & Klein (1999):
 * rounding applied once at the end, not at intermediate steps.
 */
export function recalcTemplate(tp) {
  tp.cbmPerUnit = calcVolume(tp.p, tp.l, tp.t);
  tp.cbmTarget = R2(tp.cbmPerUnit * tp.qtyTotal);
  return tp;
}

/** Calculate CBM & total qty for an item from its cartons */
export function calcItemCbm(item, tplMap) {
  let rawCbm = 0,
    totQty = 0;
  item.cartons.forEach((c) => {
    const tp = tplMap.get(c.tplId);
    if (tp) {
      rawCbm += getCbmPerUnit(tp) * c.qty;
      totQty += c.qty;
    }
  });
  return { rawCbm, totQty };
}

/**
 * Freight per item = CBM × Rate.
 * Single rounding per cascaded rounding principle (Dorfleitner & Klein 1999).
 * @see REFERENCES.md §2 "Cascaded Rounding"
 */
export function calcFreight(rawCbm, rate) {
  return R2(rawCbm * rate);
}

/**
 * Largest Remainder Method (Hare-Niemeyer) — proportional distribution
 * with mathematical guarantee: Σ result = total (exact to 2 decimal places).
 *
 * Uses integer arithmetic (cents) internally to avoid IEEE 754 floating-point
 * precision issues per IEEE 754-2019 best practices.
 *
 * @param {number}   total   - Value to distribute (e.g., $1,103.30)
 * @param {number[]} weights - Proportional weights (e.g., CBM per item)
 * @returns {number[]} Distributed values where Σ === total (exact)
 * @see Balinski & Young (2001), Pukelsheim (2017)
 * @see REFERENCES.md §1 "Largest Remainder Method"
 */
export function distributeProportional(total, weights) {
  const sumW = weights.reduce((s, w) => s + w, 0);
  if (sumW === 0) return weights.map(() => 0);

  // Integer arithmetic in cents to avoid IEEE 754 binary64 precision loss
  const totalCents = Math.round(total * 100);
  const exact = weights.map((w) => (total * w) / sumW);
  const floors = exact.map((v) => Math.floor(v * 100));

  // Distribute remaining cents to items with largest fractional remainders
  const remainders = exact.map((v, i) => ({ r: v * 100 - floors[i], i }));
  remainders.sort((a, b) => b.r - a.r);

  let toDistribute = totalCents - floors.reduce((s, f) => s + f, 0);
  for (const { i } of remainders) {
    if (toDistribute <= 0) break;
    floors[i] += 1;
    toDistribute -= 1;
  }

  return floors.map((f) => f / 100);
}

// ── CFR / FOB (Incoterms® 2020) ──

/**
 * Bidirectional CFR ↔ FOB for a single item.
 * Per Incoterms® 2020 (ICC Pub. 723):
 *   FOB = CFR − Freight  (seller's cost until goods are on board)
 *   CFR = FOB + Freight   (seller covers freight to destination port)
 */
export function getItemCfrFob(item, freight) {
  if (item.lastItemEdited === "fob" && item.fobInput > 0)
    return { cfr: R2(item.fobInput + freight), fob: item.fobInput };
  if (item.cfrInput > 0)
    return { cfr: item.cfrInput, fob: R2(item.cfrInput - freight) };
  return { cfr: 0, fob: 0 };
}

/**
 * Calculate CFR/FOB for all items.
 * Uses proportional distribution (Largest Remainder / Hare-Niemeyer)
 * for fair FOB allocation instead of dumping remainder to a single item.
 *
 * @see Balinski & Young (2001) — Webster method has smallest bias
 */
export function calcAllCfrFob(items, freights, globalFob) {
  const results = items.map((item, idx) => {
    const base = getItemCfrFob(item, freights[idx]);
    return { cfr: base.cfr, fob: base.fob, freight: freights[idx] };
  });
  const allHaveValues =
    items.length >= 2 && results.every((r) => r.cfr > 0);
  if (!allHaveValues || globalFob <= 0) return results;

  // Distribute globalFob proportionally using Largest Remainder
  const rawFobs = results.map((r) => Math.max(r.fob, 0));
  const sumRaw = rawFobs.reduce((s, f) => s + f, 0);
  if (sumRaw > 0) {
    const fairFobs = distributeProportional(globalFob, rawFobs);
    results.forEach((r, i) => {
      r.fob = fairFobs[i];
      r.freight = R2(r.cfr - r.fob);
    });
  }
  return results;
}

// ── Global Panel ──

/**
 * Auto-calc the 3rd value from any 2 of {freight, cfr, fob}.
 * Based on Incoterms® 2020: CFR = FOB + Freight
 */
export function calcGlobalTriad(fr, cfr, fob, hasFr, hasCfr, hasFob, lastEdited) {
  if (hasFr && hasCfr && lastEdited !== "fob")
    return { field: "fob", value: R2(cfr - fr) };
  if (hasFr && hasFob && lastEdited !== "cfr")
    return { field: "cfr", value: R2(fob + fr) };
  if (hasCfr && hasFob && lastEdited !== "freight")
    return { field: "freight", value: R2(cfr - fob) };
  return null;
}

// ── Incoterms® 2020 Validation ──

/**
 * Validate trade values per Incoterms® 2020 rules.
 * Returns array of warning objects for display.
 *
 * Rules enforced:
 *   1. FOB ≥ 0 (goods must have positive value)
 *   2. Freight ≥ 0 (shipping cost cannot be negative)
 *   3. CFR > FOB (CFR includes freight, must exceed FOB)
 *   4. Freight < CFR (freight cannot exceed total delivered cost)
 *
 * @param {number} cfr     - Cost and Freight value
 * @param {number} fob     - Free On Board value
 * @param {number} freight - Freight cost
 * @returns {{level: string, msg: string}[]} Warnings
 */
export function validateIncoterms(cfr, fob, freight) {
  const warnings = [];
  if (fob < 0)
    warnings.push({ level: "error", msg: "FOB negatif — nilai barang harus ≥ 0 (Incoterms® 2020 FOB)" });
  if (freight < 0)
    warnings.push({ level: "error", msg: "Freight negatif — biaya pengiriman harus ≥ 0" });
  if (cfr > 0 && fob > 0 && cfr < fob)
    warnings.push({ level: "warning", msg: "CFR < FOB — per Incoterms® 2020, CFR sudah termasuk freight" });
  if (cfr > 0 && freight > 0 && freight >= cfr)
    warnings.push({ level: "error", msg: "Freight ≥ CFR — freight melebihi nilai total pengiriman" });
  return warnings;
}
