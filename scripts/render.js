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
    tb.innerHTML = '<tr><td colspan="7" class="text-center italic text-base-content/50 py-4">Belum ada data.</td></tr>';
    $("tpl-sum-cbm").textContent = "0.00";
    $("tpl-sum-qty").textContent = "0";
    $("tpl-sum-alloc").textContent = "0";
    $("tpl-sum-sisa").textContent = "0";
    return;
  }
  const allocMap = buildAllocMap();
  let sC = 0, sQ = 0, sA = 0;

  state.templates.forEach((tp, i) => {
    const al = allocMap.get(tp.id) || 0, si = tp.qtyTotal - al;
    sC += tp.cbmTarget; sQ += tp.qtyTotal; sA += al;
    
    const chip = si === 0
      ? '<span class="badge badge-success badge-sm font-semibold text-white">HABIS ✓</span>'
      : si > 0
        ? `<span class="badge badge-warning badge-sm font-semibold">${si} sisa</span>`
        : `<span class="badge badge-error badge-sm font-semibold text-white">${Math.abs(si)} LEBIH</span>`;
        
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <input type="text" value="${tp.name}" class="input input-xs input-ghost w-full max-w-[100px] font-bold tpl-edit tpl-edit-name" data-tpl-name="${i}"><br>
        <div class="flex items-center gap-1 mt-1 text-xs">
          <input type="text" inputmode="decimal" value="${tp.p}" class="input input-xs input-bordered w-12 text-center tpl-edit tpl-edit-dim" data-tpl-p="${i}"> ×
          <input type="text" inputmode="decimal" value="${tp.l}" class="input input-xs input-bordered w-12 text-center tpl-edit tpl-edit-dim" data-tpl-l="${i}"> ×
          <input type="text" inputmode="decimal" value="${tp.t}" class="input input-xs input-bordered w-12 text-center tpl-edit tpl-edit-dim" data-tpl-t="${i}">
        </div>
      </td>
      <td class="font-mono text-xs">${tp.cbmPerUnit.toFixed(6)}</td>
      <td><input type="text" inputmode="decimal" value="${tp.cbmTarget.toFixed(2)}" class="input input-xs input-bordered w-16 text-right font-mono tpl-edit" data-tpl-cbm="${i}"></td>
      <td><input type="number" min="0" value="${tp.qtyTotal}" class="input input-xs input-bordered w-16 text-right tpl-edit" data-tpl-qty="${i}"></td>
      <td class="font-bold">${al}</td>
      <td>${chip}</td>
      <td class="text-center"><button class="btn btn-error btn-xs btn-square" data-del-tpl="${i}" title="Hapus"><i class="fa fa-trash"></i></button></td>
    `;
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
      cRows += `
        <tr>
          <td class="text-xs">${tp.p}×${tp.l}×${tp.t}</td>
          <td class="font-bold">${c.qty}</td>
          <td class="font-mono text-xs">${(cbmPU * c.qty).toFixed(4)}</td>
          <td class="text-right space-x-1">
            <button class="btn btn-warning btn-xs btn-square" data-xfer="${idx},${ci}" title="Transfer Kardus"><i class="fa fa-arrow-right-arrow-left"></i></button>
            <button class="btn btn-error btn-xs btn-square" data-del-cart="${idx},${ci}" title="Hapus Kardus"><i class="fa fa-times"></i></button>
          </td>
        </tr>`;
    });
    const cbm = R2(rawCbm);
    const { cfr, fob, freight } = cfrFobAll[idx];

    let qS = "";
    if (item.targetQty > 0) {
      if (totQty === item.targetQty)
        qS = '<span class="badge badge-success badge-sm font-semibold text-white ml-2">PAS ✓</span>';
      else if (totQty < item.targetQty)
        qS = `<span class="badge badge-warning badge-sm font-semibold ml-2">Kurang ${item.targetQty - totQty}</span>`;
      else
        qS = `<span class="badge badge-error badge-sm font-semibold text-white ml-2">Lebih ${totQty - item.targetQty}</span>`;
    }

    const div = document.createElement("div");
    div.className = "card bg-base-200 border border-base-300";
    div.innerHTML = `
      <div class="card-body p-4 lg:p-5">
        <div class="flex justify-between items-start mb-4 border-b border-base-300 pb-3">
          <div>
            <h3 class="font-bold text-lg text-primary">Item No. ${item.itemNo}</h3>
            <div class="flex items-center mt-1">
              <span class="text-sm mr-2 opacity-70">Target Qty:</span>
              <input type="number" value="${item.targetQty || ""}" placeholder="0" data-tq="${idx}" min="0" class="input input-bordered input-xs w-16 text-center">
              ${qS}
            </div>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-secondary btn-sm" data-add-cart="${idx}" title="Tambah Kardus"><i class="fa fa-plus"></i></button>
            <button class="btn btn-error btn-sm btn-square" data-del-item="${idx}" title="Hapus Item"><i class="fa fa-trash"></i></button>
          </div>
        </div>
        
        <div class="overflow-x-auto mb-4 bg-base-100 rounded-box border border-base-300">
          <table class="table table-xs w-full">
            <thead class="bg-base-200">
              <tr><th>Dimensi (cm)</th><th>Qty</th><th>CBM</th><th class="text-right">Aksi</th></tr>
            </thead>
            <tbody>
              ${cRows || '<tr><td colspan="4" class="text-center italic text-base-content/50 py-3">Belum ada karton.</td></tr>'}
            </tbody>
          </table>
        </div>
        
        <div class="grid grid-cols-2 lg:grid-cols-5 gap-2 text-sm bg-base-100 p-3 rounded-box border border-base-300">
          <div class="flex flex-col">
            <span class="text-xs opacity-60">Total Karton</span>
            <span class="font-bold text-lg">${totQty}</span>
          </div>
          <div class="flex flex-col border-l-4 border-primary pl-2">
            <span class="text-xs opacity-60">CBM Total</span>
            <span class="font-bold text-lg text-primary">${cbm.toFixed(2)}</span>
          </div>
          <div class="flex flex-col">
            <span class="text-xs opacity-60">Freight ($)</span>
            <span class="font-bold text-lg font-mono">${fmt(freight)}</span>
          </div>
          <div class="flex flex-col">
            <span class="text-xs opacity-60">CFR ($)</span>
            <input type="text" value="${cfr || ""}" placeholder="0" inputmode="decimal" data-cfr="${idx}" class="input input-sm input-bordered w-full font-mono text-right mt-1">
          </div>
          <div class="flex flex-col">
            <span class="text-xs opacity-60">FOB ($)</span>
            <input type="text" value="${fob || ""}" placeholder="0" inputmode="decimal" data-fob="${idx}" class="input input-sm input-bordered w-full font-mono text-right mt-1">
          </div>
        </div>
        
        ${(() => {
          if (totQty > 0 && cfr > 0 && freight > 0) {
            const frPerKrt = freight / totQty;
            const cfrPerKrt = cfr / totQty;
            const ratio = frPerKrt / cfrPerKrt;
            if (ratio > 0.3) {
              return `<div class="alert alert-warning shadow-sm mt-3 py-2 text-xs"><i class="fa fa-triangle-exclamation"></i><span>Freight/karton $${fmt(frPerKrt)} = ${(ratio * 100).toFixed(1)}% dari CFR/karton $${fmt(cfrPerKrt)} (Melebihi normal 30%)</span></div>`;
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

  const tag = (rowId, statusId, a, t, has, prefix = "$ ") => {
    const r = $(rowId), tg = $(statusId);
    if (!r || !tg) return;
    r.className = "border-b border-neutral-content/10";
    if (!has) { tg.textContent = "—"; tg.className = "text-center font-bold text-neutral-content/50"; return; }
    const diff = R2(a - t);
    if (diff === 0) { 
      tg.textContent = "MATCH ✓"; 
      tg.className = "text-center font-bold text-success match-anim"; 
    } else { 
      tg.textContent = `SELISIH ${prefix}${fmt(Math.abs(diff))}`; 
      tg.className = "text-center font-bold text-error miss-anim"; 
    }
  };
  
  tag("vr-cbm", "vs-cbm", aCbm, tCbm, tCbm > 0, "");
  tag("vr-freight", "vs-freight", aFr, tFr, tFr > 0);
  tag("vr-cfr", "vs-cfr", aCfr, tCfr, tCfr > 0);
  tag("vr-fob", "vs-fob", aFob, tFob, tCfr > 0 || tFr > 0);

  // Rate × CBM vs Global Freight warning
  const warnEl = $("g-rate-warning");
  const warnText = $("g-rate-warning-text");
  if (warnEl && warnText) {
    const calcFr = R2(R2(aCbm) * pf(gPrice.value));
    const gFr = pf(gFreight.value);
    const showRateWarn = gFr > 0 && aCbm > 0 && Math.abs(calcFr - gFr) > 1;
    if (showRateWarn) {
      warnEl.classList.remove("hidden");
      warnText.innerHTML = `Rate×CBM = $${fmt(calcFr)} ≠ Freight $${fmt(gFr)} (selisih $${fmt(Math.abs(calcFr - gFr))}). Effective rate: $${fmt(R2(gFr / aCbm))}/CBM`;
    } else {
      warnEl.classList.add("hidden");
    }
  }

  // Incoterms® 2020 validation (per-item + global)
  const warnContainer = $("validation-warnings");
  if (warnContainer) {
    const globalWarnings = validateIncoterms(tCfr, tFob, tFr);
    cfrFobAll.forEach((r, idx) => {
      if (r.cfr > 0 || r.fob !== 0 || r.freight !== 0) {
        const itemW = validateIncoterms(r.cfr, r.fob, r.freight);
        itemW.forEach((w) =>
          globalWarnings.push({ level: w.level, msg: `Item ${state.items[idx]?.itemNo || idx + 1}: ${w.msg}` })
        );
      }
    });
    
    warnContainer.innerHTML = "";
    if (globalWarnings.length > 0) {
      warnContainer.innerHTML = globalWarnings
        .map((w) => {
          const alertClass = w.level === "error" ? "alert-error" : "alert-warning";
          const icon = w.level === "error" ? "circle-xmark" : "triangle-exclamation";
          return `<div class="alert ${alertClass} shadow-sm py-2"><i class="fa-solid fa-${icon}"></i> <span>${w.msg}</span></div>`;
        })
        .join("");
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
