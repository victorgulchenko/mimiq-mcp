# Installing the Mimiq MCP server (for coding agents)

Mimiq is a hosted, remote MCP server. There is nothing to clone, build or run locally.

- URL: `https://mcp.mimiqai.com/mcp`
- Transport: Streamable HTTP
- Auth: optional. Without a key, each agent gets one free run of up to 3 AI agents. With a key, send `Authorization: Bearer <key>`. A free account at https://www.mimiqai.com/sign-up?redirect_url=/app/settings gives 50 credits; the key is under Settings, "Use Mimiq from your coding agent", "Create a key". Never write the key into a committed file; ask the user for it.

## Cline

Add this to `cline_mcp_settings.json` (MCP Servers, Configure):

```json
{
  "mcpServers": {
    "mimiq": {
      "type": "streamableHttp",
      "url": "https://mcp.mimiqai.com/mcp",
      "headers": { "Authorization": "Bearer YOUR_MIMIQ_KEY" },
      "disabled": false
    }
  }
}
```

Leave out `headers` to use the free run.

## Check it works

List the tools. You should see `mimiq.test_flow` and `mimiq.show_report`. Do not start a run to test the setup: a run uses credits. Ask the user before the first run.

## Using it

After building or changing anything a user goes through, call `mimiq.test_flow` with the public preview or staging URL and the task a user would try, for example `{"url": "https://my-app-git-feature.vercel.app", "goal": "Sign up and reach the dashboard", "count": 3}`. Mimiq needs a public URL; for localhost, ask the user before opening a temporary tunnel.
