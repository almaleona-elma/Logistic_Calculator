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

const statusBadge = (type, label, icon = "fa-check") =>
  `<span class="status-badge status-badge-${type}"><i class="fa-solid ${icon}"></i><span>${label}</span></span>`;

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
        ? statusBadge("success", "Pas")
        : si > 0 
        ? statusBadge("neutral", `${si} Sisa`, "fa-box-open")
        : statusBadge("error", `${Math.abs(si)} Lebih`, "fa-arrow-trend-up");
        
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <input type="text" value="${tp.name}" class="input input-sm input-ghost w-full max-w-[120px] font-bold tpl-edit tpl-edit-name" data-tpl-name="${i}">
      </td>
      <td>
        <div class="flex items-center gap-1 text-sm">
          <input type="text" inputmode="decimal" value="${tp.p}" class="input input-sm input-bordered w-14 p-1 text-center font-mono font-bold text-sm tpl-edit tpl-edit-dim" data-tpl-p="${i}"> ×
          <input type="text" inputmode="decimal" value="${tp.l}" class="input input-sm input-bordered w-14 p-1 text-center font-mono font-bold text-sm tpl-edit tpl-edit-dim" data-tpl-l="${i}"> ×
          <input type="text" inputmode="decimal" value="${tp.t}" class="input input-sm input-bordered w-14 p-1 text-center font-mono font-bold text-sm tpl-edit tpl-edit-dim" data-tpl-t="${i}">
        </div>
      </td>
      <td class="font-mono font-bold text-sm">${tp.cbmPerUnit.toFixed(6)}</td>
      <td><input type="text" inputmode="decimal" value="${tp.cbmTarget.toFixed(2)}" class="input input-sm input-bordered w-20 text-right font-mono font-bold text-sm tpl-edit" data-tpl-cbm="${i}"></td>
      <td><input type="number" min="0" value="${tp.qtyTotal}" class="input input-sm input-bordered w-20 text-right font-mono font-bold text-sm tpl-edit" data-tpl-qty="${i}"></td>
      <td class="font-bold font-mono text-sm">${al}</td>
      <td class="text-sm">${chip}</td>
      <td class="text-center"><button class="btn btn-square btn-sm bg-error/20 text-error hover:bg-error/40 border-none transition-colors" data-del-tpl="${i}" title="Hapus Template"><i class="fa fa-trash"></i></button></td>
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
          <td class="text-sm font-mono font-bold">${tp.p}×${tp.l}×${tp.t}</td>
          <td class="font-bold font-mono text-sm">${c.qty}</td>
          <td class="font-bold font-mono text-sm">${(cbmPU * c.qty).toFixed(4)}</td>
          <td class="text-right space-x-1">
            <button class="btn btn-square btn-sm bg-warning/20 text-warning hover:bg-warning/40 border-none transition-colors" data-xfer="${idx},${ci}" title="Transfer Kardus"><i class="fa fa-arrow-right-arrow-left"></i></button>
            <button class="btn btn-square btn-sm bg-error/20 text-error hover:bg-error/40 border-none transition-colors" data-del-cart="${idx},${ci}" title="Hapus Kardus"><i class="fa fa-trash"></i></button>
          </td>
        </tr>`;
    });
    const cbm = R2(rawCbm);
    const { cfr, fob, freight } = cfrFobAll[idx];

    let qS = "";
    if (item.targetQty > 0) {
      if (totQty === item.targetQty)
        qS = statusBadge("success", "Pas");
      else if (totQty < item.targetQty)
        qS = statusBadge("warning", `Kurang ${item.targetQty - totQty}`, "fa-triangle-exclamation");
      else
        qS = statusBadge("error", `Lebih ${totQty - item.targetQty}`, "fa-arrow-trend-up");
    }

    const div = document.createElement("div");
    div.className = "card bg-base-200 border border-base-300 shadow-sm h-full flex flex-col";
    div.innerHTML = `
      <div class="card-body p-4 lg:p-5 flex flex-col h-full flex-1">
        <div class="flex justify-between items-start mb-4 border-b border-base-300 pb-3 gap-2">
          <div class="flex flex-col gap-2">
            <h3 class="font-bold text-lg text-primary leading-tight mt-1">Item No. ${item.itemNo}</h3>
            <div class="flex flex-wrap items-center gap-2 mt-1">
              <span class="text-sm opacity-70 font-medium">Target Qty:</span>
              <input type="number" value="${item.targetQty || ""}" placeholder="0" data-tq="${idx}" min="0" class="input input-bordered input-sm w-20 text-center font-mono font-bold">
            </div>
          </div>
          <div class="flex flex-col items-end gap-2">
            <div class="h-6 flex items-center">${qS}</div>
            <div class="flex gap-2 mt-1">
              <button class="btn btn-primary btn-sm w-8 sm:w-auto px-0 sm:px-3" data-add-cart="${idx}" title="Tambah Karton"><i class="fa fa-plus"></i> <span class="hidden sm:inline ml-1">Karton</span></button>
              <button class="btn btn-error btn-sm w-8 sm:w-auto px-0 sm:px-3 text-base-100" data-del-item="${idx}" title="Hapus Item"><i class="fa fa-trash"></i> <span class="hidden sm:inline ml-1">Hapus</span></button>
            </div>
          </div>
        </div>
        
        <div class="overflow-x-auto mb-4 bg-base-100 rounded-box border border-base-300 flex-1">
          <table class="table table-sm w-full whitespace-nowrap">
            <thead class="bg-base-200 text-sm text-base-content">
              <tr><th>Dimensi (cm)</th><th>Qty</th><th>CBM</th><th class="text-right">Aksi</th></tr>
            </thead>
            <tbody>
              ${cRows || '<tr><td colspan="4" class="text-center italic text-base-content/50 py-3">Belum ada karton.</td></tr>'}
            </tbody>
          </table>
        </div>
        
        <div class="bg-base-100 rounded-box border border-base-300 overflow-hidden shadow-sm mt-auto">
          <div class="grid grid-cols-3 divide-x divide-base-300 border-b border-base-300">
            <div class="p-3 text-center">
              <div class="text-[10px] font-bold uppercase tracking-widest opacity-50">Karton</div>
              <div class="text-base sm:text-lg font-mono font-bold mt-1">${totQty}</div>
            </div>
            <div class="p-3 text-center">
              <div class="text-[10px] font-bold uppercase tracking-widest opacity-50">CBM Total</div>
              <div class="text-base sm:text-lg font-mono font-bold text-primary mt-1">${cbm.toFixed(2)}</div>
            </div>
            <div class="p-3 text-center">
              <div class="text-[10px] font-bold uppercase tracking-widest opacity-50">Freight</div>
              <div class="text-base sm:text-lg font-bold font-mono mt-1">${fmt(freight)}</div>
            </div>
          </div>
          <div class="grid grid-cols-2 divide-x divide-base-300 bg-base-200/30">
            <div class="p-3 sm:p-4">
              <div class="text-[10px] font-bold uppercase tracking-widest opacity-50 mb-2">Input CFR ($)</div>
              <input type="text" value="${cfr || ""}" placeholder="0.00" inputmode="decimal" data-cfr="${idx}" class="input input-sm sm:input-md input-bordered w-full font-mono font-bold text-base bg-base-100 focus-within:border-primary">
            </div>
            <div class="p-3 sm:p-4">
              <div class="text-[10px] font-bold uppercase tracking-widest opacity-50 mb-2">Input FOB ($)</div>
              <input type="text" value="${fob || ""}" placeholder="0.00" inputmode="decimal" data-fob="${idx}" class="input input-sm sm:input-md input-bordered w-full font-mono font-bold text-base bg-base-100 focus-within:border-primary">
            </div>
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
    tg.classList.remove("match-anim", "miss-anim");
    if (!has) { tg.innerHTML = '<span class="status-badge status-badge-muted"><span>—</span></span>'; return; }
    const diff = R2(a - t);
    if (diff === 0) { 
      tg.innerHTML = statusBadge("success", "Match"); 
      tg.classList.add("match-anim");
    } else { 
      tg.innerHTML = statusBadge("error", `${prefix}${fmt(Math.abs(diff))}`, "fa-not-equal"); 
      tg.classList.add("miss-anim");
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
