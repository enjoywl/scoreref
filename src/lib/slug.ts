export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function matchSlug(hnam: string, anam: string): string {
  return `${slugify(hnam)}-vs-${slugify(anam)}`;
}
