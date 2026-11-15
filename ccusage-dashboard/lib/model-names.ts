/** Merge current Flash API/version labels, not older V4 Flash generations. */
export function canonicalModelName(name: string): string {
  const model = name
    .trim()
    .toLowerCase()
    .replace(/^deepseek\//, "");
  return model === "deepseek-flash" || model === "deepseek-v4.1-flash"
    ? "deepseek-flash"
    : name;
}
