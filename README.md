# Mimiq MCP Server

Your AI coding agent tests pages, copy, and flows on simulated users — automatically, while you build. Spots bad copy, confusing UX, and conversion killers before real users do.

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_MCP-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522mimiq%2522%252C%2522type%2522%253A%2522http%2522%252C%2522url%2522%253A%2522https%253A%252F%252Fmcp.mimiqai.com%252Fmcp%2522%257D) [![Install in Cursor](https://img.shields.io/badge/Cursor-Install_MCP-black?style=flat-square&logo=cursor&logoColor=white)](https://cursor.com/install-mcp?name=mimiq&config=eyJ0cmFuc3BvcnQiOiJzdHJlYW1hYmxlX2h0dHAiLCJ1cmwiOiJodHRwczovL21jcC5taW1pcWFpLmNvbS9tY3AifQ==)

[![Mimiq MCP server](https://glama.ai/mcp/servers/victorgulchenko/mimiq-mcp/badges/card.svg)](https://glama.ai/mcp/servers/victorgulchenko/mimiq-mcp)

## Setup (30 seconds)

### Claude Code

```bash
claude mcp add --transport http mimiq https://mcp.mimiqai.com/mcp
```

Or add to `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "mimiq": {
      "type": "http",
      "url": "https://mcp.mimiqai.com/mcp"
    }
  }
}
```

### Codex

Add to `~/.codex/config.toml` (or `.codex/config.toml` in your project root):

```toml
[mcp_servers.mimiq]
url = "https://mcp.mimiqai.com/mcp"
```

With an API key, set the env var and reference it:

```toml
[mcp_servers.mimiq]
url = "https://mcp.mimiqai.com/mcp"
bearer_token_env_var = "MIMIQ_API_KEY"
```

Then set the env var: `export MIMIQ_API_KEY=mq_sk_your_key_here`

### Cursor

Add to MCP settings (Settings > MCP):

```json
{
  "mimiq": {
    "transport": "streamable_http",
    "url": "https://mcp.mimiqai.com/mcp"
  }
}
```

### VS Code (GitHub Copilot)

Open Command Palette > "MCP: Add Server" or add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "mimiq": {
      "type": "http",
      "url": "https://mcp.mimiqai.com/mcp"
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "mimiq": {
      "serverUrl": "https://mcp.mimiqai.com/mcp"
    }
  }
}
```

### Claude Desktop

Add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "mimiq": {
      "transport": "streamable_http",
      "url": "https://mcp.mimiqai.com/mcp"
    }
  }
}
```

---

No API key needed — you get **100 free personas** to start.

## Use it

Your agent now has access to Mimiq tools. It uses them **proactively** — when it builds or changes a page, it tests automatically. No need to ask.

It also works with **localhost**. The agent starts a temporary cloudflared tunnel, runs the simulation, and tears it down. You build, it tests, in the same flow.

Or ask directly:

> "Test my landing page on startup founders"
>
> "A/B test these two headlines on e-commerce shoppers"
>
> "Ask 20 SaaS founders which pricing model they prefer"

## Tools

| Tool | What it does |
|------|-------------|
| `mimiq.test_page` | Test a web page — finds UX issues, confusing copy, conversion blockers |
| `mimiq.test_flow` | Deep interactive simulation of multi-step flows (signup, checkout) |
| `mimiq.test_copy` | Test copy or A/B compare two variants head-to-head |
| `mimiq.test_text` | Test any text content (positioning, descriptions, error messages) |
| `mimiq.test_component` | Evaluate UI components from HTML snippets |
| `mimiq.ask_audience` | Survey a synthetic audience on product decisions |

## What you get back

Raw per-persona results. Each simulated user has a name, demographics, and independently decides what to do. You get:

- **action**: what they did (converted, engaged, or bounced)
- **monologue**: what they were thinking — this is where the real insights are
- **objections**: specific concerns that stopped them
- **what_would_help**: what would change their mind
- **aggregate counts**: how many converted, engaged, or bounced

There are no pre-computed verdicts or scores. Your AI agent analyzes the raw feedback and decides what it means.

## When you need more

After 100 free personas, sign up at [mimiqai.com](https://mimiqai.com) to get an API key (Settings > API Keys), then add it to your config:

**Claude Code:**
```bash
claude mcp remove mimiq
claude mcp add --transport http \
  --header="Authorization: Bearer mq_sk_your_key_here" \
  mimiq https://mcp.mimiqai.com/mcp
```

**Codex:**
```toml
[mcp_servers.mimiq]
url = "https://mcp.mimiqai.com/mcp"
bearer_token_env_var = "MIMIQ_API_KEY"
```
Then: `export MIMIQ_API_KEY=mq_sk_your_key_here`

**Cursor / VS Code / Claude Desktop / Windsurf** — add a `headers` field:
```json
{
  "headers": {
    "Authorization": "Bearer mq_sk_your_key_here"
  }
}
```

## Pricing

- **100 free personas** on first use (no signup needed)
- **2,000 personas for $10** at [mimiqai.com/app/usage](https://mimiqai.com/app/usage)

## Self-hosting

If you're running the Mimiq backend yourself:

```bash
cd mcp-hosted
MIMIQ_API_URL=http://127.0.0.1:8000/api node src/server.js
```

Point your agent at `http://127.0.0.1:8787/mcp`. In local dev mode, no API key is required.

### Docker

```bash
cd mcp-hosted
docker build -t mimiq-mcp .
docker run -p 8787:8787 -e MIMIQ_API_URL=http://host.docker.internal:8000/api -e HOST=0.0.0.0 mimiq-mcp
```

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MIMIQ_API_URL` | `http://127.0.0.1:8000/api` | Mimiq backend URL |
| `MIMIQ_API_KEY` | — | Backend API key (if backend requires shared auth) |
| `PORT` | `8787` | Server port |
| `HOST` | `127.0.0.1` | Bind host (`0.0.0.0` for Docker) |

## Testing localhost pages

Mimiq works with localhost out of the box. When your agent calls `test_page` or `test_flow` on a local dev server, it automatically:

1. Starts a temporary [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/run-tunnel/trycloudflare/) tunnel (free, no account needed)
2. Uses the public tunnel URL for the simulation
3. Tears down the tunnel when done

This is the primary workflow — test while you build, not after you deploy.

**Requirement:** `cloudflared` must be installed on the machine running the AI agent.

```bash
# macOS
brew install cloudflared

# Linux
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared
```

The agent handles the rest. No bridge daemon, no extra config, no manual tunnel setup.

## License

MIT