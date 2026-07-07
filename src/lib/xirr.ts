export interface CashFlow {
  /** "YYYY-MM-DD" */
  date: string;
  /** Negative = money out (invested), positive = money in (returned). */
  amount: number;
}

export interface XirrOptions {
  guess?: number;
  maxIterations?: number;
  tolerance?: number;
  /** Minimum days between the earliest and latest cash flow (default 30). */
  minSpanDays?: number;
}

const DAYS_PER_YEAR = 365;
const MS_PER_DAY = 86400000;
const DEFAULT_GUESS = 0.1;
const MAX_ITERATIONS = 100;
const TOLERANCE = 1e-7;
const DEFAULT_MIN_SPAN_DAYS = 30;

// Parsed manually (not `new Date(str)`) so day-count math is exact
// regardless of the runner's local timezone — every date is anchored to
// UTC midnight, so differences between them are always whole days.
function toUtcDays(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

// Money-weighted annualized return: the constant rate `r` that makes the
// net present value of every cash flow sum to zero —
//   sum( amount_i / (1 + r) ^ years_i ) = 0
// — solved via Newton-Raphson, with basic damping (step-halving) so a
// steep NPV curve (e.g. near a large loss) can't overshoot past the
// mathematically valid `r > -1` boundary and get discarded on the very
// first step.
//
// Returns `null` — never `NaN`/`Infinity` — when no meaningful rate
// exists: fewer than 2 cash flows, everything on the same date (nothing
// to annualize over), the whole history spans less than `minSpanDays`
// (annualizing a return over just a few days is technically solvable but
// swings to an absurd, misleading percentage for even a modest real
// gain/loss — see DECISIONS.md), all flows the same sign (not a real
// investment/return pair), or the iteration doesn't converge within
// maxIterations.
export function xirr(cashFlows: CashFlow[], options: XirrOptions = {}): number | null {
  if (cashFlows.length < 2) return null;

  const hasPositive = cashFlows.some((c) => c.amount > 0);
  const hasNegative = cashFlows.some((c) => c.amount < 0);
  if (!hasPositive || !hasNegative) return null;

  const days = cashFlows.map((c) => toUtcDays(c.date));
  const t0 = Math.min(...days);
  const t1 = Math.max(...days);
  if (new Set(days).size < 2) return null; // every flow on the same day
  const minSpanDays = options.minSpanDays ?? DEFAULT_MIN_SPAN_DAYS;
  if (t1 - t0 < minSpanDays) return null;

  const years = days.map((d) => (d - t0) / DAYS_PER_YEAR);
  const amounts = cashFlows.map((c) => c.amount);

  const maxIterations = options.maxIterations ?? MAX_ITERATIONS;
  const tolerance = options.tolerance ?? TOLERANCE;
  let rate = options.guess ?? DEFAULT_GUESS;

  for (let i = 0; i < maxIterations; i++) {
    if (!Number.isFinite(rate) || rate <= -1) return null;

    let npv = 0;
    let dNpv = 0;
    for (let j = 0; j < amounts.length; j++) {
      const factor = Math.pow(1 + rate, years[j]);
      npv += amounts[j] / factor;
      dNpv += (-years[j] * amounts[j]) / (factor * (1 + rate));
    }

    if (!Number.isFinite(npv) || !Number.isFinite(dNpv) || dNpv === 0) return null;

    let step = npv / dNpv;
    let nextRate = rate - step;
    let damping = 0;
    while ((!Number.isFinite(nextRate) || nextRate <= -1) && damping < 50) {
      step /= 2;
      nextRate = rate - step;
      damping += 1;
    }
    if (!Number.isFinite(nextRate) || nextRate <= -1) return null;

    if (Math.abs(nextRate - rate) < tolerance) {
      return nextRate;
    }
    rate = nextRate;
  }

  return null; // did not converge within maxIterations
}
