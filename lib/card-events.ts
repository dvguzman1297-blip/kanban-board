type Detail = Record<string, string | null | undefined>;

const q = (v: string | null | undefined) => (v ? `“${v}”` : "none");

/** Human-readable sentence for an audit-trail row (without the actor's name). */
export function describeEvent(kind: string, d: Detail = {}): string {
  switch (kind) {
    case "created": return `created this card${d.column ? ` in ${d.column}` : ""}`;
    case "moved": return `moved this card from ${d.from ?? "?"} to ${d.to ?? "?"}`;
    case "due_date": return d.to ? `${d.from ? "changed" : "set"} the due date to ${d.to}` : "removed the due date";
    case "assignee": return d.to ? `assigned this card to ${d.to}` : `unassigned ${d.from ?? "this card"}`;
    case "priority": return `changed priority from ${d.from} to ${d.to}`;
    case "subtask_done": return `completed subtask ${q(d.title)}`;
    case "subtask_reopened": return `reopened subtask ${q(d.title)}`;
    case "tag_added": return `added the tag ${q(d.tag)}`;
    case "tag_removed": return `removed the tag ${q(d.tag)}`;
    default: return "updated this card";
  }
}
