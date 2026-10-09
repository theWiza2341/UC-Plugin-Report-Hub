# UC Report Hub

Undercards userscripts can let their players send short reports (a bug, a wrong card version, and so on) as one chat message in room 0, the "void" room. feildmaster's chat-log Discord logs that room. Once a day, this repo's bot reads the void log, keeps only messages that start with a registered tag (`#WZ1 …`), and publishes them per project under `reports/<TAG>/`.

- **Players:** press a button in their script. Room 0 opens with the report typed in, and they press Enter.
- **Script developers:** see [SPEC.md](SPEC.md). In short: get a tag, paste one helper file, and read your reports from this repo. You don't need a bot, a token or any access to anything.
- **What's kept:** only messages with a registered tag. Everything else in void is read and thrown away, never stored or logged. Each report is stored with the sender's name as the chat log shows it, so spam can be traced and blocked.

| Path | What it is |
|---|---|
| `registry.json` | The registered projects (tag, name, repo, contact). |
| `reports/<TAG>/` | Each project's reports: `index.json` and one `YYYY-MM.jsonl` per month. |
| `blocklist.json` | Names whose reports are dropped, for every project or one tag. |
| `state.json` | The last log message read, so each run starts where the last one stopped. |
| `bot/` | The collector (`collect.js`), the format rules (`format.js`) and how the log is read (`log-format.js`). |
| `client/uc-report.js` | The helper scripts paste in. |
| `templates/` | An optional workflow and script for projects that want reports copied into their own repo. |
| `.github/workflows/collect.yml` | The daily run. |

## Rules the bot applies

- The format checks in `bot/format.js` (see SPEC.md): 250 characters, safe characters, no links, registered tag.
- **30 reports per player per project per day.** Extra ones are dropped.
- **Blocklist:** add a name to `blocklist.json` under `"all"` or under a project's tag, and their reports are dropped from the next run on. Reports already stored stay until you delete those lines by hand.
- Nothing is ever deleted yet. Old months can be removed later by deleting their `.jsonl` file and re-running.

## Adding a project

Add an entry to `registry.json`: tag (2 capital letters, not already taken), name, repo, contact, and a `since` date. Reports with that tag start being kept from the next run.

To pick up reports posted before the tag was added, run once with `since` set to that date.
