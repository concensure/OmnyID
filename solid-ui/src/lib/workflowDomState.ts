// @locs-version: 1.0
function cssQuotedAttributeValue(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f"\\]/g, (char) => {
    if (char === "\"") return "\\\"";
    if (char === "\\") return "\\\\";
    const codePoint = char.charCodeAt(0).toString(16);
    return `\\${codePoint} `;
  });
}

export function workflowNodeDataSelector(nodeId: string): string {
  const cssEscape = globalThis.CSS?.escape;
  const escapedNodeId = typeof cssEscape === "function"
    ? cssEscape(nodeId)
    : cssQuotedAttributeValue(nodeId);
  return `[data-magic-id="${escapedNodeId}"]`;
}
