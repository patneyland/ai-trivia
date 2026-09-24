export function normalizeCode(value: string) {
  return value
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 6);
}

export function formatCode(value: string) {
  return value.length > 3 ? `${value.slice(0, 3)}-${value.slice(3, 6)}` : value;
}
