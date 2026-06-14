export interface ComparePoint {
  date: string;
  price: number;
}

export interface CompareAsset {
  symbol: string;
  name: string;
  quoteType: string;
  points: ComparePoint[];
  error?: string;
}

export interface CompareResponse {
  assets: CompareAsset[];
}

export interface DrawdownResult {
  drawdown: number;
  peakDate: string;
  troughDate: string;
}

const DAY_MS = 86_400_000;
const YEAR_MS = 365.25 * DAY_MS;

function time(date: string): number {
  return new Date(`${date}T00:00:00Z`).getTime();
}

export function sliceYears(points: ComparePoint[], years: number): ComparePoint[] {
  if (!points.length) return [];
  const cutoff = time(points[points.length - 1].date) - years * YEAR_MS;
  const sliced = points.filter((point) => time(point.date) >= cutoff);
  return sliced.length >= 2 ? sliced : points;
}

export function cagr(points: ComparePoint[], years: number): number | null {
  if (points.length < 2) return null;
  const end = points[points.length - 1];
  const target = time(end.date) - years * YEAR_MS;
  if (time(points[0].date) > target + 45 * DAY_MS) return null;

  const start = points.find((point) => time(point.date) >= target) ?? points[0];
  const elapsedYears = (time(end.date) - time(start.date)) / YEAR_MS;
  if (elapsedYears < 0.1 || start.price <= 0 || end.price <= 0) return null;
  return Math.pow(end.price / start.price, 1 / elapsedYears) - 1;
}

export function annualizedVolatility(points: ComparePoint[], years = 5): number | null {
  const sliced = sliceYears(points, years);
  if (sliced.length < 30) return null;

  const returns: number[] = [];
  for (let index = 1; index < sliced.length; index++) {
    const previous = sliced[index - 1].price;
    const current = sliced[index].price;
    if (previous > 0 && current > 0) returns.push(Math.log(current / previous));
  }
  if (returns.length < 20) return null;

  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) /
    (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

export function maxDrawdown(
  points: ComparePoint[],
  startDate?: string,
  endDate?: string
): DrawdownResult | null {
  const filtered = points.filter(
    (point) =>
      (!startDate || point.date >= startDate) &&
      (!endDate || point.date <= endDate)
  );
  if (filtered.length < 2) return null;

  let peak = filtered[0].price;
  let peakDate = filtered[0].date;
  let worst = 0;
  let worstPeak = peakDate;
  let troughDate = peakDate;

  for (const point of filtered) {
    if (point.price > peak) {
      peak = point.price;
      peakDate = point.date;
    }
    const drawdown = peak > 0 ? point.price / peak - 1 : 0;
    if (drawdown < worst) {
      worst = drawdown;
      worstPeak = peakDate;
      troughDate = point.date;
    }
  }

  return { drawdown: worst, peakDate: worstPeak, troughDate };
}

export interface GrowthRow {
  date: string;
  values: Record<string, number>;
}

export function buildGrowthSeries(
  assets: CompareAsset[],
  years: number,
  initialValue = 10_000,
  maxPoints = 420
): GrowthRow[] {
  const available = assets.filter((asset) => asset.points.length >= 2);
  if (!available.length) return [];

  const latest = Math.max(
    ...available.map((asset) => time(asset.points[asset.points.length - 1].date))
  );
  const rangeCutoff = latest - years * YEAR_MS;
  const commonStart = Math.max(
    rangeCutoff,
    ...available.map((asset) => time(asset.points[0].date))
  );

  const reference = [...available].sort((a, b) => b.points.length - a.points.length)[0];
  const dates = reference.points
    .filter((point) => time(point.date) >= commonStart)
    .map((point) => point.date);
  if (dates.length < 2) return [];

  const maps = new Map(
    available.map((asset) => [
      asset.symbol,
      new Map(asset.points.map((point) => [point.date, point.price])),
    ])
  );
  const bases = new Map<string, number>();
  const lastValues = new Map<string, number>();

  for (const asset of available) {
    const first = asset.points.find((point) => time(point.date) >= commonStart);
    if (first) {
      bases.set(asset.symbol, first.price);
      lastValues.set(asset.symbol, first.price);
    }
  }

  const rows: GrowthRow[] = [];
  for (const date of dates) {
    const values: Record<string, number> = {};
    for (const asset of available) {
      const exact = maps.get(asset.symbol)?.get(date);
      if (exact != null) lastValues.set(asset.symbol, exact);
      const base = bases.get(asset.symbol);
      const last = lastValues.get(asset.symbol);
      if (base && last) values[asset.symbol] = (last / base) * initialValue;
    }
    rows.push({ date, values });
  }

  if (rows.length <= maxPoints) return rows;
  const stride = Math.ceil(rows.length / maxPoints);
  const sampled = rows.filter((_, index) => index % stride === 0);
  if (sampled[sampled.length - 1] !== rows[rows.length - 1]) {
    sampled.push(rows[rows.length - 1]);
  }
  return sampled;
}

function weeklyPrices(points: ComparePoint[], years: number): Map<string, number> {
  const result = new Map<string, number>();
  for (const point of sliceYears(points, years)) {
    const date = new Date(`${point.date}T00:00:00Z`);
    const day = date.getUTCDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    date.setUTCDate(date.getUTCDate() + mondayOffset);
    result.set(date.toISOString().slice(0, 10), point.price);
  }
  return result;
}

function pearson(left: number[], right: number[]): number | null {
  if (left.length < 12 || left.length !== right.length) return null;
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;

  for (let index = 0; index < left.length; index++) {
    const leftDelta = left[index] - leftMean;
    const rightDelta = right[index] - rightMean;
    covariance += leftDelta * rightDelta;
    leftVariance += leftDelta * leftDelta;
    rightVariance += rightDelta * rightDelta;
  }

  const denominator = Math.sqrt(leftVariance * rightVariance);
  return denominator === 0 ? null : covariance / denominator;
}

export function correlation(left: ComparePoint[], right: ComparePoint[], years = 5): number | null {
  const leftWeeks = weeklyPrices(left, years);
  const rightWeeks = weeklyPrices(right, years);
  const keys = [...leftWeeks.keys()]
    .filter((key) => rightWeeks.has(key))
    .sort();
  if (keys.length < 13) return null;

  const leftReturns: number[] = [];
  const rightReturns: number[] = [];
  for (let index = 1; index < keys.length; index++) {
    const previousLeft = leftWeeks.get(keys[index - 1]);
    const currentLeft = leftWeeks.get(keys[index]);
    const previousRight = rightWeeks.get(keys[index - 1]);
    const currentRight = rightWeeks.get(keys[index]);
    if (!previousLeft || !currentLeft || !previousRight || !currentRight) continue;
    leftReturns.push(Math.log(currentLeft / previousLeft));
    rightReturns.push(Math.log(currentRight / previousRight));
  }
  return pearson(leftReturns, rightReturns);
}

export interface ProjectionPoint {
  year: number;
  low: number;
  median: number;
  high: number;
}

export function projectionCone(
  points: ComparePoint[],
  years = 10,
  initialValue = 10_000
): ProjectionPoint[] {
  const sample = sliceYears(points, 10);
  if (sample.length < 252) return [];

  const returns: number[] = [];
  for (let index = 1; index < sample.length; index++) {
    if (sample[index - 1].price > 0 && sample[index].price > 0) {
      returns.push(Math.log(sample[index].price / sample[index - 1].price));
    }
  }
  if (returns.length < 200) return [];

  const dailyMean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + Math.pow(value - dailyMean, 2), 0) /
    (returns.length - 1);
  const annualMean = dailyMean * 252;
  const annualVolatility = Math.sqrt(variance) * Math.sqrt(252);
  const z = 1.28155;

  return Array.from({ length: years * 4 + 1 }, (_, index) => {
    const year = index / 4;
    const spread = z * annualVolatility * Math.sqrt(year);
    return {
      year,
      low: initialValue * Math.exp(annualMean * year - spread),
      median: initialValue * Math.exp(annualMean * year),
      high: initialValue * Math.exp(annualMean * year + spread),
    };
  });
}
