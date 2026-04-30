module.exports = [
  {
    name: "DS1: Standard Fashion Goods",
    rate: 120, // $120/CBM
    globalCfr: 35400.00,
    tpls: [
      { p: 60, l: 40, t: 40, qty: 100 }, // 0.096 cbm
      { p: 50, l: 40, t: 30, qty: 50 }   // 0.06 cbm
    ],
    items: [
      { alloc: [{ tplIdx: 0, qty: 60 }, { tplIdx: 1, qty: 20 }], cfr: 21240.00 },
      { alloc: [{ tplIdx: 0, qty: 40 }, { tplIdx: 1, qty: 30 }], cfr: 14160.00 }
    ]
  },
  {
    name: "DS2: High Value Electronics",
    rate: 85.50,
    globalCfr: 125890.45,
    tpls: [
      { p: 35, l: 25, t: 15, qty: 200 } // 0.013125 cbm
    ],
    items: [
      { alloc: [{ tplIdx: 0, qty: 50 }], cfr: 31472.61 },
      { alloc: [{ tplIdx: 0, qty: 100 }], cfr: 62945.23 },
      { alloc: [{ tplIdx: 0, qty: 50 }], cfr: 31472.61 }
    ]
  },
  {
    name: "DS3: Low Value, High Volume (Fabrics)",
    rate: 140,
    globalCfr: 12500.00,
    tpls: [
      { p: 150, l: 50, t: 50, qty: 80 }, // 0.375 cbm
      { p: 120, l: 40, t: 40, qty: 40 }  // 0.192 cbm
    ],
    items: [
      { alloc: [{ tplIdx: 0, qty: 80 }, { tplIdx: 1, qty: 40 }], cfr: 12500.00 }
    ]
  },
  {
    name: "DS4: Odd Dimensions & Cents",
    rate: 113.33,
    globalCfr: 47854.91,
    tpls: [
      { p: 44.5, l: 33.2, t: 28.1, qty: 77 }, // 0.04151494
      { p: 55.1, l: 42.0, t: 31.5, qty: 34 }  // 0.0728973
    ],
    items: [
      { alloc: [{ tplIdx: 0, qty: 30 }, { tplIdx: 1, qty: 14 }], cfr: 18000.50 },
      { alloc: [{ tplIdx: 0, qty: 47 }, { tplIdx: 1, qty: 20 }], cfr: 29854.41 }
    ]
  },
  {
    name: "DS5: Very Small LCL Shipment",
    rate: 250,
    globalCfr: 1500.00,
    tpls: [
      { p: 30, l: 30, t: 30, qty: 5 } // 0.027 cbm
    ],
    items: [
      { alloc: [{ tplIdx: 0, qty: 2 }], cfr: 600.00 },
      { alloc: [{ tplIdx: 0, qty: 3 }], cfr: 900.00 }
    ]
  },
  {
    name: "DS6: Heavy Machinery Parts",
    rate: 90.25,
    globalCfr: 89000.75,
    tpls: [
      { p: 120, l: 100, t: 80, qty: 10 }, // 0.96 cbm
      { p: 80, l: 80, t: 60, qty: 15 }    // 0.384 cbm
    ],
    items: [
      { alloc: [{ tplIdx: 0, qty: 4 }, { tplIdx: 1, qty: 5 }], cfr: 30000.25 },
      { alloc: [{ tplIdx: 0, qty: 6 }, { tplIdx: 1, qty: 10 }], cfr: 59000.50 }
    ]
  },
  {
    name: "DS7: Complex Allocation (5 Items)",
    rate: 135,
    globalCfr: 45678.90,
    tpls: [
      { p: 50, l: 40, t: 30, qty: 100 } // 0.06 cbm
    ],
    items: [
      { alloc: [{ tplIdx: 0, qty: 10 }], cfr: 4567.89 },
      { alloc: [{ tplIdx: 0, qty: 20 }], cfr: 9135.78 },
      { alloc: [{ tplIdx: 0, qty: 30 }], cfr: 13703.67 },
      { alloc: [{ tplIdx: 0, qty: 15 }], cfr: 6851.83 },
      { alloc: [{ tplIdx: 0, qty: 25 }], cfr: 11419.73 }
    ]
  },
  {
    name: "DS8: Irregular Cartons Distribution",
    rate: 160.75,
    globalCfr: 34560.88,
    tpls: [
      { p: 40, l: 30, t: 20, qty: 13 },
      { p: 45, l: 35, t: 25, qty: 17 },
      { p: 50, l: 40, t: 30, qty: 19 }
    ],
    items: [
      { alloc: [{ tplIdx: 0, qty: 5 }, { tplIdx: 1, qty: 5 }, { tplIdx: 2, qty: 5 }], cfr: 10000.00 },
      { alloc: [{ tplIdx: 0, qty: 8 }, { tplIdx: 1, qty: 12 }, { tplIdx: 2, qty: 14 }], cfr: 24560.88 }
    ]
  },
  {
    name: "DS9: Symmetric Allocation",
    rate: 100,
    globalCfr: 30000.00,
    tpls: [
      { p: 50, l: 50, t: 50, qty: 30 }
    ],
    items: [
      { alloc: [{ tplIdx: 0, qty: 10 }], cfr: 10000.00 },
      { alloc: [{ tplIdx: 0, qty: 10 }], cfr: 10000.00 },
      { alloc: [{ tplIdx: 0, qty: 10 }], cfr: 10000.00 }
    ]
  },
  {
    name: "DS10: Extreme Decimal Constraints",
    rate: 199.99,
    globalCfr: 99999.99,
    tpls: [
      { p: 33.3, l: 33.3, t: 33.3, qty: 99 }
    ],
    items: [
      { alloc: [{ tplIdx: 0, qty: 33 }], cfr: 33333.33 },
      { alloc: [{ tplIdx: 0, qty: 33 }], cfr: 33333.33 },
      { alloc: [{ tplIdx: 0, qty: 33 }], cfr: 33333.33 }
    ]
  }
];
