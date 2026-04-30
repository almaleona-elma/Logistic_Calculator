# Referensi Keilmuan — Kalkulator PEB

> Daftar standar internasional, teori, dan paper yang menjadi landasan implementasi proyek ini.  
> Terakhir diperbarui: 2026-04-30

---

## Standar Internasional (ISO / IEEE / ICC)

### ISO 80000-1:2022 — Quantities and Units: General

- **Penerbit:** International Organization for Standardization
- **Edisi terkini:** 2022 (menggantikan edisi 2009)
- **Relevansi:** Annex B mendefinisikan aturan pembulatan resmi:
  - **Round-half-to-even** ("banker's rounding") — bilangan yang tepat di tengah (misal 2.5) dibulatkan ke genap terdekat
  - Meminimalkan bias sistematik pada dataset besar
- **Diterapkan pada:** Fungsi `R2()` di `js/calc.js`
- **URL:** [ISO 80000-1:2022](https://www.iso.org/standard/76921.html)

### IEEE 754-2019 — Standard for Floating-Point Arithmetic

- **Penerbit:** Institute of Electrical and Electronics Engineers
- **Edisi terkini:** 2019 (revisi dari IEEE 754-2008)
- **Relevansi:** JavaScript `Number` menggunakan IEEE 754 binary64 (double-precision). Standard ini mendefinisikan:
  - 5 mode rounding (roundTiesToEven adalah default)
  - Representasi NaN, Infinity, signed zero
  - Mengapa `0.1 + 0.2 ≠ 0.3`
- **Diterapkan pada:** `Number.EPSILON` correction di `R2()`, integer arithmetic (cents) di `distributeProportional()`
- **URL:** [IEEE 754-2019](https://standards.ieee.org/ieee/754/6210/)
- **Companion:** Goldberg, D. (1991). *What Every Computer Scientist Should Know About Floating-Point Arithmetic.* ACM Computing Surveys, 23(1), 5-48. [DOI: 10.1145/103162.103163](https://doi.org/10.1145/103162.103163)

### Incoterms® 2020 — International Commercial Terms

- **Penerbit:** International Chamber of Commerce (ICC), Publikasi No. 723
- **Edisi terkini:** 2020 (berlaku sejak 1 Januari 2020)
- **Relevansi:** Mendefinisikan pembagian biaya dan risiko antara penjual dan pembeli:
  - **FOB** (Free On Board): Biaya penjual sampai barang naik kapal
  - **CFR** (Cost and Freight): Penjual menanggung freight sampai pelabuhan tujuan
  - Rumus inti proyek: `FOB = CFR − Freight`
- **Diterapkan pada:** Seluruh pipeline kalkulasi CFR/FOB di `js/calc.js`
- **URL:** [ICC Incoterms® 2020](https://iccwbo.org/business-solutions/incoterms-rules/incoterms-2020/)

### ISO 668:2020 — Series 1 Freight Containers: Classification, Dimensions and Ratings

- **Penerbit:** International Organization for Standardization
- **Edisi terkini:** 2020 (Amd 1:2023)
- **Relevansi:** Mendefinisikan dimensi standar container freight (20ft, 40ft, 45ft). Tidak langsung dipakai di proyek, tapi merupakan konteks domain pengiriman barang.
- **URL:** [ISO 668:2020](https://www.iso.org/standard/76912.html)

### ISO 6346:2022 — Freight Containers: Coding, Identification and Marking

- **Penerbit:** International Organization for Standardization
- **Edisi terkini:** 2022
- **Relevansi:** Sistem identifikasi container (Owner Code + Serial + Check Digit). Konteks domain untuk memahami dokumen PEB.
- **URL:** [ISO 6346:2022](https://www.iso.org/standard/83558.html)

### WTO Agreement on Customs Valuation (ACV)

- **Penerbit:** World Trade Organization / World Customs Organization (WCO)
- **Relevansi:** Mengatur metode penentuan nilai pabean barang impor:
  - Metode utama: **Transaction Value** (harga yang benar-benar dibayar)
  - Apakah freight masuk nilai pabean tergantung legislasi nasional
- **Diterapkan pada:** Konteks pemahaman mengapa FOB diperlukan (basis nilai pabean di Indonesia)
- **URL:** [WCO Customs Valuation](https://www.wcoomd.org/en/topics/valuation.aspx)

---

## Algoritma & Teori Matematika

### 1. Largest Remainder Method (Hare-Niemeyer)

- **Asal:** Teori Apportionment (pembagian kursi proporsional di parlemen)
- **Referensi utama:**
  - Balinski, M.L. & Young, H.P. (2001). *Fair Representation: Meeting the Ideal of One Man, One Vote.* 2nd ed. Brookings Institution Press. ISBN: 978-0815701118
  - Pukelsheim, F. (2017). *Proportional Representation: Apportionment Methods and Their Applications.* 2nd ed. Springer. ISBN: 978-3319647067. [DOI: 10.1007/978-3-319-64707-4](https://doi.org/10.1007/978-3-319-64707-4)
- **Prinsip:** Membagi total secara proporsional dengan jaminan `Σ result = total` (exact)
- **Diterapkan pada:** `distributeProportional()` di `js/calc.js` untuk freight & FOB

### 2. Cascaded Rounding

- **Referensi:**
  - Dorfleitner, G. & Klein, M. (1999). *Rounding with Multiplier Methods.* Mathematical Social Sciences, 37(3), 315-331. [DOI: 10.1016/S0165-4896(98)00033-3](https://doi.org/10.1016/S0165-4896(98)00033-3)
- **Prinsip:** Intermediate rounding menambah akumulasi error. Rounding hanya boleh dilakukan sekali di akhir rantai perhitungan.
- **Diterapkan pada:** `calcFreight()` — single rounding `R2(rawCbm * rate)` bukan `R2(R2(rawCbm) * rate)`

### 3. Transportation Problem (Hitchcock-Koopmans)

- **Referensi:**
  - Hitchcock, F.L. (1941). *The Distribution of a Product from Several Sources to Numerous Localities.* J. Math. Phys., 20(1-4), 224-230. [DOI: 10.1002/sapm1941201224](https://doi.org/10.1002/sapm1941201224)
  - Schrijver, A. (1998). *Theory of Linear and Integer Programming.* Wiley. ISBN: 978-0471982326
  - Referensi modern: Bertsimas, D. & Tsitsiklis, J.N. (1997). *Introduction to Linear Optimization.* Athena Scientific. ISBN: 978-1886529199
- **Relevansi:** Alokasi karton ke item sebagai masalah transportasi (supply = template qty, demand = target qty)
- **Status:** Greedy di `js/app.js`. ILP belum porting ke frontend.

### 4. CBM Calculation — Industry Standard

- **Tidak ada ISO khusus** untuk kalkulasi CBM — ini adalah rumus volume dasar:
  ```
  CBM = Panjang (m) × Lebar (m) × Tinggi (m)
  CBM = P (cm) × L (cm) × T (cm) / 1,000,000
  ```
- **Standar industri:** Digunakan secara universal oleh IATA (air freight), WCO, dan semua carrier maritim
- **Diterapkan pada:** `calcVolume()` di `js/calc.js`

---

## Daftar Singkat

| Standar / Teori | Edisi | Dipakai di |
|-----------------|-------|------------|
| ISO 80000-1:2022 | 2022 | `R2()` rounding rules |
| IEEE 754-2019 | 2019 | `Number` arithmetic, `Number.EPSILON` |
| Incoterms® 2020 (ICC 723) | 2020 | FOB/CFR calculation pipeline |
| ISO 668:2020 (Amd 1:2023) | 2020+2023 | Domain context (container dims) |
| ISO 6346:2022 | 2022 | Domain context (container ID) |
| WTO/WCO Customs Valuation | — | FOB sebagai basis nilai pabean |
| Hare-Niemeyer (Balinski & Young) | 2001 | `distributeProportional()` |
| Pukelsheim Apportionment | 2017 (2nd ed) | Teori pendukung LRM |
| Cascaded Rounding (Dorfleitner) | 1999 | Single-round freight |
| Transportation Problem (Hitchcock) | 1941 | Auto-Solve allocation |

---

*Terakhir diperbarui: 2026-04-30*
