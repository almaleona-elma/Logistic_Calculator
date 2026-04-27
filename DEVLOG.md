# Kalkulator PEB — Development Log

> Dokumen ini merangkum seluruh histori pengembangan, keputusan arsitektur, dan domain knowledge dari proyek Kalkulator Draft PEB.  
> **Terakhir diperbarui:** 2026-04-27

---

## 📁 Struktur File

| File           | Fungsi                                                    |
| -------------- | --------------------------------------------------------- |
| `index.html`   | Layout utama, 4 panel + 3 modal (Alert, Dus, Transfer)    |
| `script.js`    | ~960 baris, semua logika kalkulasi, OCR, rendering, state |
| `style.css`    | ~1087 baris, theme Frost Lavender (light + dark mode)     |
| `app_final.py` | Backend Python (tidak digunakan aktif di web)             |
| `*.backup`     | Backup file sebelum fitur transfer/auto-solve ditambahkan |

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
   CBM per item = Σ(cbmPU × qty_karton)
         ↓
   Freight per item = R2(R2(CBM) × Rate)
         ↓
   FOB per item = CFR − Freight  ← INI YANG DICARI
```

### Fungsi Kunci

| Fungsi                    | Lokasi | Deskripsi                                                |
| ------------------------- | ------ | -------------------------------------------------------- |
| `calcItemFreights()`      | ~L590  | Hitung CBM & freight per item dari karton yang dialokasi |
| `calcAllCfrFob(freights)` | ~L116  | Hitung CFR/FOB per item, remainder ke item terkecil      |
| `renderItems()`           | ~L612  | Render semua item card + carton rows                     |
| `renderTemplates()`       | ~L527  | Render tabel template master                             |
| `validate()`              | ~L823  | Rekapitulasi & validasi (CBM, Freight, CFR, FOB match)   |
| `buildTplMap()`           | ~L163  | O(1) lookup template by ID                               |
| `buildAllocMap()`         | ~L169  | Hitung total alokasi per template                        |

### Konstanta & Aturan Penting

1. **CBM per unit untuk kalkulasi:** `cbmTarget / qtyTotal` (BUKAN `cbmPerUnit` dari P×L×T)
   - Alasan: SI/forwarder memberikan cbmTarget yang sudah dibulatkan (misal 5.67)
   - Jika pakai cbmPerUnit (0.202640), split item tidak akan sum kembali ke 5.67
   - `cbmTarget / qtyTotal` = 5.67/28 = 0.2025 → 25×0.2025 + 3×0.2025 = 5.67 ✓

2. **Pembulatan:**
   - `R2(x)` = Math.round(x \* 100) / 100 (2 desimal)
   - CBM selalu dibulatkan R2 sebelum dikali Rate
   - Qty karton selalu bulat (integer) — tidak ada 0.5 karton

3. **Remainder FOB:** Selisih FOB dialokasikan ke item dengan qty terkecil (overproduction)

4. **Format angka:** Titik (.) untuk desimal, koma (,) untuk digit separator
   - `<html lang="en">` untuk memaksa format ini

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

### OCR Paste Zones

- Paste screenshot / upload PDF → Tesseract.js OCR
- 3 zona: Global (freight/fob), Items (qty), CFR per item
- Preview editable sebelum apply ke form

### State Persistence

- `localStorage` key: `kalkulatorPEB_state`
- Auto-save setiap `renderAll()`
- Auto-load saat `DOMContentLoaded`
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

---

## 🔁 Rollback Commands

```powershell
# Rollback ke sebelum fitur transfer/auto-solve
Copy-Item "d:\Program\maul\KalkulatorLogistik\script.js.backup" "d:\Program\maul\KalkulatorLogistik\script.js" -Force
Copy-Item "d:\Program\maul\KalkulatorLogistik\index.html.backup" "d:\Program\maul\KalkulatorLogistik\index.html" -Force
Copy-Item "d:\Program\maul\KalkulatorLogistik\style.css.backup" "d:\Program\maul\KalkulatorLogistik\style.css" -Force
```

---

## 📝 Future Ideas (Belum Implementasi)

1. **Locking item** — kunci item tertentu agar tidak terpengaruh auto-solve
2. **Grouping by Marking** — jika data marking tersedia dari OCR
3. **Scan dokumen SI/CI/PL** — dibatalkan tapi bisa dikerjakan ulang
4. **Split script.js** ke modul terpisah — user pernah tanya tapi belum dilakukan
