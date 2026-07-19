export const BUSINESS_TIME_ZONE = "America/Bogota";

function dateParts(date: Date): { year: string; month: string; day: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: values.get("year") ?? "0000",
    month: values.get("month") ?? "01",
    day: values.get("day") ?? "01",
  };
}

/** Current business date, independent from browser/host timezone. */
export function businessDateISO(date = new Date()): string {
  const { year, month, day } = dateParts(date);
  return `${year}-${month}-${day}`;
}

export function businessMonthISO(date = new Date()): string {
  const { year, month } = dateParts(date);
  return `${year}-${month}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Date-only arithmetic in UTC avoids DST and host-timezone drift. */
export function shiftDateISO(date: string, days: number): string {
  const [year = "0", month = "1", day = "1"] = date.split("-");
  const shifted = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + days));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

export function shiftMonthISO(month: string, delta: number): string {
  const [year = "0", rawMonth = "1"] = month.split("-");
  const shifted = new Date(Date.UTC(Number(year), Number(rawMonth) - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}`;
}
