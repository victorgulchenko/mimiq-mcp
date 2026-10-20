# Mimiq MCP Server

Your agent built it. Simulated customers try it before you ship.

Point Mimiq at a preview or staging URL and a task, such as signing up or reaching checkout. Each simulated person opens it in a real browser, clicks, types and fills in your forms (with an inbox of their own for verification codes), and the report shows how far each one got, the step where they got stuck and why. Fix those steps and run it again on the new build.

Mimiq also shows a page, copy, an email or a UI component to simulated people and reports what confused them and what they doubted, and with two versions it makes a call on which one to ship.

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_MCP-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522mimiq%2522%252C%2522type%2522%253A%2522http%2522%252C%2522url%2522%253A%2522https%253A%252F%252Fmcp.mimiqai.com%252Fmcp%2522%257D) [![Install in Cursor](https://img.shields.io/badge/Cursor-Install_MCP-black?style=flat-square&logo=cursor&logoColor=white)](https://cursor.com/install-mcp?name=mimiq&config=eyJ1cmwiOiJodHRwczovL21jcC5taW1pcWFpLmNvbS9tY3AifQ==)

## Tools

| Tool | What it does |
|------|-------------|
| `mimiq.compare_copy` | Two versions of copy or an email, the same simulated people, and Mimiq's call on which to ship. One free A/B without a key (up to 10 people per version). |
| `mimiq.compare_urls` | Two pages (for example a preview deployment and production), the same simulated people, and Mimiq's call. One free A/B without a key (up to 10 people per version). |
| `mimiq.test_page` | One page: each person scrolls it and says what confused them, what they doubted and what would help. |
| `mimiq.test_flow` | A signup, onboarding or checkout flow in a real browser, step by step, to find where people give up. 5 credits a person. |
| `mimiq.test_copy` | One piece of copy (headline, tagline, subject line, call to action). With `variant_b` it runs `compare_copy`. |
| `mimiq.test_text` | Any other text (positioning, feature descriptions, error messages, instructions). Pass `goal`. |
| `mimiq.test_component` | A UI component from its HTML or a description: do people understand it, trust it, use it? |
| `mimiq.ask_audience` | A multiple-choice question, answered by each person with their reasoning. |

Ask your agent directly, or let it test what it just built:

> "Test my landing page on startup founders"
>
> "Have three people try to sign up on my staging site and tell me where they get stuck"
>
> "Which headline should we ship? Compare them on freelance designers"
>
> "Compare the preview deployment with production"

## Mimiq's call on two versions

In `compare_copy` and `compare_urls`, the same people see version A and version B. Mimiq's call combines two things:

- a forecast of how people like them behave, asked in both orders so the order cannot decide it;
- how the same people moved between the versions.

The call is **clear** (the forecast and the people agree), **leaning** (the forecast picks a version and the people did not clearly agree), or **too close to call** (no pick: the forecast changed with the order, or the same people moved against the forecast by more than chance explains). The words come from the same code as the Mimiq app, so the result never says more than the report it links to.

The per-100 averages are the simulated people's own estimates, separate from the order-swapped forecast behind the call. The forecast supplies a direction, not a numerical average. If it disagrees with the people's estimates, the reason explains the disagreement and the call is a lean. A call never leans against the movers, though: when the same people moved the other way by a split that stands out from chance (under 5%), there is no pick. Movers count people, so an even split of movers can still have different average estimates.

What you get back:

- `call`: the headline ("Version B is the better bet."), the tier, the pick, the reason in one or two sentences, and how the people bear on it.
- `movers`: how many of the same people warmed to B, cooled on B, or stayed about the same, and how often chance splits them that unevenly.
- `versions.a` and `versions.b`: each version's headline, counts and top objections.
- `report_url`: the comparison in the Mimiq app (with a key). The plain-text summary always ends with it.

Use at least 5 people per comparison: from 5 up, Mimiq reads who moved; below that it compares rates.

## How far to trust it

These are simulated people. Mimiq's forecast has held up on headlines: right on 76% of 1,000 real headline A/B tests, against 61% for the best rule of thumb ([the benchmark](https://www.mimiqai.com/benchmark)). In pre-registered tests on emails, text messages and ads it was no better than chance at ranking small wording changes ([the register](https://github.com/victorgulchenko/mimiqbench)), so treat those calls as a fast first read. A call says which way a difference would go, not how big it would be.

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

### Make it part of every change

Add these lines to your project's `CLAUDE.md` or `AGENTS.md`, and your agent checks a customer-facing change before it calls it done:

```markdown
## Before calling a customer-facing change done
After changing a signup, onboarding, checkout, pricing or landing page, run
mimiq.test_flow on the preview URL with the task a customer would try. Fix the
steps people got stuck on, then run it again. Ask me before using more than 25 credits.
```

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
- **Get a key:** create a free account at [www.mimiqai.com/sign-up](https://www.mimiqai.com/sign-up?redirect_url=/app/settings) (it includes 50 credits). Open [Settings](https://www.mimiqai.com/app/settings), find "Use Mimiq from your coding agent", and choose "Create a key". The key starts with `mq_sk_` and is shown once.
- **Send it** on every request as `Authorization: Bearer mq_sk_...` (`X-API-Key: mq_sk_...` works too). The setup snippets above do this.
- **Credits:** one credit is one simulated person in one run (a flow uses 5 a person). A comparison of n people uses 2n: n to recruit them, n for version B (version A's run comes with the new people). Buy more at [www.mimiqai.com/app/usage](https://www.mimiqai.com/app/usage); packs start at 150 people for $9.

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

For `ask_audience`, `headline` and `summary_card` count the selected options. `votes` and `counts` give each option's count, including zero votes; `unanswered` counts missing or unrecognized choices. Each person's `selected_option` and `monologue` retain their choice and reason. These answers are not classified as interest or intent to act.

## Audience fit for pages and flows

`test_page` and `test_flow` start immediately unless the recruited crowd is wrong: more
than 1 in 5 people who are not the requested audience. People
who are close but unverified are reported, not blocked. The usual result (including
`still_running` on a polling timeout) also includes `audience: { summary, examples, fit }`,
`review_id` and a `change_who` action. Show who was recruited along with the result. Fit
includes the verified rate and fit counts.

Only a wrong crowd returns `status: "audience_review"` before simulation. Show the
summary, examples and warning, then let the user choose:

- **Continue anyway:** call the same tool and URL with `review_id`, `confirm_audience: true`
  and `audience_fit_acknowledged: true`, after they acknowledge the warning. This reuses
  the reviewed crowd.
- **Not quite? Change who and rerun:** send `review_id` and `audience_correction` with the
  same tool and URL. This works from a review, a live run or a completed result. It recruits
  a new crowd and starts a new run unless that crowd is wrong, in which case it returns a
  new review.
  Corrections use the existing recruitment and simulation credit rules.

Reviews are saved, owner-checked and bound to the URL and test kind. Changing who keeps
the original count, goal and step limit. An acknowledgement of the old crowd does not
acknowledge a new low-fit crowd. `audience_fit` is retained for existing integrations.

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

## Self-hosting

Against your own Mimiq API:

```bash
cd mcp-hosted
MIMIQ_API_URL=http://127.0.0.1:8000/api node src/server.js
```

Point your agent at `http://127.0.0.1:8787/mcp`.

| Variable | Default | What it sets |
|----------|---------|--------------|
| `MIMIQ_API_URL` | `http://127.0.0.1:8000/api` | The Mimiq API |
| `MIMIQ_APP_URL` | `https://mimiqai.com` | Where report links point |
| `MIMIQ_MCP_PUBLIC_URL` | `https://mcp.mimiqai.com/mcp` | The URL shown in setup help |
| `PORT` / `HOST` | `8787` / `127.0.0.1` | Where this server listens. Behind a proxy, keep `127.0.0.1` and have the proxy set `X-Real-IP` (it identifies the caller's network for rate limits and the free try). |
| `RATE_MAX_CALLS` | `10` | Tool calls per network per minute |
| `EMIC_API_KEY` | none | Turns on `submit_agent_feedback` (hidden without it) |
| `POSTHOG_API_KEY` | none | Usage events |

## Development

### ChatGPT account linking and inline reports

The plugin uses OAuth account linking with S256 PKCE. Existing API-key and
keyless clients continue to work. Verified ChatGPT calls require an OAuth-linked
account for tests; the backend remains responsible for credits and ownership.
Use `mimiq.show_report` after a test finishes to render its saved report in an
MCP Apps host. It reads the account's report without spending credits.

OAuth discovery is available at `/.well-known/oauth-protected-resource` and
`/.well-known/oauth-authorization-server`. The authorization, registration,
token and revocation routes live under `/oauth/`. A configured
`OPENAI_APPS_CHALLENGE` is served verbatim at
`/.well-known/openai-apps-challenge`; without it that route returns 404.

See `deploy/plugin.env.example` and `deploy/openai-mtls.nginx.conf.example`
before enabling the ChatGPT integration. Trustworthy ChatGPT identification
requires certificate verification at the existing proxy, with Node bound to
loopback. Client name and User-Agent hints alone do not establish identity.
The report HTML is checked in and self-contained, so serving it adds no runtime
dependencies.

The OAuth HTTP test needs Python with `fastapi` and `uvicorn`; set
`MIMIQ_TEST_PYTHON` if they are not in the default Python. Widget DOM tests use
the parent web app's development `jsdom` dependency after root `npm ci`.
Without these development dependencies, the corresponding tests explicitly
skip. In the full Mimiq checkout, `npm run widget:build` rebuilds embedded fonts
and scripts, `npm run widget:check` detects drift, and
`npm run widget:verify -- --screenshots` runs browser checks and captures the
three example reports. Browser capture needs root development dependencies
and a working local Playwright browser.

### Commands

```bash
npm test                        # unit tests, the compare tools against a mocked API
npm run vendor                  # rebuild src/vendor/app-logic.js from the app (src/mimiq/lib)
MIMIQ_API_URL=http://127.0.0.1:8000/api MIMIQ_E2E_API_KEY=mq_sk_... npm run e2e   # compare_copy end to end, 3 people
./deploy.sh --dry               # what a deploy would sync (see deploy.sh)
```

`src/vendor/app-logic.js` is generated from the app's `compare.ts`, `model.ts`, `readout.ts` and `names.ts`; a test fails when it no longer matches them.

## License

MIT
