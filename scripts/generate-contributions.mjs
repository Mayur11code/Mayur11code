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
 *   mayur-vinyl/public/stats.json   (stats card data consumed by /api/stats)
 *   contribution-debug.json (OS temp dir, development only)
 *
 * Zero external dependencies. Requires Node.js 18+ (built-in fetch).
 */

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "..", "assets", "contributions.svg");
const STATS_OUT_PATH = resolve(__dirname, "..", "mayur-vinyl", "public", "stats.json");
const DEBUG_PATH = resolve(tmpdir(), "contribution-debug.json");

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

// ─── Profile Stats ───────────────────────────────────────────────────────────

const PROFILE_QUERY = `
  query ($login: String!) {
    user(login: $login) {
      contributionsCollection {
        totalCommitContributions
        totalPullRequestContributions
        totalPullRequestReviewContributions
        restrictedContributionsCount
      }
      repositoriesContributedTo(first: 1, contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, REPOSITORY]) {
        totalCount
      }
      pullRequests(first: 1) { totalCount }
      issues(first: 1) { totalCount }
      followers { totalCount }
      repositories(first: 1, ownerAffiliations: OWNER, isFork: false) { totalCount }
      stars: repositories(first: 100, ownerAffiliations: OWNER, isFork: false) {
        totalCount
        nodes { stargazerCount }
      }
      gists(first: 1) { totalCount }
    }
  }`;

async function fetchProfile() {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(GITHUB_API, {
      method: "POST",
      headers: {
        Authorization: `bearer ${TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": "profile-readme-stats",
      },
      body: JSON.stringify({ query: PROFILE_QUERY, variables: { login: USERNAME } }),
    });

    if (res.status === 403) {
      const wait = parseInt(res.headers.get("retry-after") || "0", 10) * 1000 || attempt * 15000;
      console.warn(`Rate limited fetching profile. Waiting ${wait / 1000}s (attempt ${attempt}/3)...`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);

    const json = await res.json();
    if (json.errors?.length) throw new Error(`GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`);

    const u = json.data.user;
    const starCount = u.stars.nodes.reduce((a, r) => a + r.stargazerCount, 0);
    return {
      repositories: u.repositories.totalCount,
      stars: starCount,
      pullRequests: u.pullRequests.totalCount,
      issues: u.issues.totalCount,
      followers: u.followers.totalCount,
      gists: u.gists.totalCount,
      commits: u.contributionsCollection.totalCommitContributions,
      contributions: u.contributionsCollection.totalPullRequestContributions,
      reviews: u.contributionsCollection.totalPullRequestReviewContributions,
      reposContributedTo: u.repositoriesContributedTo.totalCount,
    };
  }
  throw new Error("Failed to fetch profile after 3 attempts");
}

// ─── Streak / Grade Computation ──────────────────────────────────────────────

const DAY_MS = 864e5;
const toDate = (s) => new Date(s + "T00:00:00Z");

function computeStats(weeks, today) {
  // Deduplicate days by date (the two fetch windows share a boundary week).
  const byDate = new Map();
  for (const week of weeks) {
    for (const day of week.contributionDays) {
      if (day.date <= today) byDate.set(day.date, day.contributionCount);
    }
  }

  const dates = [...byDate.keys()].sort();
  const total = [...byDate.values()].reduce((a, b) => a + b, 0);
  const activeDays = dates.filter((d) => byDate.get(d) > 0).length;
  const active = new Set(dates.filter((d) => byDate.get(d) > 0));

  // Longest streak: find the first day of each active run, then walk forward.
  let longest = 0;
  for (const d of dates) {
    if (!active.has(d)) continue;
    const prev = new Date(toDate(d).getTime() - DAY_MS).toISOString().slice(0, 10);
    if (active.has(prev)) continue;
    let run = 0;
    let cur = d;
    while (active.has(cur)) {
      run++;
      cur = new Date(toDate(cur).getTime() + DAY_MS).toISOString().slice(0, 10);
    }
    if (run > longest) longest = run;
  }

  // Current streak: walk back from today; a not-yet-complete today may fall
  // back to yesterday as the streak head without breaking the run.
  let current = 0;
  let cursor = active.has(today) ? today : new Date(toDate(today).getTime() - DAY_MS).toISOString().slice(0, 10);
  if (active.has(cursor)) {
    while (active.has(cursor)) {
      current++;
      cursor = new Date(toDate(cursor).getTime() - DAY_MS).toISOString().slice(0, 10);
    }
  }

  const yearStart = `${new Date().getUTCFullYear()}-01-01`;
  const thisYear = dates.filter((d) => d >= yearStart).reduce((a, d) => a + byDate.get(d), 0);

  // Grade thresholds on the rolling annual total.
  const grade =
    total >= 4000 ? "S" :
    total >= 3000 ? "A" :
    total >= 2000 ? "B" :
    total >= 1000 ? "C" :
    total >= 500 ? "D" : "E";

  return { total, activeDays, thisYear, currentStreak: current, longestStreak: longest, grade, dates, byDate };
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

  // GitHub's calendar returns whole weeks starting on the Sunday on-or-before
  // `from`. Both windows therefore begin/end on the same week, so the
  // boundary week arrives twice and shifts every later month label. Merge
  // weeks by firstDay, summing their days, and keep the series sorted.
  const byFirstDay = new Map();
  for (const week of allWeeks) {
    const days = week.contributionDays.slice();
    const existing = byFirstDay.get(week.firstDay);
    if (existing) existing.contributionDays.push(...days);
    else byFirstDay.set(week.firstDay, { firstDay: week.firstDay, contributionDays: days });
  }

  const merged = [...byFirstDay.values()].sort((a, b) =>
    a.firstDay < b.firstDay ? -1 : a.firstDay > b.firstDay ? 1 : 0
  );

  // Clip all contribution days to today
  for (const week of merged) {
    week.contributionDays = week.contributionDays.filter((day) => day.date <= cutoff);
  }
  const filteredWeeks = merged.filter((w) => w.contributionDays.length > 0);

  console.log(`Total: ${totalContributions} contributions across ${filteredWeeks.length} weeks`);

  return { weeks: filteredWeeks, totalContributions, from: startDate.toISOString().split("T")[0], to: today };
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
  // Geometry is authored at ~1:1 rendered pixel size (GitHub renders the
  // README img at width="100%", ~800px). Authoring at 300px and scaling up
  // made font-size 6 labels render ~16px — hence oversized/"too tall" labels.
  const barWidth = 8;
  const barGap = 6;
  const barPitch = barWidth + barGap;
  const leftPadding = 6;
  const rightPadding = 6;
  const yAxisWidth = 84;
  const labelHeight = 34;
  const titleHeight = 34;
  const topPadding = 10;
  const bottomPadding = 6;

  const chartWidth = weeks.length * barPitch - barGap + leftPadding + rightPadding;
  const svgWidth = chartWidth + yAxisWidth;
  const maxBarHeight = 196;
  const chartTop = titleHeight + topPadding;
  const chartBottom = chartTop + maxBarHeight;
  const svgHeight = chartBottom + labelHeight + bottomPadding;

  const labelFontSize = 10;
  const labelLetterSpacing = 1;

  // Aggregate by week
  const weeklyCounts = weeks.map((w) =>
    w.contributionDays.reduce((sum, d) => sum + d.contributionCount, 0)
  );

  const maxCount = Math.max(...weeklyCounts, 0);

  // Nice number scale — used for BOTH bars AND Y-axis
  const { axisMax, ticks } = calculateNiceScale(maxCount, 5);

  console.log(`  Max weekly count: ${maxCount}`);
  console.log(`  Axis max: ${axisMax}, ticks: [${ticks.join(", ")}]`);

  // Determine month label positions.
  // Labels are anchored to the CENTER of each month's week span. Anchoring to
  // the first week made them appear offset/"drifting" relative to the bars.
  const monthSpans = [];
  for (let i = 0; i < weeks.length; i++) {
    const firstDay = new Date(weeks[i].firstDay + "T00:00:00");
    const month = firstDay.getMonth();
    const last = monthSpans[monthSpans.length - 1];
    if (last && last.month === month) {
      last.endIndex = i;
    } else {
      monthSpans.push({ month, startIndex: i, endIndex: i });
    }
  }

  // Drop spans too narrow to fit a label without colliding with its neighbour.
  const minSpanPx = 34;
  const monthLabels = [];
  for (const span of monthSpans) {
    const spanPx = (span.endIndex - span.startIndex + 1) * barPitch;
    if (spanPx < minSpanPx) continue;
    const centerIndex = (span.startIndex + span.endIndex) / 2;
    monthLabels.push({ month: span.month, x: leftPadding + centerIndex * barPitch + barWidth / 2 });
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
      return `  <rect x="${x}" y="${y.toFixed(2)}" width="${barWidth}" height="${height.toFixed(2)}" fill="${hex}" opacity="${opacity.toFixed(2)}" rx="1"/>`;
    })
    .join("\n");

  // Month labels — sit just under the baseline, upright, evenly tracked
  const labelBaselineY = chartBottom + labelFontSize + 12;
  const labels = monthLabels
    .map(
      ({ month, x }) =>
        `  <text x="${x.toFixed(2)}" y="${labelBaselineY}" font-family="'Courier New','Lucida Console',monospace" font-size="${labelFontSize}" fill="#686b70" text-anchor="middle" letter-spacing="${labelLetterSpacing}">${MONTHS[month]}</text>`
    )
    .join("\n");

  // Baseline
  const baseline = `  <line x1="0" y1="${chartBottom}" x2="${chartWidth}" y2="${chartBottom}" stroke="#25282d" stroke-width="1" opacity="0.6"/>`;

  // Y-axis ticks and gridlines — use the SAME ticks and axisMax
  const yAxisX = chartWidth + 14;
  const yTicks = ticks
    .map((tickVal, i) => {
      const y = chartBottom - (tickVal / axisMax) * maxBarHeight;
      const elements = [];
      // Gridline (skip bottom baseline and top)
      if (i > 0 && i < ticks.length) {
        elements.push(`  <line x1="${leftPadding}" y1="${y.toFixed(2)}" x2="${chartWidth}" y2="${y.toFixed(2)}" stroke="#25282d" stroke-width="0.6" opacity="0.5"/>`);
      }
      // Label
      const label = tickVal >= 1000 ? `${(tickVal / 1000).toFixed(tickVal % 1000 === 0 ? 0 : 1)}k` : String(tickVal);
      elements.push(`  <text x="${yAxisX}" y="${(y + labelFontSize * 0.35).toFixed(2)}" font-family="'Courier New','Lucida Console',monospace" font-size="${labelFontSize}" fill="#686b70" text-anchor="start">${label}</text>`);
      return elements.join("\n");
    })
    .join("\n");

  // Title
  const titleX = chartWidth / 2;
  const titleY = 16;
  const title = `  <text x="${titleX}" y="${titleY}" font-family="'Courier New','Lucida Console',monospace" font-size="11" fill="#686b70" text-anchor="middle" letter-spacing="3">C O N T R I B U T I O N S</text>`;

  // Explicit width/height in px so GitHub's width="100%" scales ~1:1 instead
  // of blowing the artwork up 2.7x.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">
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
    const { weeks, totalContributions, from, to } = await fetchRollingContributions();

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

    // Stats card data — consumed by mayur-vinyl/api/stats.js
    console.log("\nFetching profile stats...");
    const s = computeStats(weeks, to);
    const profile = await fetchProfile();

    const stats = {
      generatedAt: new Date().toISOString(),
      window: { from, to },
      contributions: {
        total: s.total,
        activeDays: s.activeDays,
        thisYear: s.thisYear,
        currentStreak: s.currentStreak,
        longestStreak: s.longestStreak,
        grade: s.grade,
      },
      profile,
      // Daily series for the intensity matrix — most recent 98 days (14 weeks).
      intensity: s.dates.slice(-98).map((d) => ({ d, c: s.byDate.get(d) })),
    };

    writeFileSync(STATS_OUT_PATH, JSON.stringify(stats, null, 2), "utf-8");
    console.log(`Wrote ${STATS_OUT_PATH}`);
    console.log(`  total ${s.total}, activeDays ${s.activeDays}, streak ${s.currentStreak}d (max ${s.longestStreak}d), grade ${s.grade}`);
    console.log(`  repos ${profile.repositories}, stars ${profile.stars}, followers ${profile.followers}, PRs ${profile.pullRequests}`);
    console.log(`  intensity ${stats.intensity.length} pts (${stats.intensity[0].d} -> ${stats.intensity.at(-1).d})`);
  } catch (err) {
    console.error(`\nFailed to generate contribution histogram:\n  ${err.message}`);
    process.exit(1);
  }
}

main();
