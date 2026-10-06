import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const statsPath = resolve(__dirname, "..", "public", "stats.json");

let cached = null;
function getStats() {
  if (!cached) cached = JSON.parse(readFileSync(statsPath, "utf-8"));
  return cached;
}

// ─── Palette ────────────────────────────────────────────────────────────────
const C = {
  bg: "#08090b",
  panel: "#0e1013",
  edge: "#1a1d21",
  hairline: "#25282d",
  value: "#c5c7ca",
  label: "#686b70",
  faint: "#505358",
  heatLow: "#15171b",
  heatHigh: "#c5c7ca",
};

const MONO = "'Courier New','Lucida Console',monospace";
const SERIF = "'Georgia','Palatino Linotype','Book Antiqua','Palatino',serif";

function lerpHex(a, b, t) {
  const ch = (h, i) => parseInt(h.substr(i, 2), 16);
  const out = [1, 3, 5].map((i) => {
    const v = Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t);
    return v.toString(16).padStart(2, "0");
  });
  return `#${out.join("")}`;
}

const fmt = (n) => (n >= 1000 ? n.toLocaleString("en-US") : String(n));

// ─── Layout (authored at ~1:1 rendered px; GitHub renders width="100%") ────
const W = 832;
const H = 180;
const PAD = 24;

const SQUARE = 128;
const SQ_X = PAD;
const SQ_Y = PAD;
const CELL = 14;
const GAP = 3;
const PITCH = CELL + GAP;
const GRID = 7 * CELL + 6 * GAP; // 116
const GRID_X = SQ_X + (SQUARE - GRID) / 2;
const GRID_Y = SQ_Y + (SQUARE - GRID) / 2;

const RIGHT_X = 176;
const RIGHT_W = W - PAD - RIGHT_X;
const COLS = 4;
const COL_W = RIGHT_W / COLS;
const colCenter = (c) => RIGHT_X + COL_W * c + COL_W / 2;

const HEAD_Y = 40;
const RULE_Y = 54;
const ROW1_VAL = 98;
const ROW1_LBL = 118;
const ROW2_VAL = 148;
const ROW2_LBL = 168;

// ─── Calendar-aligned 7x7 daily heatmap (columns = weeks, rows = weekdays) ─
function buildHeatmap(stats) {
  const byDate = new Map(stats.intensity.map((p) => [p.d, p.c]));
  const dayMs = 864e5;
  const toISO = (ms) => new Date(ms).toISOString().slice(0, 10);

  const today = Date.parse(stats.window.to + "T00:00:00Z");
  const anchor = today - 42 * dayMs;
  const start = anchor - new Date(anchor).getUTCDay() * dayMs;

  const cells = [];
  let max = 0;
  for (let c = 0; c < 7; c++) {
    for (let r = 0; r < 7; r++) {
      const date = toISO(start + (c * 7 + r) * dayMs);
      const future = date > stats.window.to;
      const v = future ? 0 : byDate.get(date) ?? 0;
      if (v > max) max = v;
      cells.push({ c, r, v, future });
    }
  }
  return { cells, max };
}

export function renderStats(stats) {
  const s = stats.contributions;
  const p = stats.profile;
  const heat = buildHeatmap(stats);

  const head = `  <text x="${RIGHT_X}" y="${HEAD_Y}" font-family="${MONO}" font-size="10" fill="${C.faint}" letter-spacing="5">GITHUB\u00A0STATS</text>`;

  const rule = `  <line x1="${RIGHT_X}" y1="${RULE_Y}" x2="${W - PAD}" y2="${RULE_Y}" stroke="${C.edge}" stroke-width="1"/>`;

  const cells = heat.cells
    .map(({ c, r, v, future }) => {
      const x = GRID_X + c * PITCH;
      const y = GRID_Y + r * PITCH;
      const fill = future
        ? C.panel
        : lerpHex(C.heatLow, C.heatHigh, heat.max > 0 ? Math.pow(v / heat.max, 0.8) : 0);
      return `    <rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="1.5" fill="${fill}"/>`;
    })
    .join("\n");

  const square = `  <rect x="${SQ_X}" y="${SQ_Y}" width="${SQUARE}" height="${SQUARE}" rx="3" fill="${C.panel}" stroke="${C.edge}" stroke-width="1"/>
${cells}
  <text x="${SQ_X + SQUARE / 2}" y="${SQ_Y + SQUARE + 16}" font-family="${MONO}" font-size="8" fill="${C.faint}" text-anchor="middle" letter-spacing="2">LAST\u00A07\u00A0WEEKS</text>`;

  const stats1 = [
    ["GRADE", s.grade, false],
    ["CURRENT\u00A0STREAK", `${s.currentStreak}d`, false],
    ["LONGEST\u00A0STREAK", `${s.longestStreak}d`, false],
    ["CONTRIBUTIONS", fmt(s.total), false],
  ];
  const stats2 = [
    ["REPOSITORIES", fmt(p.repositories)],
    ["STARS", fmt(p.stars)],
    ["FOLLOWERS", fmt(p.followers)],
    ["PULL\u00A0REQUESTS", fmt(p.pullRequests)],
  ];

  const row = (items, yVal, yLbl) =>
    items
      .map(([label, value], i) => {
        const x = colCenter(i);
        return [
          `  <text x="${x}" y="${yVal}" font-family="${SERIF}" font-size="36" font-weight="normal" fill="${C.value}" text-anchor="middle">${value}</text>`,
          `  <text x="${x}" y="${yLbl}" font-family="${MONO}" font-size="9" fill="${C.label}" text-anchor="middle" letter-spacing="2">${label}</text>`,
        ].join("\n");
      })
      .join("\n");

  const r1 = row(stats1, ROW1_VAL, ROW1_LBL);
  const r2 = row(stats2, ROW2_VAL, ROW2_LBL);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="6" fill="${C.bg}" stroke="${C.hairline}" stroke-width="1"/>
${head}
${rule}
${square}
${r1}
${r2}
</svg>`;
}

export default async function handler(req, res) {
  try {
    const svg = renderStats(getStats());
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300, stale-while-revalidate=600");
    res.status(200).send(svg);
  } catch (e) {
    res.setHeader("Content-Type", "text/plain");
    res.status(500).send(`Error rendering stats: ${e.message}`);
  }
}