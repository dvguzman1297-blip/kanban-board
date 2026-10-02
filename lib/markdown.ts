/** Toggles the nth task-list checkbox ("- [ ]" / "- [x]") in markdown source. */
export function toggleCheckbox(source: string, index: number): string {
  let i = -1;
  return source.replace(/^(\s*(?:[-*+]|\d+\.)\s+)\[( |x|X)\]/gm, (m, lead: string, mark: string) => {
    i++;
    return i === index ? `${lead}[${mark === " " ? "x" : " "}]` : m;
  });
}

/** One-line plain-text preview of markdown for card faces. */
export function stripMarkdown(source: string): string {
  return source
    .replace(/```[\s\S]*?```/g, " code ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(?:[-*+]|\d+\.)\s+\[( |x|X)\]\s+/gm, (_m, c: string) => (c === " " ? "☐ " : "☑ "))
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/(\*\*|__|\*|_|`|~~)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
