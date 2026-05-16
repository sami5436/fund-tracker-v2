#!/usr/bin/env node
// One-time scraper for Fidelity fund holdings + metadata.
// Source: stockanalysis.com (Yahoo's quoteSummary endpoint is rate-limited too
// aggressively for a 70-fund batch).
//
// Reads tickers from lib/constants.ts, scrapes the main quote page + holdings
// page for each, writes the result to lib/fidelity-funds-data.json.
//
// Usage:
//   node scripts/scrape-fidelity-funds.mjs
//   node scripts/scrape-fidelity-funds.mjs FXAIX FCNTX     # only these
//   node scripts/scrape-fidelity-funds.mjs --merge         # keep prior entries for failed tickers

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONSTANTS_PATH = path.join(ROOT, 'lib', 'constants.ts');
const OUTPUT_PATH = path.join(ROOT, 'lib', 'fidelity-funds-data.json');

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const DELAY_MS = 800;
const RETRY_BACKOFF_MS = [2000, 5000, 12000];

async function loadTickersFromConstants() {
  const src = await fs.readFile(CONSTANTS_PATH, 'utf8');
  const match = src.match(/FIDELITY_FUND_TICKERS:\s*string\[\]\s*=\s*\[([\s\S]*?)\];/);
  if (!match) throw new Error('Could not find FIDELITY_FUND_TICKERS in constants.ts');
  return [...match[1].matchAll(/'([A-Z]{3,6})'/g)].map((m) => m[1]);
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (res.status === 404) return { notFound: true };
  if (res.status === 429) return { rateLimited: true };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { html: await res.text() };
}

// Strip Vue/HTML comments and tags from a fragment, keep text separated by "|".
function rowText(html) {
  let s = html.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<[^>]+>/g, '|');
  s = s.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function parseHoldings(html, limit = 10) {
  // Holdings table rows have an anchor to /stocks/<ticker>/ in them.
  const trMatches = html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g);
  const rows = [];
  for (const m of trMatches) {
    const inner = m[1];
    if (!/<a\s+href="\/stocks\//.test(inner)) continue;
    const txt = rowText(inner)
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean);
    // Expected columns: [rank, ticker, name, weight, shares]
    if (txt.length < 4) continue;
    const rank = parseInt(txt[0], 10);
    const ticker = txt[1];
    const name = txt[2];
    const weightStr = txt.find((c) => /%$/.test(c)) ?? '';
    const weight = parseFloat(weightStr.replace('%', ''));
    if (!ticker || !isFinite(rank) || !isFinite(weight)) continue;
    rows.push({ ticker, name, weight });
    if (rows.length >= limit) break;
  }
  return rows;
}

function parseAssetSize(s) {
  // "791.70B" → 791_700_000_000, "1.23M" → 1_230_000, "456K" → 456_000
  const m = s.match(/^([\d,.]+)\s*([BMK]?)/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ''));
  if (!isFinite(n)) return null;
  const suffix = m[2].toUpperCase();
  if (suffix === 'B') return n * 1e9;
  if (suffix === 'M') return n * 1e6;
  if (suffix === 'K') return n * 1e3;
  return n;
}

function parsePct(s) {
  if (!s || s === 'n/a' || s === '-') return null;
  const n = parseFloat(s.replace('%', '').replace(/,/g, ''));
  return isFinite(n) ? n : null;
}

function parseNum(s) {
  if (!s || s === 'n/a' || s === '-') return null;
  const n = parseFloat(s.replace(/,/g, ''));
  return isFinite(n) ? n : null;
}

const RISK_MAP = {
  low: 1,
  'below average': 2,
  average: 3,
  'above average': 4,
  high: 5,
};
function parseRisk(s) {
  if (!s) return null;
  return RISK_MAP[s.trim().toLowerCase()] ?? null;
}

function parseMain(ticker, html) {
  // stockanalysis embeds a label/value array in the page JS:
  //   [["Category","Large Blend"],["Performance Rating","Above Average"],...]
  // And renders the same data as: <span>Label</span> <span class="font-semibold">Value</span>
  // We try the embedded array first (most reliable), fall back to span pattern.

  const arrayPairs = new Map();
  for (const m of html.matchAll(/\["([^"\\]{2,40})","([^"\\]{1,80})"\]/g)) {
    if (!arrayPairs.has(m[1])) arrayPairs.set(m[1], m[2]);
  }

  const findPair = (label) => {
    const fromArray = arrayPairs.get(label);
    if (fromArray) return fromArray.trim();
    const re = new RegExp(
      `>\\s*${label}\\s*<\\/(?:span|div|td)>\\s*<(?:span|div|td)[^>]*>\\s*([^<]+?)\\s*<`,
      'i'
    );
    const m = html.match(re);
    return m ? m[1].trim() : null;
  };

  // The embedded data blob also has key:"value" pairs like trYTD:"8.69%", tr1y:"27.29%"
  const findEmbedded = (key) => {
    const re = new RegExp(`${key}:"([^"]+)"`);
    const m = html.match(re);
    return m ? m[1] : null;
  };

  let name = ticker;
  const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
  if (h1) {
    name = h1[1].replace(/&amp;/g, '&').replace(/\s*\([A-Z]{3,6}\)\s*$/, '').trim();
  }

  const PERF_MAP = {
    high: 5,
    'above average': 4,
    average: 3,
    'below average': 2,
    low: 1,
  };
  const perfRaw = findPair('Performance Rating');
  const performanceStars = perfRaw ? PERF_MAP[perfRaw.trim().toLowerCase()] ?? null : null;

  return {
    name,
    category: findPair('Category'),
    family: findPair('Fund Family') ?? 'Fidelity',
    expenseRatio: parsePct(findPair('Expense Ratio')),
    totalAssets: (() => {
      const v = findPair('Fund Assets') ?? findPair('Net Assets');
      return v ? parseAssetSize(v) : null;
    })(),
    yield: parsePct(findPair('Dividend Yield') ?? findPair('Yield')),
    ytdReturn: parsePct(findPair('YTD Return') ?? findEmbedded('trYTD')),
    return1Y: parsePct(findEmbedded('tr1y') ?? findPair('1-Year Return')),
    return3Y: parsePct(findEmbedded('tr3y') ?? findPair('3-Year Return')),
    return5Y: parsePct(findEmbedded('tr5y') ?? findPair('5-Year Return')),
    return10Y: parsePct(findEmbedded('tr10y') ?? findPair('10-Year Return')),
    low52: parseNum(findEmbedded('low52') ?? findPair('52-Week Low')),
    high52: parseNum(findEmbedded('high52') ?? findPair('52-Week High')),
    turnover: parsePct(findEmbedded('holdingsTurnover') ?? findPair('Turnover')),
    inceptionDate: findPair('Inception Date'),
    beta: parseNum(findPair('Beta (5Y)') ?? findPair('Beta')),
    riskRating: parseRisk(findPair('Risk Rating') ?? findPair('Risk')),
    performanceStars,
  };
}

async function fetchWithRetry(url) {
  for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
    const r = await fetchHtml(url);
    if (r.notFound) return null;
    if (r.rateLimited) {
      const wait = RETRY_BACKOFF_MS[attempt] ?? RETRY_BACKOFF_MS.at(-1);
      process.stdout.write(` (429, wait ${wait}ms)`);
      await new Promise((res) => setTimeout(res, wait));
      continue;
    }
    return r.html;
  }
  throw new Error('rate limited');
}

async function scrapeOne(ticker) {
  const mainUrl = `https://stockanalysis.com/quote/mutf/${ticker}/`;
  const holdUrl = `https://stockanalysis.com/quote/mutf/${ticker}/holdings/`;

  const mainHtml = await fetchWithRetry(mainUrl);
  if (!mainHtml) throw new Error('not found');
  const meta = parseMain(ticker, mainHtml);

  await new Promise((r) => setTimeout(r, DELAY_MS));

  const holdHtml = await fetchWithRetry(holdUrl);
  const holdings = holdHtml ? parseHoldings(holdHtml, 10) : [];

  return {
    ticker,
    name: meta.name,
    category: meta.category,
    family: meta.family,
    riskRating: meta.riskRating,
    morningstarRating: meta.performanceStars,
    expenseRatio: meta.expenseRatio,
    totalAssets: meta.totalAssets,
    yield: meta.yield,
    beta: meta.beta,
    ytdReturn: meta.ytdReturn,
    return1Y: meta.return1Y,
    return3Y: meta.return3Y,
    return5Y: meta.return5Y,
    return10Y: meta.return10Y,
    low52: meta.low52,
    high52: meta.high52,
    turnover: meta.turnover,
    inceptionDate: meta.inceptionDate,
    holdings,
    fetchedAt: new Date().toISOString(),
  };
}

async function loadExisting() {
  try {
    const txt = await fs.readFile(OUTPUT_PATH, 'utf8');
    const parsed = JSON.parse(txt);
    return Array.isArray(parsed.funds) ? parsed.funds : [];
  } catch {
    return [];
  }
}

async function main() {
  const args = process.argv.slice(2);
  const merge = args.includes('--merge');
  const overrideTickers = args.filter((a) => !a.startsWith('--'));

  const allTickers = await loadTickersFromConstants();
  const tickers = overrideTickers.length ? overrideTickers : allTickers;
  console.log(`Scraping ${tickers.length} tickers from stockanalysis.com`);

  const prior = merge ? await loadExisting() : [];
  const priorMap = new Map(prior.map((f) => [f.ticker, f]));

  const results = [];
  const failed = [];

  for (let i = 0; i < tickers.length; i++) {
    const t = tickers[i];
    process.stdout.write(`[${i + 1}/${tickers.length}] ${t}`);
    try {
      const data = await scrapeOne(t);
      results.push(data);
      console.log(` ✓ ${data.holdings.length} holdings, ${data.category ?? '—'}`);
    } catch (err) {
      console.log(` ✗ ${err.message}`);
      failed.push(t);
      if (priorMap.has(t)) results.push(priorMap.get(t));
    }
    if (i < tickers.length - 1) {
      await new Promise((res) => setTimeout(res, DELAY_MS));
    }
  }

  const out = {
    generatedAt: new Date().toISOString(),
    requested: tickers.length,
    succeeded: results.length - failed.filter((t) => priorMap.has(t)).length,
    failed,
    funds: results,
  };
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${results.length} funds → ${path.relative(ROOT, OUTPUT_PATH)}`);
  if (failed.length) console.log(`Failed: ${failed.join(', ')}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
