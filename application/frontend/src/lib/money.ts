const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** Formats integer cents. Money is never held as a float in application state. */
export function formatMoney(cents: number): string {
  return formatter.format(cents / 100);
}

/** Parses a user-entered dollar amount ("12.50") into integer cents, or null if it is not a valid amount. */
export function parseDollarsToCents(input: string): number | null {
  const text = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [whole = "0", fraction = ""] = text.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function centsToDollarInput(cents: number): string {
  return (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
}
