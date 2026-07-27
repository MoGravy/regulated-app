# Hermes MCP: migrating the public endpoint from ngrok to Cloudflare Tunnel

**Host:** box 69 (`root@69.62.75.37`, `srv1659197`)
**Date of diagnosis:** 2026-07-27

## Why

Claude's MCP connector failed to connect with:

> Couldn't register with Hermes's sign-in service. You can try again, or add an
> OAuth Client ID in the connector settings. (ref `ofid_c7540928b42a1e45`)

### Root cause

ngrok's free tier serves an HTML browser-warning interstitial to requests with
browser-like headers. The MCP OAuth discovery endpoints are unauthenticated and
correctly return `404` (mcp-proxy implements no OAuth), which per the MCP spec
means "this resource is not protected, just connect". But Claude's connector
never saw that 404 — it got the interstitial HTML instead, failed to parse it,
and fell through to attempting dynamic client registration, which hit the same
HTML page.

Demonstrated directly:

```
U=https://baked-overdrive-cubicle.ngrok-free.dev/.well-known/oauth-protected-resource

browser-like:  200      # ngrok interstitial HTML
with skip hdr: 404      # the real response
```

Same URL, same server, two different answers depending on request headers.

### What was ruled out

Everything on the server side. For the record, all of these were checked and are
healthy:

- All three units active: `hermes-gateway`, `hermes-mcp-proxy`, `hermes-ngrok`
- ngrok domain is reserved (`--domain=` on the ExecStart), so the URL did **not**
  change on restart
- `/sse` returns `200` with a valid SSE handshake (`event: endpoint`)
- `/mcp` returns `406` to a bare curl, which is correct — Streamable HTTP
  requires `Accept: application/json, text/event-stream`. It is **not** a 404.
- A full JSON-RPC `initialize` over the public tunnel returns `200` with a
  session ID and `serverInfo: {name: hermes, version: 1.28.1}` — **with no
  authentication**
- The `--pass-environment` drop-in (`passenv.conf`, dated Jul 26) is not
  implicated; nothing is enforcing auth on the MCP path

The transport is **not** the problem. mcp-proxy serves both `/sse` and `/mcp`
correctly despite being started with `--transport streamablehttp`. Do not change
it.

### Why not just pay ngrok

The interstitial bypass header (`ngrok-skip-browser-warning`) must be sent by the
*client*. Claude does not send it, and the agent-side `--request-header-add` flag
rewrites requests going *upstream* to the proxy, after ngrok's edge has already
decided to serve the interstitial. Nothing configurable on the box changes that.

Paid ngrok (~$8–10/mo) does remove the interstitial. Cloudflare Tunnel is free
and the domains are already on Cloudflare nameservers, so it costs $0.

## Target setup

| | |
|---|---|
| Hostname | `mcp-7fq.adelaideanxietyclinic.com.au` |
| Origin | `http://127.0.0.1:8765` (unchanged) |
| Connector URL | `https://mcp-7fq.adelaideanxietyclinic.com.au/sse` |
| Tunnel name | `hermes-box69` |

`adelaideanxietyclinic.com.au` is retired as a website but stays registered and
on Cloudflare nameservers. The subdomain is deliberately non-obvious: until
Cloudflare Access is in front of it (see below), the hostname is the only thing
protecting the endpoint.

## Steps

Use the **dashboard-managed** (remotely-managed) tunnel. It avoids
`cloudflared tunnel login`, the `cert.pem` flow, and hand-editing config files —
which matters when working from a phone.

1. Cloudflare dashboard → **Zero Trust** → **Networks** → **Tunnels** →
   **Create a tunnel** → **Cloudflared**
2. Name it `hermes-box69`. Cloudflare shows an install command with a token
   embedded.
3. On box 69, run that command. It installs the binary *and* a `cloudflared`
   systemd service, already authenticated.
4. Dashboard → the tunnel → **Public Hostnames** → **Add**:
   - Subdomain: `mcp-7fq`
   - Domain: `adelaideanxietyclinic.com.au`
   - Service: **HTTP** → `127.0.0.1:8765`

   Cloudflare creates the DNS record automatically.

> The install command contains a live credential. Do not paste it into chat
> logs, issues, or commit messages.

### Verify

The decisive test — the one that returned `200` on ngrok:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -A 'Mozilla/5.0' -H 'Accept: text/html' \
  https://mcp-7fq.adelaideanxietyclinic.com.au/.well-known/oauth-protected-resource
```

**Expect `404`.** That is success: the real response, browser headers and all.
A `200` means an interstitial or error page is still in the way.

Then confirm the MCP endpoint itself:

```bash
curl -s -i -m 15 -X POST https://mcp-7fq.adelaideanxietyclinic.com.au/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"diag","version":"0"}}}' \
  | head -20
```

Expect `200` and a `serverInfo` naming `hermes`.

### Repoint the connector

In Claude's connector settings, **delete** the existing connector and re-add it
against `https://mcp-7fq.adelaideanxietyclinic.com.au/sse`. Delete rather than
edit — a failed registration can leave stale OAuth state that an edit preserves.

If `/sse` misbehaves, `/mcp` is also served correctly and is the newer transport.

## Rollback

`hermes-ngrok.service` is left running and untouched throughout the migration.
If anything goes wrong, repoint the connector at
`https://baked-overdrive-cubicle.ngrok-free.dev/sse` — which is broken for Claude
but fine for any client that sends non-browser headers.

## Decommissioning ngrok

Only after the Cloudflare hostname has been working for a few days:

```bash
systemctl disable --now hermes-ngrok.service
```

Leave the unit file in place initially. Once you are confident, remove
`/etc/systemd/system/hermes-ngrok.service`, `systemctl daemon-reload`, and revoke
the ngrok authtoken from the ngrok dashboard.

## Outstanding: the endpoint has no authentication

Independent of this bug, and still true after the migration:

> A full MCP `initialize` succeeds from the public internet with **no
> credentials**. Anyone with the hostname has full access to Hermes's tools —
> sending Telegram messages, publishing to WordPress, reading conversations,
> writing files.

mcp-proxy provides no auth layer. Today the only protection is that the URL is
hard to guess, and the old ngrok URL has appeared in chat transcripts.

Cloudflare Access can close this without writing any code: the tunnel's public
hostname can be put behind an Access application with a service-token policy,
and the token supplied to the connector as headers. This is the reason to prefer
Cloudflare over paid ngrok beyond cost — it is a policy checkbox on
infrastructure you will already have running.

Tracked as follow-up work; not part of this migration.
