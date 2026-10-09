// UC Report helper, format 1 (see SPEC.md). Paste this into your script.
//
//   const r = UCReport.compose("WZ", 1, "261008 161@28.0 20@PA");
//   if (r.ok) UCReport.openVoid(r.message);   // room 0, code typed in: the player presses Enter
//   else console.warn(r.error);
//
//   UCReport.check("#WZ1 261008 161@28.0")   // -> { ok, tag, version, payload } or { ok: false, error }
//   UCReport.fit("WZ", 1, ["161@28.0", "20@PA", ...], "261008")
//        // -> messages of at most 250 characters, each a complete report on its own
//
// It never sends anything: the player sends the message themselves.
// Works in the page or in a userscript sandbox (uses unsafeWindow if there).

const UCReport = (() => {
  const MAX_MESSAGE = 250;
  const MAX_PAYLOAD = 245;
  const SAFE_RE = /^[A-Za-z0-9 \-_.,;:!?#%()[\]{}|\\@+/=]+$/;
  const LINK_RE = /:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:com|net|org|gg|io|me|ly|co|xyz|tv|app|dev)\b/i;
  const HEADER_RE = /^#([A-Z]{2})([0-9]) (.+)$/s;

  function check(message) {
    const t = String(message || "").trim();
    if (t.length > MAX_MESSAGE) return { ok: false, error: `${t.length} characters; the chat keeps 250` };
    const m = t.match(HEADER_RE);
    if (!m) return { ok: false, error: "must start with #XX1 and a space (XX = your tag, 1 = your format version)" };
    const payload = m[3];
    const bad = payload.replace(/[A-Za-z0-9 \-_.,;:!?#%()[\]{}|\\@+/=]/g, "");
    if (bad) return { ok: false, error: `characters the chat may change: ${[...new Set(bad)].join(" ")}` };
    if (LINK_RE.test(payload)) return { ok: false, error: "looks like a link (the chat drops those)" };
    return { ok: true, tag: m[1], version: Number(m[2]), payload };
  }

  function compose(tag, version, payload) {
    if (!/^[A-Z]{2}$/.test(tag)) return { ok: false, error: "tag must be 2 capital letters" };
    if (!/^[0-9]$/.test(String(version))) return { ok: false, error: "version must be one digit" };
    const p = String(payload || "").trim();
    if (!p) return { ok: false, error: "empty payload" };
    if (p.length > MAX_PAYLOAD) return { ok: false, error: `payload is ${p.length} characters; at most ${MAX_PAYLOAD}` };
    const message = `#${tag}${version} ${p}`;
    const c = check(message);
    return c.ok ? { ok: true, message } : c;
  }

  // Pack tokens into as few messages as possible, each starting with `prefix`
  // (e.g. a date), so every message stands alone.
  function fit(tag, version, tokens, prefix = "") {
    const head = `#${tag}${version} ${prefix ? `${prefix} ` : ""}`;
    const out = [];
    let cur = "";
    tokens.forEach((t) => {
      const next = cur ? `${cur} ${t}` : t;
      if (cur && head.length + next.length > MAX_MESSAGE) { out.push(head + cur); cur = t; } else cur = next;
    });
    if (cur) out.push(head + cur);
    return out;
  }

  // Opens room 0 (the "void" room) with the message typed in, ready for Enter.
  function openVoid(message) {
    const w = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    if (typeof w.openRoom === "function" && !document.querySelector("#chat-public-0")) w.openRoom(0);
    let tries = 0;
    const fill = () => {
      const input = document.querySelector("#chat-public-0 .chat-text");
      if (!input) { if (++tries < 40) setTimeout(fill, 100); return; }
      input.value = message;
      input.focus();
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    fill();
  }

  return { check, compose, fit, openVoid, MAX_MESSAGE, MAX_PAYLOAD };
})();

if (typeof module !== "undefined") module.exports = UCReport;
