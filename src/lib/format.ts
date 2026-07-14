const CURRENCY_SYMBOLS: Record<string, string> = {
  THB: "฿",
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
};

export function symbolFor(currency: string) {
  return CURRENCY_SYMBOLS[currency] ?? `${currency} `;
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
}

export function formatMoney(value: number, currency = "THB") {
  const sign = value < 0 ? "-" : "";
  return `${sign}${symbolFor(currency)}${formatAmount(value)}`;
}

// For a per-unit price (Avg Cost, Last Price, a transaction's Price), not
// an aggregate money amount — trailing zeros are dropped but a
// significant decimal (e.g. 13.0219) is kept in full, rather than forcing
// a fixed 2 decimal places like formatMoney. Deliberately NOT used for
// totals (Market Value, Total Return, P&L, dividend amounts) — those stay
// on formatMoney's fixed 2dp, since a total's trailing zero is still
// meaningful (฿100.00, not ฿100).
export function formatUnitPrice(value: number, currency = "THB") {
  const sign = value < 0 ? "-" : "";
  const trimmed = Number(Math.abs(value)).toString();
  const decimals = trimmed.includes(".") ? trimmed.split(".")[1].length : 0;
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(value));
  return `${sign}${symbolFor(currency)}${formatted}`;
}

export function formatSigned(value: number, currency = "THB") {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${symbolFor(currency)}${formatAmount(value)}`;
}

export function formatPercent(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}

export function formatQuantity(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(value);
}

export function formatDateTime(isoString: string) {
  return new Date(isoString).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function pnlColor(value: number) {
  if (value > 0) return "text-green-600 dark:text-green-400";
  if (value < 0) return "text-red-600 dark:text-red-400";
  return "text-gray-500 dark:text-gray-400";
}

// Same green/red-is-P&L semantics as pnlColor, plus a translucent pill
// background — for badge/chip contexts (DESIGN.md Components > Badges/chips).
export function pnlBadgeClass(value: number) {
  if (value > 0) return "bg-green-500/10 text-green-600 dark:bg-green-400/10 dark:text-green-400";
  if (value < 0) return "bg-red-500/10 text-red-600 dark:bg-red-400/10 dark:text-red-400";
  return "bg-gray-500/10 text-gray-600 dark:bg-gray-400/10 dark:text-gray-400";
}
