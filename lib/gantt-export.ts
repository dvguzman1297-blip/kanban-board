// Builds an interactive Excel Gantt chart: one row per card, one narrow column per day.
// The bars are conditional formatting driven by each row's Start / Due cells, so editing a date in Excel moves the bar.
import { isDoneName } from "./board-utils";
import { memberName } from "./board-stats";
import { effectiveColor, type ColorKey } from "./colors";
import { cardDates, dayOffset, shiftISO } from "./timeline";
import type { Card, Column, Member } from "./types";

// Tailwind 500 shades, matching PALETTE in colors.ts.
const HEX: Record<ColorKey, string> = {
  slate: "64748B", sky: "0EA5E9", teal: "14B8A6", emerald: "10B981", amber: "F59E0B",
  orange: "F97316", rose: "F43F5E", pink: "EC4899", violet: "8B5CF6", indigo: "6366F1",
};
const MAX_DAYS = 1100; // keeps the sheet usable; later bars are clipped
const PAD_BEFORE = 7; // spare days either side so dates can be dragged out in Excel
const PAD_AFTER = 30;

export type GanttRow = {
  title: string; status: string; assignee: string; priority: string;
  barStart: string; barEnd: string; // the dates the chart draws, same rule as the Timeline view
  progress: string; color: string; // 6-digit hex
};
export type GanttPlan = { rows: GanttRow[]; start: string; end: string };

/** Blends a hex colour towards white; used for completed cards. */
const lighten = (hex: string, amount: number) =>
  [0, 2, 4].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - amount) + 255 * amount).toString(16).padStart(2, "0")).join("").toUpperCase();

export function buildGanttPlan(input: {
  cards: Card[]; columns: Column[]; members: Member[]; colColors: Record<string, ColorKey>; today: string;
}): GanttPlan {
  const { columns, members, colColors, today } = input;
  const colById = new Map(columns.map((c) => [c.id, c]));
  const people = new Map(members.map((m) => [m.id, memberName(m)]));

  const rows = input.cards
    .filter((c) => !c.archived_at && colById.has(c.column_id))
    .map((c): GanttRow => {
      const col = colById.get(c.column_id)!;
      const { start, end } = cardDates(c, today);
      const subs = c.subtasks ?? [];
      const hex = HEX[effectiveColor(c.color, colColors[col.id] ?? "slate")];
      return {
        title: c.title, status: col.name, assignee: c.assignee_id ? people.get(c.assignee_id) ?? "Former member" : "",
        priority: c.priority, barStart: start, barEnd: end,
        progress: subs.length ? `${subs.filter((s) => s.done).length}/${subs.length}` : "",
        color: isDoneName(col.name) ? lighten(hex, 0.45) : hex,
      };
    })
    .sort((a, b) => a.barStart.localeCompare(b.barStart) || a.barEnd.localeCompare(b.barEnd) || a.title.localeCompare(b.title));

  if (!rows.length) return { rows, start: today, end: today };
  const start = rows.reduce((m, r) => (r.barStart < m ? r.barStart : m), rows[0].barStart);
  const end = rows.reduce((m, r) => (r.barEnd > m ? r.barEnd : m), rows[0].barEnd);
  return { rows, start, end: dayOffset(start, end) >= MAX_DAYS ? shiftISO(start, MAX_DAYS - 1) : end };
}

// Fixed columns (1-based): Card, Status, Assignee, Priority, Start, Due, Days, Subtasks; day columns follow.
const FIXED = ["Card", "Status", "Assignee", "Priority", "Start", "Due", "Days", "Subtasks"];
const START_COL = 5, DUE_COL = 6, DAYS_COL = 7;
const FIRST_DAY = FIXED.length + 1;
const HEADER_ROWS = 3, FIRST_ROW = HEADER_ROWS + 1;
const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" });
const utcDate = (iso: string) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)));
const solid = (hex: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: `FF${hex}` } });
// Conditional-format fills use bgColor.
const cfFill = (hex: string) => ({ fill: { type: "pattern" as const, pattern: "solid" as const, bgColor: { argb: `FF${hex}` }, fgColor: { argb: `FF${hex}` } } });

export async function buildGanttWorkbook(input: Parameters<typeof buildGanttPlan>[0] & { boardName: string }) {
  const plan = buildGanttPlan(input);
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Gantt", { views: [{ state: "frozen", xSplit: 1, ySplit: HEADER_ROWS }] });

  const rangeStart = shiftISO(plan.start, -PAD_BEFORE);
  const days = dayOffset(rangeStart, shiftISO(plan.end, PAD_AFTER)) + 1;
  const dayIso = (i: number) => shiftISO(rangeStart, i);
  const lastRow = FIRST_ROW + Math.max(plan.rows.length, 1) - 1;
  const colName = (n: number) => { let s = ""; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
  const firstDayCol = colName(FIRST_DAY), lastDayCol = colName(FIRST_DAY + days - 1);

  sheet.getColumn(1).width = 38;
  [14, 16, 10, 12, 12, 7, 10].forEach((w, i) => { sheet.getColumn(i + 2).width = w; });
  for (let i = 0; i < days; i++) sheet.getColumn(FIRST_DAY + i).width = 3.2;

  // Header: title, a hint, fixed column names, then month / day-number / weekday bands over the day columns.
  sheet.getCell(1, 1).value = input.boardName;
  sheet.getCell(1, 1).font = { bold: true, size: 14 };
  sheet.getCell(2, 1).value = "Edit Start / Due to move a bar. Status and Priority have dropdowns.";
  sheet.getCell(2, 1).font = { italic: true, size: 9, color: { argb: "FF71717A" } };
  FIXED.forEach((label, i) => {
    const cell = sheet.getCell(HEADER_ROWS, i + 1);
    cell.value = label; cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = solid("27272A");
  });
  let monthFrom = 0;
  for (let i = 0; i <= days; i++) {
    if (i < days && dayIso(i).slice(0, 7) === dayIso(monthFrom).slice(0, 7)) continue;
    const cell = sheet.getCell(1, FIRST_DAY + monthFrom);
    cell.value = MONTH(dayIso(monthFrom)); cell.font = { bold: true }; cell.alignment = { horizontal: "left" };
    if (i - 1 > monthFrom) sheet.mergeCells(1, FIRST_DAY + monthFrom, 1, FIRST_DAY + i - 1);
    monthFrom = i;
  }
  for (let i = 0; i < days; i++) {
    const iso = dayIso(i);
    const num = sheet.getCell(2, FIRST_DAY + i); // a real date, so the bar formulas can compare against it
    num.value = utcDate(iso); num.numFmt = "d"; num.font = { size: 8 }; num.alignment = { horizontal: "center" };
    const wd = sheet.getCell(HEADER_ROWS, FIRST_DAY + i);
    wd.value = WEEKDAY[utcDate(iso).getUTCDay()]; wd.font = { size: 8 }; wd.alignment = { horizontal: "center" };
  }

  // One row per card: editable cells on the left; the bar is drawn by the rules below.
  const statusNames = [...new Set(input.columns.map((c) => c.name))];
  const statusList = statusNames.every((n) => !n.includes(",") && !n.includes('"')) && statusNames.join(",").length < 250 ? statusNames.join(",") : null;
  plan.rows.forEach((r, n) => {
    const row = FIRST_ROW + n;
    const dateCell = (col: number, iso: string) => {
      const cell = sheet.getCell(row, col);
      cell.value = utcDate(iso); cell.numFmt = "yyyy-mm-dd";
      cell.dataValidation = { type: "date", operator: "greaterThan", formulae: [new Date(Date.UTC(2000, 0, 1))], allowBlank: false, showErrorMessage: true, errorTitle: "Invalid date", error: "Enter a valid date, for example 2026-10-15." };
    };
    sheet.getCell(row, 1).value = r.title;
    sheet.getCell(row, 2).value = r.status;
    if (statusList) sheet.getCell(row, 2).dataValidation = { type: "list", allowBlank: false, formulae: [`"${statusList}"`] };
    sheet.getCell(row, 3).value = r.assignee;
    sheet.getCell(row, 4).value = r.priority;
    sheet.getCell(row, 4).dataValidation = { type: "list", allowBlank: false, formulae: ['"low,medium,high,urgent"'] };
    dateCell(START_COL, r.barStart);
    dateCell(DUE_COL, r.barEnd);
    const start = `${colName(START_COL)}${row}`, due = `${colName(DUE_COL)}${row}`;
    sheet.getCell(row, DAYS_COL).value = { formula: `IF(AND(ISNUMBER(${start}),ISNUMBER(${due})),${due}-${start}+1,"")`, result: dayOffset(r.barStart, r.barEnd) + 1 };
    sheet.getCell(row, DAYS_COL + 1).value = r.progress;

    // The bar: day cells whose date falls between this row's Start and Due.
    sheet.addConditionalFormatting({
      ref: `${firstDayCol}${row}:${lastDayCol}${row}`,
      rules: [{
        type: "expression", priority: n + 1, style: cfFill(r.color),
        formulae: [`AND(ISNUMBER($${colName(START_COL)}${row}),ISNUMBER($${colName(DUE_COL)}${row}),${firstDayCol}$2>=$${colName(START_COL)}${row},${firstDayCol}$2<=$${colName(DUE_COL)}${row})`],
      }],
    });
  });

  // Today and weekend shading across headers and the grid (lower priority than the bars).
  const grid = `${firstDayCol}2:${lastDayCol}${lastRow}`;
  sheet.addConditionalFormatting({
    ref: grid,
    rules: [
      { type: "expression", priority: plan.rows.length + 1, style: cfFill("C7D2FE"), formulae: [`${firstDayCol}$2=TODAY()`] },
      { type: "expression", priority: plan.rows.length + 2, style: cfFill("E4E4E7"), formulae: [`WEEKDAY(${firstDayCol}$2,2)>5`] },
    ],
  });
  sheet.autoFilter = { from: { row: HEADER_ROWS, column: 1 }, to: { row: HEADER_ROWS, column: FIXED.length } };

  return book;
}

export async function downloadGanttXlsx(input: Parameters<typeof buildGanttPlan>[0] & { boardName: string }) {
  const buffer = await (await buildGanttWorkbook(input)).xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${input.boardName.replace(/[\\/:*?"<>|]+/g, "").trim() || "board"}-gantt-${input.today}.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
