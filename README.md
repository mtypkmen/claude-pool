# claude-pool

A small local proxy and web panel that lets **one Claude Code session use several Claude accounts at the same time**.

Claude Code talks to the proxy instead of Anthropic. For every request the proxy picks the account with the most room left, forwards the request with that account's own login, and streams the answer back. If an account hits a real rate limit, the next request goes to another account. A web panel shows how much of each account's limit is left, how many tokens were used, and what was asked.

```
claude  ──►  claude-pool proxy (127.0.0.1:8787)  ──►  api.anthropic.com
                │        │
                │        └─ picks an account per request (balanced, sticky, fails over on real limits)
                └─ web panel, shared memory, notes imported from your own files
```

Nothing leaves your machine except the requests Claude Code was going to send anyway. There is no server, no account, no telemetry.

## Features

- **Up to 10 accounts, one session.** Requests are spread by remaining quota instead of exhausting one account first. Each account gets its own color in the panel.
- **Step rotation.** Anthropic's prompt cache is per account, so switching on every request would waste it. The proxy stays on one account until it has used 10 more points of its session (5 h) limit, then moves to the one with the most session limit left.
- **Account management.** Add an account with **+ Acc** (opens the browser sign-in), or use **⋯** on a card to refresh its login or remove it.
- **Real failover only.** A response counts as an account limit only if it carries `retry-after` or a non-`allowed` limit status. Other 429s are passed through untouched.
- **Limit check on start.** The first real request triggers a tiny `hi` to every account so the panel shows each account's limits immediately.
- **Web panel.** Remaining session (5 h) and weekly limit per account, request log, total tokens (kept across restarts), a one-click disable switch per account.
- **Shared memory.** After a finished task a short lesson is stored and shown to every account. If you correct the result in your next message, the wrong note is fixed. Rules live in `agent.md`.
- **Imported knowledge.** Your own `CLAUDE.md` files, Claude memory, agent definitions and notes folders are packed once and added to requests, so the pool knows you even when started from another folder. See [Imported knowledge](#imported-knowledge).

## Requirements

- Node.js 18 or newer (no other dependencies)
- [Claude Code](https://docs.claude.com/en/docs/claude-code) installed (`claude` on your PATH)
- Two or more Claude accounts you own
- Logins stored in a `.credentials.json` file inside each account's Claude Code config folder

## Install

```bash
git clone <this repo> claude-pool
cd claude-pool
node setup.js          # downloads the three front-end libraries the panel uses into vendor/
```

### 1. Log every account into its own config folder

Claude Code keeps its login in a config folder. Give each account its own with `CLAUDE_CONFIG_DIR`, then log in once per account (use a different browser account each time):

```bash
# macOS / Linux / Git Bash
CLAUDE_CONFIG_DIR=~/.claude-pool/account1 claude auth login
CLAUDE_CONFIG_DIR=~/.claude-pool/account2 claude auth login
```

```powershell
# Windows PowerShell
$env:CLAUDE_CONFIG_DIR = "$HOME\.claude-pool\account1"; claude auth login
$env:CLAUDE_CONFIG_DIR = "$HOME\.claude-pool\account2"; claude auth login
```

### 2. Tell the proxy where the logins are

```bash
cp accounts.example.json accounts.json
```

Edit `accounts.json`: one entry per account (up to 10, extra entries are ignored), `creds` is the `.credentials.json` inside that account's config folder (`~` is expanded):

```json
[
  { "name": "Account 1", "creds": "~/.claude-pool/account1/.credentials.json" },
  { "name": "Account 2", "creds": "~/.claude-pool/account2/.credentials.json" }
]
```

### 3. Optional: add the `claude-pool` command

Put the project folder on your PATH. Then `claude-pool` starts the proxy if it is not running and launches `claude` through it:

- Windows: `claude-pool.cmd` (add the folder to PATH)
- macOS / Linux: `claude-pool.sh` (`chmod +x`, then link or alias it)

## Use

```bash
claude-pool                 # starts the proxy if needed, then opens Claude Code through it
claude-pool --continue      # every normal claude flag works, continue where you left off
```

Open the panel at **http://127.0.0.1:8787**. Without the launcher, run `node server.js` yourself and start Claude Code with `ANTHROPIC_BASE_URL=http://127.0.0.1:8787 claude`.

The panel has three parts:

| Section | What it shows |
|---|---|
| Accounts | Session limit left, status, request count, enable/disable switch |
| Remaining limits | Session (5 h) and weekly limit per account, and **Total Token** (input + output + cache read). The badge goes from gray to dark purple as the number grows |
| Shared memory | Notes shared by all accounts, a pause switch, imported-files status and a re-scan button |

Try the design without any account: open `http://127.0.0.1:8787/?demo`.

## How accounts are chosen

1. Accounts that are disabled or cooling down are skipped.
2. A limit whose reset time has already passed counts as 0. An account at 98% of its session or weekly limit is used only if no other account is available.
3. The proxy keeps the current account until its session (5 h) usage has grown by 10 points, then picks the other account with the lowest session usage. Change `STEP` in `server.js` to switch more or less often.
4. A real limit puts an account on cooldown and the request is retried on another account. A 401 puts it on a 60 s cooldown.

## Shared memory

After a task finishes (`end_turn`), a cheap model call turns the exchange into at most one short lesson, saved in `memory.json`. Notes are appended to the end of the system prompt of later agent requests (so Claude's cached prefix stays valid). It is limited to one lesson per 2 minutes.

If your next message corrects the last result (for example "that is wrong, it did not work"), the proxy asks the cheap model which notes caused the mistake, removes them and stores one corrected lesson, marked **corrected** in the panel, **before** the request is sent. Only messages that look like corrections are checked.

`agent.md` holds the rules the agents follow for using, writing and fixing notes. Edit it freely, it is read on every use.

Notes are plain text in `memory.json` and can be deleted one by one in the panel. The **Pause memory** button switches memory and imported knowledge off.

## Imported knowledge

On first start `import.js` builds `knowledge.json` from your own files (read-only):

- `~/.claude/CLAUDE.md` and the `CLAUDE.md` in each folder listed in `import.json`
- Claude's per-project memory and agent memory (`~/.claude/projects/*/memory`, `~/.claude/agent-memory`)
- one line per agent file in `~/.claude/agents`
- every other `.md` in the folders you list, as a folder map the agent can open with its Read tool

```bash
cp import.example.json import.json   # add folders to scan, then:
node import.js                       # or press "Re-scan files" in the panel
```

The pack is capped (about 16 000 characters of full text plus a short folder map) and secret-looking strings (API keys, bearer tokens, `password=...`) are replaced with `[redacted]`. If Claude Code already loaded a file in the request, it is not added a second time. This text is sent to Anthropic as part of your requests, exactly like a `CLAUDE.md` would be.

## Files

| File | Purpose |
|---|---|
| `server.js` | proxy, account selection, memory, panel API |
| `panel.html`, `app.js`, `assets/` | web panel (3D mascot, animations) |
| `import.js` | builds the knowledge pack |
| `agent.md` | rules for memory notes |
| `accounts.json` | **yours, git-ignored**: account names and credential paths |
| `import.json` | **yours, git-ignored**: folders to scan |
| `stats.json`, `memory.json`, `knowledge.json` | **generated, git-ignored**: token totals, notes, imported pack |

Environment: `PORT` (default 8787) and `UP` (upstream URL, for tests).

## Security

- The proxy listens on `127.0.0.1` only. The panel has no login.
- Requests from other websites open in your browser are refused (403): the `Host` must be `127.0.0.1` or `localhost`, a foreign `Origin` is rejected, and so are cross-site requests to anything but the panel page.
- Tokens are read from your credentials files when needed. They are never logged, never sent to the panel (the account list sent to the page has the credential path removed) and only go to Anthropic. When an access token has expired the proxy refreshes it and writes the new one back to the same file.
- `accounts.json`, `stats.json`, `memory.json`, `knowledge.json` and `import.json` are in `.gitignore`.

## Tests

```bash
npm test
```

The tests start the proxy against a fake Anthropic server and fake credentials and home folder. They never touch real accounts.
