// Format Canvas-ready peer replies. Review reminders stay outside the editor.
// Kept pure so existing saved drafts can be displayed cleanly without rerunning AI.
function cleanPeerReply(input) {
  const result = [];
  for (const line of String(input || "").split(/\r?\n/)) {
    let value = line.trim();
    if (!value) { result.push(""); continue; }
    if (/^source verification needed\.?$/i.test(value)) continue;
    if (/^note\s*:/i.test(value) &&
        /\b(AI|artificial intelligence|disclosure|draft|source verification)\b/i.test(value)) continue;
    value = value.replace(/\s*source verification needed\.?\s*$/i, "").trim();
    if (!value) continue;
    if (value.endsWith("?")) {
      if (/^(?:question\s*:|how|what|which|why|when|where|who|would|could|should|can|do|does|is|are|in what|to what)\b/i.test(value)) continue;
      const match = value.match(/^(.+[.!])\s+(?:question\s*:|how|what|which|why|when|where|who|would|could|should|can|do|does|is|are)\b[^?]{0,450}\?$/i);
      if (match) value = match[1];
      else continue;
    }
    result.push(value);
  }
  return result.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
if (typeof module !== "undefined" && module.exports) module.exports = {cleanPeerReply};
