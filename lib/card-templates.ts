import type { CardTemplate } from "./types";

const sub = (title: string) => ({ id: crypto.randomUUID(), title, done: false });

type Builtin = Omit<CardTemplate, "id" | "board_id" | "subtasks"> & { subtasks: string[] };

const BUILTINS: Builtin[] = [
  {
    name: "Bug Report", builtin: true, title: "Bug: ", priority: "high", energy_level: "medium",
    description: "## Summary\n\n## Steps to reproduce\n1. \n2. \n3. \n\n## Expected behaviour\n\n## Actual behaviour\n\n## Environment\n- Browser / device:\n- Version:\n",
    subtasks: ["Reproduce the bug", "Find the root cause", "Fix and add a regression test", "Verify in staging"],
  },
  {
    name: "Feature Spec", builtin: true, title: "Spec: ", priority: "medium", energy_level: "high",
    description: "## Problem\n\n## Goals\n- \n\n## Non-goals\n- \n\n## Proposed solution\n\n## Open questions\n- [ ] \n",
    subtasks: ["Write the spec", "Review with the team", "Break down into tasks", "Sign-off"],
  },
  {
    name: "Database Migration", builtin: true, title: "Migration: ", priority: "high", energy_level: "high",
    description: "## Change\n\n```sql\n-- migration here\n```\n\n## Rollback\n\n```sql\n-- rollback here\n```\n\n## Risks\n- Locks / downtime:\n- Data backfill:\n",
    subtasks: ["Write the migration", "Write the rollback", "Test on a copy of production data", "Take a backup", "Run in production", "Verify and monitor"],
  },
  {
    name: "Release Checklist", builtin: true, title: "Release ", priority: "urgent", energy_level: "medium",
    description: "## Release notes\n- \n\n## Go / no-go\n- [ ] All tests green\n- [ ] Migrations reviewed\n- [ ] Rollback plan agreed\n",
    subtasks: ["Freeze the release branch", "Run the full test suite", "Update the changelog", "Deploy to staging and smoke test", "Deploy to production", "Announce the release"],
  },
];

/** Built-in templates with fresh subtask ids (so two cards never share ids). */
export const builtinTemplates = (): CardTemplate[] =>
  BUILTINS.map((t, i) => ({ ...t, id: `builtin-${i}`, board_id: "", subtasks: t.subtasks.map(sub) }));

/** Copies a template's subtasks with new ids and unchecked boxes. */
export const freshSubtasks = (t: Pick<CardTemplate, "subtasks">) => t.subtasks.map((s) => ({ id: crypto.randomUUID(), title: s.title, done: false }));
