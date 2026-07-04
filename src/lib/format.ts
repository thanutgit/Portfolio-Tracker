const CURRENCY_SYMBOLS: Record<string, string> = {
  THB: "฿",
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
};

function symbolFor(currency: string) {
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
