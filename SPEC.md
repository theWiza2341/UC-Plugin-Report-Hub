# Report format, version 1

A report is one ordinary Undercards chat message, posted by the player in room 0 (the "void" room). The hub's bot reads the void log and files each report under its project's tag.

## The message

```
#WZ1 261008 161@28.0 20@PA
```

| Part | Rule |
|---|---|
| `#` | Marks a report. |
| `WZ` | Your project's tag: 2 capital letters, listed in `registry.json`. |
| `1` | Your own format version, one digit. Change it when you change your payload format, so old and new reports can be told apart. |
| space | Exactly one. |
| payload | Everything after the space. Yours to design. |

**Limits** (measured in Undercards chat, 2026-10-08):
- **250 characters for the whole message.** The chat cuts longer messages without warning. With the 5-character header, that leaves **245 for the payload**.
- **Safe characters only:** `A–Z a–z 0–9`, space, and `- _ . , ; : ! ? # % ( ) [ ] { } | \ @ + / =`. Anything else may be changed or dropped on the way.
- **Nothing that looks like a link.** The chat drops messages with links, so `://`, `www.` and domain names are rejected.
- **One message is one complete report.** Chat has a cooldown, and players may stop halfway, so the hub never joins messages together. If you have more to say, send another complete message.

Messages that break a rule, or use a tag that isn't registered, are read and thrown away.

## What the hub publishes

Reports are published per tag, one JSON object per line, in one file per month:

```
reports/WZ/index.json        { "tag": "WZ", "files": [{ "file": "2026-10.jsonl", "reports": 12 }], "total": 12 }
reports/WZ/2026-10.jsonl
```

```json
{"id":"1557694041292800001","at":"2026-10-08T10:00:00.000Z","tag":"WZ","v":1,"from":"V7cCysrg4D9Z","payload":"261008 161@28.0 20@PA"}
```

| Field | Meaning |
|---|---|
| `id` | Unique per report (the Discord message id, with `.n` added when one log post held several chat lines). Use it to skip reports you've already read. |
| `at` | When it was posted. |
| `v` | Your format version. |
| `from` | The sender, as a tag. The same player always gets the same tag in your project, and a different tag in every other project. It's never their name. |
| `payload` | Exactly what came after `#XX1 `. |

The files update once a day, at about 07:20 UTC. Read them from `https://raw.githubusercontent.com/<hub repo>/main/reports/<TAG>/`.

**Limits per player:** 30 reports a day per project. More than that is dropped.

## Joining

Open a pull request adding your tag to `registry.json`, with your project name, repo and a contact. Then:
1. Paste `client/uc-report.js` into your script. `UCReport.compose(tag, version, payload)` checks a report; `UCReport.openVoid(message)` opens room 0 with it typed in. The player presses Enter, because the helper never sends messages by itself.
2. Read your reports from the hub, either directly or with `templates/pull-reports.yml` and `templates/transform.js` in your own repo.

You never need a Discord bot, a token, or access to anyone else's repo.
