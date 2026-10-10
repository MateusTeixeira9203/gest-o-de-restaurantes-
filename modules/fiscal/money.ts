export const decimal = (c: number) => (c / 100).toFixed(2);
export function percent(cents: number, rate: string) {
  const [whole, fraction = ""] = rate.split(".");
  const scaled = BigInt((whole || "0") + fraction.padEnd(4, "0"));
  return Number((BigInt(cents) * scaled + BigInt(500000)) / BigInt(1000000));
}
// Largest remainders, stable tie order: allocations sum exactly to the original cents.
export function allocate(cents: number, weights: number[]) {
  const total = weights.reduce((n, w) => n + w, 0);
  if (
    !Number.isSafeInteger(cents) ||
    cents < 0 ||
    weights.some((w) => !Number.isSafeInteger(w) || w < 0)
  )
    throw new Error("Rateio inválido.");
  if (!total) {
    if (cents) throw new Error("Não é possível ratear sem itens.");
    return weights.map(() => 0);
  }
  const parts = weights.map((w, i) => ({
    i,
    value: Number((BigInt(cents) * BigInt(w)) / BigInt(total)),
    rest: (BigInt(cents) * BigInt(w)) % BigInt(total),
  }));
  let remainder = cents - parts.reduce((n, p) => n + p.value, 0);
  for (const p of [...parts].sort((a, b) =>
    a.rest === b.rest ? a.i - b.i : a.rest > b.rest ? -1 : 1,
  )) {
    if (remainder-- <= 0) break;
    p.value++;
  }
  return parts.map((p) => p.value);
}
