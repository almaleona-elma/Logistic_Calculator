// ═══════════════════════════════════════════════════════════════
//  render.js — DOM rendering (templates, items, validation)
// ═══════════════════════════════════════════════════════════════

import {
  R2, pf, pi, fmt,
  getCbmPerUnit, calcItemCbm, calcFreight, distributeProportional,
  getItemCfrFob, calcAllCfrFob, validateIncoterms,
} from "./calc.js";
import { state, buildTplMap, buildAllocMap, saveState } from "./state.js";

const $ = (id) => document.getElementById(id);

// ── Global Inputs (cached references) ──

const gPrice = $("g-price"),
  gFreight = $("g-freight"),
  gCfr = $("g-cfr"),
  gFob = $("g-fob");

/** Read current global input values */
export function getGlobalInputs() {
  return {
    price: gPrice.value,
    freight: gFreight.value,
    cfr: gCfr.value,
    fob: gFob.value,
  };
}

// ── Compute freights for all items ──

function calcItemFreights() {
  const price = pf(gPrice.value);
  const globalFreight = pf(gFreight.value);
  const tplMap = buildTplMap();
  const data = state.items.map((item) => calcItemCbm(item, tplMap));
  const rawCbms = data.map((d) => d.rawCbm);
  const hasCbm = rawCbms.some((c) => c > 0);

  // Largest Remainder: distribute global freight proportionally by CBM
  // Guarantees Σ freight_i = globalFreight exactly (Hare-Niemeyer)
  const freights =
    globalFreight > 0 && hasCbm
      ? distributeProportional(globalFreight, rawCbms)
      : data.map((d) => calcFreight(d.rawCbm, price));

  return { data, freights, tplMap };
}

// ── Templates Table ──

export function renderTemplates() {
  const tb = $("tpl-body");
  tb.innerHTML = "";
  if (!state.templates.length) {
    tb.innerHTML = '<tr><td colspan="7" class="empty">Belum ada data.</td></tr>';
    $("tpl-sum-cbm").textContent = "0.00";
    $("tpl-sum-qty").textContent = "0";
    $("tpl-sum-alloc").textContent = "0";
    $("tpl-sum-sisa").textContent = "0";
    return;
  }
  const allocMap = buildAllocMap();
  let sC = 0, sQ = 0, sA = 0;

  state.templates.forEach((tp, i) => {
    const al = allocMap.get(tp.id) || 0,
      si = tp.qtyTotal - al;
    sC += tp.cbmTarget;
    sQ += tp.qtyTotal;
    sA += al;
    const chip =
      si === 0
        ? '<span class="chip ok">HABIS ✓</span>'
        : si > 0
          ? `<span class="chip warn">${si} sisa</span>`
          : `<span class="chip err">${Math.abs(si)} LEBIH</span>`;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><input type="text" value="${tp.name}" class="tpl-edit tpl-edit-name" data-tpl-name="${i}" style="width:70px;font-weight:600"><br><small><input type="text" inputmode="decimal" value="${tp.p}" class="tpl-edit tpl-edit-dim" data-tpl-p="${i}" style="width:45px">×<input type="text" inputmode="decimal" value="${tp.l}" class="tpl-edit tpl-edit-dim" data-tpl-l="${i}" style="width:45px">×<input type="text" inputmode="decimal" value="${tp.t}" class="tpl-edit tpl-edit-dim" data-tpl-t="${i}" style="width:45px"></small></td><td>${tp.cbmPerUnit.toFixed(6)}</td><td><input type="text" inputmode="decimal" value="${tp.cbmTarget.toFixed(2)}" class="tpl-edit" data-tpl-cbm="${i}" style="width:65px"></td><td><input type="number" min="0" value="${tp.qtyTotal}" class="tpl-edit" data-tpl-qty="${i}" style="width:55px"></td><td>${al}</td><td>${chip}</td><td><button class="btn red" data-del-tpl="${i}"><i class="fa fa-trash"></i></button></td>`;
    tb.appendChild(tr);
  });
  $("tpl-sum-cbm").textContent = sC.toFixed(2);
  $("tpl-sum-qty").textContent = sQ;
  $("tpl-sum-alloc").textContent = sA;
  $("tpl-sum-sisa").textContent = sQ - sA;
}

// ── Items Cards ──

export function renderItems() {
  const wrap = $("items-wrap");
  wrap.innerHTML = "";
  const { data, freights, tplMap } = calcItemFreights();
  const globalFob = pf(gFob.value);
  const cfrFobAll = calcAllCfrFob(state.items, freights, globalFob);

  state.items.forEach((item, idx) => {
    const { rawCbm, totQty } = data[idx];
    let cRows = "";
    item.cartons.forEach((c, ci) => {
      const tp = tplMap.get(c.tplId);
      if (!tp) return;
      const cbmPU = getCbmPerUnit(tp);
      cRows += `<tr><td>${tp.p}×${tp.l}×${tp.t}</td><td>${c.qty}</td><td>${(cbmPU * c.qty).toFixed(4)}</td><td><button class="btn orange sm" data-xfer="${idx},${ci}" title="Transfer"><i class="fa fa-arrow-right-arrow-left"></i></button> <button class="btn red" data-del-cart="${idx},${ci}"><i class="fa fa-times"></i></button></td></tr>`;
    });
    const cbm = R2(rawCbm);
    const { cfr, fob, freight } = cfrFobAll[idx];

    let qS = "";
    if (item.targetQty > 0) {
      if (totQty === item.targetQty)
        qS = '<span class="chip ok">PAS ✓</span>';
      else if (totQty < item.targetQty)
        qS = `<span class="chip warn">Kurang ${item.targetQty - totQty}</span>`;
      else
        qS = `<span class="chip err">Lebih ${totQty - item.targetQty}</span>`;
    }

    const div = document.createElement("div");
    div.className = "item-card";
    div.innerHTML = `
      <div class="item-head">
        <h3>Item No. ${item.itemNo}</h3>
        <div class="item-head-right">
          <div class="target-qty-wrap">Target: <input type="number" value="${item.targetQty || ""}" placeholder="0" data-tq="${idx}" min="0"> ${qS}</div>
          <button class="btn blue sm" data-add-cart="${idx}"><i class="fa fa-plus"></i> Dus</button>
          <button class="btn red" data-del-item="${idx}"><i class="fa fa-trash"></i></button>
        </div>
      </div>
      <div class="item-body">
        <table class="tbl"><thead><tr><th>Dimensi</th><th>Qty</th><th>CBM</th><th></th></tr></thead>
        <tbody>${cRows || '<tr><td colspan="4" class="empty">Belum ada karton.</td></tr>'}</tbody></table>
        <div class="item-grid">
          <div class="sbox"><span>Total Karton</span><b>${totQty}</b></div>
          <div class="sbox" style="border-left:3px solid var(--blue)"><span>CBM</span><b style="color:var(--blue)">${cbm.toFixed(2)}</b></div>
          <div class="sbox"><span>Freight ($)</span><b>$ ${fmt(freight)}</b></div>
          <div class="sbox"><span>CFR ($)</span><input type="text" value="${cfr || ""}" placeholder="0" inputmode="decimal" data-cfr="${idx}"></div>
          <div class="sbox"><span>FOB ($)</span><input type="text" value="${fob || ""}" placeholder="0" inputmode="decimal" data-fob="${idx}"></div>
        </div>
        ${(() => {
          if (totQty > 0 && cfr > 0 && freight > 0) {
            const frPerKrt = freight / totQty;
            const cfrPerKrt = cfr / totQty;
            const ratio = frPerKrt / cfrPerKrt;
            if (ratio > 0.3) {
              return `<div class="freight-warn"><i class="fa fa-triangle-exclamation"></i> Freight/karton $${fmt(frPerKrt)} = ${(ratio * 100).toFixed(1)}% dari CFR/karton $${fmt(cfrPerKrt)} (threshold 30%)</div>`;
            }
          }
          return "";
        })()}
      </div>`;
    wrap.appendChild(div);
  });
}

// ── Validation Panel ──

export function renderValidation() {
  const { data, freights } = calcItemFreights();
  const globalFob = pf(gFob.value);
  const cfrFobAll = calcAllCfrFob(state.items, freights, globalFob);

  let aCbm = 0, aFr = 0, aCfr = 0;
  state.items.forEach((_, idx) => {
    aCbm += data[idx].rawCbm;
    aFr += cfrFobAll[idx].freight;
    aCfr += cfrFobAll[idx].cfr;
  });
  aCbm = R2(aCbm);
  aFr = R2(aFr);
  aCfr = R2(aCfr);
  const aFob = R2(aCfr - aFr);

  const tFr = pf(gFreight.value),
    tCfr = pf(gCfr.value),
    tFobInput = pf(gFob.value),
    tFob = tFobInput > 0 ? tFobInput : R2(tCfr - tFr);
  const tCbm = state.templates.length
    ? R2(state.templates.reduce((s, tp) => s + tp.cbmTarget, 0))
    : 0;

  const set = (id, v) => ($(id).textContent = v);
  set("va-cbm", fmt(aCbm));
  set("vt-cbm", fmt(tCbm));
  set("va-freight", `$ ${fmt(aFr)}`);
  set("vt-freight", `$ ${fmt(tFr)}`);
  set("va-cfr", `$ ${fmt(aCfr)}`);
  set("vt-cfr", `$ ${fmt(tCfr)}`);
  set("va-fob", `$ ${fmt(aFob)}`);
  set("vt-fob", `$ ${fmt(tFob)}`);

  const tag = (cid, tid, a, t, has, prefix = "$ ") => {
    const c = $(cid), tg = $(tid);
    c.classList.remove("match", "miss");
    if (!has) { tg.textContent = "—"; return; }
    const diff = R2(a - t);
    if (diff === 0) { c.classList.add("match"); tg.textContent = "MATCH ✓"; }
    else { c.classList.add("miss"); tg.textContent = `SELISIH ${prefix}${fmt(Math.abs(diff))}`; }
  };
  tag("vc-cbm", "tag-cbm", aCbm, tCbm, tCbm > 0, "");
  tag("vc-freight", "tag-freight", aFr, tFr, tFr > 0);
  tag("vc-cfr", "tag-cfr", aCfr, tCfr, tCfr > 0);
  tag("vc-fob", "tag-fob", aFob, tFob, tCfr > 0 || tFr > 0);

  // Rate × CBM vs Global Freight warning
  const warnEl = $("g-rate-warning");
  if (warnEl) {
    const calcFr = R2(R2(aCbm) * pf(gPrice.value));
    const gFr = pf(gFreight.value);
    if (gFr > 0 && aCbm > 0 && Math.abs(calcFr - gFr) > 1) {
      warnEl.style.display = "block";
      warnEl.innerHTML = `<i class="fa fa-triangle-exclamation"></i> Rate×CBM = $${fmt(calcFr)} ≠ Freight $${fmt(gFr)} (selisih $${fmt(Math.abs(calcFr - gFr))}). Effective rate: $${fmt(R2(gFr / aCbm))}/CBM`;
      warnEl.style.color = "var(--orange)";
    } else {
      warnEl.style.display = "none";
    }
  }

  // Incoterms® 2020 validation (per-item + global)
  const incoEl = $("inco-warnings");
  if (incoEl) {
    const globalWarnings = validateIncoterms(tCfr, tFob, tFr);
    cfrFobAll.forEach((r, idx) => {
      if (r.cfr > 0 || r.fob !== 0 || r.freight !== 0) {
        const itemW = validateIncoterms(r.cfr, r.fob, r.freight);
        itemW.forEach((w) =>
          globalWarnings.push({ level: w.level, msg: `Item ${state.items[idx]?.itemNo || idx + 1}: ${w.msg}` })
        );
      }
    });
    if (globalWarnings.length > 0) {
      incoEl.style.display = "block";
      incoEl.innerHTML = globalWarnings
        .map((w) => `<div class="inco-${w.level}"><i class="fa fa-${w.level === "error" ? "circle-xmark" : "triangle-exclamation"}"></i> ${w.msg}</div>`)
        .join("");
    } else {
      incoEl.style.display = "none";
    }
  }
}

// ── Render All ──

let _globalLastEdited = "";
export function setGlobalLastEdited(v) { _globalLastEdited = v; }
export function getGlobalLastEdited() { return _globalLastEdited; }

export function renderAll() {
  // Preserve focus across re-render
  const active = document.activeElement;
  let focusSelector = null;
  if (active && active.tagName === "INPUT") {
    for (const attr of active.attributes) {
      if (attr.name.startsWith("data-")) {
        focusSelector = `[${attr.name}="${attr.value}"]`;
        break;
      }
    }
  }

  renderTemplates();
  renderItems();
  renderValidation();

  if (focusSelector) {
    const el = document.querySelector(focusSelector);
    if (el) el.focus();
  }

  saveState({
    price: gPrice.value,
    freight: gFreight.value,
    cfr: gCfr.value,
    fob: gFob.value,
    lastEdited: _globalLastEdited,
  });
}

// ── Copy Result to Clipboard ──

export function buildResultText() {
  const { data, freights, tplMap } = calcItemFreights();
  const globalFob = pf(gFob.value);
  const cfrFobAll = calcAllCfrFob(state.items, freights, globalFob);

  let text = "══════ HASIL KALKULASI PEB ══════\n\n";
  text += `Freight/CBM: $${gPrice.value}\n`;
  text += `Total Freight: $${fmt(pf(gFreight.value))}\n`;
  text += `Total CFR: $${fmt(pf(gCfr.value))}\n`;
  text += `Total FOB: $${fmt(pf(gFob.value))}\n\n`;

  text += "MASTER MEASUREMENT:\n";
  state.templates.forEach((tp) => {
    text += `  ${tp.name} (${tp.p}×${tp.l}×${tp.t} cm) CBM/unit:${tp.cbmPerUnit.toFixed(6)} Qty:${tp.qtyTotal} CBM:${tp.cbmTarget.toFixed(2)}\n`;
  });
  text += "\nALOKASI ITEM:\n";
  state.items.forEach((item, idx) => {
    const { rawCbm, totQty } = data[idx];
    const { cfr, fob, freight } = cfrFobAll[idx];
    text += `  Item ${item.itemNo}: Qty=${totQty}, CBM=${R2(rawCbm).toFixed(2)}, Freight=$${fmt(freight)}, CFR=$${fmt(cfr)}, FOB=$${fmt(fob)}\n`;
    item.cartons.forEach((c) => {
      const tp = tplMap.get(c.tplId);
      if (!tp) return;
      const cbmPU = getCbmPerUnit(tp);
      text += `    └ ${tp.p}×${tp.l}×${tp.t}: ${c.qty} krt (${(cbmPU * c.qty).toFixed(4)} CBM)\n`;
    });
  });
  return text;
}
