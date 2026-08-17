import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = resolve(__dirname, "..", "public", "contributions.svg");
let cachedSvg = null;

function getSvg() {
  if (!cachedSvg) {
    cachedSvg = readFileSync(svgPath, "utf-8");
  }
  return cachedSvg;
}

export default async function handler(req, res) {
  try {
    const svg = getSvg();
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300, stale-while-revalidate=600");
    res.status(200).send(svg);
  } catch (e) {
    res.setHeader("Content-Type", "text/plain");
    res.status(500).send(`Error loading contributions: ${e.message}`);
  }
}
