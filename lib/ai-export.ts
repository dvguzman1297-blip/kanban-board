// Client-side export of an AI reply. Works from the already-rendered markdown (tables, lists, links), so no re-parsing.
export type ExportFormat = "excel" | "word" | "pdf";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const slug = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "ai-reply";

/** Detached copy with absolute links and no checkboxes, safe to hand to other apps. */
function cleanCopy(root: HTMLElement) {
  const copy = root.cloneNode(true) as HTMLElement;
  copy.querySelectorAll("a").forEach((a) => { const href = a.getAttribute("href"); if (href) a.setAttribute("href", new URL(href, location.origin).href); });
  copy.querySelectorAll("input").forEach((i) => i.remove());
  return copy;
}

const STYLE = "body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#111}h1,h2,h3{margin:14px 0 6px}table{border-collapse:collapse;margin:8px 0}" +
  "th,td{border:1px solid #999;padding:4px 8px;vertical-align:top;text-align:left}th{background:#e5e7eb}a{color:#4338ca}ul,ol{margin:6px 0}.meta{color:#666;font-size:9pt}";

function documentHtml(title: string, body: string, dateLabel: string) {
  return `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8">` +
    `<title>${esc(title)}</title><style>${STYLE}</style></head><body><h1>${esc(title)}</h1><p class="meta">${esc(dateLabel)}</p>${body}</body></html>`;
}

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function printHtml(html: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open(); doc.write(html); doc.close();
  setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1500);
  }, 150);
}

const cellText = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim();

async function toExcel(root: HTMLElement, title: string, filename: string) {
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();

  // Text outside tables (headings, paragraphs, bullets) goes on a "Summary" sheet.
  const lines: { text: string; bold: boolean }[] = [];
  root.querySelectorAll("h1,h2,h3,h4,p,li").forEach((el) => {
    if (el.closest("table")) return;
    const text = cellText(el);
    if (text) lines.push({ text: el.tagName === "LI" ? `• ${text}` : text, bold: /^H\d$/.test(el.tagName) });
  });
  const tables = [...root.querySelectorAll("table")];
  if (lines.length || !tables.length) {
    const sheet = book.addWorksheet("Summary");
    sheet.getColumn(1).width = 100;
    sheet.addRow([title]).font = { bold: true, size: 14 };
    lines.forEach((l) => { const row = sheet.addRow([l.text]); row.font = { bold: l.bold }; row.alignment = { wrapText: true, vertical: "top" }; });
  }

  tables.forEach((table, n) => {
    const sheet = book.addWorksheet(tables.length === 1 ? "Table" : `Table ${n + 1}`, { views: [{ state: "frozen", ySplit: 1 }] });
    const rows = [...table.querySelectorAll("tr")];
    const widths: number[] = [];
    rows.forEach((tr, r) => {
      const cells = [...tr.querySelectorAll("th,td")];
      const row = sheet.addRow(cells.map(cellText));
      cells.forEach((cell, c) => {
        const target = row.getCell(c + 1);
        const anchors = cell.querySelectorAll("a");
        if (anchors.length === 1 && anchors[0].href) target.value = { text: cellText(cell), hyperlink: anchors[0].href };
        target.alignment = { wrapText: true, vertical: "top" };
        widths[c] = Math.max(widths[c] ?? 10, Math.min(60, cellText(cell).length + 2));
      });
      if (r === 0) row.eachCell((c) => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF27272A" } }; });
    });
    widths.forEach((w, i) => { sheet.getColumn(i + 1).width = w; });
  });

  save(new Blob([await book.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
}

/** `root` is the rendered reply element; `title` is shown at the top of the exported document. */
export async function exportReply(format: ExportFormat, root: HTMLElement, title: string) {
  const copy = cleanCopy(root);
  const date = new Date().toISOString().slice(0, 10);
  const base = `${slug(title)}-${date}`;
  const html = documentHtml(title, copy.innerHTML, new Date().toLocaleString());
  if (format === "excel") return toExcel(copy, title, `${base}.xlsx`);
  if (format === "word") return save(new Blob(["﻿", html], { type: "application/msword" }), `${base}.doc`);
  printHtml(html);
}
