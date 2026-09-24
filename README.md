# Mimiq MCP Server

Your agent built the page. Simulated buyers test it.

Mimiq shows a page, copy or email to a crowd of simulated people and reports how they reacted and why: who would stay, who would leave, what confused them and what would change their mind. Give it two versions and it makes a call on which one to ship.

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_MCP-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522mimiq%2522%252C%2522type%2522%253A%2522http%2522%252C%2522url%2522%253A%2522https%253A%252F%252Fmcp.mimiqai.com%252Fmcp%2522%257D) [![Install in Cursor](https://img.shields.io/badge/Cursor-Install_MCP-black?style=flat-square&logo=cursor&logoColor=white)](https://cursor.com/install-mcp?name=mimiq&config=eyJ1cmwiOiJodHRwczovL21jcC5taW1pcWFpLmNvbS9tY3AifQ==)

## Tools

| Tool | What it does |
|------|-------------|
| `mimiq.compare_copy` | Two versions of copy or an email, the same simulated people, and Mimiq's call on which to ship. One free A/B without a key (up to 10 people per version). |
| `mimiq.compare_urls` | Two pages (for example a preview deployment and production), the same simulated people, and Mimiq's call. One free A/B without a key (up to 10 people per version). |
| `mimiq.test_page` | One page: each person scrolls it and says what confused them, what they doubted and what would help. |
| `mimiq.test_flow` | A signup, onboarding or checkout flow in a real browser, step by step, to find where people give up. 10 credits a person. |
| `mimiq.test_copy` | One piece of copy (headline, tagline, subject line, call to action). With `variant_b` it runs `compare_copy`. |
| `mimiq.test_text` | Any other text (positioning, feature descriptions, error messages, instructions). Pass `goal`. |
| `mimiq.test_component` | A UI component from its HTML or a description: do people understand it, trust it, use it? |
| `mimiq.ask_audience` | A multiple-choice question, answered by each person with their reasoning. |

Ask your agent directly, or let it test what it just built:

> "Test my landing page on startup founders"
>
> "Which headline should we ship? Compare them on freelance designers"
>
> "Compare the preview deployment with production"

## Mimiq's call on two versions

In `compare_copy` and `compare_urls`, the same people see version A and version B. Mimiq's call combines two things:

- a forecast of how people like them behave, asked in both orders so the order cannot decide it;
- how the same people moved between the versions.

The call is **clear** (the forecast and the people agree), **leaning** (the forecast picks a version and the people did not agree), or **too close to call** (the forecast changed with the order; no pick). The words come from the same code as the Mimiq app, so the result never says more than the report it links to.

What you get back:

- `call`: the headline ("Version B is the better bet."), the tier, the pick, the reason in one or two sentences, and how the people bear on it.
- `movers`: how many of the same people warmed to B, cooled on B, or stayed about the same, and how often chance splits them that unevenly.
- `versions.a` and `versions.b`: each version's headline, counts and top objections.
- `report_url`: the comparison in the Mimiq app (with a key). The plain-text summary always ends with it.

Use at least 5 people per comparison: from 5 up, Mimiq reads who moved; below that it compares rates.

## How far to trust it

These are simulated people. Mimiq's forecast has held up on headlines: right on 76% of 1,000 real headline A/B tests, against 61% for the best rule of thumb ([the benchmark](https://mimiqai.com/benchmark)). In pre-registered tests on emails, text messages and ads it was no better than chance at ranking small wording changes ([the register](https://github.com/victorgulchenko/mimiqbench)), so treat those calls as a fast first read. A call says which way a difference would go, not how big it would be.

## Setup

### Claude Code

```bash
claude mcp add --transport http mimiq https://mcp.mimiqai.com/mcp --header "Authorization: Bearer $MIMIQ_API_KEY"
```

Or in `.mcp.json` at your project root (Claude Code reads `${MIMIQ_API_KEY}` from your environment, so the key stays out of the repo):

```json
{
  "mcpServers": {
    "mimiq": {
      "type": "http",
      "url": "https://mcp.mimiqai.com/mcp",
      "headers": { "Authorization": "Bearer ${MIMIQ_API_KEY}" }
    }
  }
}
```

Leave out the header to use the free try.

### Codex

In `~/.codex/config.toml` (or `.codex/config.toml` in your project):

```toml
[mcp_servers.mimiq]
url = "https://mcp.mimiqai.com/mcp"
bearer_token_env_var = "MIMIQ_API_KEY"
```

### Cursor

In `~/.cursor/mcp.json` or `.cursor/mcp.json` (do not commit a file with a key in it):

```json
{
  "mcpServers": {
    "mimiq": {
      "url": "https://mcp.mimiqai.com/mcp",
      "headers": { "Authorization": "Bearer mq_sk_..." }
    }
  }
}
```

### VS Code (GitHub Copilot)

In `.vscode/mcp.json`; VS Code asks for the key once and stores it:

```json
{
  "inputs": [{ "type": "promptString", "id": "mimiq-key", "description": "Mimiq API key", "password": true }],
  "servers": {
    "mimiq": {
      "type": "http",
      "url": "https://mcp.mimiqai.com/mcp",
      "headers": { "Authorization": "Bearer ${input:mimiq-key}" }
    }
  }
}
```

### Windsurf

In `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "mimiq": {
      "serverUrl": "https://mcp.mimiqai.com/mcp",
      "headers": { "Authorization": "Bearer mq_sk_..." }
    }
  }
}
```

### Claude Desktop

Through [mcp-remote](https://www.npmjs.com/package/mcp-remote), in the Claude Desktop config:

```json
{
  "mcpServers": {
    "mimiq": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.mimiqai.com/mcp", "--header", "Authorization:${MIMIQ_AUTH}"],
      "env": { "MIMIQ_AUTH": "Bearer mq_sk_..." }
    }
  }
}
```

## Keys and the free try

- **Without a key**, each agent gets one free test: one run on up to 100 simulated people. A comparison shows both versions to the same people, so it needs two runs; without a key an agent also gets one free A/B of up to 10 people per version, while the daily free A/B allowance lasts. Anything larger needs a key, and the tools say so before anything is spent.
- **Get a key:** create a free account at [mimiqai.com/sign-up](https://mimiqai.com/sign-up?redirect_url=/app/settings) (it adds 100 people). Open [Settings](https://mimiqai.com/app/settings), find "Use Mimiq from your coding agent", and choose "Create a key". The key starts with `mq_sk_` and is shown once.
- **Send it** on every request as `Authorization: Bearer mq_sk_...` (`X-API-Key: mq_sk_...` works too). The setup snippets above do this.
- **Credits:** one credit is one simulated person in one run (a flow uses 10 a person). A comparison of n people uses 2n: n to recruit them, n for version B (version A's run comes with the new people). Buy more at [mimiqai.com/app/usage](https://mimiqai.com/app/usage); packs start at 500 people for $29.

## Report links

With a key, every test and comparison is saved to your account, and the result ends with a link to it in the Mimiq app (`/app/t/...` for a test, `/app/compare/.../...` for a comparison). Put the link in your summary so your human can open the full report, the people and their words. Reports are private until you share them from the app.

Without a key, tests stay private to the agent that ran them and cannot be opened in the app; the result says how to get a key instead. `ask_audience` answers are returned in full and are not saved as a report yet.

## What a single test returns

Each simulated person's reaction, not a verdict:

- `action` and `action_class` (`converted`, `engaged` or `bounced`): what they did.
- `monologue`, `objections`, `what_would_help`: what they thought, what stopped them, what would change their mind.
- `per_100`: on copy and page tests, the person's own estimate of how many in 100 people like them would stop or stay, and act.
- `journey_steps`: on `test_page` and `test_flow`, the steps where something changed.
- `counts`, a plain `summary_card`, and `report_url` (with a key).

## Localhost

Mimiq needs a public URL. For a local dev server, open a temporary tunnel with [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/downloads/) (free, no account) and pass its URL. The page is public while the tunnel runs, so your agent should tell you before it opens one:

```bash
cloudflared tunnel --url http://localhost:3000 > /tmp/mimiq_tunnel.log 2>&1 &
sleep 5; grep -o 'https://[^ |]*trycloudflare.com' /tmp/mimiq_tunnel.log
```

## Errors

Every error carries a `code`, a plain `message` and a `request_id`. Credit and key errors also carry `how_to_get_a_key` (the steps, the header and the `.mcp.json`).

| Code | What it means | What to do |
|------|---------------|------------|
| `INSUFFICIENT_CREDITS` | `reason` says which: `free_try_used`, `ab_needs_two_runs`, `free_try_too_big`, `network_monthly_limit`, or `out_of_credits` (with a key). | Get a key, run fewer people, or buy more credits. |
| `UNAUTHORIZED` | The key was not accepted (`invalid_key`). | Check it starts with `mq_sk_` and is still listed in Settings. |
| `INVALID_INPUT` | A missing field, or a URL Mimiq cannot reach (localhost, a private address). | Fix the input; for localhost, use a tunnel. |
| `SIM_FAILED` | The run failed, for example the page did not load. A failed run is refunded. | Check the URL loads in a normal browser, then call again. |
| `SIM_TIMEOUT` | The run outlasted `timeout_seconds`. It keeps going on Mimiq's side. | With a key, open the report link later; or call again with a longer timeout. |
| `RATE_LIMITED` | Too many calls from one network in a minute. | Wait a minute. |

## License

MIT
