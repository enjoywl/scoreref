export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function matchSlug(hnam: string, anam: string): string {
  const home = slugify(hnam) || "team-a";
  const away = slugify(anam) || "team-b";
  return `${home}-vs-${away}`;
}
