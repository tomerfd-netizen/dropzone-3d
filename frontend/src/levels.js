// ── Seeded RNG (LCG) ────────────────────────────────────────
// Used so every play of the same level always gets the same grid layout.
export function makeRng(seed) {
  let s = (seed ^ 0xdeadbeef) >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// ── Level Definitions ────────────────────────────────────────
// rows      : how many rows of bubbles to place
// numColors : distinct colors used (3–6)
// density   : fraction of grid cells filled (0–1)
// pattern   : 'random' | 'striped' | 'checkers'
export const LEVELS = [
  // ── Tier 1 (1–8): Beginner — 3 colors, sparse ───────────
  { rows: 3, numColors: 3, density: 0.60, pattern: 'random'   },
  { rows: 3, numColors: 3, density: 0.65, pattern: 'striped'  },
  { rows: 4, numColors: 3, density: 0.65, pattern: 'random'   },
  { rows: 4, numColors: 3, density: 0.70, pattern: 'checkers' },
  { rows: 4, numColors: 3, density: 0.72, pattern: 'random'   },
  { rows: 5, numColors: 3, density: 0.70, pattern: 'striped'  },
  { rows: 5, numColors: 3, density: 0.75, pattern: 'random'   },
  { rows: 5, numColors: 3, density: 0.78, pattern: 'checkers' },

  // ── Tier 2 (9–16): Easy — 4 colors ─────────────────────
  { rows: 5, numColors: 4, density: 0.72, pattern: 'random'   },
  { rows: 5, numColors: 4, density: 0.75, pattern: 'striped'  },
  { rows: 6, numColors: 4, density: 0.75, pattern: 'random'   },
  { rows: 6, numColors: 4, density: 0.78, pattern: 'checkers' },
  { rows: 6, numColors: 4, density: 0.80, pattern: 'random'   },
  { rows: 6, numColors: 4, density: 0.82, pattern: 'striped'  },
  { rows: 6, numColors: 4, density: 0.85, pattern: 'random'   },
  { rows: 6, numColors: 4, density: 0.87, pattern: 'checkers' },

  // ── Tier 3 (17–24): Medium — 5 colors ───────────────────
  { rows: 6, numColors: 5, density: 0.80, pattern: 'random'   },
  { rows: 7, numColors: 5, density: 0.80, pattern: 'striped'  },
  { rows: 7, numColors: 5, density: 0.82, pattern: 'random'   },
  { rows: 7, numColors: 5, density: 0.85, pattern: 'checkers' },
  { rows: 7, numColors: 5, density: 0.87, pattern: 'random'   },
  { rows: 7, numColors: 5, density: 0.88, pattern: 'striped'  },
  { rows: 7, numColors: 5, density: 0.90, pattern: 'random'   },
  { rows: 7, numColors: 5, density: 0.92, pattern: 'checkers' },

  // ── Tier 4 (25–32): Hard — 6 colors ─────────────────────
  { rows: 7, numColors: 6, density: 0.88, pattern: 'random'   },
  { rows: 8, numColors: 6, density: 0.88, pattern: 'striped'  },
  { rows: 8, numColors: 6, density: 0.90, pattern: 'random'   },
  { rows: 8, numColors: 6, density: 0.92, pattern: 'checkers' },
  { rows: 8, numColors: 6, density: 0.93, pattern: 'random'   },
  { rows: 8, numColors: 6, density: 0.95, pattern: 'striped'  },
  { rows: 8, numColors: 6, density: 0.97, pattern: 'random'   },
  { rows: 8, numColors: 6, density: 0.98, pattern: 'checkers' },

  // ── Tier 5 (33–40): Expert — max density ────────────────
  { rows: 8, numColors: 6, density: 1.00, pattern: 'random'   },
  { rows: 8, numColors: 6, density: 1.00, pattern: 'striped'  },
  { rows: 8, numColors: 6, density: 1.00, pattern: 'checkers' },
  { rows: 9, numColors: 6, density: 1.00, pattern: 'random'   },
  { rows: 9, numColors: 6, density: 1.00, pattern: 'striped'  },
  { rows: 9, numColors: 6, density: 1.00, pattern: 'checkers' },
  { rows: 9, numColors: 6, density: 1.00, pattern: 'random'   },
  { rows: 9, numColors: 6, density: 1.00, pattern: 'checkers' },
];

export const TOTAL_LEVELS = LEVELS.length; // 40
