// Thai tax-advantaged fund holding-period rules, checked against published
// guidance as of July 2026 — these can change; re-verify before relying on
// this for a real tax filing.
//   RMF:     5 years from each individual buy lot's trade date, AND the
//            holder must be 55+ years old, to sell without penalty.
//   SSF:     10 years from each individual buy lot's trade date. No age
//            condition.
//   ThaiESG: 5 years from each individual buy lot's trade date. No age
//            condition.
//   normal:  no holding-period condition at all.
const HOLDING_PERIOD_YEARS: Record<string, number | null> = {
  normal: null,
  RMF: 5,
  SSF: 10,
  ThaiESG: 5,
};

const RMF_MIN_AGE = 55;

export interface TaxHoldingInput {
  taxBucket: string;
  /** The buy transaction's trade_date, "YYYY-MM-DD". */
  tradeDate: string;
  /** Nullable — the user may not have entered it yet. */
  birthDate: string | null;
  /** Defaults to today; injectable so this stays a pure, testable function. */
  asOf?: string;
}

export type TaxHoldingStatus = "met" | "not_met" | "no_condition";

export interface TaxHoldingResult {
  taxBucket: string;
  holdingPeriodYears: number | null;
  /** trade_date + holdingPeriodYears. Null for `normal` (no condition). */
  eligibleDate: string | null;
  /** Null for `normal`. */
  holdingPeriodMet: boolean | null;
  /** Negative/zero once the holding-period date has passed. Null for `normal`. */
  daysUntilHoldingEligible: number | null;
  /** True only for RMF. */
  ageRequired: boolean;
  /** birth_date + 55 years. Null unless RMF and birth_date is known. */
  ageEligibleDate: string | null;
  /** Null = unknown (RMF with no birth_date) or n/a (not RMF). */
  ageConditionMet: boolean | null;
  /** Null unless RMF and birth_date is known. */
  daysUntilAgeEligible: number | null;
  status: TaxHoldingStatus;
}

function addYears(dateStr: string, years: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().slice(0, 10);
}

// ISO "YYYY-MM-DD" strings compare lexicographically in calendar order.
function isOnOrAfter(a: string, b: string): boolean {
  return a >= b;
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const ta = Date.UTC(ay, am - 1, ad);
  const tb = Date.UTC(by, bm - 1, bd);
  return Math.round((tb - ta) / 86400000);
}

// Per lot/transaction, not per asset as a whole — each buy has its own
// clock, so a single asset can have some lots already eligible and others
// still waiting, exactly as Thai RMF/SSF/ThaiESG rules require.
export function computeTaxHoldingStatus({
  taxBucket,
  tradeDate,
  birthDate,
  asOf,
}: TaxHoldingInput): TaxHoldingResult {
  const today = asOf ?? new Date().toISOString().slice(0, 10);
  const holdingPeriodYears = HOLDING_PERIOD_YEARS[taxBucket] ?? null;

  if (holdingPeriodYears === null) {
    return {
      taxBucket,
      holdingPeriodYears: null,
      eligibleDate: null,
      holdingPeriodMet: null,
      daysUntilHoldingEligible: null,
      ageRequired: false,
      ageEligibleDate: null,
      ageConditionMet: null,
      daysUntilAgeEligible: null,
      status: "no_condition",
    };
  }

  const eligibleDate = addYears(tradeDate, holdingPeriodYears);
  const holdingPeriodMet = isOnOrAfter(today, eligibleDate);
  const daysUntilHoldingEligible = daysBetween(today, eligibleDate);

  const ageRequired = taxBucket === "RMF";
  let ageEligibleDate: string | null = null;
  let ageConditionMet: boolean | null = null;
  let daysUntilAgeEligible: number | null = null;
  if (ageRequired && birthDate) {
    ageEligibleDate = addYears(birthDate, RMF_MIN_AGE);
    ageConditionMet = isOnOrAfter(today, ageEligibleDate);
    daysUntilAgeEligible = daysBetween(today, ageEligibleDate);
  }

  // `ageConditionMet === null` (RMF, birth_date unknown) is treated as not
  // met — conservative, since compliance can't be confirmed either way.
  // The UI distinguishes this "unknown" case from a real "not met" using
  // `ageRequired && ageConditionMet === null` directly, rather than a 4th
  // status value here.
  const allConditionsMet = holdingPeriodMet && (!ageRequired || ageConditionMet === true);

  return {
    taxBucket,
    holdingPeriodYears,
    eligibleDate,
    holdingPeriodMet,
    daysUntilHoldingEligible,
    ageRequired,
    ageEligibleDate,
    ageConditionMet,
    daysUntilAgeEligible,
    status: allConditionsMet ? "met" : "not_met",
  };
}
