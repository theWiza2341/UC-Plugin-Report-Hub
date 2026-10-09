// bot/log-format.js
//
// How the chat-log Discord writes one Undercards chat message, so the
// collector can tell who sent it and what they wrote.
//
// The exact layout isn't confirmed yet: run the workflow once with "probe"
// ticked. It prints the shape of the newest messages, with letters shown as x
// and digits as 9, and the "read" line shows what this file made of each.
// Adjust the patterns here if "read" comes out wrong.
//
// Handled so far:
//   - a webhook post named after the player, text in the content
//   - an embed with the player as its author or title, text in the description
//   - plain content "Name: text", "**Name**: text", "[12:34] Name: text", "<Name> text"
//
// -> [{ sender, text }] (a log post may hold several chat lines)

const LINE_RES = [
  /^\s*(?:\[[^\]]{1,20}\]\s*)?\*\*(.+?)\*\*\s*:?\s+([\s\S]*)$/, // **Name**: text
  /^\s*(?:\[[^\]]{1,20}\]\s*)?<([^>]{1,40})>\s+([\s\S]*)$/, // <Name> text
  /^\s*(?:\[[^\]]{1,20}\]\s*)?([^\s:]{1,40}):\s+([\s\S]*)$/ // Name: text
];

const unmark = (s) => String(s || "").replace(/^`+|`+$/g, "").replace(/\\([*_~`|>#\\])/g, "$1").trim();

function fromLine(line) {
  for (const re of LINE_RES) {
    const m = String(line || "").match(re);
    if (m) return { sender: unmark(m[1]), text: unmark(m[2]) };
  }
  return null;
}

function readLogMessage(m) {
  if (!m) return [];
  // A webhook post per player: the post's name is the player.
  if (m.webhookId && m.content) return [{ sender: m.author && m.author.username, text: unmark(m.content) }];
  const out = [];
  (m.embeds || []).forEach((e) => {
    if (!e || !(e.description || (e.fields && e.fields.length))) return;
    const sender = (e.author && e.author.name) || e.title || null;
    const text = e.description || (e.fields.find((f) => /message|text/i.test(f.name)) || e.fields[0]).value;
    if (sender) { out.push({ sender: unmark(sender), text: unmark(text) }); return; }
    String(text).split("\n").forEach((line) => { const r = fromLine(line); if (r && r.text) out.push(r); });
  });
  if (m.content) {
    m.content.split("\n").forEach((line) => { const r = fromLine(line); if (r && r.text) out.push(r); });
  }
  return out;
}

module.exports = { readLogMessage, fromLine };
