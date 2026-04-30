# Referensi Keilmuan — Kalkulator PEB

> Daftar teori, algoritma, dan paper yang menjadi landasan implementasi perhitungan dalam proyek ini.

---

## 1. Distribusi Proporsional: Largest Remainder Method (Hare-Niemeyer)

**Diterapkan pada:** Distribusi freight dan FOB ke item berdasarkan CBM

**Sumber:**
- Balinski, M.L. & Young, H.P. (2001). *Fair Representation: Meeting the Ideal of One Man, One Vote.* Brookings Institution Press. ISBN: 978-0815701118
- Niemeyer, H.F. & Hare, T. (1882). Metode awal untuk distribusi kursi proporsional

**Prinsip:**
Membagi total nilai (misal $1,103.30) ke N item secara proporsional berdasarkan bobot (CBM), dengan jaminan matematis bahwa `Σ hasil = total` secara exact ke 2 desimal.

**Algoritma:**
1. Hitung exact share: `share_i = total × (weight_i / Σ weights)`
2. Floor ke cent: `floor_i = ⌊share_i × 100⌋ / 100`
3. Hitung sisa cent: `remaining = round(total × 100) - Σ floor_i`
4. Distribusikan sisa ke item dengan fractional remainder terbesar

**File implementasi:** `js/calc.js` → `distributeProportional()`

---

## 2. Transportation Problem (Hitchcock-Koopmans)

**Relevan untuk:** Alokasi karton ke item (Auto-Solve)

**Sumber:**
- Hitchcock, F.L. (1941). *The Distribution of a Product from Several Sources to Numerous Localities.* Journal of Mathematics and Physics, 20(1-4), 224-230.
- Koopmans, T.C. (1949). *Optimum Utilization of the Transportation System.* Econometrica, 17, 136-146.
- Dantzig, G.B. (1951). *Application of the Simplex Method to a Transportation Problem.* Activity Analysis of Production and Allocation, Cowles Commission Monograph 13.

**Prinsip:**
Meminimalkan cost (deviasi CBM) saat mendistribusikan supply (tipe karton) ke demand (item). Saat ini diimplementasikan sebagai greedy; dapat ditingkatkan ke ILP.

**Status:** Greedy implementation di `js/app.js` → Auto-Solve. ILP reference di `app_final.py` (PuLP).

---

## 3. Cascaded Rounding

**Diterapkan pada:** Kalkulasi freight (single rounding)

**Sumber:**
- Dorfleitner, G. & Klein, M. (1999). *Rounding with Multiplier Methods.* Mathematical Social Sciences, 37(3), 315-331.

**Prinsip:**
Intermediate rounding menambah akumulasi error. Rounding hanya boleh dilakukan sekali, di akhir rantai perhitungan.

```
SALAH:  freight = R2(R2(rawCbm) × rate)    ← 2× rounding, error ~$0.34/item
BENAR:  freight = R2(rawCbm × rate)          ← 1× rounding
```

**File implementasi:** `js/calc.js` → `calcFreight()`

---

## 4. Apportionment Theory (Balinski-Young Impossibility)

**Relevan untuk:** Distribusi FOB remainder

**Sumber:**
- Balinski, M.L. & Young, H.P. (1982). *Fair Representation: Meeting the Ideal of One Man, One Vote.* Yale University Press.
- Sainte-Laguë, A. (1910). *La représentation proportionnelle et la méthode des moindres carrés.* Annales scientifiques de l'École Normale Supérieure, 27, 529-542.

**Prinsip:**
Balinski-Young membuktikan bahwa tidak ada metode apportionment yang secara simultan memenuhi *quota rule* dan *house monotonicity*. Metode Webster/Sainte-Laguë memiliki bias terkecil terhadap ukuran (besar/kecil), sedangkan "dump remainder ke item terkecil" selalu bias terhadap item kecil.

**File implementasi:** `js/calc.js` → `calcAllCfrFob()` menggunakan `distributeProportional()` untuk distribusi FOB yang fair.

---

## 5. Integer Linear Programming (ILP)

**Relevan untuk:** Optimisasi alokasi karton (future improvement)

**Sumber:**
- Schrijver, A. (1998). *Theory of Linear and Integer Programming.* Wiley. ISBN: 978-0471982326
- PuLP Documentation: https://coin-or.github.io/pulp/

**Prinsip:**
Formulasi masalah alokasi sebagai:
```
Minimize: Σᵢ Σⱼ cᵢⱼ · xᵢⱼ
Subject to:
  Σⱼ xᵢⱼ = supply_i     (tiap tipe karton habis)
  Σᵢ xᵢⱼ = demand_j      (tiap item terpenuhi)
  xᵢⱼ ≥ 0, integer
```

**Status:** Diimplementasikan di `app_final.py` menggunakan PuLP. Belum porting ke frontend.

**Library frontend potensial:** [javascript-lp-solver](https://www.npmjs.com/package/javascript-lp-solver) (~15KB)

---

## 6. IEEE 754 Floating Point Arithmetic

**Relevan untuk:** Semua kalkulasi numerik dalam JavaScript

**Sumber:**
- IEEE Standard 754-2019: *IEEE Standard for Floating-Point Arithmetic*
- Goldberg, D. (1991). *What Every Computer Scientist Should Know About Floating-Point Arithmetic.* ACM Computing Surveys, 23(1), 5-48.

**Prinsip:**
JavaScript menggunakan IEEE 754 double-precision (64-bit). Operasi seperti `0.1 + 0.2 ≠ 0.3` memerlukan penanganan khusus. Solusi di proyek ini:
- `Number.EPSILON` correction di `R2()` untuk menghindari banker's rounding artifacts
- Integer arithmetic (cents) di `distributeProportional()` untuk menghindari floating point errors

---

*Terakhir diperbarui: 2026-04-30*
