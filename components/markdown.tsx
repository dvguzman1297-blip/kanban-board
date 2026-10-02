"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import "./markdown.css";

/** Renders markdown (no raw HTML). Task-list checkboxes call `onToggle(index)` when provided. */
export function Markdown({ source, onToggle }: { source: string; onToggle?: (index: number) => void }) {
  let box = -1; // reset on every render so indexes match the source order
  return (
    <div className="md break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        components={{
          a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer noopener" className="text-indigo-300 underline underline-offset-2">{children}</a>,
          input: ({ type, checked }) => {
            if (type !== "checkbox") return null;
            const index = ++box;
            return <input type="checkbox" checked={!!checked} readOnly={!onToggle} disabled={!onToggle}
              onChange={() => onToggle?.(index)} aria-label="Toggle task" className="mr-1.5 h-3.5 w-3.5 translate-y-0.5 accent-indigo-500" />;
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
