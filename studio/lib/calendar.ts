export function isDateInMonth(value: string, year: number, month: number) {
  return value.startsWith(`${year}-${String(month).padStart(2, "0")}-`);
}
