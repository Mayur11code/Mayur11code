let cache = { count: null, ts: 0 };
const CACHE_MS = 10 * 60 * 1000;

async function fetchCount() {
  const now = Date.now();
  if (cache.count !== null && now - cache.ts < CACHE_MS) return cache.count;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      "https://komarev.com/ghpvc/?username=Mayur11code&format=svg",
      { signal: controller.signal }
    );
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Komarev ${res.status}`);
    const svg = await res.text();
    const m = svg.match(/<text[^>]*>([\d,]+)<\/text>/);
    const count = m ? m[1].replace(/,/g, "") : null;
    if (count) {
      cache = { count, ts: now };
      return count;
    }
  } catch (e) {
    console.error("Komarev fetch failed:", e.message);
  }
  return cache.count || "\u2014";
}

function escapeXml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderVinyl(count) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 400" width="440" height="400">
  <defs>
    <filter id="grain" x="0%" y="0%" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="4" stitchTiles="stitch" result="n"/>
      <feColorMatrix type="saturate" values="0" in="n" result="g"/>
      <feBlend in="SourceGraphic" in2="g" mode="multiply"/>
    </filter>
    <radialGradient id="hl" cx="32%" cy="28%" r="50%">
      <stop offset="0%" stop-color="#fff" stop-opacity="0.14"/>
      <stop offset="35%" stop-color="#fff" stop-opacity="0.04"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="hl2" cx="72%" cy="72%" r="35%">
      <stop offset="0%" stop-color="#fff" stop-opacity="0.07"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="edge" cx="50%" cy="50%" r="50%">
      <stop offset="60%" stop-color="#fff" stop-opacity="0"/>
      <stop offset="88%" stop-color="#fff" stop-opacity="0.02"/>
      <stop offset="96%" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="arm" x1="0" y1="0" x2="1" y2="0.3">
      <stop offset="0%" stop-color="#505358"/>
      <stop offset="50%" stop-color="#686b70"/>
      <stop offset="100%" stop-color="#45484c"/>
    </linearGradient>
  </defs>

  <g>
    <animateTransform attributeName="transform" type="rotate" from="0 200 200" to="360 200 200" dur="10s" repeatCount="indefinite"/>

    <circle cx="200" cy="200" r="197" fill="#08090b"/>
    <circle cx="200" cy="200" r="195" fill="#0e1013"/>
    <circle cx="200" cy="200" r="194" fill="none" stroke="#505358" stroke-width="1.5" opacity="0.6"/>
    <circle cx="200" cy="200" r="192" fill="none" stroke="#3b3e43" stroke-width="0.8" opacity="0.5"/>
    <circle cx="200" cy="200" r="190" fill="none" stroke="#505358" stroke-width="0.4" opacity="0.3"/>
    <circle cx="200" cy="200" r="189" fill="#0e1013"/>

    <circle cx="200" cy="200" r="187" fill="none" stroke="#585b60" stroke-width="0.6" opacity="0.6"/>
    <circle cx="200" cy="200" r="184" fill="none" stroke="#505358" stroke-width="0.5" opacity="0.5"/>
    <circle cx="200" cy="200" r="181" fill="none" stroke="#585b60" stroke-width="0.4" opacity="0.4"/>
    <circle cx="200" cy="200" r="178" fill="none" stroke="#45484c" stroke-width="0.6" opacity="0.55"/>
    <circle cx="200" cy="200" r="175" fill="none" stroke="#585b60" stroke-width="0.45" opacity="0.45"/>
    <circle cx="200" cy="200" r="172" fill="none" stroke="#505358" stroke-width="0.55" opacity="0.55"/>
    <circle cx="200" cy="200" r="169" fill="none" stroke="#45484c" stroke-width="0.4" opacity="0.4"/>
    <circle cx="200" cy="200" r="166" fill="none" stroke="#585b60" stroke-width="0.5" opacity="0.5"/>
    <circle cx="200" cy="200" r="163" fill="none" stroke="#505358" stroke-width="0.6" opacity="0.6"/>
    <circle cx="200" cy="200" r="160" fill="none" stroke="#45484c" stroke-width="0.45" opacity="0.45"/>
    <circle cx="200" cy="200" r="157" fill="none" stroke="#585b60" stroke-width="0.5" opacity="0.5"/>
    <circle cx="200" cy="200" r="154" fill="none" stroke="#505358" stroke-width="0.55" opacity="0.55"/>
    <circle cx="200" cy="200" r="151" fill="none" stroke="#45484c" stroke-width="0.4" opacity="0.4"/>
    <circle cx="200" cy="200" r="148" fill="none" stroke="#585b60" stroke-width="0.5" opacity="0.5"/>
    <circle cx="200" cy="200" r="145" fill="none" stroke="#505358" stroke-width="0.6" opacity="0.6"/>
    <circle cx="200" cy="200" r="142" fill="none" stroke="#45484c" stroke-width="0.45" opacity="0.45"/>

    <circle cx="200" cy="200" r="139" fill="none" stroke="#585b60" stroke-width="0.55" opacity="0.55"/>
    <circle cx="200" cy="200" r="135" fill="none" stroke="#505358" stroke-width="0.45" opacity="0.45"/>
    <circle cx="200" cy="200" r="131" fill="none" stroke="#45484c" stroke-width="0.5" opacity="0.5"/>
    <circle cx="200" cy="200" r="127" fill="none" stroke="#585b60" stroke-width="0.55" opacity="0.55"/>
    <circle cx="200" cy="200" r="123" fill="none" stroke="#505358" stroke-width="0.45" opacity="0.45"/>
    <circle cx="200" cy="200" r="119" fill="none" stroke="#45484c" stroke-width="0.5" opacity="0.5"/>
    <circle cx="200" cy="200" r="115" fill="none" stroke="#585b60" stroke-width="0.55" opacity="0.55"/>
    <circle cx="200" cy="200" r="111" fill="none" stroke="#505358" stroke-width="0.45" opacity="0.45"/>
    <circle cx="200" cy="200" r="107" fill="none" stroke="#45484c" stroke-width="0.5" opacity="0.5"/>
    <circle cx="200" cy="200" r="103" fill="none" stroke="#585b60" stroke-width="0.55" opacity="0.55"/>
    <circle cx="200" cy="200" r="99" fill="none" stroke="#505358" stroke-width="0.45" opacity="0.45"/>

    <circle cx="200" cy="200" r="95" fill="none" stroke="#45484c" stroke-width="0.55" opacity="0.55"/>
    <circle cx="200" cy="200" r="91" fill="none" stroke="#585b60" stroke-width="0.5" opacity="0.5"/>
    <circle cx="200" cy="200" r="87" fill="none" stroke="#505358" stroke-width="0.55" opacity="0.55"/>
    <circle cx="200" cy="200" r="83" fill="none" stroke="#45484c" stroke-width="0.45" opacity="0.45"/>
    <circle cx="200" cy="200" r="79" fill="none" stroke="#585b60" stroke-width="0.5" opacity="0.5"/>
    <circle cx="200" cy="200" r="75" fill="none" stroke="#505358" stroke-width="0.55" opacity="0.55"/>
    <circle cx="200" cy="200" r="71" fill="none" stroke="#45484c" stroke-width="0.45" opacity="0.45"/>
    <circle cx="200" cy="200" r="67" fill="none" stroke="#585b60" stroke-width="0.5" opacity="0.5"/>
    <circle cx="200" cy="200" r="63" fill="none" stroke="#505358" stroke-width="0.55" opacity="0.55"/>
    <circle cx="200" cy="200" r="59" fill="none" stroke="#45484c" stroke-width="0.4" opacity="0.4"/>

    <circle cx="200" cy="200" r="185" fill="#0b0d0f" opacity="0.35"/>
    <circle cx="200" cy="200" r="170" fill="#0e1013" opacity="0.2"/>
    <circle cx="200" cy="200" r="155" fill="#0b0d0f" opacity="0.3"/>
    <circle cx="200" cy="200" r="140" fill="#0e1013" opacity="0.2"/>
    <circle cx="200" cy="200" r="125" fill="#0b0d0f" opacity="0.3"/>
    <circle cx="200" cy="200" r="110" fill="#0e1013" opacity="0.2"/>
    <circle cx="200" cy="200" r="95" fill="#0b0d0f" opacity="0.3"/>
    <circle cx="200" cy="200" r="80" fill="#0e1013" opacity="0.2"/>
    <circle cx="200" cy="200" r="65" fill="#0b0d0f" opacity="0.25"/>

    <circle cx="200" cy="200" r="191" fill="none" stroke="#585b60" stroke-width="0.9" opacity="0.4"/>
    <circle cx="200" cy="200" r="189" fill="url(#hl)"/>
    <circle cx="200" cy="200" r="189" fill="url(#hl2)"/>
    <circle cx="200" cy="200" r="195" fill="url(#edge)"/>

    <circle cx="148" cy="118" r="1.5" fill="#292c30" opacity="0.25"/>
    <circle cx="278" cy="162" r="1.0" fill="#292c30" opacity="0.18"/>
    <circle cx="182" cy="298" r="1.2" fill="#292c30" opacity="0.22"/>
    <circle cx="235" cy="108" r="0.8" fill="#292c30" opacity="0.15"/>
    <circle cx="310" cy="230" r="1.3" fill="#292c30" opacity="0.2"/>
    <circle cx="120" cy="210" r="0.9" fill="#292c30" opacity="0.16"/>

    <circle cx="200" cy="200" r="197" fill="#45484c" opacity="0.018" filter="url(#grain)"/>
  </g>

  <g>
    <circle cx="200" cy="200" r="58" fill="#0e1013"/>
    <circle cx="200" cy="200" r="57" fill="none" stroke="#45484c" stroke-width="0.5" opacity="0.5"/>
    <circle cx="200" cy="200" r="55" fill="#08090b"/>
    <circle cx="200" cy="200" r="54.5" fill="none" stroke="#505358" stroke-width="0.35" opacity="0.35"/>
    <circle cx="200" cy="200" r="43" fill="none" stroke="#3b3e43" stroke-width="0.3" opacity="0.25"/>
    <text x="200" y="195" font-family="'Courier New','Lucida Console',monospace" font-size="22" font-weight="bold" fill="#c5c7ca" text-anchor="middle">${escapeXml(count)}</text>
    <text x="200" y="214" font-family="'Courier New','Lucida Console',monospace" font-size="8" fill="#686b70" text-anchor="middle" letter-spacing="2">VIEWS</text>
  </g>

  <g>
    <path d="M393,34 Q365,155 258,274" stroke="#08090b" stroke-width="4" fill="none" opacity="0.3" stroke-linecap="round" transform="translate(2,2)"/>
    <path d="M393,34 Q365,155 258,274" stroke="url(#arm)" stroke-width="2.8" fill="none" stroke-linecap="round"/>
    <path d="M392,33 Q364,154 257,273" stroke="#686b70" stroke-width="0.5" fill="none" opacity="0.4" stroke-linecap="round"/>
    <circle cx="395" cy="26" r="9" fill="#1a1d21" stroke="#3b3e43" stroke-width="1"/>
    <circle cx="395" cy="26" r="5" fill="#0e1013" stroke="#45484c" stroke-width="0.6"/>
    <circle cx="395" cy="26" r="2" fill="#292c30"/>
    <rect x="250" y="270" width="12" height="8" rx="1.5" fill="#292c30" stroke="#45484c" stroke-width="0.5" transform="rotate(-22,256,274)"/>
    <rect x="252" y="278" width="8" height="5" rx="1" fill="#1a1d21" stroke="#3b3e43" stroke-width="0.4" transform="rotate(-22,256,280.5)"/>
    <circle cx="253" cy="286" r="1.2" fill="#c5c7ca" opacity="0.8"/>
  </g>
</svg>`;
}

export default async function handler(req, res) {
  const count = await fetchCount();
  const svg = renderVinyl(count);

  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  res.setHeader("X-Counter-Source", "komarev");
  res.status(200).send(svg);
}
