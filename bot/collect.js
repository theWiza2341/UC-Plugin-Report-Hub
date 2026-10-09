// bot/collect.js
//
// Reads the void (room 0) channel of the Undercards chat-log Discord and files
// every tagged report (#XX1 ...) under reports/<TAG>/, one JSON line each.
// Run by .github/workflows/collect.yml; see README.md.
//
//   node bot/collect.js                    daily: everything after the last message read
//   node bot/collect.js --since 2026-10-08 backfill: re-read from that date (repeats skipped)
//   node bot/collect.js --probe            print the shape of the newest messages, store nothing
//
// Environment:
//   BOT_TOKEN        the bot's token (repo secret)
//   VOID_CHANNEL_ID  the void log channel's id (repo variable)
//
// What's stored per report: the Discord message id, its time, the tag and
// version, the payload exactly as sent, and the sender's name as the log shows
// it (so spam can be traced and blocked). Nothing from messages without a
// valid registered header: those are read and dropped.
//
// blocklist.json: names whose reports are dropped, for every project ("all")
// or one tag ("WZ"). Matching ignores case.

const fs = require("fs");
const path = require("path");
const { parseReport, looksLikeReport } = require("./format.js");
const { readLogMessage } = require("./log-format.js");

const ROOT = path.resolve(__dirname, "..");
const REPORTS = path.join(ROOT, "reports");
const STATE = path.join(ROOT, "state.json");
const DISCORD_EPOCH = 1420070400000n;
const PER_SENDER_PER_DAY = 30; // per project

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const flag = (name) => process.argv.includes(`--${name}`);

const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return fallback; } };
const writeJson = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`); };

const snowflakeAt = (date) => String((BigInt(Date.parse(`${date}T00:00:00Z`)) - DISCORD_EPOCH) << 22n);
const timeOf = (id) => new Date(Number((BigInt(id) >> 22n) + DISCORD_EPOCH)).toISOString();
const later = (a, b) => (!a ? b : !b ? a : BigInt(a) >= BigInt(b) ? a : b);

const nameKey = (name) => String(name || "?").trim().toLowerCase();

// blocklist.json -> (tag, name) => true if blocked
function loadBlocklist() {
  const b = readJson(path.join(ROOT, "blocklist.json"), {});
  const sets = {};
  Object.entries(b).forEach(([k, list]) => { if (Array.isArray(list)) sets[k] = new Set(list.map(nameKey)); });
  return (tag, name) => !!((sets.all && sets.all.has(nameKey(name))) || (sets[tag] && sets[tag].has(nameKey(name))));
}

// Every message after `after`, oldest first.
async function* messagesAfter(channel, after) {
  let cursor = after;
  for (;;) {
    const batch = await channel.messages.fetch({ limit: 100, after: cursor });
    if (!batch.size) return;
    const sorted = [...batch.values()].sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
    for (const m of sorted) yield m;
    cursor = sorted[sorted.length - 1].id;
    if (batch.size < 100) return;
  }
}

// Shape only, for working out the log's format: letters -> x, digits -> 9.
const shape = (s) => String(s || "").slice(0, 120).replace(/[A-Za-z]/g, "x").replace(/[0-9]/g, "9");

async function probe(channel) {
  const batch = await channel.messages.fetch({ limit: 15 });
  console.log("Newest messages, contents masked (x = letter, 9 = digit):");
  [...batch.values()].forEach((m) => {
    const e = m.embeds && m.embeds[0];
    console.log(JSON.stringify({
      authorIsBot: !!m.author.bot, viaWebhook: !!m.webhookId, authorName: shape(m.author.username),
      content: shape(m.content),
      embed: e ? { author: shape(e.author && e.author.name), title: shape(e.title), description: shape(e.description), fields: (e.fields || []).map((f) => [shape(f.name), shape(f.value)]) } : null,
      read: readLogMessage(m).map((r) => ({ sender: shape(r.sender), text: shape(r.text) }))
    }));
  });
}

// Ids already stored for a tag; also counts them towards each sender's daily cap.
function loadIds(dir, perDay) {
  const ids = new Set();
  if (!fs.existsSync(dir)) return ids;
  fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")).forEach((f) => {
    fs.readFileSync(path.join(dir, f), "utf8").split("\n").forEach((l) => {
      try {
        if (!l) return;
        const r = JSON.parse(l);
        ids.add(r.id);
        const k = `${r.tag}|${nameKey(r.from)}|${String(r.at).slice(0, 10)}`;
        perDay.set(k, (perDay.get(k) || 0) + 1);
      } catch (e) { /* skip */ }
    });
  });
  return ids;
}

function writeIndex(tag) {
  const dir = path.join(REPORTS, tag);
  const files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}\.jsonl$/.test(f)).sort();
  const list = files.map((f) => ({ file: f, reports: fs.readFileSync(path.join(dir, f), "utf8").split("\n").filter(Boolean).length }));
  writeJson(path.join(dir, "index.json"), { tag, files: list, total: list.reduce((n, x) => n + x.reports, 0) });
}

async function main() {
  const token = process.env.BOT_TOKEN;
  const channelId = (process.env.VOID_CHANNEL_ID || "").trim();
  if (!token) throw new Error("BOT_TOKEN is missing (repo secret).");
  if (!channelId) throw new Error("VOID_CHANNEL_ID is missing (repo variable).");

  const registry = readJson(path.join(ROOT, "registry.json"), { projects: {} }).projects || {};
  const state = readJson(STATE, {});
  const { Client, GatewayIntentBits } = require("discord.js");
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
  await client.login(token);
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.messages) throw new Error(`Can't read channel ${channelId}: check the bot can see it and read its history.`);
    if (flag("probe")) { await probe(channel); return; }
    const blocked = loadBlocklist();

    const since = arg("since");
    const earliest = Object.values(registry).map((p) => p.since).filter(Boolean).sort()[0] || new Date().toISOString().slice(0, 10);
    const after = since ? snowflakeAt(since) : state.lastId || snowflakeAt(earliest);
    console.log(since ? `Backfill from ${since}.` : state.lastId ? `Reading after message ${state.lastId} (${timeOf(state.lastId)}).` : `First run: reading from ${earliest}.`);

    const seen = new Map(); // tag -> Set of stored ids
    const perDay = new Map();
    const stats = { read: 0, reports: 0, stored: 0, repeats: 0, unregistered: 0, invalid: 0, overLimit: 0, blocked: 0 };
    const add = new Map(); // file -> lines
    let last = state.lastId;

    for await (const m of messagesAfter(channel, after)) {
      stats.read++;
      last = later(last, m.id);
      readLogMessage(m).forEach((msg, i) => {
        if (!looksLikeReport(msg.text)) return;
        stats.reports++;
        const r = parseReport(msg.text);
        if (r.error) { stats.invalid++; return; }
        if (!registry[r.tag]) { stats.unregistered++; return; }
        // One log post can hold several chat lines: the first keeps the post's id.
        const id = i ? `${m.id}.${i}` : m.id;
        const dir = path.join(REPORTS, r.tag);
        if (!seen.has(r.tag)) seen.set(r.tag, loadIds(dir, perDay));
        if (seen.get(r.tag).has(id)) { stats.repeats++; return; }
        const at = timeOf(m.id);
        const from = String(msg.sender || "?").trim();
        if (blocked(r.tag, from)) { stats.blocked++; return; }
        const dayKey = `${r.tag}|${nameKey(from)}|${at.slice(0, 10)}`;
        perDay.set(dayKey, (perDay.get(dayKey) || 0) + 1);
        if (perDay.get(dayKey) > PER_SENDER_PER_DAY) { stats.overLimit++; return; }
        const file = path.join(dir, `${at.slice(0, 7)}.jsonl`);
        if (!add.has(file)) add.set(file, []);
        add.get(file).push(JSON.stringify({ id, at, tag: r.tag, v: r.version, from, payload: r.payload }));
        seen.get(r.tag).add(id);
        stats.stored++;
      });
    }

    const tags = new Set();
    add.forEach((lines, file) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(file, `${lines.join("\n")}\n`);
      tags.add(path.basename(path.dirname(file)));
    });
    tags.forEach(writeIndex);
    if (last && last !== state.lastId) writeJson(STATE, { ...state, lastId: last, lastAt: timeOf(last) });
    console.log(`Read ${stats.read} messages: ${stats.reports} reports, ${stats.stored} stored, ${stats.repeats} already stored, ${stats.invalid} invalid, ${stats.unregistered} unregistered tags, ${stats.overLimit} over the daily limit, ${stats.blocked} from blocked names.`);
  } finally {
    client.destroy();
  }
}

if (require.main === module) main().catch((e) => { console.error(e.message || e); process.exit(1); });
module.exports = { snowflakeAt, timeOf, main };
