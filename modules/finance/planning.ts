// Calendar dates preserve the original day across short months.
export function monthlyDate(date: string, offset: number) {
  const [year, month, day] = date.split('-').map(Number);
  const last = new Date(Date.UTC(year, month + offset, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1 + offset, Math.min(day, last))).toISOString().slice(0, 10);
}
export function installments(total: number, count: number) {
  if (!Number.isSafeInteger(total) || !Number.isInteger(count) || count < 1 || count > 60 || total < count) throw new Error('Valor insuficiente para a quantidade de parcelas.');
  return Array.from({length: count}, (_, i) => Math.floor(total / count) + (i < total % count ? 1 : 0));
}
export function convertQuantity(quantity: number, from: string, to: string) {
  const units: Record<string, {dimension: string; factor: number}> = {un:{dimension:'count',factor:1},g:{dimension:'mass',factor:1},kg:{dimension:'mass',factor:1000},ml:{dimension:'volume',factor:1},L:{dimension:'volume',factor:1000}};
  if (!units[from] || !units[to] || units[from].dimension !== units[to].dimension) throw new Error('Unidades incompatíveis. Use kg/g, L/ml ou a mesma unidade.');
  const result = Math.round(quantity * units[from].factor / units[to].factor * 1000) / 1000;
  if (!Number.isFinite(result) || result <= 0 || result > 1_000_000_000) throw new Error('Quantidade inválida ou menor que a precisão do estoque.');
  return result;
}
