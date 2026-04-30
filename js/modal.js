// ═══════════════════════════════════════════════════════════════
//  modal.js — Modal system (alert, confirm, dus, transfer)
//  Refactored to use DaisyUI <dialog>
// ═══════════════════════════════════════════════════════════════

import { pi, getCbmPerUnit } from "./calc.js";
import { state, buildAllocMap, buildTplMap } from "./state.js";

const $ = (id) => document.getElementById(id);

// ── Alert / Confirm ──

const mDialog = $("modal-alert"),
  mIcon = $("modal-icon"),
  mMsg = $("modal-message"),
  mActions = $("modal-actions");

export function showAlert(msg, type = "success") {
  const icons = {
    success: '<i class="fa-solid fa-circle-check text-success"></i>',
    error: '<i class="fa-solid fa-circle-xmark text-error"></i>',
    warning: '<i class="fa-solid fa-triangle-exclamation text-warning"></i>',
    info: '<i class="fa-solid fa-circle-info text-info"></i>',
  };
  mIcon.innerHTML = icons[type] || icons.success;
  mMsg.textContent = msg;
  mActions.innerHTML = `<button class="btn btn-primary" id="modal-ok">OK</button>`;
  
  mDialog.showModal();
  
  return new Promise((resolve) => {
    $("modal-ok").addEventListener("click", () => {
      mDialog.close();
      resolve();
    }, { once: true });
  });
}

export function showConfirm(msg) {
  mIcon.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-warning"></i>';
  mMsg.textContent = msg;
  mActions.innerHTML = `
    <button class="btn btn-ghost" id="modal-no">Batal</button>
    <button class="btn btn-primary" id="modal-yes">Ya, Lanjut</button>
  `;
  
  mDialog.showModal();
  
  return new Promise((resolve) => {
    $("modal-no").addEventListener("click", () => {
      mDialog.close();
      resolve(false);
    }, { once: true });
    
    $("modal-yes").addEventListener("click", () => {
      mDialog.close();
      resolve(true);
    }, { once: true });
  });
}

// ── Dus Modal ──

const dusDialog = $("modal-dus"),
  dusSel = $("modal-dus-select"),
  dusQty = $("modal-dus-qty"),
  dusPrev = $("modal-dus-preview");
let dusResolver = null;

function updateDusPreview() {
  const ti = pi(dusSel.value);
  if (ti < 0 || ti >= state.templates.length) {
    dusPrev.textContent = "—";
    return;
  }
  const tp = state.templates[ti], qty = pi(dusQty.value);
  const allocMap = buildAllocMap();
  const sisa = tp.qtyTotal - (allocMap.get(tp.id) || 0);
  const cbmPU = getCbmPerUnit(tp);
  
  if (qty > 0) {
    dusPrev.innerHTML = `<i class="fa fa-box mr-1 text-primary"></i> ${qty} × ${cbmPU.toFixed(6)} = <b>${(cbmPU * qty).toFixed(4)} CBM</b> <span class="opacity-70 ml-2">(sisa stok: ${sisa})</span>`;
    dusPrev.className = "alert shadow-sm text-sm bg-base-200 text-base-content";
  } else {
    dusPrev.textContent = "Isi jumlah qty dengan benar";
    dusPrev.className = "alert alert-error shadow-sm text-sm";
  }
}

/** Show modal to pick template + qty. Returns {ti, qty} or null. */
export function showDusModal(templatesList, allocMap) {
  dusSel.innerHTML = "";
  templatesList.forEach((t, i) => {
    const sisa = t.qtyTotal - (allocMap.get(t.id) || 0);
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = `${t.name} (${t.p}×${t.l}×${t.t}) — Sisa: ${sisa}`;
    dusSel.appendChild(opt);
  });
  dusQty.value = 1;
  updateDusPreview();
  
  dusDialog.showModal();
  
  return new Promise((resolve) => {
    dusResolver = resolve;
  });
}

dusSel.addEventListener("change", updateDusPreview);
dusQty.addEventListener("input", updateDusPreview);

$("modal-dus-cancel").addEventListener("click", () => {
  dusDialog.close();
  if (dusResolver) { dusResolver(null); dusResolver = null; }
});

$("modal-dus-ok").addEventListener("click", () => {
  const ti = pi(dusSel.value);
  const qty = pi(dusQty.value);
  dusDialog.close();
  if (dusResolver) { dusResolver({ ti, qty }); dusResolver = null; }
});

// ── Transfer Modal ──

const xfDialog = $("modal-transfer"),
  xfQtyEl = $("transfer-qty"),
  xfToEl = $("transfer-to"),
  xfPrev = $("transfer-preview");
let xfResolver = null, xfCtx = null;

function updateTransferPreview() {
  if (!xfCtx) return;
  const qty = pi(xfQtyEl.value);
  const cbmPU = getCbmPerUnit(xfCtx.tp);
  if (qty > 0 && qty <= xfCtx.maxQty) {
    const toIdx = pi(xfToEl.value);
    const toItem = state.items[toIdx];
    xfPrev.innerHTML = `<i class="fa fa-arrow-right text-warning mr-1"></i> ${qty} krt (${(cbmPU * qty).toFixed(4)} CBM) &rarr; <b class="text-primary">Item ${toItem ? toItem.itemNo : "?"}</b>`;
  } else {
    xfPrev.textContent = qty > xfCtx.maxQty ? `Maximal transfer: ${xfCtx.maxQty}` : "Isi jumlah dengan benar";
  }
}

/** Show transfer modal. Returns {fromIdx, ci, tplId, qty, toIdx} or false. */
export function showTransferModal(fromIdx, ci) {
  const item = state.items[fromIdx], c = item.cartons[ci];
  const tp = buildTplMap().get(c.tplId);
  if (!tp) return Promise.resolve(false);
  xfCtx = { fromIdx, ci, tplId: c.tplId, maxQty: c.qty, tp };

  $("transfer-from-label").textContent = `Item ${item.itemNo}`;
  $("transfer-karton-label").textContent = `${tp.name} (${tp.p}×${tp.l}×${tp.t}) — ${c.qty} krt`;
  xfQtyEl.value = 1;
  xfQtyEl.max = c.qty;

  xfToEl.innerHTML = "";
  state.items.forEach((it, i) => {
    if (i === fromIdx) return;
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = `Item ${it.itemNo} (target: ${it.targetQty})`;
    xfToEl.appendChild(opt);
  });

  updateTransferPreview();
  xfDialog.showModal();
  
  return new Promise((resolve) => {
    xfResolver = resolve;
  });
}

xfQtyEl.addEventListener("input", updateTransferPreview);
xfToEl.addEventListener("change", updateTransferPreview);

$("transfer-cancel").addEventListener("click", () => {
  xfDialog.close();
  if (xfResolver) { xfResolver(false); xfResolver = null; }
});

$("transfer-ok").addEventListener("click", () => {
  if (!xfCtx) return;
  const qty = pi(xfQtyEl.value);
  const toIdx = pi(xfToEl.value);
  if (qty <= 0 || qty > xfCtx.maxQty || toIdx === xfCtx.fromIdx) return;
  
  xfDialog.close();
  if (xfResolver) {
    xfResolver({ fromIdx: xfCtx.fromIdx, ci: xfCtx.ci, tplId: xfCtx.tplId, qty, toIdx });
    xfResolver = null;
  }
});
