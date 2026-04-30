// ═══════════════════════════════════════════════════════════════
//  app.js — Entry point: event wiring + initialization
// ═══════════════════════════════════════════════════════════════

import { R2, pf, pi, fmt, calcGlobalTriad, recalcTemplate } from "./calc.js";
import {
  state, buildTplMap, buildAllocMap,
  createTemplate, createItem,
  loadState, resetState,
} from "./state.js";
import { showAlert, showConfirm, showDusModal, showTransferModal } from "./modal.js";
import {
  renderAll, renderTemplates, renderItems, renderValidation,
  getGlobalInputs, buildResultText,
  setGlobalLastEdited, getGlobalLastEdited,
} from "./render.js";

const $ = (id) => document.getElementById(id);

// ══════════════════════════════════════════════
//  INPUT SANITIZATION (STRICT NUMBER)
// ══════════════════════════════════════════════
document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.tagName === "INPUT") {
    if (t.type === "number") {
      // Hanya izinkan angka 0-9
      t.value = t.value.replace(/[^0-9]/g, "");
    } else if (t.inputMode === "decimal") {
      // Izinkan angka, titik, dan koma
      t.value = t.value.replace(/[^0-9.,]/g, "");
    }
  }
});

// ══════════════════════════════════════════════
//  GLOBAL PANEL
// ══════════════════════════════════════════════
const gPrice = $("g-price"),
  gFreight = $("g-freight"),
  gCfr = $("g-cfr"),
  gFob = $("g-fob"),
  gHint = $("g-calc-hint");

function updateGlobal() {
  const fr = pf(gFreight.value),
    cfr = pf(gCfr.value),
    fob = pf(gFob.value);
  const result = calcGlobalTriad(
    fr, cfr, fob,
    gFreight.value !== "", gCfr.value !== "", gFob.value !== "",
    getGlobalLastEdited(),
  );
  if (result) {
    const labels = { fob: "FOB", cfr: "CFR", freight: "Freight" };
    const colors = { fob: "text-success", cfr: "text-info", freight: "text-warning" };
    const inputs = { fob: gFob, cfr: gCfr, freight: gFreight };
    inputs[result.field].value = result.value;
    gHint.innerHTML = `<i class="fa-solid fa-circle-check ${colors[result.field]}"></i> <span class="font-bold">Terhitung Otomatis:</span> ${labels[result.field]} = $${fmt(result.value)}`;
    gHint.className = "flex items-center gap-2 p-3 mt-4 bg-base-200/50 rounded-box text-sm border border-base-300";
  } else {
    gHint.innerHTML = `<i class="fa-solid fa-circle-info text-base-content/50"></i> <span>Isi 2 dari 3 field (Freight, CFR, FOB) — field ke-3 otomatis terhitung.</span>`;
    gHint.className = "flex items-center gap-2 p-3 mt-4 bg-base-200/50 rounded-box text-sm border border-base-300 text-base-content/70";
  }
}

gFreight.addEventListener("input", () => { setGlobalLastEdited("freight"); updateGlobal(); renderAll(); });
gCfr.addEventListener("input", () => { setGlobalLastEdited("cfr"); updateGlobal(); renderAll(); });
gFob.addEventListener("input", () => { setGlobalLastEdited("fob"); updateGlobal(); renderAll(); });
gPrice.addEventListener("input", () => renderAll());

// ══════════════════════════════════════════════
//  TEMPLATE FORM
// ══════════════════════════════════════════════
const tfP = $("tf-p"), tfL = $("tf-l"), tfT = $("tf-t"),
  tfQty = $("tf-qty"), tfCbm = $("tf-cbm"), tfPrev = $("tf-cbm-preview");
let lastEdited = "";

function getCbmPerUnitForm() {
  const p = pf(tfP.value), l = pf(tfL.value), t = pf(tfT.value);
  return p > 0 && l > 0 && t > 0 ? (p * l * t) / 1_000_000 : 0;
}

function updateFormPreview() {
  const cbmPU = getCbmPerUnitForm();
  const qty = pi(tfQty.value), cbm = pf(tfCbm.value);
  if (cbmPU <= 0) { tfPrev.textContent = "Isi P, L, T dulu"; tfPrev.style.color = ""; return; }
  if (lastEdited === "qty" && qty > 0) {
    const calc = R2(cbmPU * qty);
    tfCbm.value = calc;
    tfPrev.textContent = `${cbmPU.toFixed(6)} × ${qty} = ${calc.toFixed(2)} CBM`;
    tfPrev.style.color = "var(--green)";
  } else if (lastEdited === "cbm" && cbm > 0) {
    const calc = Math.round(cbm / cbmPU);
    tfQty.value = calc;
    tfPrev.textContent = `${cbm.toFixed(2)} ÷ ${cbmPU.toFixed(6)} = ${calc} karton`;
    tfPrev.style.color = "var(--blue)";
  } else if (lastEdited === "cbm") {
    tfPrev.textContent = `CBM/unit: ${cbmPU.toFixed(6)} — Mengetik CBM...`;
    tfPrev.style.color = "";
  } else if (qty > 0) {
    const calc = R2(cbmPU * qty);
    tfCbm.value = calc;
    tfPrev.textContent = `${cbmPU.toFixed(6)} × ${qty} = ${calc.toFixed(2)} CBM`;
    tfPrev.style.color = "var(--green)";
  } else {
    tfPrev.textContent = `CBM/unit: ${cbmPU.toFixed(6)} — Isi Qty atau CBM`;
    tfPrev.style.color = "";
  }
}

tfQty.addEventListener("input", () => { lastEdited = "qty"; updateFormPreview(); });
tfCbm.addEventListener("input", () => { lastEdited = "cbm"; updateFormPreview(); });
[tfP, tfL, tfT].forEach((el) => el.addEventListener("input", updateFormPreview));

$("btn-add-tpl").addEventListener("click", () => {
  const name = $("tf-name").value.trim() || `Dus ${state.templates.length + 1}`;
  const p = pf(tfP.value), l = pf(tfL.value), t = pf(tfT.value);
  const qty = pi(tfQty.value), cbm = pf(tfCbm.value);
  if (!p || !l || !t) { showAlert("Isi P, L, dan T!", "error"); return; }
  if (!qty && !cbm) { showAlert("Isi Qty Karton atau CBM Total!", "error"); return; }
  const cbmPU = (p * l * t) / 1_000_000;
  const finalQty = qty || Math.round(cbm / cbmPU);
  const finalCbm = lastEdited === "cbm" && cbm > 0 ? cbm : R2(cbmPU * finalQty);
  state.templates.push(createTemplate(name, p, l, t, finalCbm, finalQty));
  lastEdited = "";
  renderAll();
});

// Template table: delete + inline edit (event delegation)
$("tpl-body").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-del-tpl]");
  if (btn) { state.templates.splice(+btn.dataset.delTpl, 1); renderAll(); }
});

$("tpl-body").addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset.tplName !== undefined) {
    state.templates[+t.dataset.tplName].name = t.value.trim() || `Dus ${+t.dataset.tplName + 1}`;
  } else if (t.dataset.tplP !== undefined) {
    state.templates[+t.dataset.tplP].p = pf(t.value);
    recalcTemplate(state.templates[+t.dataset.tplP]);
    renderAll();
  } else if (t.dataset.tplL !== undefined) {
    state.templates[+t.dataset.tplL].l = pf(t.value);
    recalcTemplate(state.templates[+t.dataset.tplL]);
    renderAll();
  } else if (t.dataset.tplT !== undefined) {
    state.templates[+t.dataset.tplT].t = pf(t.value);
    recalcTemplate(state.templates[+t.dataset.tplT]);
    renderAll();
  } else if (t.dataset.tplQty !== undefined) {
    const i = +t.dataset.tplQty;
    state.templates[i].qtyTotal = pi(t.value);
    state.templates[i].cbmTarget = R2(state.templates[i].cbmPerUnit * state.templates[i].qtyTotal);
    renderAll();
  } else if (t.dataset.tplCbm !== undefined) {
    const i = +t.dataset.tplCbm;
    state.templates[i].cbmTarget = pf(t.value);
    if (state.templates[i].cbmPerUnit > 0)
      state.templates[i].qtyTotal = Math.round(state.templates[i].cbmTarget / state.templates[i].cbmPerUnit);
    renderAll();
  }
});

// ══════════════════════════════════════════════
//  ITEMS PANEL
// ══════════════════════════════════════════════
$("btn-add-item").addEventListener("click", () => {
  state.items.push(createItem(state.items.length + 1));
  renderAll();
});

// Items: change events (target qty, CFR, FOB inputs)
$("items-wrap").addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset.tq !== undefined) {
    state.items[+t.dataset.tq].targetQty = pi(t.value);
    renderAll();
  } else if (t.dataset.cfr !== undefined) {
    const i = +t.dataset.cfr;
    state.items[i].cfrInput = pf(t.value);
    state.items[i].lastItemEdited = "cfr";
    renderAll();
  } else if (t.dataset.fob !== undefined) {
    const i = +t.dataset.fob;
    state.items[i].fobInput = pf(t.value);
    state.items[i].lastItemEdited = "fob";
    renderAll();
  }
});

// Items: click events (delete, add carton, transfer)
$("items-wrap").addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  if (btn.dataset.delItem !== undefined) {
    state.items.splice(+btn.dataset.delItem, 1);
    state.items.forEach((it, i) => (it.itemNo = i + 1));
    renderAll();
  } else if (btn.dataset.delCart !== undefined) {
    const [a, c] = btn.dataset.delCart.split(",").map(Number);
    state.items[a].cartons.splice(c, 1);
    renderAll();
  } else if (btn.dataset.addCart !== undefined) {
    await manualAddDus(+btn.dataset.addCart);
  } else if (btn.dataset.xfer !== undefined) {
    const [a, c] = btn.dataset.xfer.split(",").map(Number);
    const result = await showTransferModal(a, c);
    if (result) {
      // Execute transfer
      const srcCarton = state.items[result.fromIdx].cartons[result.ci];
      srcCarton.qty -= result.qty;
      if (srcCarton.qty <= 0) state.items[result.fromIdx].cartons.splice(result.ci, 1);
      const dest = state.items[result.toIdx];
      const existing = dest.cartons.find((c) => c.tplId === result.tplId);
      if (existing) existing.qty += result.qty;
      else dest.cartons.push({ tplId: result.tplId, qty: result.qty });
      renderAll();
    }
  }
});

async function manualAddDus(idx) {
  if (!state.templates.length) { showAlert("Buat Template dulu!", "error"); return; }
  const allocMap = buildAllocMap();
  const result = await showDusModal(state.templates, allocMap);
  if (!result || result.qty <= 0) return;
  const { ti, qty } = result;
  if (ti < 0 || ti >= state.templates.length) return;
  state.items[idx].cartons.push({ tplId: state.templates[ti].id, qty });
  renderAll();
}

// ══════════════════════════════════════════════
//  AUTO-SOLVE
// ══════════════════════════════════════════════
$("btn-auto-solve").addEventListener("click", async () => {
  if (!state.templates.length || !state.items.length) {
    showAlert("Buat Template dan Item dulu!", "error"); return;
  }
  const totT = state.items.reduce((s, it) => s + it.targetQty, 0),
    totA = state.templates.reduce((s, tp) => s + tp.qtyTotal, 0);
  if (!totT) { showAlert("Isi Target Karton di setiap Item!", "error"); return; }
  if (totT !== totA && !(await showConfirm(`⚠️ Target (${totT}) ≠ Template (${totA}). Lanjut?`))) return;

  // Group templates by P dimension
  const groups = new Map();
  state.templates.forEach((tp) => {
    const key = tp.p;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ tplId: tp.id, avail: tp.qtyTotal, t: tp.t });
  });
  const groupArr = [...groups.values()];
  groupArr.forEach((pool) => pool.sort((a, b) => b.t - a.t));

  const sortedItems = state.items
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => b.item.targetQty - a.item.targetQty);

  // Only clear items that have target
  state.items.forEach((it) => { if (it.targetQty > 0) it.cartons = []; });

  let gIdx = 0;
  sortedItems.forEach(({ item }) => {
    let need = item.targetQty;
    while (need > 0 && gIdx < groupArr.length) {
      const pool = groupArr[gIdx];
      for (const sl of pool) {
        if (need <= 0) break;
        if (sl.avail <= 0) continue;
        const take = Math.min(need, sl.avail);
        item.cartons.push({ tplId: sl.tplId, qty: take });
        sl.avail -= take;
        need -= take;
      }
      if (pool.every((sl) => sl.avail <= 0)) gIdx++;
      else break;
    }
  });

  renderAll();
  const left = groupArr.reduce((s, pool) => s + pool.reduce((s2, sl) => s2 + sl.avail, 0), 0);
  showAlert(
    left === 0
      ? `✅ Semua karton teralokasi! (${groupArr.length} group P)`
      : `⚠️ Sisa ${left} karton tidak teralokasi.`,
    left === 0 ? "success" : "warning",
  );
});

// ══════════════════════════════════════════════
//  RESET
// ══════════════════════════════════════════════
const btnReset = $("btn-reset");
if (btnReset) {
  btnReset.addEventListener("click", async () => {
    if (!(await showConfirm("⚠️ Reset semua data? Semua template, item, dan nilai global akan dihapus."))) return;
    resetState();
    gFreight.value = "";
    gCfr.value = "";
    gFob.value = "";
    gPrice.value = "85";
    setGlobalLastEdited("");
    updateGlobal();
    renderAll();
  });
}

// ══════════════════════════════════════════════
//  THEME TOGGLE
// ══════════════════════════════════════════════
const THEME_KEY = "kalkulatorPEB_theme";
const themeController = document.querySelector(".theme-controller");

if (themeController) {
  // Load saved theme (default to dracula)
  const savedTheme = localStorage.getItem(THEME_KEY) || "dracula";
  document.documentElement.setAttribute("data-theme", savedTheme);
  themeController.checked = savedTheme === "light";

  // Listen for changes
  themeController.addEventListener("change", (e) => {
    const nextTheme = e.target.checked ? "light" : "dracula";
    document.documentElement.setAttribute("data-theme", nextTheme);
    localStorage.setItem(THEME_KEY, nextTheme);
  });
}

// ══════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════
const savedGlobal = loadState();
if (savedGlobal) {
  gPrice.value = savedGlobal.price || "85";
  gFreight.value = savedGlobal.freight || "";
  gCfr.value = savedGlobal.cfr || "";
  gFob.value = savedGlobal.fob || "";
  setGlobalLastEdited(savedGlobal.lastEdited || "");
}
updateGlobal();
renderAll();
