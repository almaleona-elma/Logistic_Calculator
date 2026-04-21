document.addEventListener('DOMContentLoaded', () => {
    // ══════════════════════════════════════════════
    //  STATE & HELPERS
    // ══════════════════════════════════════════════
    let templates = [];
    let items = [];

    const R2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
    const fmt = (n, d = 2) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
    const $ = id => document.getElementById(id);
    const pf = v => parseFloat(String(v).replace(',', '.')) || 0; // handle comma decimal
    const pi = v => parseInt(v) || 0;   // shorthand parseInt-or-0

    /** Build Map<tplId, template> for O(1) lookups */
    function buildTplMap() {
        const m = new Map();
        templates.forEach(tp => m.set(tp.id, tp));
        return m;
    }

    /** Compute allocated qty per template in a single pass */
    function buildAllocMap() {
        const m = new Map();
        items.forEach(it => it.cartons.forEach(c => m.set(c.tplId, (m.get(c.tplId) || 0) + c.qty)));
        return m;
    }

    /** Bidirectional CFR ↔ FOB for a single item (used in render, validate, copy) */
    function getItemCfrFob(item, freight) {
        if (item.lastItemEdited === 'fob' && item.fobInput > 0) {
            return { cfr: R2(item.fobInput + freight), fob: item.fobInput };
        }
        if (item.cfrInput > 0) {
            return { cfr: item.cfrInput, fob: R2(item.cfrInput - freight) };
        }
        return { cfr: 0, fob: 0 };
    }

    // ══════════════════════════════════════════════
    //  LOCAL STORAGE CACHE
    // ══════════════════════════════════════════════
    const STORAGE_KEY = 'kalkulatorPEB_state';

    function saveState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                templates, items,
                global: { price: gPrice.value, freight: gFreight.value, cfr: gCfr.value, fob: gFob.value, lastEdited: gLastEdited }
            }));
        } catch (_) { /* quota */ }
    }

    function loadState() {
        try {
            const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (!s) return;
            if (s.templates) templates = s.templates;
            if (s.items) items = s.items;
            if (s.global) {
                gPrice.value = s.global.price || '85';
                gFreight.value = s.global.freight || '';
                gCfr.value = s.global.cfr || '';
                gFob.value = s.global.fob || '';
                gLastEdited = s.global.lastEdited || '';
            }
        } catch (_) { /* parse error */ }
    }

    // ══════════════════════════════════════════════
    //  GLOBAL PANEL
    // ══════════════════════════════════════════════
    const gPrice = $('g-price'), gFreight = $('g-freight'), gCfr = $('g-cfr'), gFob = $('g-fob'), gHint = $('g-calc-hint');
    let gLastEdited = '';

    function updateGlobal() {
        const fr = pf(gFreight.value), cfr = pf(gCfr.value), fob = pf(gFob.value);
        const hasFr = gFreight.value !== '', hasCfr = gCfr.value !== '', hasFob = gFob.value !== '';

        if (hasFr && hasCfr && gLastEdited !== 'fob') {
            gFob.value = R2(cfr - fr);
            gHint.textContent = `FOB = $${fmt(cfr)} − $${fmt(fr)} = $${fmt(R2(cfr - fr))}`;
            gHint.style.color = 'var(--green)';
        } else if (hasFr && hasFob && gLastEdited !== 'cfr') {
            gCfr.value = R2(fob + fr);
            gHint.textContent = `CFR = $${fmt(fob)} + $${fmt(fr)} = $${fmt(R2(fob + fr))}`;
            gHint.style.color = 'var(--blue)';
        } else if (hasCfr && hasFob && gLastEdited !== 'freight') {
            gFreight.value = R2(cfr - fob);
            gHint.textContent = `Freight = $${fmt(cfr)} − $${fmt(fob)} = $${fmt(R2(cfr - fob))}`;
            gHint.style.color = 'var(--orange)';
        } else {
            gHint.textContent = 'Isi 2 dari 3: Freight, CFR, FOB — yang ke-3 otomatis terhitung';
            gHint.style.color = '';
        }
    }

    gFreight.addEventListener('input', () => { gLastEdited = 'freight'; updateGlobal(); renderAll(); });
    gCfr.addEventListener('input', () => { gLastEdited = 'cfr'; updateGlobal(); renderAll(); });
    gFob.addEventListener('input', () => { gLastEdited = 'fob'; updateGlobal(); renderAll(); });
    gPrice.addEventListener('input', () => renderAll());
    updateGlobal();

    // ══════════════════════════════════════════════
    //  CLIPBOARD PASTE ENGINE
    // ══════════════════════════════════════════════
    let activeZone = null;

    document.querySelectorAll('.paste-drop').forEach(drop => {
        drop.addEventListener('click', () => {
            document.querySelectorAll('.paste-drop').forEach(d => d.classList.remove('active'));
            drop.classList.add('active');
            activeZone = drop.dataset.zone;
        });
        drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
        drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
        drop.addEventListener('drop', async e => {
            e.preventDefault(); drop.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (!file) return;
            const zone = drop.dataset.zone;
            file.type === 'application/pdf' ? await processZonePdf(zone, file) : await processZoneImage(zone, file);
        });
    });

    document.addEventListener('paste', async e => {
        if (!activeZone) return;
        for (const item of e.clipboardData.items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                await processZoneImage(activeZone, item.getAsFile());
                return;
            }
        }
    });

    document.querySelectorAll('.paste-zone input[type="file"]').forEach(input => {
        input.addEventListener('change', async e => {
            const file = e.target.files[0];
            if (!file) return;
            const zone = input.dataset.zone;
            (file.type === 'application/pdf' || file.name.endsWith('.pdf'))
                ? await processZonePdf(zone, file)
                : await processZoneImage(zone, file);
        });
    });

    // ══════════════════════════════════════════════
    //  OCR & PDF PROCESSING
    // ══════════════════════════════════════════════
    function setBar(zone, pct, msg) {
        $(`status-${zone}`).style.display = 'block';
        $(`bar-${zone}`).style.width = pct + '%';
        $(`msg-${zone}`).textContent = msg;
    }

    async function processZoneImage(zone, file) {
        setBar(zone, 5, 'Memulai OCR...');
        try {
            const result = await Tesseract.recognize(file, 'eng', {
                logger: m => {
                    if (m.status === 'recognizing text')
                        setBar(zone, 5 + Math.round(m.progress * 90), `OCR ${Math.round(m.progress * 100)}%`);
                }
            });
            setBar(zone, 100, '✅ OCR selesai!');
            console.log(`[${zone}] OCR Text:`, result.data.text);
            handleZoneText(zone, result.data.text);
        } catch (err) {
            setBar(zone, 100, 'Error: ' + err.message);
        }
    }

    async function processZonePdf(zone, file) {
        setBar(zone, 10, 'Membaca PDF...');
        try {
            const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
            let allText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const tc = await (await pdf.getPage(i)).getTextContent();
                allText += tc.items.map(x => x.str).join(' ') + '\n';
                setBar(zone, 10 + Math.round((i / pdf.numPages) * 80), `Halaman ${i}/${pdf.numPages}`);
            }
            console.log(`[${zone}] PDF Text:`, allText);

            if (allText.trim().length > 20) {
                setBar(zone, 100, '✅ Text-layer PDF berhasil dibaca!');
                handleZoneText(zone, allText);
            } else {
                setBar(zone, 60, 'PDF scan, menjalankan OCR halaman 1...');
                const page = await pdf.getPage(1);
                const vp = page.getViewport({ scale: 2 });
                const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
                await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
                await processZoneImage(zone, c);
            }
        } catch (err) {
            setBar(zone, 100, 'Error PDF: ' + err.message);
        }
    }

    // ══════════════════════════════════════════════
    //  ZONE TEXT HANDLERS
    // ══════════════════════════════════════════════
    let parsed = { measurement: [], items: [], cfr: [], global: {} };

    function handleZoneText(zone, text) {
        const handlers = { measurement: parseMeasurement, items: parseItems, cfr: parseCfr, global: parseGlobal };
        if (handlers[zone]) handlers[zone](text);
    }

    // ── MEASUREMENT ──
    function parseMeasurement(text) {
        parsed.measurement = [];
        for (const line of text.split('\n')) {
            let m = line.match(/(\d+[.,]\d+)\s*(?:M3|CBM|m3)\s*.*?(\d+[.,]?\d*)\s*[xX×*]\s*(\d+[.,]?\d*)\s*[xX×*]\s*(\d+[.,]?\d*)/i);
            if (!m) {
                m = line.match(/(\d+[.,]?\d*)\s*[xX×*]\s*(\d+[.,]?\d*)\s*[xX×*]\s*(\d+[.,]?\d*)\s*.*?(\d+[.,]\d+)\s*(?:M3|CBM)/i);
                if (m) m = [null, m[4], m[1], m[2], m[3]];
            }
            if (m) {
                const cbm = pf(m[1].replace(',', '.')), p = pf(m[2].replace(',', '.')),
                    l = pf(m[3].replace(',', '.')), t = pf(m[4].replace(',', '.'));
                if (cbm > 0 && p > 0 && l > 0 && t > 0) parsed.measurement.push({ p, l, t, cbm });
            }
        }

        const tb = $('tbody-measurement');
        $('results-measurement').style.display = 'block';
        $('count-measurement').textContent = parsed.measurement.length;

        if (!parsed.measurement.length) {
            tb.innerHTML = '<tr><td colspan="5" class="empty">Tidak terdeteksi. Pastikan format "P x L x T" & "M3/CBM".</td></tr>';
            return;
        }
        tb.innerHTML = '';
        parsed.measurement.forEach((r, i) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td><input type="checkbox" checked data-mi="${i}"></td><td><input type="text" inputmode="decimal" value="${r.p}" class="ocr-edit" data-mp="${i}"></td><td><input type="text" inputmode="decimal" value="${r.l}" class="ocr-edit" data-ml="${i}"></td><td><input type="text" inputmode="decimal" value="${r.t}" class="ocr-edit" data-mt="${i}"></td><td><input type="text" inputmode="decimal" value="${r.cbm}" class="ocr-edit" data-mc="${i}"></td>`;
            tb.appendChild(tr);
        });
        // Bind edit events to sync back to parsed data
        const bindOcr = (attr, key, parse = pf) => tb.querySelectorAll(`[${attr}]`).forEach(el =>
            el.addEventListener('change', e => { parsed.measurement[+e.target.dataset[key]][{ mp: 'p', ml: 'l', mt: 't', mc: 'cbm' }[key]] = parse(e.target.value); }));
        bindOcr('data-mp', 'mp'); bindOcr('data-ml', 'ml'); bindOcr('data-mt', 'mt'); bindOcr('data-mc', 'mc');
    }

    // ── ITEMS ──
    function parseItems(text) {
        parsed.items = [];
        for (const line of text.split('\n')) {
            const m = line.match(/ITEM\s*(?:NO\.?|#)?\s*(\d+)\s*[:\-=]?\s*(\d+[.,]?\d*)\s*/i);
            if (m) parsed.items.push({ itemNo: pi(m[1]), qty: Math.round(pf(m[2].replace(',', '.'))) });
        }
        const totalMatch = text.match(/NUMBER\s*OF\s*CARTON[S]?\s*[:\-=]?\s*(\d+[.,]?\d*)/i);

        const pre = $('preview-items');
        $('results-items').style.display = 'block';
        $('count-items').textContent = parsed.items.length;

        if (!parsed.items.length) {
            pre.innerHTML = '<div class="empty" style="padding:8px;font-size:12px">Tidak terdeteksi. Format: "ITEM NO 1 : 47 CARTONS"</div>';
            return;
        }
        let html = '<table class="tbl" style="font-size:12px"><thead><tr><th>Item No</th><th>Qty Karton</th></tr></thead><tbody>';
        parsed.items.forEach((it, i) => html += `<tr><td><input type="number" value="${it.itemNo}" class="ocr-edit" data-ino="${i}" min="1"></td><td><input type="number" value="${it.qty}" class="ocr-edit" data-iqty="${i}" min="0"></td></tr>`);
        html += '</tbody></table>';
        if (totalMatch) html += `<div style="margin-top:4px;color:var(--green);font-size:11px">Total detected: ${totalMatch[1]}</div>`;
        pre.innerHTML = html;
        pre.querySelectorAll('[data-ino]').forEach(el => el.addEventListener('change', e => { parsed.items[+e.target.dataset.ino].itemNo = pi(e.target.value) || 1; }));
        pre.querySelectorAll('[data-iqty]').forEach(el => el.addEventListener('change', e => { parsed.items[+e.target.dataset.iqty].qty = pi(e.target.value); }));
    }

    // ── CFR ──
    function parseCfr(text) {
        parsed.cfr = [];
        for (const line of text.split('\n')) {
            const matches = line.match(/[\d,]+\.\d{2}/g);
            if (matches) matches.forEach(val => {
                const num = pf(val.replace(/,/g, ''));
                if (num > 0 && num < 1_000_000) parsed.cfr.push(num);
            });
        }
        // Remove last value if it's a sum of the rest (likely a total row)
        if (parsed.cfr.length > 2) {
            const last = parsed.cfr[parsed.cfr.length - 1];
            const sumRest = parsed.cfr.slice(0, -1).reduce((s, v) => s + v, 0);
            if (Math.abs(last - sumRest) < 1) parsed.cfr.pop();
        }

        const pre = $('preview-cfr');
        $('results-cfr').style.display = 'block';
        $('count-cfr').textContent = parsed.cfr.length;

        if (!parsed.cfr.length) { pre.innerHTML = '<div class="empty" style="padding:8px;font-size:12px">Tidak terdeteksi.</div>'; return; }
        let html = '<table class="tbl" style="font-size:12px"><thead><tr><th>Item</th><th>CFR ($)</th></tr></thead><tbody>';
        parsed.cfr.forEach((v, i) => html += `<tr><td>Item ${i + 1}</td><td><input type="text" inputmode="decimal" value="${v}" class="ocr-edit" data-cv="${i}"></td></tr>`);
        pre.innerHTML = html + '</tbody></table>';
        pre.querySelectorAll('[data-cv]').forEach(el => el.addEventListener('change', e => { parsed.cfr[+e.target.dataset.cv] = pf(e.target.value); }));
    }

    // ── GLOBAL ──
    function parseGlobal(text) {
        parsed.global = {};
        let m = text.match(/FOB\s*[=:]\s*U?\$?\s*([\d,]+\.\d{2})/i);
        if (m) parsed.global.fob = pf(m[1].replace(/,/g, ''));
        m = text.match(/FREIGHT\s*(?:CHARGES?)?\s*[=:]\s*U?\$?\s*([\d,]+\.\d{2})/i);
        if (m) parsed.global.freight = pf(m[1].replace(/,/g, ''));
        m = text.match(/CFR\s*[=:]\s*U?\$?\s*([\d,]+\.\d{2})/i);
        if (m) parsed.global.cfr = pf(m[1].replace(/,/g, ''));

        if (parsed.global.fob && parsed.global.freight && !parsed.global.cfr)
            parsed.global.cfr = R2(parsed.global.fob + parsed.global.freight);

        if (parsed.global.freight) gFreight.value = parsed.global.freight;
        if (parsed.global.cfr) gCfr.value = parsed.global.cfr;
        updateGlobal();
        renderAll();
        setBar('global', 100, `✅ FOB: $${fmt(parsed.global.fob || 0)}, Freight: $${fmt(parsed.global.freight || 0)}`);
    }

    // ══════════════════════════════════════════════
    //  APPLY & CLEAR BUTTONS
    // ══════════════════════════════════════════════
    document.querySelectorAll('[data-apply]').forEach(btn =>
        btn.addEventListener('click', () => applyParsed(btn.dataset.apply)));
    document.querySelectorAll('[data-clear]').forEach(btn =>
        btn.addEventListener('click', () => {
            const z = btn.dataset.clear;
            $(`results-${z}`).style.display = 'none';
            $(`status-${z}`).style.display = 'none';
        }));

    function applyParsed(zone) {
        if (zone === 'measurement') {
            const checks = $('tbody-measurement').querySelectorAll('[data-mi]');
            let added = 0;
            checks.forEach((cb, i) => {
                if (!cb.checked) return;
                const r = parsed.measurement[i]; if (!r) return;
                const cbmPU = (r.p * r.l * r.t) / 1_000_000;
                templates.push({ id: Date.now() + i, name: `Dus-${templates.length + 1}`, p: r.p, l: r.l, t: r.t, cbmTarget: r.cbm, qtyTotal: Math.round(r.cbm / cbmPU), cbmPerUnit: cbmPU });
                added++;
            });
            if (added) { alert(`✅ ${added} ukuran ditambahkan ke Master Template!`); renderAll(); }
        } else if (zone === 'items') {
            parsed.items.forEach(pi => {
                const exists = items.find(it => it.itemNo === pi.itemNo);
                if (exists) exists.targetQty = pi.qty;
                else items.push({ id: Date.now() + pi.itemNo, itemNo: pi.itemNo, targetQty: pi.qty, cartons: [], cfrInput: 0, fobInput: 0, lastItemEdited: '' });
            });
            items.sort((a, b) => a.itemNo - b.itemNo);
            alert(`✅ ${parsed.items.length} item dimuat!`);
            renderAll();
        } else if (zone === 'cfr') {
            parsed.cfr.forEach((val, i) => {
                if (items[i]) { items[i].cfrInput = val; items[i].fobInput = 0; items[i].lastItemEdited = 'cfr'; }
            });
            alert(`✅ CFR diterapkan ke ${Math.min(parsed.cfr.length, items.length)} item!`);
            renderAll();
        }
    }

    // ══════════════════════════════════════════════
    //  PANEL 2 – MASTER TEMPLATE
    // ══════════════════════════════════════════════
    const tfP = $('tf-p'), tfL = $('tf-l'), tfT = $('tf-t'),
        tfQty = $('tf-qty'), tfCbm = $('tf-cbm'), tfPrev = $('tf-cbm-preview');
    let lastEdited = '';

    function getCbmPerUnit() {
        const p = pf(tfP.value), l = pf(tfL.value), t = pf(tfT.value);
        return (p > 0 && l > 0 && t > 0) ? (p * l * t) / 1_000_000 : 0;
    }

    function updateFormPreview() {
        const cbmPU = getCbmPerUnit();
        const qty = pi(tfQty.value), cbm = pf(tfCbm.value);

        if (cbmPU <= 0) { tfPrev.textContent = 'Isi P, L, T dulu'; tfPrev.style.color = ''; return; }

        if (lastEdited === 'qty' && qty > 0) {
            // User editing Qty → auto-calc CBM
            const calc = R2(cbmPU * qty);
            tfCbm.value = calc;
            tfPrev.textContent = `${cbmPU.toFixed(6)} × ${qty} = ${calc.toFixed(2)} CBM`;
            tfPrev.style.color = 'var(--green)';
        } else if (lastEdited === 'cbm' && cbm > 0) {
            // User editing CBM → auto-calc Qty
            const calc = Math.round(cbm / cbmPU);
            tfQty.value = calc;
            tfPrev.textContent = `${cbm.toFixed(2)} ÷ ${cbmPU.toFixed(6)} = ${calc} karton`;
            tfPrev.style.color = 'var(--blue)';
        } else if (lastEdited === 'cbm') {
            // User is still typing CBM (value 0 or invalid) — DON'T overwrite
            tfPrev.textContent = `CBM/unit: ${cbmPU.toFixed(6)} — Mengetik CBM...`;
            tfPrev.style.color = '';
        } else if (qty > 0) {
            // No explicit edit, but qty exists → calc CBM
            const calc = R2(cbmPU * qty);
            tfCbm.value = calc;
            tfPrev.textContent = `${cbmPU.toFixed(6)} × ${qty} = ${calc.toFixed(2)} CBM`;
            tfPrev.style.color = 'var(--green)';
        } else {
            tfPrev.textContent = `CBM/unit: ${cbmPU.toFixed(6)} — Isi Qty atau CBM`;
            tfPrev.style.color = '';
        }
    }

    tfQty.addEventListener('input', () => { lastEdited = 'qty'; updateFormPreview(); });
    tfCbm.addEventListener('input', () => { lastEdited = 'cbm'; updateFormPreview(); });
    [tfP, tfL, tfT].forEach(el => el.addEventListener('input', updateFormPreview));

    $('btn-add-tpl').addEventListener('click', () => {
        const name = $('tf-name').value.trim() || `Dus ${templates.length + 1}`;
        const p = pf(tfP.value), l = pf(tfL.value), t = pf(tfT.value);
        const qty = pi(tfQty.value), cbm = pf(tfCbm.value);
        if (!p || !l || !t) { alert('Isi P, L, dan T!'); return; }
        if (!qty && !cbm) { alert('Isi Qty Karton atau CBM Total!'); return; }
        const cbmPU = (p * l * t) / 1_000_000;
        const finalQty = qty || Math.round(cbm / cbmPU);
        const finalCbm = (lastEdited === 'cbm' && cbm > 0) ? cbm : R2(cbmPU * finalQty);
        templates.push({ id: Date.now(), name, p, l, t, cbmTarget: finalCbm, qtyTotal: finalQty, cbmPerUnit: cbmPU });
        // Pertahankan semua value agar bisa tambah ulang dengan data sama
        lastEdited = '';
        renderAll();
    });

    function renderTemplates() {
        const tb = $('tpl-body'); tb.innerHTML = '';
        if (!templates.length) {
            tb.innerHTML = '<tr><td colspan="7" class="empty">Belum ada data.</td></tr>';
            $('tpl-sum-cbm').textContent = '0.00'; $('tpl-sum-qty').textContent = '0'; $('tpl-sum-alloc').textContent = '0'; $('tpl-sum-sisa').textContent = '0';
            return;
        }
        const allocMap = buildAllocMap();
        let sC = 0, sQ = 0, sA = 0;
        templates.forEach((tp, i) => {
            const al = allocMap.get(tp.id) || 0, si = tp.qtyTotal - al;
            sC += tp.cbmTarget; sQ += tp.qtyTotal; sA += al;
            const chip = si === 0 ? '<span class="chip ok">HABIS ✓</span>' : si > 0 ? `<span class="chip warn">${si} sisa</span>` : `<span class="chip err">${Math.abs(si)} LEBIH</span>`;
            const tr = document.createElement('tr');
            tr.innerHTML = `<td><input type="text" value="${tp.name}" class="tpl-edit tpl-edit-name" data-tpl-name="${i}" style="width:70px;font-weight:600"><br><small><input type="text" inputmode="decimal" value="${tp.p}" class="tpl-edit tpl-edit-dim" data-tpl-p="${i}" style="width:45px">×<input type="text" inputmode="decimal" value="${tp.l}" class="tpl-edit tpl-edit-dim" data-tpl-l="${i}" style="width:45px">×<input type="text" inputmode="decimal" value="${tp.t}" class="tpl-edit tpl-edit-dim" data-tpl-t="${i}" style="width:45px"></small></td><td>${tp.cbmPerUnit.toFixed(6)}</td><td><input type="text" inputmode="decimal" value="${tp.cbmTarget.toFixed(2)}" class="tpl-edit" data-tpl-cbm="${i}" style="width:65px"></td><td><input type="number" min="0" value="${tp.qtyTotal}" class="tpl-edit" data-tpl-qty="${i}" style="width:55px"></td><td>${al}</td><td>${chip}</td><td><button class="btn red" data-del-tpl="${i}"><i class="fa fa-trash"></i></button></td>`;
            tb.appendChild(tr);
        });
        $('tpl-sum-cbm').textContent = sC.toFixed(2); $('tpl-sum-qty').textContent = sQ; $('tpl-sum-alloc').textContent = sA; $('tpl-sum-sisa').textContent = sQ - sA;
    }

    // Event delegation for template table (delete + inline edit)
    $('tpl-body').addEventListener('click', e => {
        const btn = e.target.closest('[data-del-tpl]');
        if (btn) { templates.splice(+btn.dataset.delTpl, 1); renderAll(); }
    });
    $('tpl-body').addEventListener('change', e => {
        const t = e.target;
        if (t.dataset.tplName !== undefined) {
            templates[+t.dataset.tplName].name = t.value.trim() || `Dus ${+t.dataset.tplName + 1}`;
        } else if (t.dataset.tplP !== undefined) {
            const i = +t.dataset.tplP; templates[i].p = pf(t.value);
            templates[i].cbmPerUnit = (templates[i].p * templates[i].l * templates[i].t) / 1_000_000;
            templates[i].cbmTarget = R2(templates[i].cbmPerUnit * templates[i].qtyTotal);
            renderAll();
        } else if (t.dataset.tplL !== undefined) {
            const i = +t.dataset.tplL; templates[i].l = pf(t.value);
            templates[i].cbmPerUnit = (templates[i].p * templates[i].l * templates[i].t) / 1_000_000;
            templates[i].cbmTarget = R2(templates[i].cbmPerUnit * templates[i].qtyTotal);
            renderAll();
        } else if (t.dataset.tplT !== undefined) {
            const i = +t.dataset.tplT; templates[i].t = pf(t.value);
            templates[i].cbmPerUnit = (templates[i].p * templates[i].l * templates[i].t) / 1_000_000;
            templates[i].cbmTarget = R2(templates[i].cbmPerUnit * templates[i].qtyTotal);
            renderAll();
        } else if (t.dataset.tplQty !== undefined) {
            const i = +t.dataset.tplQty; templates[i].qtyTotal = pi(t.value);
            templates[i].cbmTarget = R2(templates[i].cbmPerUnit * templates[i].qtyTotal);
            renderAll();
        } else if (t.dataset.tplCbm !== undefined) {
            const i = +t.dataset.tplCbm; templates[i].cbmTarget = pf(t.value);
            if (templates[i].cbmPerUnit > 0) templates[i].qtyTotal = Math.round(templates[i].cbmTarget / templates[i].cbmPerUnit);
            renderAll();
        }
    });

    // ══════════════════════════════════════════════
    //  PANEL 3 – ITEMS
    // ══════════════════════════════════════════════
    $('btn-add-item').addEventListener('click', () => {
        items.push({ id: Date.now(), itemNo: items.length + 1, targetQty: 0, cartons: [], cfrInput: 0, fobInput: 0, lastItemEdited: '' });
        renderAll();
    });

    function calcItemFreights() {
        const price = pf(gPrice.value), globalFr = pf(gFreight.value);
        const tplMap = buildTplMap();

        const data = items.map(item => {
            let rawCbm = 0, totQty = 0;
            item.cartons.forEach(c => {
                const tp = tplMap.get(c.tplId);
                if (tp) {
                    // Gunakan CBM Target (dari forwarder) agar Rate × CBM = Freight tepat
                    const cbmPU = tp.qtyTotal > 0 ? tp.cbmTarget / tp.qtyTotal : tp.cbmPerUnit;
                    rawCbm += cbmPU * c.qty;
                    totQty += c.qty;
                }
            });
            return { rawCbm, totQty };
        });
        const totalRawCbm = data.reduce((s, d) => s + d.rawCbm, 0);

        let freights;
        if (globalFr > 0 && totalRawCbm > 0) {
            freights = data.map(d => R2((d.rawCbm / totalRawCbm) * globalFr));
            // Adjust last item to absorb rounding remainder
            const diff = R2(globalFr - freights.reduce((s, v) => s + v, 0));
            if (freights.length > 0 && diff !== 0) freights[freights.length - 1] = R2(freights[freights.length - 1] + diff);
        } else {
            freights = data.map(d => R2(R2(d.rawCbm) * price));
        }
        return { data, freights, tplMap };
    }

    function renderItems() {
        const wrap = $('items-wrap'); wrap.innerHTML = '';
        const { data, freights, tplMap } = calcItemFreights();

        items.forEach((item, idx) => {
            const { rawCbm, totQty } = data[idx];
            let cRows = '';
            item.cartons.forEach((c, ci) => {
                const tp = tplMap.get(c.tplId);
                if (!tp) return;
                const cbmPU = tp.qtyTotal > 0 ? tp.cbmTarget / tp.qtyTotal : tp.cbmPerUnit;
                cRows += `<tr><td>${tp.p}×${tp.l}×${tp.t}</td><td>${c.qty}</td><td>${(cbmPU * c.qty).toFixed(4)}</td><td><button class="btn red" data-del-cart="${idx},${ci}"><i class="fa fa-times"></i></button></td></tr>`;
            });
            const cbm = R2(rawCbm), freight = freights[idx];
            const { cfr, fob } = getItemCfrFob(item, freight);

            let qS = '';
            if (item.targetQty > 0) {
                if (totQty === item.targetQty) qS = '<span class="chip ok">PAS ✓</span>';
                else if (totQty < item.targetQty) qS = `<span class="chip warn">Kurang ${item.targetQty - totQty}</span>`;
                else qS = `<span class="chip err">Lebih ${totQty - item.targetQty}</span>`;
            }

            const div = document.createElement('div'); div.className = 'item-card';
            div.innerHTML = `
                <div class="item-head">
                    <h3>Item No. ${item.itemNo}</h3>
                    <div class="item-head-right">
                        <div class="target-qty-wrap">Target: <input type="number" value="${item.targetQty || ''}" placeholder="0" data-tq="${idx}" min="0"> ${qS}</div>
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
                        <div class="sbox"><span>CFR ($)</span><input type="text" value="${cfr || ''}" placeholder="0" inputmode="decimal" data-cfr="${idx}"></div>
                        <div class="sbox"><span>FOB ($)</span><input type="text" value="${fob || ''}" placeholder="0" inputmode="decimal" data-fob="${idx}"></div>
                    </div>
                </div>`;
            wrap.appendChild(div);
        });
    }

    // Event delegation for items panel (single listener instead of per-element)
    $('items-wrap').addEventListener('change', e => {
        const t = e.target;
        if (t.dataset.tq !== undefined) { items[+t.dataset.tq].targetQty = pi(t.value); renderAll(); }
        else if (t.dataset.cfr !== undefined) { const i = +t.dataset.cfr; items[i].cfrInput = pf(t.value); items[i].lastItemEdited = 'cfr'; renderAll(); }
        else if (t.dataset.fob !== undefined) { const i = +t.dataset.fob; items[i].fobInput = pf(t.value); items[i].lastItemEdited = 'fob'; renderAll(); }
    });

    $('items-wrap').addEventListener('click', e => {
        const btn = e.target.closest('button');
        if (!btn) return;
        if (btn.dataset.delItem !== undefined) { items.splice(+btn.dataset.delItem, 1); items.forEach((it, i) => it.itemNo = i + 1); renderAll(); }
        else if (btn.dataset.delCart !== undefined) { const [a, c] = btn.dataset.delCart.split(',').map(Number); items[a].cartons.splice(c, 1); renderAll(); }
        else if (btn.dataset.addCart !== undefined) manualAddDus(+btn.dataset.addCart);
    });

    function manualAddDus(idx) {
        if (!templates.length) { alert('Buat Template dulu!'); return; }
        const allocMap = buildAllocMap();
        const choices = templates.map((t, i) => `${i + 1}. ${t.name} (${t.p}×${t.l}×${t.t}) Sisa: ${t.qtyTotal - (allocMap.get(t.id) || 0)}`).join('\n');
        const pick = prompt(`Pilih nomor:\n${choices}`);
        if (!pick) return;
        const ti = pi(pick) - 1;
        if (ti < 0 || ti >= templates.length) return;
        const tp = templates[ti];
        const qty = pi(prompt(`Qty untuk "${tp.name}" (Sisa ${tp.qtyTotal - (allocMap.get(tp.id) || 0)}):`));
        if (!qty || qty <= 0) return;
        items[idx].cartons.push({ tplId: tp.id, qty });
        renderAll();
    }

    // ══════════════════════════════════════════════
    //  AUTO-SOLVE
    // ══════════════════════════════════════════════
    $('btn-auto-solve').addEventListener('click', () => {
        if (!templates.length || !items.length) { alert('Buat Template dan Item dulu!'); return; }
        const totT = items.reduce((s, it) => s + it.targetQty, 0), totA = templates.reduce((s, tp) => s + tp.qtyTotal, 0);
        if (!totT) { alert('Isi Target Karton di setiap Item!'); return; }
        if (totT !== totA && !confirm(`⚠️ Target (${totT}) ≠ Template (${totA}). Lanjut?`)) return;

        const pool = templates.map(tp => ({ tplId: tp.id, avail: tp.qtyTotal }));
        items.forEach(it => it.cartons = []);
        items.forEach(item => {
            let need = item.targetQty;
            for (const sl of pool) {
                if (need <= 0) break;
                if (sl.avail <= 0) continue;
                const take = Math.min(need, sl.avail);
                item.cartons.push({ tplId: sl.tplId, qty: take });
                sl.avail -= take; need -= take;
            }
        });
        renderAll();
        const left = pool.reduce((s, sl) => s + sl.avail, 0);
        setTimeout(() => alert(left === 0 ? '✅ Semua karton teralokasi!' : `⚠️ Sisa ${left} karton tidak teralokasi.`), 100);
    });

    // ══════════════════════════════════════════════
    //  VALIDATION
    // ══════════════════════════════════════════════
    function validate() {
        const { data, freights } = calcItemFreights();
        let aCbm = 0, aFr = 0, aCfr = 0;
        items.forEach((item, idx) => {
            aCbm += data[idx].rawCbm;
            aFr += freights[idx];
            aCfr += getItemCfrFob(item, freights[idx]).cfr;
        });
        aCbm = R2(aCbm); aFr = R2(aFr); aCfr = R2(aCfr);
        const aFob = R2(aCfr - aFr);
        const tFr = pf(gFreight.value), tCfr = pf(gCfr.value), tFob = R2(tCfr - tFr);
        const tCbm = templates.length ? R2(templates.reduce((s, tp) => s + tp.cbmTarget, 0)) : 0;

        const set = (id, v) => $(id).textContent = v;
        set('va-cbm', fmt(aCbm)); set('vt-cbm', fmt(tCbm));
        set('va-freight', `$ ${fmt(aFr)}`); set('vt-freight', `$ ${fmt(tFr)}`);
        set('va-cfr', `$ ${fmt(aCfr)}`); set('vt-cfr', `$ ${fmt(tCfr)}`);
        set('va-fob', `$ ${fmt(aFob)}`); set('vt-fob', `$ ${fmt(tFob)}`);

        const tag = (cid, tid, a, t, has, prefix = '$ ') => {
            const c = $(cid), tg = $(tid); c.classList.remove('match', 'miss');
            if (!has) { tg.textContent = '—'; return; }
            const diff = R2(a - t);
            if (diff === 0) { c.classList.add('match'); tg.textContent = 'MATCH ✓'; }
            else { c.classList.add('miss'); tg.textContent = `SELISIH ${prefix}${fmt(Math.abs(diff))}`; }
        };
        tag('vc-cbm', 'tag-cbm', aCbm, tCbm, tCbm > 0, '');
        tag('vc-freight', 'tag-freight', aFr, tFr, tFr > 0);
        tag('vc-cfr', 'tag-cfr', aCfr, tCfr, tCfr > 0);
        tag('vc-fob', 'tag-fob', aFob, tFob, tCfr > 0 || tFr > 0);
    }

    // ══════════════════════════════════════════════
    //  RENDER ALL
    // ══════════════════════════════════════════════
    function renderAll() {
        const active = document.activeElement;
        let focusSelector = null;
        if (active && active.tagName === 'INPUT') {
            for (const attr of active.attributes) {
                if (attr.name.startsWith('data-')) { focusSelector = `[${attr.name}="${attr.value}"]`; break; }
            }
        }
        renderTemplates();
        renderItems();
        validate();
        if (focusSelector) { const el = document.querySelector(focusSelector); if (el) el.focus(); }
        saveState();
    }

    loadState();
    updateGlobal();
    renderAll();

    // ══════════════════════════════════════════════
    //  COPY HASIL & RESET
    // ══════════════════════════════════════════════
    $('btn-copy-result').addEventListener('click', () => {
        const { data, freights, tplMap } = calcItemFreights();
        let text = '══════ HASIL KALKULASI PEB ══════\n\n';
        text += `Freight/CBM: $${gPrice.value}\n`;
        text += `Total Freight: $${fmt(pf(gFreight.value))}\n`;
        text += `Total CFR: $${fmt(pf(gCfr.value))}\n`;
        text += `Total FOB: $${fmt(pf(gFob.value))}\n\n`;

        text += 'MASTER MEASUREMENT:\n';
        templates.forEach(tp => {
            text += `  ${tp.name} (${tp.p}×${tp.l}×${tp.t} cm) CBM/unit:${tp.cbmPerUnit.toFixed(6)} Qty:${tp.qtyTotal} CBM:${tp.cbmTarget.toFixed(2)}\n`;
        });
        text += '\nALOKASI ITEM:\n';
        items.forEach((item, idx) => {
            const { rawCbm, totQty } = data[idx];
            const { cfr, fob } = getItemCfrFob(item, freights[idx]);
            text += `  Item ${item.itemNo}: Qty=${totQty}, CBM=${R2(rawCbm).toFixed(2)}, Freight=$${fmt(freights[idx])}, CFR=$${fmt(cfr)}, FOB=$${fmt(fob)}\n`;
            item.cartons.forEach(c => {
                const tp = tplMap.get(c.tplId);
                if (!tp) return;
                const cbmPU = tp.qtyTotal > 0 ? tp.cbmTarget / tp.qtyTotal : tp.cbmPerUnit;
                text += `    └ ${tp.p}×${tp.l}×${tp.t}: ${c.qty} krt (${(cbmPU * c.qty).toFixed(4)} CBM)\n`;
            });
        });
        navigator.clipboard.writeText(text).then(() => alert('✅ Hasil disalin ke clipboard!'));
    });

    $('btn-reset-all').addEventListener('click', () => {
        if (!confirm('⚠️ Reset semua data? Semua template, item, dan nilai global akan dihapus.')) return;
        templates.length = 0;
        items.length = 0;
        gFreight.value = ''; gCfr.value = ''; gFob.value = '';
        gPrice.value = '85';
        gLastEdited = '';
        localStorage.removeItem(STORAGE_KEY);
        updateGlobal();
        renderAll();
    });

    // ══════════════════════════════════════════════
    //  THEME TOGGLE (Dark / Light)
    // ══════════════════════════════════════════════
    const THEME_KEY = 'kalkulatorPEB_theme';
    const btnTheme = $('btn-theme');
    const themeIcon = btnTheme.querySelector('i');

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        if (theme === 'dark') {
            themeIcon.className = 'fa-solid fa-sun';
        } else {
            themeIcon.className = 'fa-solid fa-moon';
        }
    }

    // Load saved theme or default to light
    const savedTheme = localStorage.getItem(THEME_KEY) || 'light';
    applyTheme(savedTheme);

    btnTheme.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        const next = current === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        localStorage.setItem(THEME_KEY, next);
    });
});
