// Template: copy to .github/report-hub/transform.js in YOUR repo (with
// pull-reports.yml). It downloads your tag's reports from the hub and writes
// them in your own format. Only transform() is yours to write.
//
// Each hub report: { id, at, tag, v, from, payload }
//   id       Discord message id (unique; use it to skip repeats)
//   at       when it was posted (ISO time)
//   v        your format version (the digit after your tag)
//   from     the sender's name, as the chat log shows it
//   payload  exactly what your script put after "#XX1 "

const fs = require("fs");
const path = require("path");

const { HUB, TAG, OUT = "reports" } = process.env;
const RAW = `https://raw.githubusercontent.com/${HUB}/main/reports/${TAG}/`;

// ---- yours: one hub report -> whatever you want to keep (or null to skip) ----
function transform(report) {
  return { id: report.id, at: report.at, version: report.v, from: report.from, payload: report.payload };
}

async function get(url) {
  const res = await fetch(url, { headers: { "Cache-Control": "no-cache" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

(async () => {
  const index = JSON.parse((await get(`${RAW}index.json`)) || '{"files":[]}');
  const file = path.join(OUT, "reports.json");
  const kept = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
  const have = new Set(kept.map((r) => r.id));
  let added = 0;
  for (const { file: month } of index.files) {
    const text = (await get(RAW + month)) || "";
    text.split("\n").filter(Boolean).forEach((line) => {
      const r = JSON.parse(line);
      if (have.has(r.id)) return;
      const t = transform(r);
      if (t) { kept.push(t); have.add(r.id); added++; }
    });
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(kept, null, 1)}\n`);
  console.log(`${added} new, ${kept.length} in total.`);
})().catch((e) => { console.error(e.message); process.exit(1); });
