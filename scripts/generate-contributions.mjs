#!/usr/bin/env node

/**
 * generate-contributions.mjs
 *
 * Fetches real GitHub contribution data and renders a monochrome
 * vertical-bar histogram SVG with a proper "nice number" Y-axis.
 *
 * Usage:
 *   GITHUB_TOKEN=ghp_xxx node scripts/generate-contributions.mjs
 *   GH_TOKEN=ghp_xxx node scripts/generate-contributions.mjs
 *
 * Output:
 *   assets/contributions.svg
 *   /tmp/contribution-debug.json (development only)
 *
 * Zero external dependencies. Requires Node.js 18+ (built-in fetch).
 */

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "..", "assets", "contributions.svg");
const DEBUG_PATH = "/tmp/contribution-debug.json";

const USERNAME = "Mayur11code";

const TOKEN =
  process.env.GITHUB_TOKEN ||
  process.env.GH_TOKEN;

if (!TOKEN) {
  console.error(
    "Error: No GitHub token found.\n" +
      "Set GITHUB_TOKEN or GH_TOKEN environment variable.\n\n" +
      "  GITHUB_TOKEN=ghp_xxx node scripts/generate-contributions.mjs"
  );
  process.exit(1);
}

// ─── GraphQL ────────────────────────────────────────────────────────────────

const GITHUB_API = "https://api.github.com/graphql";

async function fetchContributions(from, to) {
  const query = `
    query($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            totalContributions
            weeks {
              firstDay
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }
  `;

  const body = JSON.stringify({ query, variables: { login: USERNAME, from, to } });

  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(GITHUB_API, {
      method: "POST",
      headers: {
        Authorization: `bearer ${TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": "contribution-histogram-gen",
      },
      body,
    });

    if (res.status === 403) {
      const retryAfter = res.headers.get("retry-after");
      const wait = retryAfter ? parseInt(retryAfter, 10) * 1000 : attempt * 15000;
      console.warn(`Rate limited. Waiting ${wait / 1000}s (attempt ${attempt}/3)...`);
      await sleep(wait);
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub API error ${res.status}: ${text}`);
    }

    const json = await res.json();

    if (json.errors?.length) {
      const msg = json.errors.map((e) => e.message).join("; ");
      if (msg.includes("RESOURCE_LIMITS") && attempt < 3) {
        console.warn(`Resource limits hit (attempt ${attempt}/3). Retrying...`);
        await sleep(5000);
        continue;
      }
      throw new Error(`GraphQL errors: ${msg}`);
    }

    return json.data.user.contributionsCollection.contributionCalendar;
  }

  throw new Error("Failed after 3 attempts");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Nice Number Scale ──────────────────────────────────────────────────────

function calculateNiceScale(maxValue, targetTicks = 5) {
  if (maxValue <= 0) {
    return { axisMax: 1, tickStep: 1, ticks: [0, 1] };
  }

  const rawStep = maxValue / targetTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;

  let niceMultiplier;
  if (normalized <= 1) niceMultiplier = 1;
  else if (normalized <= 2) niceMultiplier = 2;
  else if (normalized <= 2.5) niceMultiplier = 2.5;
  else if (normalized <= 5) niceMultiplier = 5;
  else niceMultiplier = 10;

  const tickStep = niceMultiplier * magnitude;
  const axisMax = Math.ceil(maxValue / tickStep) * tickStep;

  const ticks = [];
  for (let v = 0; v <= axisMax + tickStep * 0.01; v += tickStep) {
    ticks.push(Math.round(v * 1000) / 1000);
  }

  return { axisMax, tickStep, ticks };
}

// ─── Data Pipeline ──────────────────────────────────────────────────────────

async function fetchRollingContributions() {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  const cutoff = today;

  const midDate = new Date(startDate.getTime() + (endDate.getTime() - startDate.getTime()) / 2);

  console.log(`Fetching contributions for ${USERNAME}...`);
  console.log(`  Period: ${startDate.toISOString().split("T")[0]} \u2192 ${cutoff}`);

  let allWeeks = [];
  let totalContributions = 0;

  try {
    const cal1 = await fetchContributions(
      startDate.toISOString(),
      midDate.toISOString()
    );
    allWeeks.push(...cal1.weeks);
    totalContributions += cal1.totalContributions;
    console.log(`  Window 1: ${cal1.totalContributions} contributions`);

    await sleep(1000);

    const cal2 = await fetchContributions(
      new Date(midDate.getTime() + 1000).toISOString(),
      endDate.toISOString()
    );
    allWeeks.push(...cal2.weeks);
    totalContributions += cal2.totalContributions;
    console.log(`  Window 2: ${cal2.totalContributions} contributions`);
  } catch (err) {
    console.warn(`Split-window fetch failed: ${err.message}`);
    console.warn("Falling back to rolling 12-month range...");

    const cal = await fetchContributions(startDate.toISOString(), endDate.toISOString());
    allWeeks = cal.weeks;
    totalContributions = cal.totalContributions;
    console.log(`  Fallback: ${cal.totalContributions} contributions`);
  }

  // Clip all contribution days to today
  for (const week of allWeeks) {
    week.contributionDays = week.contributionDays.filter((day) => day.date <= cutoff);
  }
  const filteredWeeks = allWeeks.filter((w) => w.contributionDays.length > 0);

  console.log(`Total: ${totalContributions} contributions across ${filteredWeeks.length} weeks`);

  return { weeks: filteredWeeks, totalContributions };
}

// ─── Validation ─────────────────────────────────────────────────────────────

function validateData(weeks) {
  const today = new Date().toISOString().split("T")[0];
  let errors = 0;

  for (const week of weeks) {
    for (const day of week.contributionDays) {
      if (day.date > today) {
        console.error(`  FAIL: Future date detected: ${day.date}`);
        errors++;
      }
      if (day.contributionCount < 0) {
        console.error(`  FAIL: Negative count on ${day.date}: ${day.contributionCount}`);
        errors++;
      }
    }
  }

  if (errors > 0) {
    throw new Error(`Validation failed with ${errors} error(s). Aborting to prevent misleading output.`);
  }

  console.log("  Validation passed: no future dates, no negative counts.");
}

// ─── SVG Renderer ───────────────────────────────────────────────────────────

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function renderHistogram(weeks) {
  const barWidth = 3;
  const barGap = 2;
  const barPitch = barWidth + barGap;
  const leftPadding = 2;
  const rightPadding = 2;
  const yAxisWidth = 30;
  const labelHeight = 16;
  const titleHeight = 14;
  const topPadding = 4;
  const bottomPadding = 2;

  const chartWidth = weeks.length * barPitch - barGap + leftPadding + rightPadding;
  const svgWidth = chartWidth + yAxisWidth;
  const maxBarHeight = 72;
  const chartTop = titleHeight + topPadding;
  const chartBottom = chartTop + maxBarHeight;
  const svgHeight = chartBottom + labelHeight + bottomPadding;

  // Aggregate by week
  const weeklyCounts = weeks.map((w) =>
    w.contributionDays.reduce((sum, d) => sum + d.contributionCount, 0)
  );

  const maxCount = Math.max(...weeklyCounts, 0);

  // Nice number scale — used for BOTH bars AND Y-axis
  const { axisMax, ticks } = calculateNiceScale(maxCount, 5);

  console.log(`  Max weekly count: ${maxCount}`);
  console.log(`  Axis max: ${axisMax}, ticks: [${ticks.join(", ")}]`);

  // Determine month label positions
  const monthLabels = [];
  let lastMonth = -1;
  for (let i = 0; i < weeks.length; i++) {
    const firstDay = new Date(weeks[i].firstDay + "T00:00:00");
    const month = firstDay.getMonth();
    if (month !== lastMonth) {
      // Skip if too close to previous label (minimum 30px apart)
      if (monthLabels.length > 0) {
        const prevIdx = monthLabels[monthLabels.length - 1].index;
        const gap = (i - prevIdx) * barPitch;
        if (gap < 30) continue;
      }
      monthLabels.push({ month, index: i });
      lastMonth = month;
    }
  }

  // Build bars — heights use axisMax (same scale as Y-axis)
  const bars = weeklyCounts
    .map((count, i) => {
      const height = axisMax > 0 ? Math.max(1, (count / axisMax) * maxBarHeight) : 1;
      const x = leftPadding + i * barPitch;
      const y = chartBottom - height;
      const t = axisMax > 0 ? count / axisMax : 0;
      // Color: #3b3e43 (low) to #c5c7ca (high)
      const r = Math.round(0x3b + t * (0xc5 - 0x3b));
      const g = Math.round(0x3e + t * (0xc7 - 0x3e));
      const b = Math.round(0x43 + t * (0xca - 0x43));
      const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
      const opacity = count === 0 ? 0.3 : 0.5 + t * 0.5;
      return `  <rect x="${x}" y="${y.toFixed(2)}" width="${barWidth}" height="${height.toFixed(2)}" fill="${hex}" opacity="${opacity.toFixed(2)}" rx="0.5"/>`;
    })
    .join("\n");

  // Month labels
  const labels = monthLabels
    .map(({ month, index }) => {
      const x = leftPadding + index * barPitch + barWidth / 2;
      return `  <text x="${x}" y="${svgHeight - 1}" font-family="'Courier New','Lucida Console',monospace" font-size="6" fill="#686b70" text-anchor="middle">${MONTHS[month]}</text>`;
    })
    .join("\n");

  // Baseline
  const baseline = `  <line x1="0" y1="${chartBottom}" x2="${chartWidth}" y2="${chartBottom}" stroke="#25282d" stroke-width="0.5" opacity="0.6"/>`;

  // Y-axis ticks and gridlines — use the SAME ticks and axisMax
  const yAxisX = chartWidth + 6;
  const yTicks = ticks
    .map((tickVal, i) => {
      const y = chartBottom - (tickVal / axisMax) * maxBarHeight;
      const elements = [];
      // Gridline (skip bottom baseline and top)
      if (i > 0 && i < ticks.length) {
        elements.push(`  <line x1="${leftPadding}" y1="${y.toFixed(2)}" x2="${chartWidth}" y2="${y.toFixed(2)}" stroke="#25282d" stroke-width="0.3" opacity="0.5"/>`);
      }
      // Label
      const label = tickVal >= 1000 ? `${(tickVal / 1000).toFixed(tickVal % 1000 === 0 ? 0 : 1)}k` : String(tickVal);
      elements.push(`  <text x="${yAxisX}" y="${(y + 2.5).toFixed(2)}" font-family="'Courier New','Lucida Console',monospace" font-size="6" fill="#686b70" text-anchor="start">${label}</text>`);
      return elements.join("\n");
    })
    .join("\n");

  // Title
  const titleX = chartWidth / 2;
  const titleY = titleHeight - 4;
  const title = `  <text x="${titleX}" y="${titleY}" font-family="'Courier New','Lucida Console',monospace" font-size="6" fill="#686b70" text-anchor="middle" letter-spacing="2">C O N T R I B U T I O N S</text>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="100%">
${title}
${baseline}
${bars}
${labels}
${yTicks}
</svg>`;

  return svg;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  try {
    const { weeks, totalContributions } = await fetchRollingContributions();

    if (!weeks.length) {
      console.warn("No week data received. Generating empty histogram.");
    }

    // Validate data integrity
    validateData(weeks);

    // Write debug output
    const debugData = {
      generatedAt: new Date().toISOString(),
      username: USERNAME,
      totalContributions,
      weeks: weeks.map((w) => ({
        firstDay: w.firstDay,
        days: w.contributionDays.map((d) => ({
          date: d.date,
          count: d.contributionCount,
        })),
        weeklyCount: w.contributionDays.reduce((s, d) => s + d.contributionCount, 0),
      })),
    };
    writeFileSync(DEBUG_PATH, JSON.stringify(debugData, null, 2), "utf-8");
    console.log(`Debug written to ${DEBUG_PATH}`);

    const svg = renderHistogram(weeks);

    writeFileSync(OUT_PATH, svg, "utf-8");
    console.log(`\nWrote ${OUT_PATH}`);
    console.log(`  ${weeks.length} weeks, ${totalContributions} total contributions`);
  } catch (err) {
    console.error(`\nFailed to generate contribution histogram:\n  ${err.message}`);
    process.exit(1);
  }
}

main();
