const flashNames = ["deepseek-flash", "deepseek-v4.1-flash"] as const;
const flashSearchNames = [
  ...flashNames,
  ...flashNames.map((name) => "deepseek/" + name),
];

/** Merge current Flash API/version labels, not older V4 Flash generations. */
export function canonicalModelName(name: string): string {
  const model = name
    .trim()
    .toLowerCase()
    .replace(/^deepseek\//, "");
  return flashNames.some((alias) => alias === model) ? flashNames[0] : name;
}

/** Keep aliases searchable without restoring duplicate labels in reports. */
export function searchableModelNames(name: string): readonly string[] {
  return canonicalModelName(name) === flashNames[0] ? flashSearchNames : [name];
}
