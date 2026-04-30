// ═══════════════════════════════════════════════════════════════
//  calc.js — Pure calculation functions (zero DOM dependency)
// ═══════════════════════════════════════════════════════════════

/** Round to 2 decimal places */
export const R2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Multi-format number parser: US (1,234.56), EU (1.234,56), comma decimal */
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

/** CBM per unit — single source of truth (was 4× copy-paste) */
export function getCbmPerUnit(tp) {
  return tp.qtyTotal > 0 ? tp.cbmTarget / tp.qtyTotal : tp.cbmPerUnit;
}

/** Volume in m³ from dimensions in cm */
export function calcVolume(p, l, t) {
  return (p * l * t) / 1_000_000;
}

/** Recalculate template after dimension/qty edit (was 3× copy-paste) */
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

/** Freight = CBM × Rate (single rounding) */
export function calcFreight(rawCbm, rate) {
  return R2(rawCbm * rate);
}

/**
 * Largest Remainder Method (Hare-Niemeyer) — distribusi proporsional
 * dengan jaminan Σ result = total (exact to 2 decimal places).
 *
 * Berdasarkan teori Apportionment (Balinski & Young, 2001).
 * Digunakan di sistem pemilu proporsional untuk distribusi kursi.
 *
 * @param {number} total   - Nilai total yang akan didistribusikan
 * @param {number[]} weights - Bobot proporsional (misal: CBM per item)
 * @returns {number[]} Nilai terdistribusi, Σ === total (exact)
 */
export function distributeProportional(total, weights) {
  const sumW = weights.reduce((s, w) => s + w, 0);
  if (sumW === 0) return weights.map(() => 0);

  const totalCents = Math.round(total * 100);
  const exact = weights.map((w) => (total * w) / sumW);
  const floors = exact.map((v) => Math.floor(v * 100));
  let sumFloors = floors.reduce((s, f) => s + f, 0);

  // Distribute remaining cents to items with largest fractional remainders
  const remainders = exact.map((v, i) => ({ r: v * 100 - floors[i], i }));
  remainders.sort((a, b) => b.r - a.r);

  let toDistribute = totalCents - sumFloors;
  for (const { i } of remainders) {
    if (toDistribute <= 0) break;
    floors[i] += 1;
    toDistribute -= 1;
  }

  return floors.map((f) => f / 100);
}

// ── CFR / FOB ──

/** Bidirectional CFR ↔ FOB for a single item */
export function getItemCfrFob(item, freight) {
  if (item.lastItemEdited === "fob" && item.fobInput > 0)
    return { cfr: R2(item.fobInput + freight), fob: item.fobInput };
  if (item.cfrInput > 0)
    return { cfr: item.cfrInput, fob: R2(item.cfrInput - freight) };
  return { cfr: 0, fob: 0 };
}

/**
 * Calculate CFR/FOB for all items.
 * Uses proportional distribution (Largest Remainder) for fair FOB allocation
 * instead of dumping remainder to a single item.
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

/** Auto-calc the 3rd value from any 2 of {freight, cfr, fob} */
export function calcGlobalTriad(fr, cfr, fob, hasFr, hasCfr, hasFob, lastEdited) {
  if (hasFr && hasCfr && lastEdited !== "fob")
    return { field: "fob", value: R2(cfr - fr) };
  if (hasFr && hasFob && lastEdited !== "cfr")
    return { field: "cfr", value: R2(fob + fr) };
  if (hasCfr && hasFob && lastEdited !== "freight")
    return { field: "freight", value: R2(cfr - fob) };
  return null;
}
