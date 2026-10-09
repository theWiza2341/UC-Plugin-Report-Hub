// bot/format.js
//
// The report message format (see SPEC.md). Shared by the collector and the
// tests; client/uc-report.js carries its own copy for scripts to paste in.
//
//   #WZ1 <payload>
//   │└┬┘│
//   │ │ └ format version (one digit, the project's own)
//   │ └── project tag (two capital letters, from registry.json)
//   └──── marks a report
//
// Whole message at most 250 characters (Undercards cuts longer ones without
// warning), so the payload is at most 245. Only characters the 2026-10-08
// chat probe showed arrive unchanged, and nothing that looks like a link
// (the chat drops messages with links).

const MAX_MESSAGE = 250;
const MAX_PAYLOAD = 245;
const HEADER_RE = /^#([A-Z]{2})([0-9]) (.+)$/s;
const SAFE_RE = /^[A-Za-z0-9 \-_.,;:!?#%()[\]{}|\\@+/=]+$/;
const LINK_RE = /:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:com|net|org|gg|io|me|ly|co|xyz|tv|app|dev)\b/i;

// -> { tag, version, payload } or { error }
function parseReport(text) {
  const t = String(text || "").trim();
  if (t.length > MAX_MESSAGE) return { error: "longer than 250 characters" };
  const m = t.match(HEADER_RE);
  if (!m) return { error: "no #XX1 header" };
  const payload = m[3];
  if (payload.length > MAX_PAYLOAD) return { error: "payload longer than 245 characters" };
  if (!SAFE_RE.test(payload)) return { error: "characters outside the safe set" };
  if (LINK_RE.test(payload)) return { error: "looks like a link" };
  return { tag: m[1], version: Number(m[2]), payload };
}

const looksLikeReport = (text) => /^\s*#[A-Z]{2}[0-9] /.test(String(text || ""));

module.exports = { MAX_MESSAGE, MAX_PAYLOAD, HEADER_RE, SAFE_RE, LINK_RE, parseReport, looksLikeReport };
