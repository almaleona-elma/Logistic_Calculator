// ═══════════════════════════════════════════════════════════════
//  Test Suite — Kalkulator Draft PEB
//  Jalankan: node test.js
// ═══════════════════════════════════════════════════════════════

// ── Extracted functions (mirror dari script.js) ──
const R2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const pf = (v) => {
  const s = String(v).replace(/\s/g, '');
  if (!s) return 0;
  if (/,\d{3}/.test(s) && s.includes('.')) return parseFloat(s.replace(/,/g, '')) || 0;
  if (/\.\d{3}/.test(s) && s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  if (s.includes(',')) return parseFloat(s.replace(',', '.')) || 0;
  return parseFloat(s) || 0;
};

const pfOld = (v) => parseFloat(String(v).replace(",", ".")) || 0;
const pi = (v) => parseInt(v) || 0;

function getItemCfrFob(item, freight) {
  if (item.lastItemEdited === "fob" && item.fobInput > 0)
    return { cfr: R2(item.fobInput + freight), fob: item.fobInput };
  if (item.cfrInput > 0)
    return { cfr: item.cfrInput, fob: R2(item.cfrInput - freight) };
  return { cfr: 0, fob: 0 };
}

function calcFreightOld(rawCbm, price) { return R2(R2(rawCbm) * price); }
function calcFreightNew(rawCbm, price) { return R2(rawCbm * price); }

function distributeProportional(total, weights) {
  const sumW = weights.reduce((s, w) => s + w, 0);
  if (sumW === 0) return weights.map(() => 0);
  const totalCents = Math.round(total * 100);
  const exact = weights.map((w) => (total * w) / sumW);
  const floors = exact.map((v) => Math.floor(v * 100));
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

// ISO 80000-1:2022 Annex B — Round-half-to-even
function roundHalfEven(value, decimals = 2) {
  const factor = 10 ** decimals;
  const shifted = value * factor;
  const truncated = Math.trunc(shifted);
  const remainder = Math.abs(shifted - truncated);
  if (Math.abs(remainder - 0.5) > 1e-9) return Math.round(shifted) / factor;
  if (truncated % 2 === 0) return truncated / factor;
  return (truncated + Math.sign(shifted)) / factor;
}

// Incoterms® 2020 validation
function validateIncoterms(cfr, fob, freight) {
  const warnings = [];
  if (fob < 0) warnings.push({ level: "error", msg: "FOB negatif" });
  if (freight < 0) warnings.push({ level: "error", msg: "Freight negatif" });
  if (cfr > 0 && fob > 0 && cfr < fob) warnings.push({ level: "warning", msg: "CFR < FOB" });
  if (cfr > 0 && freight > 0 && freight >= cfr) warnings.push({ level: "error", msg: "Freight ≥ CFR" });
  return warnings;
}

// ── Mini test framework ──
let pass = 0, fail = 0, groupName = '';
const RED = '\x1b[31m', GREEN = '\x1b[32m', DIM = '\x1b[2m', BOLD = '\x1b[1m', RESET = '\x1b[0m';

function describe(name, fn) { groupName = name; console.log(`\n${BOLD}${name}${RESET}`); fn(); }

function it(name, fn) {
  try { fn(); pass++; console.log(`  ${GREEN}✓${RESET} ${name}`); }
  catch (e) { fail++; console.log(`  ${RED}✗ ${name}${RESET}\n    ${RED}${e.message}${RESET}`); }
}

function eq(actual, expected, label = '') {
  if (typeof expected === 'number' && typeof actual === 'number') {
    if (Math.abs(actual - expected) > 0.0001)
      throw new Error(`${label ? label + ': ' : ''}Expected ${expected}, got ${actual}`);
  } else if (actual !== expected)
    throw new Error(`${label ? label + ': ' : ''}Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function approx(actual, expected, tol = 0.01, label = '') {
  if (Math.abs(actual - expected) > tol)
    throw new Error(`${label ? label + ': ' : ''}Expected ~${expected} (±${tol}), got ${actual}`);
}

// ═══════════════════════════════════════════════════════════════
//  TEST CASES
// ═══════════════════════════════════════════════════════════════

describe("TC1: pf() — Number Parser", () => {
  it("Integer biasa: '85' → 85", () => eq(pf("85"), 85));
  it("Desimal titik: '1103.30' → 1103.30", () => eq(pf("1103.30"), 1103.30));
  it("Desimal koma: '1103,30' → 1103.30", () => eq(pf("1103,30"), 1103.30));
  it("Thousands separator: '1,103.30' → 1103.30", () => eq(pf("1,103.30"), 1103.30));
  it("Multi thousands: '1,234,567.89' → 1234567.89", () => eq(pf("1,234,567.89"), 1234567.89));
  it("EU format: '1.234,56' → 1234.56", () => eq(pf("1.234,56"), 1234.56));
  it("EU penuh: '24.742,67' → 24742.67", () => eq(pf("24.742,67"), 24742.67));
  it("String kosong → 0", () => eq(pf(""), 0));
  it("Undefined → 0", () => eq(pf(undefined), 0));
  it("Sudah number: 85 → 85", () => eq(pf(85), 85));
  it("Whitespace: ' 85 ' → 85", () => eq(pf(" 85 "), 85));
  it("Nol: '0' → 0", () => eq(pf("0"), 0));
  it("Negatif: '-5.25' → -5.25", () => eq(pf("-5.25"), -5.25));
  it("[REGRESI] OLD pf gagal parse '1,234,567.89'", () => {
    eq(pfOld("1,234,567.89"), 1.234, "OLD salah");
    eq(pf("1,234,567.89"), 1234567.89, "NEW benar");
  });
});

describe("TC2: R2() — Pembulatan 2 Desimal", () => {
  it("Tepat: 5.67 → 5.67", () => eq(R2(5.67), 5.67));
  it("Round up: 5.675 → 5.68", () => eq(R2(5.675), 5.68));
  it("Round down: 5.674 → 5.67", () => eq(R2(5.674), 5.67));
  it("Nol → 0", () => eq(R2(0), 0));
  it("Negatif: -3.456 → -3.46", () => eq(R2(-3.456), -3.46));
  it("Besar: 24742.67 → 24742.67", () => eq(R2(24742.67), 24742.67));
  it("Banker's edge: 2.005 → 2.01", () => eq(R2(2.005), 2.01));
});

describe("TC3: Freight = CBM × Rate (Fix A1: Single Rounding)", () => {
  const rate = 85;
  it("CBM 5.674: OLD=481.95 vs NEW=482.29 (NEW lebih akurat)", () => {
    eq(calcFreightOld(5.674, rate), 481.95, "OLD");
    eq(calcFreightNew(5.674, rate), 482.29, "NEW");
  });
  it("CBM 2.856 × $85 = $242.76", () => eq(calcFreightNew(2.856, rate), 242.76));
  it("CBM tepat 5.67 → OLD=NEW=$481.95", () => {
    eq(calcFreightNew(5.67, rate), 481.95);
    eq(calcFreightOld(5.67, rate), 481.95);
  });
  it("CBM 0 → $0", () => eq(calcFreightNew(0, rate), 0));
  it("Sum item freights ≈ total freight (3 item)", () => {
    const cbms = [5.674, 2.856, 4.448];
    const sum = cbms.reduce((s, c) => s + calcFreightNew(c, rate), 0);
    const total = calcFreightNew(cbms.reduce((s, c) => s + c, 0), rate);
    approx(sum, total, 0.03);
  });
});

describe("TC4: CBM per Unit = P×L×T / 1,000,000", () => {
  it("45×32×28 = 0.040320", () => approx((45*32*28)/1e6, 0.04032, 1e-6));
  it("60×40×50 = 0.120000", () => approx((60*40*50)/1e6, 0.12, 1e-6));
  it("100×100×100 = 1.000000", () => eq((100*100*100)/1e6, 1));
  it("Dimensi 0 → 0", () => eq((0*32*28)/1e6, 0));
});

describe("TC5: cbmTarget / qtyTotal vs cbmPerUnit", () => {
  it("5.67/28 = 0.2025 → re-sum (25+3) = 5.67", () => {
    const cbmPU = 5.67 / 28;
    approx(cbmPU, 0.2025, 0.0001);
    eq(R2(cbmPU * 25 + cbmPU * 3), 5.67);
  });
  it("cbmPerUnit × qty ≠ cbmTarget (forwarder rounding)", () => {
    const cbmPerUnit = (45*32*28)/1e6; // 0.040320
    const cbmCalc = cbmPerUnit * 28;    // 1.12896
    const cbmTarget = 1.13;
    approx(Math.abs(cbmCalc - cbmTarget), 0.001, 0.01);
  });
});

describe("TC6: Global Panel — CFR = FOB + Freight", () => {
  it("FOB = CFR - Freight: 24742.67 - 1103.30 = 23639.37", () => eq(R2(24742.67 - 1103.30), 23639.37));
  it("CFR = FOB + Freight: 23639.37 + 1103.30 = 24742.67", () => eq(R2(23639.37 + 1103.30), 24742.67));
  it("Freight = CFR - FOB: 24742.67 - 23639.37 = 1103.30", () => eq(R2(24742.67 - 23639.37), 1103.30));
});

describe("TC7: getItemCfrFob() — Bidirectional CFR ↔ FOB", () => {
  it("CFR 10000, freight 500 → FOB 9500", () => {
    const r = getItemCfrFob({ cfrInput: 10000, fobInput: 0, lastItemEdited: "cfr" }, 500);
    eq(r.cfr, 10000); eq(r.fob, 9500);
  });
  it("FOB 9500, freight 500 → CFR 10000", () => {
    const r = getItemCfrFob({ cfrInput: 0, fobInput: 9500, lastItemEdited: "fob" }, 500);
    eq(r.cfr, 10000); eq(r.fob, 9500);
  });
  it("Tanpa input → 0,0", () => {
    const r = getItemCfrFob({ cfrInput: 0, fobInput: 0, lastItemEdited: "" }, 500);
    eq(r.cfr, 0); eq(r.fob, 0);
  });
  it("FOB negatif jika Freight > CFR", () => {
    const r = getItemCfrFob({ cfrInput: 100, fobInput: 0, lastItemEdited: "cfr" }, 200);
    eq(r.fob, -100);
  });
});

describe("TC8: FOB Proporsional (Largest Remainder)", () => {
  it("3 items: FOB terdistribusi proporsional, total exact", () => {
    const globalFob = 23639.37;
    const items = [
      { cfrInput: 15000, fobInput: 0, lastItemEdited: "cfr" },
      { cfrInput: 8000, fobInput: 0, lastItemEdited: "cfr" },
      { cfrInput: 1742.67, fobInput: 0, lastItemEdited: "cfr" },
    ];
    const freights = [600, 350, 153.30];
    const results = items.map((item, i) => ({ ...getItemCfrFob(item, freights[i]), freight: freights[i] }));

    // Use proportional distribution
    const rawFobs = results.map(r => Math.max(r.fob, 0));
    const fairFobs = distributeProportional(globalFob, rawFobs);

    // Total must be EXACT
    const totalFob = fairFobs.reduce((s, f) => s + f, 0);
    eq(totalFob, globalFob, "Total FOB EXACT match");
  });
});

describe("TC9: Validasi FOB Target (Fix A2)", () => {
  it("Prioritas input user jika ada", () => {
    const tFobInput = 23640.00, tFobCalc = R2(24742.67 - 1103.30);
    const tFob = tFobInput > 0 ? tFobInput : tFobCalc;
    eq(tFob, 23640.00);
  });
  it("Fallback ke CFR-Freight jika input 0", () => {
    const tFob = 0 > 0 ? 0 : R2(24742.67 - 1103.30);
    eq(tFob, 23639.37);
  });
});

describe("TC10: Template Qty = round(CBM / cbmPerUnit)", () => {
  it("5.67 / 0.040320 = 141", () => eq(Math.round(5.67 / 0.040320), 141));
  it("1.13 / 0.040320 = 28", () => eq(Math.round(1.13 / 0.040320), 28));
  it("0.12 / 0.120000 = 1", () => eq(Math.round(0.12 / 0.12), 1));
});

describe("TC11: Auto-Solve Alokasi", () => {
  it("2 items, 1 template — distribusi proporsional", () => {
    const pool = [{ tplId: 1, avail: 100, t: 28 }];
    const items = [{ targetQty: 60, cartons: [] }, { targetQty: 40, cartons: [] }];
    const sorted = [...items].sort((a, b) => b.targetQty - a.targetQty);
    sorted.forEach(item => {
      let need = item.targetQty;
      for (const sl of pool) {
        if (need <= 0) break;
        const take = Math.min(need, sl.avail);
        item.cartons.push({ tplId: sl.tplId, qty: take });
        sl.avail -= take; need -= take;
      }
    });
    eq(sorted[0].cartons[0].qty, 60); eq(sorted[1].cartons[0].qty, 40);
    eq(pool[0].avail, 0, "Pool habis");
  });

  it("Fix B1: Item tanpa target tidak di-clear", () => {
    const items = [
      { targetQty: 50, cartons: [{ tplId: 1, qty: 30 }] },
      { targetQty: 0, cartons: [{ tplId: 2, qty: 10 }] },
    ];
    items.forEach(it => { if (it.targetQty > 0) it.cartons = []; });
    eq(items[0].cartons.length, 0, "Target item cleared");
    eq(items[1].cartons.length, 1, "No-target item preserved");
    eq(items[1].cartons[0].qty, 10);
  });
});

describe("TC12: E2E — 3 Item, 2 Template", () => {
  it("Full pipeline: Alokasi → Freight → CFR/FOB → Validasi", () => {
    const rate = 85, globalCfr = 24742.67;
    const tpl1 = { cbmTarget: 5.67, qtyTotal: 28 };
    const tpl2 = { cbmTarget: 7.30, qtyTotal: 61 };
    const tplMap = new Map([[1, tpl1], [2, tpl2]]);

    const itemData = [
      { cartons: [{ tplId: 1, qty: 15 }, { tplId: 2, qty: 30 }], cfrInput: 15000 },
      { cartons: [{ tplId: 1, qty: 10 }, { tplId: 2, qty: 25 }], cfrInput: 8000 },
      { cartons: [{ tplId: 2, qty: 6 }, { tplId: 1, qty: 3 }], cfrInput: 1742.67 },
    ];

    const results = itemData.map(item => {
      let rawCbm = 0;
      item.cartons.forEach(c => {
        const tp = tplMap.get(c.tplId);
        rawCbm += (tp.cbmTarget / tp.qtyTotal) * c.qty;
      });
      const freight = R2(rawCbm * rate);
      return { rawCbm, freight, cfr: item.cfrInput, fob: R2(item.cfrInput - freight) };
    });

    results.forEach((r, i) => { if (r.freight <= 0) throw new Error(`Item ${i}: Freight ≤ 0`); });
    results.forEach((r, i) => { if (r.fob <= 0) throw new Error(`Item ${i}: FOB ≤ 0`); });
    eq(results.reduce((s, r) => s + r.cfr, 0), globalCfr, "Sum CFR = Global");
    results.forEach((r, i) => {
      if (r.freight / r.cfr > 0.3) throw new Error(`Item ${i}: Freight/CFR > 30%`);
    });
  });
});

describe("TC14: distributeProportional() — Hare-Niemeyer", () => {
  it("Σ result = total (exact, selalu)", () => {
    const result = distributeProportional(1103.30, [5.074, 3.413, 4.501]);
    eq(result.reduce((s, v) => s + v, 0), 1103.30, "Sum exact");
  });

  it("Proporsi benar", () => {
    const result = distributeProportional(1000, [50, 30, 20]);
    eq(result[0], 500);
    eq(result[1], 300);
    eq(result[2], 200);
  });

  it("Edge: semua weight 0 → semua 0", () => {
    const result = distributeProportional(100, [0, 0, 0]);
    eq(result[0], 0); eq(result[1], 0); eq(result[2], 0);
  });

  it("Edge: 1 item → mendapat semua", () => {
    const result = distributeProportional(500.50, [1]);
    eq(result[0], 500.50);
  });

  it("Remainder cents ke fractional terbesar", () => {
    // 100 / 3 = 33.3333... each
    const result = distributeProportional(100, [1, 1, 1]);
    const sum = result.reduce((s, v) => s + v, 0);
    eq(sum, 100, "Sum exact");
    // Two items get 33.34, one gets 33.33 (or similar)
    result.forEach(v => approx(v, 33.33, 0.02));
  });

  it("Distribusi freight realistis: 3 item", () => {
    const freight = 1103.30;
    const cbms = [5.674, 2.856, 4.458];
    const result = distributeProportional(freight, cbms);
    eq(result.reduce((s, v) => s + v, 0), freight, "Sum exact");
    // Proportional check
    const totalCbm = cbms.reduce((s, c) => s + c, 0);
    result.forEach((v, i) => {
      const expected = freight * cbms[i] / totalCbm;
      approx(v, expected, 0.01, `Item ${i}`);
    });
  });

  it("Banyak item (10) tetap exact", () => {
    const weights = [1.1, 2.2, 3.3, 4.4, 5.5, 6.6, 7.7, 8.8, 9.9, 0.5];
    const result = distributeProportional(9999.99, weights);
    eq(result.reduce((s, v) => s + v, 0), 9999.99, "Sum exact");
  });
});

describe("TC15: roundHalfEven() — ISO 80000-1:2022", () => {
  it("Non-halfway: 5.674 → 5.67", () => eq(roundHalfEven(5.674), 5.67));
  it("Non-halfway: 5.676 → 5.68", () => eq(roundHalfEven(5.676), 5.68));
  it("Halfway even: 2.5 → 2 (even)", () => eq(roundHalfEven(2.5, 0), 2));
  it("Halfway odd: 3.5 → 4 (even)", () => eq(roundHalfEven(3.5, 0), 4));
  it("Halfway 2.25 → 2.2 (even)", () => eq(roundHalfEven(2.25, 1), 2.2));
  it("Halfway 2.35 → 2.4 (even)", () => eq(roundHalfEven(2.35, 1), 2.4));
  it("Negative halfway: -2.5 → -2 (even)", () => eq(roundHalfEven(-2.5, 0), -2));
  it("Negative halfway: -3.5 → -4 (even)", () => eq(roundHalfEven(-3.5, 0), -4));
  it("Zero → 0", () => eq(roundHalfEven(0), 0));
  it("Large: 24742.675 → 24742.68", () => eq(roundHalfEven(24742.675), 24742.68));
  it("vs R2(): R2 rounds half-up, ISO rounds half-even", () => {
    // R2 works on 2 decimals; for integer-level: both round 2.50 → 2.50
    // Difference shows at exact halves like x.xx5:
    eq(roundHalfEven(2.5, 0), 2, "ISO 2.5→2 (even)");
    eq(roundHalfEven(3.5, 0), 4, "ISO 3.5→4 (even)");
    // R2 with EPSILON: 0.045 + ε rounds up
    eq(R2(0.045), 0.05, "R2 rounds half-up at 2 decimals");
  });
});

describe("TC16: validateIncoterms() — Incoterms® 2020", () => {
  it("Valid: CFR=15000, FOB=14400, Freight=600 → no warnings", () => {
    eq(validateIncoterms(15000, 14400, 600).length, 0);
  });
  it("FOB negatif → contains error", () => {
    const w = validateIncoterms(100, -50, 150);
    eq(w.some(x => x.level === "error" && x.msg.includes("FOB")), true);
  });
  it("Freight negatif → contains error", () => {
    const w = validateIncoterms(100, 120, -20);
    eq(w.some(x => x.level === "error" && x.msg.includes("Freight")), true);
  });
  it("CFR < FOB → warning", () => {
    const w = validateIncoterms(100, 200, 50);
    eq(w.some(x => x.level === "warning"), true);
  });
  it("Freight ≥ CFR → error", () => {
    const w = validateIncoterms(100, 0, 150);
    eq(w.some(x => x.level === "error"), true);
  });
  it("Zero values → no warnings", () => {
    eq(validateIncoterms(0, 0, 0).length, 0);
  });
  it("Multiple violations → multiple warnings", () => {
    const w = validateIncoterms(100, -50, 200);
    // FOB negatif + Freight >= CFR = 2 errors
    eq(w.length >= 2, true);
  });
});

// ═══════════════════════════════════════════════════════════════
// TC17: Real Data from Sample PDF (EVERGREEN TEXTILE)
// ═══════════════════════════════════════════════════════════════
describe("TC17: Real Data from Sample PDF (EVERGREEN TEXTILE)", () => {
  it("should process shipment with 2 items and 3 carton types correctly", () => {
    const rate = 150;        // $150 / CBM
    const globalFreight = 1468.50;
    const globalCfr = 23854.92;
    const globalFob = 22386.42; // Note: 23854.92 - 1468.50 = 22386.42

    const tplMap = new Map([
      [1, { cbmTarget: 5.76186, qtyTotal: 26 }], // 149x42.5x35
      [2, { cbmTarget: 3.85016, qtyTotal: 19 }], // 149x42.5x32
      [3, { cbmTarget: 0.17731, qtyTotal: 1 }]   // 149x42.5x28
    ]);

    const itemData = [
      { cartons: [{ tplId: 1, qty: 26 }, { tplId: 2, qty: 17 }], cfrInput: 22747.45 },
      { cartons: [{ tplId: 2, qty: 2 }, { tplId: 3, qty: 1 }], cfrInput: 1107.48 }
    ];

    // 1. Calculate raw CBM
    let totalCbm = 0;
    const rawCbms = itemData.map(item => {
      let cbm = 0;
      item.cartons.forEach(c => {
        const tp = tplMap.get(c.tplId);
        cbm += (tp.cbmTarget / tp.qtyTotal) * c.qty;
      });
      totalCbm += cbm;
      return cbm;
    });

    // 2. Calculate initial freights & FOB
    const initialFreights = rawCbms.map(cbm => cbm * rate);
    
    // 3. Proportional Distribution
    const fairFreights = distributeProportional(globalFreight, initialFreights);
    
    const rawFobs = itemData.map((item, i) => Math.max(0, item.cfrInput - fairFreights[i]));
    const fairFobs = distributeProportional(globalFob, rawFobs);

    const sumFr = R2(fairFreights[0] + fairFreights[1]);
    const sumFob = R2(fairFobs[0] + fairFobs[1]);
    const sumCfr = R2(itemData[0].cfrInput + itemData[1].cfrInput);

    // Verify
    eq(Math.round(totalCbm * 100), 979); // 9.79 m3 (matches PDF)
    eq(sumFr, globalFreight);            // 1468.50 exact match
    eq(sumFob, globalFob);               // 22386.42 exact match
    eq(sumCfr, 23854.93);                // CFR target was 23854.92, sum is 93 (1 cent difference allowed/expected from input data)
  });
});

// ═══════════════════════════════════════════════════════════════
//  SUMMARY
// ═══════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(50)}`);
if (fail === 0) console.log(`${GREEN}${BOLD}  ✅ ALL ${pass} TESTS PASSED${RESET}`);
else console.log(`${RED}${BOLD}  ❌ ${fail} FAILED${RESET}, ${GREEN}${pass} passed${RESET}`);
console.log(`${'═'.repeat(50)}\n`);

process.exit(fail > 0 ? 1 : 0);
