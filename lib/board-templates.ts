// Starter boards offered when creating a board. The structures are common workflow patterns written from scratch.
// Column names matter: "Done" feeds velocity/completion/auto-archive and "Blocked"/"Waiting" feed the blocked count.
import type { Card } from "./types";

export type TemplateColumn = { name: string; wip_limit: number | null };
export type TemplateCard = {
  column: number; // index into `columns`
  title: string; description?: string; priority: Card["priority"];
  dueInDays?: number; subtasks?: string[];
};
export type BoardTemplate = {
  id: string; name: string; description: string; columns: TemplateColumn[]; examples: TemplateCard[];
};

const col = (name: string, wip_limit: number | null = null): TemplateColumn => ({ name, wip_limit });

export const BOARD_TEMPLATES: BoardTemplate[] = [
  {
    id: "standard", name: "Standard Kanban", description: "A simple flow for any kind of work.",
    columns: [col("Backlog"), col("Up Next"), col("In Progress", 3), col("Blocked"), col("Done")],
    examples: [],
  },
  {
    id: "sprint", name: "Sprint (Scrum)", description: "Plan and track work in short iterations.",
    columns: [col("Backlog"), col("To Do"), col("In Progress", 3), col("In Review"), col("Blocked"), col("Done")],
    examples: [
      { column: 0, title: "Write user stories for the next sprint", priority: "medium", subtasks: ["Draft stories", "Add acceptance criteria", "Estimate with the team"] },
      { column: 1, title: "Set up the sprint goal", priority: "high", dueInDays: 1, description: "One sentence the whole team can repeat: what must be true at the end of the sprint?" },
      { column: 2, title: "Build the first feature", priority: "high", dueInDays: 5, subtasks: ["Design", "Implement", "Write tests"] },
      { column: 3, title: "Review the first pull request", priority: "medium", dueInDays: 2 },
    ],
  },
  {
    id: "content", name: "Content Calendar", description: "Move posts from idea to published.",
    columns: [col("Ideas"), col("Writing", 4), col("In Review"), col("Scheduled"), col("Done")],
    examples: [
      { column: 0, title: "Post idea: customer success story", priority: "low", description: "Angle, audience and where it will be shared." },
      { column: 1, title: "Draft the monthly newsletter", priority: "high", dueInDays: 4, subtasks: ["Outline", "First draft", "Add images", "Proofread"] },
      { column: 2, title: "Blog post: product update", priority: "medium", dueInDays: 3 },
      { column: 3, title: "Social posts for launch week", priority: "medium", dueInDays: 7 },
    ],
  },
  {
    id: "hiring", name: "Hiring Pipeline", description: "Follow candidates from application to hire.",
    columns: [col("Applied"), col("Screening", 6), col("Interview", 4), col("Offer"), col("Waiting"), col("Done")],
    examples: [
      { column: 0, title: "Candidate: Alex Rivera – Frontend Developer", priority: "medium", description: "Source, CV link and first impressions." },
      { column: 1, title: "Candidate: Sam Patel – Product Designer", priority: "medium", dueInDays: 2, subtasks: ["Review portfolio", "Phone screen"] },
      { column: 2, title: "Candidate: Jordan Lee – Backend Developer", priority: "high", dueInDays: 3, subtasks: ["Schedule panel", "Collect feedback", "Decide next step"] },
      { column: 4, title: "Candidate: Chris Wong – references pending", priority: "low", dueInDays: 5 },
    ],
  },
  {
    id: "bugs", name: "Bug Tracker", description: "Triage, fix and verify issues.",
    columns: [col("Reported"), col("Triaged"), col("In Progress", 3), col("In Review"), col("Blocked"), col("Done")],
    examples: [
      { column: 0, title: "Bug: page crashes when saving an empty form", priority: "high", description: "## Steps to reproduce\n1. \n2. \n\n## Expected\n\n## Actual\n" },
      { column: 1, title: "Bug: wrong date shown on the calendar", priority: "medium", dueInDays: 6 },
      { column: 2, title: "Bug: login fails on slow connections", priority: "urgent", dueInDays: 1, subtasks: ["Reproduce", "Find the root cause", "Fix and add a test"] },
      { column: 4, title: "Bug: export fails for large files (needs server logs)", priority: "medium" },
    ],
  },
  {
    id: "personal", name: "Personal Tasks", description: "Your own to-do list, kept simple.",
    columns: [col("To Do"), col("Doing", 3), col("Waiting"), col("Done")],
    examples: [
      { column: 0, title: "Book the dentist appointment", priority: "low", dueInDays: 7 },
      { column: 0, title: "Plan the week's meals", priority: "medium", dueInDays: 2, subtasks: ["Pick recipes", "Write the shopping list"] },
      { column: 1, title: "Finish the report", priority: "high", dueInDays: 3 },
      { column: 2, title: "Waiting for the package to arrive", priority: "low" },
    ],
  },
  {
    id: "weekly", name: "Weekly Planner", description: "Plan the week day by day.",
    columns: [col("Monday"), col("Tuesday"), col("Wednesday"), col("Thursday"), col("Friday"), col("Done")],
    examples: [
      { column: 0, title: "Weekly planning and priorities", priority: "high", subtasks: ["Review last week", "Pick the top 3 goals"] },
      { column: 1, title: "Team check-in", priority: "medium" },
      { column: 2, title: "Deep-work block: main project", priority: "high" },
      { column: 4, title: "Weekly review and wrap-up", priority: "medium", subtasks: ["Update the board", "Send the status update"] },
    ],
  },
  {
    id: "project", name: "Project Plan", description: "Run a project from plan to delivery.",
    columns: [col("Planning"), col("In Progress", 5), col("Review"), col("Waiting"), col("Done")],
    examples: [
      { column: 0, title: "Define scope and goals", priority: "high", dueInDays: 2, description: "What are we delivering, for whom, and by when?" },
      { column: 0, title: "List stakeholders and risks", priority: "medium", dueInDays: 4 },
      { column: 1, title: "Build the first milestone", priority: "high", dueInDays: 10, subtasks: ["Break into tasks", "Assign owners", "Track progress"] },
      { column: 3, title: "Waiting for budget approval", priority: "medium", dueInDays: 5 },
    ],
  },
  {
    id: "roadmap", name: "Product Roadmap", description: "Take ideas from backlog to release.",
    columns: [col("Ideas"), col("Planned"), col("Building", 4), col("Testing"), col("Done")],
    examples: [
      { column: 0, title: "Idea: dark mode for the mobile app", priority: "low", description: "Who asked for it, and what problem does it solve?" },
      { column: 1, title: "Planned: single sign-on", priority: "high", dueInDays: 21, subtasks: ["Write the spec", "Choose the provider"] },
      { column: 2, title: "Building: improved search", priority: "high", dueInDays: 10 },
      { column: 3, title: "Testing: new onboarding flow", priority: "medium", dueInDays: 4 },
    ],
  },
  {
    id: "marketing", name: "Marketing Campaign", description: "Plan, create and launch a campaign.",
    columns: [col("Brainstorm"), col("Planning"), col("Creating", 4), col("Review"), col("Live"), col("Done")],
    examples: [
      { column: 0, title: "Campaign theme ideas", priority: "medium" },
      { column: 1, title: "Set audience, channels and budget", priority: "high", dueInDays: 3, subtasks: ["Define the audience", "Pick channels", "Set the budget"] },
      { column: 2, title: "Design the landing page", priority: "high", dueInDays: 8 },
      { column: 3, title: "Review the email sequence", priority: "medium", dueInDays: 5 },
    ],
  },
  {
    id: "support", name: "Customer Support", description: "Handle requests from new to resolved.",
    columns: [col("New"), col("In Progress", 5), col("Waiting"), col("Done")],
    examples: [
      { column: 0, title: "Customer cannot reset their password", priority: "high", dueInDays: 1, description: "Account, what they tried, and any error message." },
      { column: 0, title: "Question about invoice 1042", priority: "medium", dueInDays: 2 },
      { column: 1, title: "Investigate slow dashboard report", priority: "high", dueInDays: 2, subtasks: ["Reproduce", "Check logs", "Reply to the customer"] },
      { column: 2, title: "Waiting for the customer to send a screenshot", priority: "low" },
    ],
  },
  {
    id: "event", name: "Event Planning", description: "Organize an event, step by step.",
    columns: [col("Ideas"), col("Planning", 6), col("Booked"), col("Waiting"), col("Done")],
    examples: [
      { column: 0, title: "Venue options", priority: "medium", subtasks: ["Shortlist 3 venues", "Compare costs"] },
      { column: 1, title: "Build the guest list", priority: "high", dueInDays: 7 },
      { column: 2, title: "Book the caterer", priority: "medium", dueInDays: 14 },
      { column: 3, title: "Waiting for speaker confirmation", priority: "high", dueInDays: 5 },
    ],
  },
  {
    id: "onboarding", name: "Employee Onboarding", description: "Welcome a new hire from day one.",
    columns: [col("Before Day 1"), col("Week 1"), col("First Month"), col("Done")],
    examples: [
      { column: 0, title: "Prepare laptop, accounts and access", priority: "high", dueInDays: 2, subtasks: ["Order equipment", "Create accounts", "Send the welcome email"] },
      { column: 1, title: "Intro meetings with the team", priority: "medium", dueInDays: 5 },
      { column: 1, title: "Walk through tools and processes", priority: "medium", dueInDays: 6 },
      { column: 2, title: "Set 30-60-90 day goals", priority: "medium", dueInDays: 20 },
    ],
  },
];

export const templateById = (id: unknown) => BOARD_TEMPLATES.find((t) => t.id === id) ?? BOARD_TEMPLATES[0];
