#!/usr/bin/env node

/**
 * generate-contributions.mjs
 *
 * Fetches real GitHub contribution data for a user and renders a
 * monochrome vertical-bar histogram SVG.
 *
 * Usage:
 *   GITHUB_TOKEN=ghp_xxx node scripts/generate-contributions.mjs
 *   GH_TOKEN=ghp_xxx node scripts/generate-contributions.mjs
 *
 * Environment:
 *   GITHUB_TOKEN or GH_TOKEN — GitHub personal access token or Actions token.
 *                              Must have public_repo / read:user scope.
 *
 * Output:
 *   assets/contributions.svg
 *
 * Zero external dependencies. Requires Node.js 18+ (built-in fetch).
 */

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "..", "assets", "contributions.svg");

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
      // If resource limits exceeded, retry with smaller window
      if (msg.includes("RESOURCE_LIMITS") && attempt < 3) {
        console.warn(`Resource limits hit (attempt ${attempt}/3). Retrying with smaller window...`);
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

// ─── Data Pipeline ──────────────────────────────────────────────────────────

async function fetchFullYearContributions() {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59);

  // Split into two 6-month windows to avoid resource limits
  const midYear = new Date(now.getFullYear(), 6, 1);

  console.log(`Fetching contributions for ${USERNAME}...`);

  let allWeeks = [];
  let totalContributions = 0;

  try {
    // Window 1: Jan – Jun
    const cal1 = await fetchContributions(
      yearStart.toISOString(),
      new Date(midYear.getTime() - 1000).toISOString()
    );
    allWeeks.push(...cal1.weeks);
    totalContributions += cal1.totalContributions;
    console.log(`  Window 1 (Jan–Jun): ${cal1.totalContributions} contributions`);

    await sleep(1000); // Respect secondary rate limit

    // Window 2: Jul – Dec
    const cal2 = await fetchContributions(
      midYear.toISOString(),
      yearEnd.toISOString()
    );
    allWeeks.push(...cal2.weeks);
    totalContributions += cal2.totalContributions;
    console.log(`  Window 2 (Jul–Dec): ${cal2.totalContributions} contributions`);
  } catch (err) {
    console.warn(`Split-window fetch failed: ${err.message}`);
    console.warn("Falling back to default past-year range...");

    const cal = await fetchContributions(
      new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString(),
      now.toISOString()
    );
    allWeeks = cal.weeks;
    totalContributions = cal.totalContributions;
    console.log(`  Fallback: ${cal.totalContributions} contributions`);
  }

  console.log(`Total: ${totalContributions} contributions across ${allWeeks.length} weeks`);

  return { weeks: allWeeks, totalContributions };
}

// ─── SVG Renderer ───────────────────────────────────────────────────────────

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function renderHistogram(weeks) {
  const barWidth = 4;
  const barGap = 1.5;
  const svgHeight = 120;
  const labelHeight = 22;
  const barAreaHeight = svgHeight - labelHeight;
  const maxBarHeight = barAreaHeight - 8;
  const paddingX = 2;
  const paddingY = 4;

  const svgWidth = weeks.length * (barWidth + barGap) + paddingX * 2;

  // Aggregate by week
  const weeklyCounts = weeks.map((w) =>
    w.contributionDays.reduce((sum, d) => sum + d.contributionCount, 0)
  );

  const maxCount = Math.max(...weeklyCounts, 1);

  // Determine month label positions
  const monthLabels = [];
  let lastMonth = -1;
  for (let i = 0; i < weeks.length; i++) {
    const firstDay = new Date(weeks[i].firstDay);
    const month = firstDay.getMonth();
    if (month !== lastMonth) {
      monthLabels.push({ month, index: i });
      lastMonth = month;
    }
  }

  // Build SVG
  const bars = weeklyCounts
    .map((count, i) => {
      const height = Math.max(1, (count / maxCount) * maxBarHeight);
      const x = paddingX + i * (barWidth + barGap);
      const y = paddingY + (maxBarHeight - height);
      const opacity = count === 0 ? 0.15 : 0.4 + (count / maxCount) * 0.6;
      return `  <rect x="${x}" y="${y}" width="${barWidth}" height="${height}" fill="#d0d0d0" opacity="${opacity.toFixed(2)}" rx="0.5"/>`;
    })
    .join("\n");

  const labels = monthLabels
    .map(({ month, index }) => {
      const x = paddingX + index * (barWidth + barGap) + barWidth / 2;
      return `  <text x="${x}" y="${svgHeight - 2}" font-family="'Courier New', 'Lucida Console', monospace" font-size="7" fill="#555555" text-anchor="middle" letter-spacing="0.5">${MONTHS[month]}</text>`;
    })
    .join("\n");

  // Thin month divider lines
  const dividers = monthLabels
    .filter((m) => m.index > 0)
    .map(({ index }) => {
      const x = paddingX + index * (barWidth + barGap) - barGap / 2;
      return `  <line x1="${x}" y1="0" x2="${x}" y2="${svgHeight - labelHeight}" stroke="#2a2a2a" stroke-width="0.3"/>`;
    })
    .join("\n");

  // Contribution count label
  const totalText = `  <text x="${svgWidth / 2}" y="-6" font-family="'Courier New', 'Lucida Console', monospace" font-size="7" fill="#555555" text-anchor="middle" letter-spacing="1">CONTRIBUTIONS</text>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -14 ${svgWidth} ${svgHeight + 14}" width="100%" preserveAspectRatio="none">
${totalText}
${dividers}
${bars}
${labels}
</svg>`;

  return svg;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  try {
    const { weeks, totalContributions } = await fetchFullYearContributions();

    if (!weeks.length) {
      console.warn("No week data received. Generating empty histogram.");
    }

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
