# Mimiq MCP Server

Your agent built it. AI agents use it like your users before you ship.

Point Mimiq at a preview or staging URL and a task in plain words, such as signing up or reaching checkout. No test scripts. Each agent acts as one of your users: it opens the app in its own real browser, clicks, types and fills in your forms (with an inbox of its own for verification codes), and the report shows what was broken, what did nothing, where each agent got stuck or gave up and why, with the step and a screenshot. Fix what they hit and run it again on the new build.

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_MCP-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522mimiq%2522%252C%2522type%2522%253A%2522http%2522%252C%2522url%2522%253A%2522https%253A%252F%252Fmcp.mimiqai.com%252Fmcp%2522%257D) [![Install in Cursor](https://img.shields.io/badge/Cursor-Install_MCP-black?style=flat-square&logo=cursor&logoColor=white)](https://cursor.com/install-mcp?name=mimiq&config=eyJ1cmwiOiJodHRwczovL21jcC5taW1pcWFpLmNvbS9tY3AifQ==)

## Tools

| Tool | What it does |
|------|-------------|
| `mimiq.test_flow` | AI agents go through a flow on your preview, staging or live URL in real browsers and report what broke, what did nothing and where they got stuck, step by step with screenshots. 5 credits an agent. |
| `mimiq.show_report` | Shows a saved report again. Reads your account only and spends no credits. |

Ask your agent directly, or let it test what it just built:

> "Have three agents sign up on this preview and tell me where they get stuck"
>
> "Check the new checkout on the preview before I merge"
>
> "Run Mimiq on staging with parents shopping for school shoes, then fix what they hit"
>
> "Run it again on the fixed build"

## What the agents find, and the limits

- Errors on screen, buttons and links that do nothing, forms that reject good input, dead ends, and steps where agents wait, give up or go the wrong way because of the wording.
- What the browser recorded: JavaScript errors, failed or 4xx/5xx requests and requests slower than 3 seconds, on the step each happened.
- Each problem comes with which agents hit it, the step, the screenshot and a suggested fix, ranked by how many agents hit it.
- The agents are simulated users. They find problems fast; they do not forecast how many real people will convert.
- They cannot pay with real cards, and CAPTCHAs or bot protection can stop them. Use a preview or staging URL without bot protection.

## On every pull request

The [Mimiq preview check](https://github.com/victorgulchenko/mimiq-preview-check) GitHub Action runs the agents on each Vercel, Netlify or Cloudflare Pages preview and keeps one comment on the pull request with what they hit. Any other CI can call the same endpoint: it is plain JSON-RPC over HTTP.

```bash
curl -s https://mcp.mimiqai.com/mcp \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $MIMIQ_API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"mimiq.test_flow","arguments":{"url":"'"$PREVIEW_URL"'","goal":"Sign up and start using it","count":3}}}'
```

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
## Before calling a user-facing change done
After changing anything a user goes through (signup, onboarding, checkout,
settings, a new feature), run mimiq.test_flow on the preview URL with the task
a user would try. Fix what the agents hit, then run it again. Ask me before
using more than 25 credits.
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

- **Without a key**, each agent gets one free test: one flow with up to 3 agents, while the daily free allowance lasts. Anything larger needs a key, and the tool says so before anything is spent.
- **Get a key:** create a free account at [www.mimiqai.com/sign-up](https://www.mimiqai.com/sign-up?redirect_url=/app/settings) (it includes 50 credits). Open [Settings](https://www.mimiqai.com/app/settings), find "Use Mimiq from your coding agent", and choose "Create a key". The key starts with `mq_sk_` and is shown once.
- **Send it** on every request as `Authorization: Bearer mq_sk_...` (`X-API-Key: mq_sk_...` works too). The setup snippets above do this.
- **Credits:** an agent in a flow uses 5 credits. Buy more at [www.mimiqai.com/app/usage](https://www.mimiqai.com/app/usage): a one-time Starter of 120 credits for $9, or plans from $19 a month.

## Signed-in pages and protected previews

Pass `access` to `test_flow` for a preview behind Vercel Deployment Protection (`vercel_bypass`), a browser password prompt (`basic_auth`) or pages behind a sign-in (`login`, a test account). The agents type placeholders; the real values are filled in only in the browser, kept apart from the test and deleted when the run ends, and never appear in results or reports. Access comes with paid credits.

## Report links

With a key, every run is saved to your account, and the result ends with a link to it in the Mimiq app (`/app/t/...`). Put the link in your summary so your human can open the full report, the agents' steps and their screenshots. Reports are private until you share them from the app.

Without a key, runs stay private to the agent that ran them and cannot be opened in the app; the result says how to get a key instead.

## What a run returns

- Each agent's `journey_steps`: what it did at each step, where it was, and what it said.
- Where each agent stopped and why: finished, got partway, or gave up.
- The problems the agents hit, ranked by how many hit them, with the steps.
- `browser_caught`: what the browser itself recorded on your site, grouped and ranked by how many agents hit each: JavaScript errors, requests that failed or answered 4xx or 5xx (including your hosted backend, such as Supabase or Firebase), and requests slower than 3 seconds. The summary card lists them too.
- `counts`, a plain `summary_card`, and `report_url` (with a key).

## Who the agents are

By default Mimiq builds agents who match who the app is for, from the page. Pass `audience` in plain words to choose ("freelance designers", "parents shopping for school shoes"). The run starts right away unless the recruited agents are wrong (more than 1 in 5 not the requested audience); then the result is `status: "audience_review"`: show the warning, then continue with `review_id`, `confirm_audience: true` and `audience_fit_acknowledged: true`, or recruit again with `review_id` and `audience_correction`. In the app you can also build agents from your own customers (a CSV; names, emails and phone numbers are stripped before upload).

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
| `INSUFFICIENT_CREDITS` | `reason` says which: `free_try_used`, `free_flow_too_big`, `free_flows_used_today`, `network_monthly_limit`, or `out_of_credits` (with a key). | Get a key, run fewer agents, or buy more credits. |
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
npm test                        # unit tests, the tools against a mocked API
npm run vendor                  # rebuild src/vendor/app-logic.js from the app (src/mimiq/lib)
MIMIQ_API_URL=http://127.0.0.1:8000/api MIMIQ_E2E_API_KEY=mq_sk_... npm run e2e   # compare_copy end to end, 3 people
./deploy.sh --dry               # what a deploy would sync (see deploy.sh)
```

`src/vendor/app-logic.js` is generated from the app's `compare.ts`, `model.ts`, `readout.ts` and `names.ts`; a test fails when it no longer matches them.

## License

MIT
