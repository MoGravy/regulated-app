# Working notes

## Machine access, from Matthew's iPhone via Blink

These are the connection commands. Use them verbatim. Do not reconstruct them from a raw user
and IP, and do not suggest an alternative form.

| Machine | Command | Notes |
|---|---|---|
| box 69 | `mosh box69` | Blink host alias `box69`, HostName 69.62.75.37, User root, Key `phone`. mosh, not ssh. |
| jkt | root@187.77.127.100, tailnet 100.106.62.14 | Blink alias not yet confirmed, ask before assuming one. |
| Mac | matthews-m1.tail9810ef.ts.net | Blink alias not yet confirmed. M1. Sleeps, so it is often unreachable. |

Never suggest `ssh root@69.62.75.37`. That form bypasses the saved Blink host, so it never offers
the `phone` key, drops to password auth that is not enabled, loops three prompts and fails. Repeating
it risks a fail2ban ban on the phone's IP, which would lock Matthew out of the one machine that is
reliably up.

If a connection fails, read the error before proposing a fix. `authFailed` means sshd was reached
and the credentials were refused, which is a key or alias problem. A socket disconnect means nothing
was listening, which is a machine asleep, off the tailnet, or with Remote Login off, and cannot be
fixed from the phone.

## Remote Control

Matthew works from an iPhone. A Claude Code cloud session cannot reach any of the machines above,
so machine work runs through Remote Control on the target box, driven from the Claude app.

Bootstrap, on box 69, inside tmux so it survives Blink disconnecting:

```
cd ~/hermes-work && claude remote-control --name hermes-cron
```

Then Claude app, Code tab, pick the session. Detach tmux with Ctrl-B then D.

## Standing rules

- App is the Cloudways clone 6590589. Every script guards on that string in MTH_WORDPRESS_URL.
  Never write to any other WordPress site.
- Single line commands only, no heredocs, one command per fenced code block, state the machine
  before the command.
- Scripts live in /srv/claude-content/luma/images/ as .txt, copied to .py before running, secrets
  sourced from /etc/hermes-gateway.secrets.
- One content-mutating operation at a time, read-back between. A 200 is acceptance, not
  confirmation. Verify by stored values, never by byte length.
- No model-rewritten content on the site. No em dashes anywhere. Move aside, never delete.
- Automation first. Manual steps are a flagged temporary workaround, not an answer.
- Back up before any update, upgrade or restart, and verify the tarball is not truncated.
- Handoffs and vault deliverables go to vault-inbox/ on box 69 via Hermes files_write. Never
  manual download and drag.

## Where the work lives

Handoffs and runbooks are in `vault-inbox/AI Stack/`, numbered and dated. The current pair is
260830_AI-Stack_Handoff-03_v1.md and 260830_AI-Stack_Runbook-01_Skills-and-Cron_v1.md.
