// ═══════════════════════════════════════════════════════════════
//  modal.js — Modal system (alert, confirm, dus, transfer)
// ═══════════════════════════════════════════════════════════════

import { pi, getCbmPerUnit } from "./calc.js";
import { state, buildAllocMap, buildTplMap } from "./state.js";

const $ = (id) => document.getElementById(id);

// ── Alert / Confirm ──

const mOverlay = $("modal-overlay"),
  mIcon = $("modal-icon"),
  mMsg = $("modal-message"),
  mActions = $("modal-actions");

export function showAlert(msg, type = "success") {
  const icons = {
    success: "fa-circle-check",
    error: "fa-circle-xmark",
    warning: "fa-triangle-exclamation",
    info: "fa-circle-info",
  };
  mIcon.className = `modal-icon ${type}`;
  mIcon.innerHTML = `<i class="fa-solid ${icons[type] || icons.success}"></i>`;
  mMsg.textContent = msg;
  mActions.innerHTML = `<button class="btn modal-btn-ok" id="modal-ok">OK</button>`;
  mOverlay.classList.add("active");
  return new Promise((resolve) => {
    $("modal-ok").addEventListener(
      "click",
      () => {
        mOverlay.classList.remove("active");
        resolve();
      },
      { once: true },
    );
  });
}

export function showConfirm(msg) {
  mIcon.className = "modal-icon warning";
  mIcon.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
  mMsg.textContent = msg;
  mActions.innerHTML = `<button class="btn modal-btn-cancel" id="modal-no">Batal</button><button class="btn modal-btn-ok" id="modal-yes">Ya, Lanjut</button>`;
  mOverlay.classList.add("active");
  return new Promise((resolve) => {
    $("modal-no").addEventListener(
      "click",
      () => {
        mOverlay.classList.remove("active");
        resolve(false);
      },
      { once: true },
    );
    $("modal-yes").addEventListener(
      "click",
      () => {
        mOverlay.classList.remove("active");
        resolve(true);
      },
      { once: true },
    );
  });
}

// ── Dus Modal ──

const dusOverlay = $("modal-dus-overlay"),
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
  const tp = state.templates[ti],
    qty = pi(dusQty.value);
  const allocMap = buildAllocMap();
  const sisa = tp.qtyTotal - (allocMap.get(tp.id) || 0);
  const cbmPU = getCbmPerUnit(tp);
  dusPrev.innerHTML =
    qty > 0
      ? `<i class="fa fa-box" style="margin-right:4px"></i> ${qty} × ${cbmPU.toFixed(6)} = <b>${(cbmPU * qty).toFixed(4)} CBM</b> &nbsp;(sisa: ${sisa})`
      : "Isi jumlah qty";
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
  dusOverlay.classList.add("active");
  return new Promise((resolve) => {
    dusResolver = resolve;
  });
}

dusSel.addEventListener("change", updateDusPreview);
dusQty.addEventListener("input", updateDusPreview);
$("modal-dus-cancel").addEventListener("click", () => {
  dusOverlay.classList.remove("active");
  if (dusResolver) {
    dusResolver(null);
    dusResolver = null;
  }
});
$("modal-dus-ok").addEventListener("click", () => {
  const ti = pi(dusSel.value);
  const qty = pi(dusQty.value);
  dusOverlay.classList.remove("active");
  if (dusResolver) {
    dusResolver({ ti, qty });
    dusResolver = null;
  }
});

// ── Transfer Modal ──

const xfOverlay = $("modal-transfer-overlay"),
  xfQtyEl = $("transfer-qty"),
  xfToEl = $("transfer-to"),
  xfPrev = $("transfer-preview");
let xfResolver = null,
  xfCtx = null;

function updateTransferPreview() {
  if (!xfCtx) return;
  const qty = pi(xfQtyEl.value);
  const cbmPU = getCbmPerUnit(xfCtx.tp);
  if (qty > 0 && qty <= xfCtx.maxQty) {
    const toIdx = pi(xfToEl.value);
    const toItem = state.items[toIdx];
    xfPrev.innerHTML = `<i class="fa fa-arrow-right" style="margin-right:4px"></i> ${qty} krt (${(cbmPU * qty).toFixed(4)} CBM) → <b>Item ${toItem ? toItem.itemNo : "?"}</b>`;
  } else {
    xfPrev.textContent =
      qty > xfCtx.maxQty ? `Max: ${xfCtx.maxQty}` : "Isi jumlah";
  }
}

/** Show transfer modal. Returns {fromIdx, ci, tplId, qty, toIdx} or false. */
export function showTransferModal(fromIdx, ci) {
  const item = state.items[fromIdx],
    c = item.cartons[ci];
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
  xfOverlay.classList.add("active");
  return new Promise((resolve) => {
    xfResolver = resolve;
  });
}

xfQtyEl.addEventListener("input", updateTransferPreview);
xfToEl.addEventListener("change", updateTransferPreview);
$("transfer-cancel").addEventListener("click", () => {
  xfOverlay.classList.remove("active");
  if (xfResolver) {
    xfResolver(false);
    xfResolver = null;
  }
});
$("transfer-ok").addEventListener("click", () => {
  if (!xfCtx) return;
  const qty = pi(xfQtyEl.value);
  const toIdx = pi(xfToEl.value);
  if (qty <= 0 || qty > xfCtx.maxQty || toIdx === xfCtx.fromIdx) return;
  xfOverlay.classList.remove("active");
  if (xfResolver) {
    xfResolver({
      fromIdx: xfCtx.fromIdx,
      ci: xfCtx.ci,
      tplId: xfCtx.tplId,
      qty,
      toIdx,
    });
    xfResolver = null;
  }
});
