# Kalkulator PEB — Development Log

> Dokumen ini merangkum seluruh histori pengembangan, keputusan arsitektur, dan domain knowledge dari proyek Kalkulator Draft PEB.  
> **Terakhir diperbarui:** 2026-04-30

---

## 📁 Struktur File

| File           | Fungsi                                                    |
| -------------- | --------------------------------------------------------- |
| `index.html`   | Layout utama, 4 panel + 3 modal (Alert, Dus, Transfer)    |
| `js/calc.js`   | Pure calculation functions (R2, pf, getCbmPerUnit, dll)   |
| `js/state.js`  | State management + localStorage + factory functions       |
| `js/render.js` | DOM rendering (templates, items, validation)               |
| `js/modal.js`  | Modal system (alert, confirm, dus, transfer)               |
| `js/app.js`    | Entry point: event wiring + initialization                |
| `style.css`    | ~1128 baris, theme Frost Lavender (light + dark mode)     |
| `test.js`      | Test suite — 48 test cases, jalankan `node test.js`       |
| `app_final.py` | Backend Python (referensi, tidak digunakan aktif di web)  |

---

## 🎨 Design System

### Theme: "Frost Lavender" (Pastel)

- **Warna utama:** Biru pastel (`#8FBEE6`), Lavender (`#B2B1D8`)
- **Warning:** Amber hangat (`#d4a96a`)
- **Error:** Merah redam (`#E57C7C`)
- **Batasan user:** Tidak boleh hijau, kuning, atau pink sebagai warna dominan
- **Font:** Inter (Google Fonts)
- **Dark mode:** Tersedia via toggle button di header

### Sumber inspirasi awal:

Monkeytype "Milkshake" theme → diubah menjadi Frost Lavender sesuai preferensi user.

---

## 🧮 Arsitektur Kalkulasi

### Alur Data

```
CI (Invoice) → CFR per item (sudah pasti dari dokumen)
SI/PL → Ukuran karton (P×L×T) + qty per template + qty target per item
         ↓
   Distribusi karton ke item (Manual / Auto-Solve / Transfer)
         ↓
   CBM per item = Σ(getCbmPerUnit(tp) × qty_karton)
         ↓
   Freight per item = R2(CBM × Rate)     ← single rounding
         ↓
   FOB per item = CFR − Freight  ← INI YANG DICARI
```

### Modul & Fungsi Kunci

| Fungsi                         | Modul       | Deskripsi                                                |
| ------------------------------ | ----------- | -------------------------------------------------------- |
| `getCbmPerUnit(tp)`            | `calc.js`   | CBM per unit — single source of truth                    |
| `calcItemCbm(item, tplMap)`    | `calc.js`   | Hitung CBM & qty total item dari karton                  |
| `calcFreight(rawCbm, rate)`    | `calc.js`   | Freight = CBM × Rate (single rounding)                   |
| `calcAllCfrFob(items, ...)`    | `calc.js`   | CFR/FOB per item + remainder ke item terkecil            |
| `calcGlobalTriad(...)`         | `calc.js`   | Auto-calc 2 dari 3 (freight, cfr, fob)                  |
| `recalcTemplate(tp)`           | `calc.js`   | Recalc cbmPerUnit + cbmTarget setelah edit dimensi       |
| `buildTplMap()`                | `state.js`  | O(1) lookup template by ID                               |
| `buildAllocMap()`              | `state.js`  | Hitung total alokasi per template                        |
| `createTemplate(...)` / `createItem(...)` | `state.js` | Factory functions dengan auto-ID              |
| `renderAll()`                  | `render.js` | Render templates + items + validation + save state       |
| `buildResultText()`            | `render.js` | Bangun teks clipboard untuk "Copy Hasil"                 |

### Konstanta & Aturan Penting

1. **CBM per unit untuk kalkulasi:** `getCbmPerUnit(tp)` = `cbmTarget / qtyTotal` (BUKAN `cbmPerUnit` dari P×L×T)
   - Alasan: SI/forwarder memberikan cbmTarget yang sudah dibulatkan (misal 5.67)
   - Jika pakai cbmPerUnit (0.202640), split item tidak akan sum kembali ke 5.67
   - `cbmTarget / qtyTotal` = 5.67/28 = 0.2025 → 25×0.2025 + 3×0.2025 = 5.67 ✓

2. **Pembulatan:**
   - `R2(x)` = Math.round(x \* 100) / 100 (2 desimal)
   - Freight = `R2(rawCbm * rate)` — **single rounding**, bukan `R2(R2(rawCbm) * rate)`
   - Qty karton selalu bulat (integer) — tidak ada 0.5 karton

3. **Remainder FOB:** Selisih FOB dialokasikan ke item dengan CFR terkecil (overproduction)

4. **Format angka:** Titik (.) untuk desimal, koma (,) untuk digit separator
   - `<html lang="en">` untuk memaksa format ini
   - `pf()` multi-format parser: handle US (1,234.56), EU (1.234,56), comma decimal

### Freight Reasonableness Warning

- Threshold: freight/karton > 30% dari CFR/karton → warning orange muncul
- CSS class: `.freight-warn`

---

## 🔄 Fitur Distribusi Karton (3 Level)

### 1. Auto-Solve (Otomatis)

- Group template by **P (panjang)** dimension
- Dalam setiap group: sort by **T (tinggi) descending** — karton tertinggi dulu
- Sort items by **targetQty descending** — item utama (qty terbanyak) mendapat prioritas
- Alokasi: item utama → ambil karton terbesar → lanjut ke berikutnya
- Item order (itemNo) TIDAK berubah setelah auto-solve
- Item tanpa targetQty TIDAK di-clear kartonnya

### 2. Quick Redistribute (Transfer ↔)

- Tombol oranye ↔ di setiap baris karton dalam item
- Modal: pilih qty dan item tujuan
- Auto-merge jika item tujuan sudah punya karton tipe sama
- Hapus baris otomatis jika qty asal = 0

### 3. Manual

- Tombol "+ Dus" untuk tambah karton ke item
- Tombol hapus (×) untuk hapus karton dari item
- Edit inline qty di template table

### Pola Distribusi (Domain Knowledge)

| Skenario          | Pola                                                        |
| ----------------- | ----------------------------------------------------------- |
| 1 ukuran, N item  | Distribusi berdasarkan target qty                           |
| 2+ ukuran, P sama | T terbesar → item utama; T lebih kecil → pelengkap/sisa     |
| 2+ ukuran, P beda | Group by P: Item 1+2 = group P₁, Item 3+4 = group P₂        |
| 3 item (ganjil)   | Item 1 = utama, Item 2 = bisa utama, Item 3 = sisa produksi |
| 4 item            | Item 1+2 = group P panjang, Item 3+4 = group P pendek       |
| Validasi          | Freight/CFR per item harus masuk akal (bukan 50%, bukan 0%) |

---

## 🔧 UI/UX Features

### Modal System

- **Custom modals** menggantikan browser alert/confirm/prompt
- 3 modal: Alert/Confirm, Pilih Dus, Transfer Karton
- Semua menggunakan Promise-based API (`showAlert`, `showConfirm`, `showDusModal`, `showTransferModal`)

### State Persistence

- `localStorage` key: `kalkulatorPEB_state`
- Auto-save setiap `renderAll()`
- Auto-load saat module init
- Reset: hapus localStorage + clear form
- Theme key: `kalkulatorPEB_theme`

### Copy Hasil

- Format teks terstruktur ke clipboard
- Menampilkan: Freight/CBM, Total Freight/CFR/FOB, Master Measurement, Alokasi Item

---

## 🐛 Bug History & Lessons Learned

### 1. Variable Name Collision (2026-04-27)

- **Bug:** `const tfPrev` dideklarasikan 2x (transfer modal + template form) → SyntaxError
- **Dampak:** Seluruh script.js tidak berjalan (OCR, theme, semua mati)
- **Fix:** Rename transfer modal vars dari `tf*` → `xf*`
- **Lesson:** Selalu `node -c script.js` setelah edit untuk syntax check

### 2. CBM Calculation Source (2026-04-27)

- **Issue:** Apakah pakai `cbmPerUnit` (P×L×T) atau `cbmTarget/qtyTotal`?
- **Jawaban:** Pakai `cbmTarget/qtyTotal` karena cbmTarget dari SI = ground truth
- **Lesson:** SI document adalah sumber kebenaran, bukan kalkulasi teoritis

### 3. Auto-solve pool variable (2026-04-27)

- **Bug:** Variabel `pool` undefined setelah refactor grouping
- **Fix:** Ganti dengan `groupArr.reduce(...)` untuk hitung sisa

### 4. Multi-fix Analisis Akurasi (2026-04-30)

- **A1 — Double-rounding Freight:** `R2(R2(rawCbm) * price)` → `R2(rawCbm * price)`
- **A2 — Validasi FOB:** Target FOB kini gunakan input `g-fob` jika tersedia
- **A4 — parseGlobal() FOB:** OCR FOB kini di-set ke field input
- **B1 — Auto-Solve clear:** Hanya clear karton item yang punya targetQty > 0
- **B2 — pf() parser:** Handle format US (1,234.56), EU (1.234,56), dan comma decimal
- **B5 — Variable shadowing:** `pi` → `pItem` di applyParsed("items")
- **C5 — g-rate-warning:** Tambahkan element HTML yang hilang
- **Lesson:** Selalu audit rounding chain end-to-end; pastikan setiap element yang direferensikan JS ada di HTML

### 5. Restructure: Monolith → ES Modules (2026-04-30)

- **Issue:** `script.js` = 1,380 baris monolitik, untestable, DRY violations
- **Fix:** Split ke 5 ES modules: `calc.js`, `state.js`, `modal.js`, `render.js`, `app.js`
- **DRY eliminated:** CBM ternary (4× → `getCbmPerUnit()`), template recalc (3× → `recalcTemplate()`), item factory (2× → `createItem()`)
- **OCR dihapus:** Tesseract.js, pdf.js, paste zones, semua parser
- **Lesson:** Pisahkan pure logic dari DOM — memungkinkan unit testing tanpa browser

---

## 📋 Conversation History Summary

| Tanggal    | Topik                                | Status                   |
| ---------- | ------------------------------------ | ------------------------ |
| 2026-04-17 | Theme Frost Lavender                 | ✅                       |
| 2026-04-17 | Format desimal titik (.)             | ✅                       |
| 2026-04-17 | Hapus fitur Distribusi CFR           | ✅                       |
| 2026-04-17 | LocalStorage cache                   | ✅                       |
| 2026-04-17 | Scan Dokumen SI/CI/PL                | ❌ Dibatalkan (rollback) |
| 2026-04-17 | Refactor script.js (-25% LOC)        | ✅                       |
| 2026-04-21 | Custom modal (ganti alert/confirm)   | ✅                       |
| 2026-04-21 | Responsive design                    | ✅                       |
| 2026-04-21 | Decimal format fix                   | ✅                       |
| 2026-04-27 | Freight reasonableness warning (30%) | ✅                       |
| 2026-04-27 | Auto-solve grouping by P + sort by T | ✅                       |
| 2026-04-27 | Quick redistribute (transfer modal)  | ✅                       |
| 2026-04-27 | Fix tfPrev collision bug             | ✅                       |
| 2026-04-30 | Analisis & fix akurasi perhitungan   | ✅                       |
| 2026-04-30 | Restructure → 5 ES modules          | ✅                       |
| 2026-04-30 | Hapus OCR (Tesseract/pdf.js)         | ✅                       |

---

## 📝 Future Ideas (Belum Implementasi)

1. **Locking item** — kunci item tertentu agar tidak terpengaruh auto-solve
2. **Grouping by Marking** — jika data marking tersedia
3. **ILP-based Auto-Solve** — port logika PuLP dari `app_final.py` ke browser
4. **Import/Export JSON** — save/load skenario kalkulasi sebagai file
