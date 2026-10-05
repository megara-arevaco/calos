/** Diary dates use the device's local calendar, matching measurement forms. */
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Keep the local diary day in the ISO prefix while preserving the actual instant. */
export function localTimestamp(date = new Date()): string {
  const offset = -date.getTimezoneOffset();
  const shifted = new Date(date.getTime() + offset * 60_000);
  const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
  const minutes = String(Math.abs(offset) % 60).padStart(2, "0");
  return `${shifted.toISOString().slice(0, -1)}${offset < 0 ? "-" : "+"}${hours}:${minutes}`;
}
