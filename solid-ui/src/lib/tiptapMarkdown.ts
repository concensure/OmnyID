// @locs-version: 1.0
/**
 * Tiptap JSON â†’ Markdown serializer.
 *
 * Handles all node/mark types used by TiptapEditor:
 *   Nodes:  doc, paragraph, heading, bulletList, orderedList, taskList,
 *           listItem, taskItem, blockquote, codeBlock, hardBreak,
 *           horizontalRule, image, table/tableRow/tableHeader/tableCell,
 *           text, mention
 *   Marks:  bold, italic, strike, underline, code, link, highlight
 *           (textStyle/color are dropped â€” no Markdown equivalent)
 *
 * Text alignment is intentionally omitted â€” it is a display concern and the
 * Tiptap viewer that re-hydrates the Markdown applies alignment from the view.
 */

import type { JSONContent } from "@tiptap/core";

// â”€â”€ Public entry point â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function tiptapToMarkdown(doc: JSONContent): string {
  return serializeBlock(doc).trimEnd();
}

// â”€â”€ Block serializer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function serializeBlock(node: JSONContent): string {
  switch (node.type) {
    case "doc":
      return joinBlocks(node.content ?? []);

    case "paragraph": {
      const inline = serializeInlineNodes(node.content ?? []);
      return inline ? inline + "\n\n" : "";
    }

    case "heading": {
      const level = Math.max(1, Math.min(6, Number(node.attrs?.level ?? 1)));
      const text = serializeInlineNodes(node.content ?? []);
      return "#".repeat(level) + " " + text + "\n\n";
    }

    case "bulletList":
      return joinListItems(node.content ?? [], (_, item) => serializeListItem(item, "- ")) + "\n";

    case "orderedList": {
      const start = Number(node.attrs?.start ?? 1);
      return joinListItems(node.content ?? [], (i, item) => serializeListItem(item, `${start + i}. `)) + "\n";
    }

    case "taskList":
      return joinListItems(node.content ?? [], (_, item) => serializeTaskItem(item)) + "\n";

    case "blockquote": {
      const inner = joinBlocks(node.content ?? []).trimEnd();
      const quoted = inner.split("\n").map(line => `> ${line}`).join("\n");
      return quoted + "\n\n";
    }

    case "codeBlock": {
      const lang = String(node.attrs?.language ?? "");
      const text = (node.content ?? []).map(n => n.text ?? "").join("");
      return "```" + lang + "\n" + text + "\n```\n\n";
    }

    case "horizontalRule":
      return "---\n\n";

    case "image": {
      const src = String(node.attrs?.src ?? "");
      const alt = String(node.attrs?.alt ?? "");
      const title = node.attrs?.title ? ` "${String(node.attrs.title)}"` : "";
      return `![${alt}](${src}${title})\n\n`;
    }

    case "table":
      return serializeTable(node) + "\n";

    default:
      return joinBlocks(node.content ?? []);
  }
}

// â”€â”€ List helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function joinBlocks(nodes: JSONContent[]): string {
  return nodes.map(n => serializeBlock(n)).join("");
}

function joinListItems(
  items: JSONContent[],
  render: (index: number, item: JSONContent) => string,
): string {
  return items.map((item, i) => render(i, item)).join("");
}

function serializeListItem(item: JSONContent, marker: string): string {
  const children = item.content ?? [];
  if (children.length === 0) return marker + "\n";

  const [first, ...rest] = children;
  const firstText =
    first.type === "paragraph"
      ? serializeInlineNodes(first.content ?? [])
      : serializeBlock(first).trimEnd();

  let result = marker + firstText + "\n";

  // Nested lists / continuation paragraphs â€” indent by two spaces
  for (const child of rest) {
    const nested = serializeBlock(child)
      .trimEnd()
      .split("\n")
      .map(line => "  " + line)
      .join("\n");
    result += nested + "\n";
  }

  return result;
}

function serializeTaskItem(item: JSONContent): string {
  const checked = item.attrs?.checked ? "x" : " ";
  const marker = `- [${checked}] `;

  const children = item.content ?? [];
  if (children.length === 0) return marker + "\n";

  const [first, ...rest] = children;
  const firstText =
    first.type === "paragraph"
      ? serializeInlineNodes(first.content ?? [])
      : serializeBlock(first).trimEnd();

  let result = marker + firstText + "\n";

  for (const child of rest) {
    const nested = serializeBlock(child)
      .trimEnd()
      .split("\n")
      .map(line => "  " + line)
      .join("\n");
    result += nested + "\n";
  }

  return result;
}

// â”€â”€ Table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function serializeTable(node: JSONContent): string {
  const rows = node.content ?? [];
  if (rows.length === 0) return "";

  const serializeRow = (row: JSONContent): string[] =>
    (row.content ?? []).map(cell => {
      const paras = cell.content ?? [];
      const text = serializeInlineNodes(
        paras.flatMap(p => p.content ?? []),
      );
      return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
    });

  const [headerRow, ...dataRows] = rows;
  const headers = serializeRow(headerRow);
  const sep = headers.map(() => "---");

  const lines = [
    `| ${headers.join(" | ")} |`,
    `| ${sep.join(" | ")} |`,
    ...dataRows.map(row => `| ${serializeRow(row).join(" | ")} |`),
  ];

  return lines.join("\n") + "\n";
}

// â”€â”€ Inline serializer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function serializeInlineNodes(nodes: JSONContent[]): string {
  return nodes.map(serializeInlineNode).join("");
}

function serializeInlineNode(node: JSONContent): string {
  if (node.type === "hardBreak") return "  \n";
  if (node.type === "mention") {
    return `@${String(node.attrs?.label ?? node.attrs?.id ?? "mention")}`;
  }
  if (node.type !== "text") {
    // Wrap unknown inline nodes by traversing their children
    return serializeInlineNodes(node.content ?? []);
  }

  const raw = node.text ?? "";
  if (!raw) return "";

  const marks: JSONContent[] = node.marks ?? [];

  // Code mark takes full precedence â€” no escaping, no other marks
  if (marks.some(m => m.type === "code")) {
    return "`" + raw.replace(/`/g, "\\`") + "`";
  }

  // Escape markdown-significant characters in plain text
  let text = escapeMd(raw);

  // Apply marks in a stable order for predictable output
  const markTypes = new Set(marks.map(m => m.type));
  const linkMark = marks.find(m => m.type === "link");

  if (markTypes.has("underline"))  text = `<u>${text}</u>`;
  if (markTypes.has("highlight"))  text = `==${text}==`;
  if (markTypes.has("bold"))       text = `**${text}**`;
  if (markTypes.has("italic"))     text = `_${text}_`;
  if (markTypes.has("strike"))     text = `~~${text}~~`;
  if (linkMark) {
    const href = String(linkMark.attrs?.href ?? "#");
    const title = linkMark.attrs?.title ? ` "${String(linkMark.attrs.title)}"` : "";
    text = `[${text}](${href}${title})`;
  }

  return text;
}

// Escape characters that have special meaning in Markdown inline context.
// Applied only outside code spans so the raw text is preserved.
function escapeMd(text: string): string {
  return text.replace(/([\\`*_[\]~=|])/g, "\\$1");
}
