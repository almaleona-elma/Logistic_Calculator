# ==============================================================================
#                 KALKULATOR ALOKASI LOGISTIK - Versi Desktop (Bersih)
# ==============================================================================
# Fitur:
# - Multi tipe karton (nama + P/L/T cm -> volume otomatis m^3)
# - Data item pengiriman (nama, jumlah karton, total CBM, preferensi tipe karton)
# - Optimisasi dengan PuLP: minimalkan selisih total volume vs total CBM
# - Distribusi hasil total per tipe kembali ke tiap item (hormati preferensi)
# - Validasi input + tombol Reset
# ==============================================================================

import PySimpleGUI as sg
import pulp

# -------------------------- UTIL & OPTIMISASI -------------------------- #


def solve_allocation(carton_types, shipping_items):
    """
    Mencari total jumlah tiap tipe karton (integer) yang:
    - jumlah karton = total karton di shipping_items
    - total volume mendekati total CBM shipping_items (minimalkan deviasi absolut)
    """
    # Grand total
    total_cartons = sum(i["count"] for i in shipping_items)
    target_cbm = sum(i["cbm"] for i in shipping_items)

    # LP model
    prob = pulp.LpProblem("AllocationProblem", pulp.LpMinimize)

    # Variabel keputusan: jumlah tiap tipe karton (integer >= 0)
    names = [ct["name"] for ct in carton_types]
    x = pulp.LpVariable.dicts("Carton", names, lowBound=0, cat="Integer")

    # Variabel deviasi (>=0) supaya bisa minimize |total_volume - target_cbm|
    e = pulp.LpVariable("deviation", lowBound=0)

    # Total volume (ekspresi)
    total_volume = pulp.lpSum(x[ct["name"]] * ct["volume"] for ct in carton_types)

    # Objective: minimize deviasi
    prob += e

    # Constraint jumlah karton sama persis
    prob += pulp.lpSum(x[n] for n in names) == total_cartons, "TotalCartonsMatch"

    # Constraint deviasi absolut: -e <= (total_volume - target_cbm) <= e
    prob += total_volume - target_cbm <= e, "DevPos"
    prob += target_cbm - total_volume <= e, "DevNeg"

    # Solve
    prob.solve(pulp.PULP_CBC_CMD(msg=False))

    if pulp.LpStatus[prob.status] != "Optimal":
        return (
            None,
            "Tidak ada solusi optimal. Cek konsistensi data (CBM & jumlah karton).",
        )

    return {n: int(x[n].value()) for n in names}, None


def distribute_results(solved_counts, shipping_items, carton_types):
    """
    Bagi total per-tipe (solved_counts) ke setiap item:
    1) pakai tipe preferensi item dulu,
    2) sisa dipenuhi dari tipe dengan volume terbesar.
    """
    # stok yang tersedia per tipe
    stock = solved_counts.copy()
    # urutkan item: yang punya preferensi dulu, lalu jumlah kecil ke besar
    items = sorted(
        shipping_items,
        key=lambda r: (r["preference"] == "" or r["preference"] is None, r["count"]),
    )

    # daftar tipe diurutkan dari volume terbesar
    types_sorted = sorted(carton_types, key=lambda ct: ct["volume"], reverse=True)
    type_names = [ct["name"] for ct in types_sorted]

    results = []
    for it in items:
        need = it["count"]
        alloc = {n: 0 for n in type_names}

        # 1) pakai preferensi
        pref = it.get("preference") or ""
        if pref and stock.get(pref, 0) > 0:
            take = min(need, stock[pref])
            alloc[pref] += take
            stock[pref] -= take
            need -= take

        # 2) penuhi sisa dari tipe volume terbesar
        for n in type_names:
            if need <= 0:
                break
            avail = stock.get(n, 0)
            if avail > 0:
                take = min(need, avail)
                alloc[n] += take
                stock[n] -= take
                need -= take

        results.append({"name": it["name"], "allocation": alloc})

    return results


# ------------------------------- GUI ---------------------------------- #

sg.theme("SystemDefaultForReal")

# Bagian definisi tipe karton
carton_editor = [
    [
        sg.Text("Nama"),
        sg.Input(key="-CT_NAME-", size=(14, 1)),
        sg.Text("P"),
        sg.Input(key="-CT_L-", size=(6, 1)),
        sg.Text("L"),
        sg.Input(key="-CT_W-", size=(6, 1)),
        sg.Text("T"),
        sg.Input(key="-CT_H-", size=(6, 1)),
        sg.Button("Tambah", key="-ADD_CT-"),
    ],
    [
        sg.Table(
            values=[],
            headings=["Nama", "P(cm)", "L(cm)", "T(cm)", "Vol (m³)"],
            key="-CT_TABLE-",
            auto_size_columns=False,
            col_widths=[14, 8, 8, 8, 10],
            justification="right",
            display_row_numbers=True,
            num_rows=5,
            enable_events=True,
        )
    ],
    [
        sg.Button("Hapus Terpilih", key="-DEL_CT-"),
        sg.Button("Reset Tipe", key="-RESET_CT-"),
    ],
]

# Bagian item pengiriman
item_editor = [
    [
        sg.Text("Item"),
        sg.Input(key="-ITEM_NAME-", size=(14, 1)),
        sg.Text("Jml"),
        sg.Input(key="-ITEM_COUNT-", size=(6, 1)),
        sg.Text("CBM"),
        sg.Input(key="-ITEM_CBM-", size=(8, 1)),
        sg.Text("Preferensi"),
        sg.Combo(values=[], key="-ITEM_PREF-", size=(14, 1), readonly=True),
        sg.Button("Tambah", key="-ADD_ITEM-"),
    ],
    [
        sg.Table(
            values=[],
            headings=["Item", "Jml Karton", "Total CBM", "Preferensi"],
            key="-ITEM_TABLE-",
            auto_size_columns=False,
            col_widths=[14, 10, 10, 14],
            justification="right",
            display_row_numbers=True,
            num_rows=7,
            enable_events=True,
        )
    ],
    [
        sg.Button("Hapus Terpilih", key="-DEL_ITEM-"),
        sg.Button("Reset Item", key="-RESET_ITEM-"),
    ],
]

layout = [
    [sg.Text("Kalkulator Alokasi Logistik", font=("Helvetica", 16, "bold"))],
    [sg.Frame("Langkah 1 • Tipe Karton", carton_editor)],
    [sg.Frame("Langkah 2 • Item Pengiriman", item_editor)],
    [
        sg.Button(
            "HITUNG & ALOKASIKAN",
            key="-CALC-",
            size=(28, 2),
            font=("Helvetica", 12, "bold"),
        )
    ],
    [
        sg.Multiline(
            key="-OUT-",
            size=(90, 18),
            font=("Consolas", 10),
            autoscroll=True,
            disabled=True,
        )
    ],
]

window = sg.Window("Aplikasi Kalkulator Logistik", layout)

# Storage
carton_types = []  # list of dict: name, l,w,h, volume
shipping_items = []  # list of dict: name, count, cbm, preference


def refresh_ct_table(win):
    win["-CT_TABLE-"].update(
        values=[
            [d["name"], d["l"], d["w"], d["h"], f"{d['volume']:.5f}"]
            for d in carton_types
        ]
    )
    win["-ITEM_PREF-"].update(values=[d["name"] for d in carton_types])


def refresh_item_table(win):
    win["-ITEM_TABLE-"].update(
        values=[
            [d["name"], d["count"], d["cbm"], d["preference"]] for d in shipping_items
        ]
    )


while True:
    event, v = window.read()
    if event in (sg.WIN_CLOSED, None):
        break

    # ---- Tipe Karton ----
    if event == "-ADD_CT-":
        try:
            name = (v["-CT_NAME-"] or "").strip()
            l = float(v["-CT_L-"])
            w = float(v["-CT_W-"])
            h = float(v["-CT_H-"])
            if not name or l <= 0 or w <= 0 or h <= 0:
                raise ValueError
            vol = (l * w * h) / 1_000_000  # cm^3 -> m^3
            carton_types.append({"name": name, "l": l, "w": w, "h": h, "volume": vol})
            refresh_ct_table(window)
            # clear input
            for k in ["-CT_NAME-", "-CT_L-", "-CT_W-", "-CT_H-"]:
                window[k].update("")
        except Exception:
            sg.popup_error("Input tipe karton tidak valid. Isi Nama & angka P/L/T > 0.")

    if event == "-DEL_CT-":
        sel = v.get("-CT_TABLE-", [])
        if sel:
            try:
                carton_types.pop(sel[0])
                refresh_ct_table(window)
            except Exception:
                pass
        else:
            sg.popup_error("Pilih baris tipe karton yang ingin dihapus.")

    if event == "-RESET_CT-":
        carton_types.clear()
        refresh_ct_table(window)

    # ---- Item ----
    if event == "-ADD_ITEM-":
        try:
            name = (v["-ITEM_NAME-"] or "").strip()
            count = int(v["-ITEM_COUNT-"])
            cbm = float(v["-ITEM_CBM-"])
            pref = v["-ITEM_PREF-"] or ""
            if not name or count <= 0 or cbm <= 0:
                raise ValueError
            shipping_items.append(
                {"name": name, "count": count, "cbm": cbm, "preference": pref}
            )
            refresh_item_table(window)
            for k in ["-ITEM_NAME-", "-ITEM_COUNT-", "-ITEM_CBM-"]:
                window[k].update("")
        except Exception:
            sg.popup_error("Input item tidak valid. Isi Nama, Jml(>0), CBM(>0).")

    if event == "-DEL_ITEM-":
        sel = v.get("-ITEM_TABLE-", [])
        if sel:
            try:
                shipping_items.pop(sel[0])
                refresh_item_table(window)
            except Exception:
                pass
        else:
            sg.popup_error("Pilih baris item yang ingin dihapus.")

    if event == "-RESET_ITEM-":
        shipping_items.clear()
        refresh_item_table(window)

    # ---- Hitung ----
    if event == "-CALC-":
        if not carton_types:
            sg.popup_error("Masukkan minimal 1 tipe karton.")
            continue
        if not shipping_items:
            sg.popup_error("Masukkan minimal 1 item pengiriman.")
            continue

        window["-OUT-"].update("Menghitung... mohon tunggu.\n")

        solved, err = solve_allocation(carton_types, shipping_items)
        if err:
            window["-OUT-"].update(f"ERROR: {err}\n")
            continue

        detail = distribute_results(solved, shipping_items, carton_types)

        # ---- Cetak hasil ----
        lines = []
        lines.append("==============================================")
        lines.append("            HASIL ALOKASI (OPTIMAL)           ")
        lines.append("==============================================\n")
        lines.append(f"Total karton = {sum(i['count'] for i in shipping_items)}")
        lines.append(
            f"Total CBM (target) = {sum(i['cbm'] for i in shipping_items):.5f} m³"
        )
        total_vol = sum(
            solved[n] * next(ct["volume"] for ct in carton_types if ct["name"] == n)
            for n in solved
        )
        lines.append(f"Total volume dari hasil = {total_vol:.5f} m³\n")

        lines.append("Ringkasan total per tipe:")
        for n, c in solved.items():
            if c > 0:
                lines.append(f"  - {n}: {c} karton")
        lines.append("")

        # header tabel
        header = "Item".ljust(16)
        for ct in carton_types:
            header += ct["name"][:10].center(10)
        header += "Total".center(8) + "CBM Baru".center(12)
        lines.append(header)
        lines.append("-" * len(header))

        g_total_ct = 0
        g_total_cbm = 0.0
        for it in detail:
            row = it["name"][:16].ljust(16)
            item_ct = 0
            item_cbm = 0.0
            for ct in carton_types:
                cnt = it["allocation"].get(ct["name"], 0)
                row += str(cnt).center(10)
                item_ct += cnt
                item_cbm += cnt * ct["volume"]
            row += str(item_ct).center(8) + f"{item_cbm:.2f} m³".center(12)
            lines.append(row)
            g_total_ct += item_ct
            g_total_cbm += item_cbm

        lines.append("-" * len(header))
        foot = "GRAND TOTAL".ljust(16)
        for ct in carton_types:
            foot += str(solved.get(ct["name"], 0)).center(10)
        foot += str(g_total_ct).center(8) + f"{g_total_cbm:.2f} m³".center(12)
        lines.append(foot)

        window["-OUT-"].update("\n".join(lines))

window.close()
