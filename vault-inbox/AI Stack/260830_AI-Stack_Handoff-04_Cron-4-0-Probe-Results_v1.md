# AI Stack Handoff 04: section 4.0 probe results, Hermes cron (2026-08-30)

Companion to 260830_AI-Stack_Runbook-01_Skills-and-Cron_v1.md. That file is the execution
detail. This file records the answers to the three blocking questions in its section 4.0, so the
five cron entries in 4.3 can be written without rewriting them afterwards.

Status: section 4.0 is DONE, reads only. Sections 4.1 to 4.3 are still unwritten. Sections 1, 2,
3, 5 and 6 are untouched.

## 0. Read this first, the environment changed

Runbook section 0 states that no ssh binary exists, no tailscale, TCP 22 times out everywhere,
matthews-m1 does not resolve, and there is no path to any machine. That was true of the Claude
Code cloud container that authored the runbook. **It is not true of box 69.**

The 2026-08-30 04:55 UTC session ran natively on box 69 (hostname srv1659197, tailnet
100.89.221.17) via Remote Control. From there: ssh, tailscale, mosh, nc and jq are all present,
and both other machines are reachable at the network layer. Treat runbook section 0 as a
statement about the authoring container, not about box 69.

Practical consequence: runbook tasks 1 and 2 no longer need hand-pasting from the phone. Task 2
(Mac) can be driven from box 69 now. Task 1 (jkt) is blocked on one key install, see section 3.

## 1. Answers to the three 4.0 questions

All three were answered by read-only probes against /root/.hermes/cron/jobs.json on box 69.
Nothing was written to that file.

### Q1. Does the schedule field carry a timezone? NO.

The schedule field is an object of exactly three keys:

```
"schedule": { "kind": "cron", "expr": "0 10 * * 1", "display": "0 10 * * 1" }
```

31 entries carry a schedule, 26 with kind "cron" and 5 with kind "interval". A grep of the whole
file for "tz", "timezone", "time_zone", "utc" and "offset" returns nothing. There is no timezone
support anywhere in the schema.

**Decision for 4.1:** ignore the local cron column. Use the **UTC cron, ACST** column now. Ten
cron strings must be hand edited to the **UTC cron, ACDT** column at 02:00 Adelaide local on
Sunday 4 October 2026, and back again on Sunday 4 April 2027.

Per the standing rule that manual steps are a flagged temporary workaround and not an answer,
this belongs in the backlog as "teach Hermes cron a tz field". Do not let the twice yearly edit
become the permanent design. Add a calendar reminder for 3 October 2026 as the interim guard.

### Q2. Capability allowlist and files_write path scope? PARTIAL, and the missing half blocks jobs b and d.

Full unique key list from jobs.json:

```
base_url, chat_id, chat_name, completed, context_from, created_at, deliver, display,
enabled, enabled_toolsets, expr, id, jobs, kind, last_delivery_error, last_error,
last_run_at, last_status, minutes, model, name, next_run_at, no_agent, origin,
paused_at, paused_reason, platform, profile, prompt, provider, repeat, schedule,
schedule_display, script, skill, skills, state, thread_id, times, updated_at, workdir
```

Four candidate fields, with their live value distributions across 31 entries:

```
enabled_toolsets:  ["terminal","web"] x2   ["terminal"] x2   null x27
profile:           minimax-battery x3      null x27
workdir:           null x31
no_agent:          false x12   true x19
```

**What exists:** `enabled_toolsets` is a real capability allowlist. It is an array of toolset
names and it is populated on live entries, so capability can be constrained by the job definition
rather than by prompt wording. That is the right shape for the 4.0 requirement.

**What does not exist:** there is no files_write path scope field anywhere in the schema.
`workdir` exists but is null on all 31 entries, and a working directory is a cwd, not a write
boundary. Nothing constrains which paths a job may write to.

**Therefore jobs b (Luma article draft, draft only) and d (self review, propose only) are half
gated.** Whether toolset granularity alone is sufficient turns on a fact that is NOT in
jobs.json: which toolset contains WordPress publishing and files_write, and whether a toolset
exists that grants drafting without publishing. If publish and draft sit in the same toolset,
the 4.0 gate fails as written and b and d cannot be built to the stated spec.

**Next read, unresolved:** the Hermes toolset registry. Find the definitive list of toolset names
and their contained tools, then confirm whether a draft-without-publish toolset exists. Until
that is answered, do not write b or d. Do not substitute prompt wording for the gate. A prompt
constrains intent, not capability, which is the exact failure mode 4.0 exists to prevent.

### Q3. Where does job run history live? FOUND, three sources.

In order of usefulness:

1. **jobs.json itself.** Every entry stores `last_status`, `last_error`, `last_run_at`. This is a
   one-run-deep history and it is sufficient for job c's failed-job detection with no log parsing
   at all. Start here.
2. **/root/.hermes/cron/output/**, 33 subdirectories. The runbook's suggested `ls` did not cover
   this path. It is almost certainly the per-run output store and the real multi-run history.
   Confirm its structure before job d is built on it.
3. **hermes-task-log.service**, unit description "Hermes task log exporter (Phase 4 A/B
   scoreboard, read-only over state.db)". Implies a structured task log in a SQLite state.db and
   is the correct source for job d. **This unit is currently `inactive dead`.** If d consumes it,
   someone must decide whether to start and enable it.

Log directory contents, for reference:

```
/root/.hermes/logs:  agent.log (3.2M, live), agent.log.1/.2/.3, errors.log, errors.log.1/.2,
                     gateway.log, gateway.log.1/.2/.3, gateway-exit-diag.log,
                     gateway-shutdown-diag.log, mcp-stderr.log, dashboard.log (0 bytes),
                     curator/ (16 dirs), youtube-*.log, update.log, tui_gateway_crash.log
/var/log:            hermes-claude-content-audit.log, hermes-ui-monitor.log,
                     hermes-ui-recovery.log (2.0 GB, see section 4)
/usr/local/lib/hermes-agent/logs:  does not exist
```

Hermes services on box 69:

```
hermes-dashboard.service    active running   web dashboard, tailnet only
hermes-gateway.service      active running   Agent Gateway
hermes-mcp-auth.service     active running   MCP bearer-auth reverse proxy
hermes-mcp-proxy.service    active running   MCP proxy, stdio to HTTP/SSE
hermes-task-log.service     inactive dead    task log exporter, read-only over state.db
```

## 2. Rollback point, verified

```
/root/.hermes/cron/jobs.json.PRE-BOB-20260830
56602 bytes, mtime 2026-08-30 02:53:44 UTC
md5 17a08520af5c936754fd0924e654841c
```

Confirmed intact at the stated size. Restore from this file if 4.3 goes wrong.

**Important caveat.** Live jobs.json is ALSO 56602 bytes but has a different md5
(01b9f4bd69d0dcc6fecf2e27b75dd18c). A jq-normalised diff shows 88 changed lines, all of them
scheduler bookkeeping: `last_run_at`, `next_run_at` and `repeat.completed` ticking forward. No
structural change, so the backup remains a valid pre-change baseline.

This is a live demonstration of the standing rule: verify by stored values, never by byte length.
Two files of identical size here have different contents. Any verification step in 4.3 that
compares byte counts is worthless. Compare with jq.

## 3. Machine reachability, measured from box 69 on 2026-08-30

tailscale status:

```
100.89.221.17   srv1659197           linux   this box, box 69
100.65.83.92    ipad-mini-gen-5      iOS
100.80.248.104  ipad-pro-12-9-gen-3  iOS
100.101.157.0   iphone182            iOS
100.101.149.29  matthews-m1          macOS
100.106.62.14   odysseus-jkt         linux
```

### jkt: network reachable, auth REFUSED. Blocked on a key install.

```
tailscale ping 100.106.62.14  ->  pong from odysseus-jkt via 187.77.127.100:41641 in 74ms
nc -vz 100.106.62.14 22       ->  succeeded
nc -vz 187.77.127.100 22      ->  succeeded
ssh -o BatchMode=yes root@187.77.127.100
    Offering public key: /root/.ssh/id_ed25519 ED25519 SHA256:cQntp05fhZmCQ9mWIACbQ2rBTLkoGkOBt/AYfmJG/zI
    root@187.77.127.100: Permission denied (publickey).
```

Both addresses reach the same host and sshd answers on both. Per the CLAUDE.md diagnostic rule
this is authFailed, not a socket disconnect, so it is a key problem and NOT a sleeping machine.

**Blocker:** box 69's public key is not in jkt's authorized_keys. The fix requires a session that
already has access to jkt. The key to install is:

```
/root/.ssh/id_ed25519.pub on box 69, fingerprint SHA256:cQntp05fhZmCQ9mWIACbQ2rBTLkoGkOBt/AYfmJG/zI
```

Only two auth attempts were made and then stopped. Do not loop retries, that is the fail2ban
risk. Once the key is installed, runbook task 1 can run from box 69 without phone pasting.

### Mac: UP.

```
matthews-m1.tail9810ef.ts.net  ->  100.101.149.29
tailscale ping   ->  pong from matthews-m1 via 110.175.164.206:41644 in 159ms
nc -vz ... 22    ->  succeeded
```

Awake, on the tailnet, Remote Login on, sshd accepting. Authentication was not attempted, the
question asked was whether it is up. **It sleeps, so act while it is awake.** Runbook task 2 is
the thing to run.

## 4. Incidental findings, not part of 4.0

- **Claude Credit Watchdog (id 404d7935be20) has been failing since 2026-08-24.** Its
  `last_status` is "error" with "Claude API key is invalid or expired". It runs Mondays, so it
  has failed at least once with nobody noticing. This is exactly the class of failure job c is
  meant to catch. Fix the key separately, and treat this as the acceptance test for c.
- **/var/log/hermes-ui-recovery.log is 2,040,989,250 bytes**, roughly 2.0 GB, last written
  2026-06-08. Unrotated and stale. Check free disk before any install in runbook tasks 1 to 3.
- Local /srv/claude-content/vault-inbox/AI Stack/ holds only the 260827 files. The 260830 pair
  exists on git branch claude/hermes-cron-jobs-setup-crgemx but is not on box 69's disk. If the
  vault is meant to be the source of truth, that gap needs closing.

## 5. What the next session should do, in order

1. **Read the Hermes toolset registry** and resolve the Q2 gap. Which toolset holds WordPress
   publishing and files_write, and is there a draft-without-publish toolset. This gates jobs b
   and d. Nothing else in 4.3 should be written until this is answered.
2. **Write jobs a, c and e** from runbook 4.3, using the UTC cron ACST column, one entry at a
   time with a jq read-back between each, per the one-mutation-at-a-time rule. Back up jobs.json
   again before the first write.
3. **Write jobs b and d** only if step 1 says the gate can be enforced by definition. If it
   cannot, stop and report, do not fall back to prompt wording.
4. **Install box 69's key on jkt**, then run runbook task 1.
5. **Run runbook task 2 on the Mac** while it is awake.
6. Confirm registration per runbook section 5.

## Standing rules that bit during this session

- Verify by stored values, never by byte length. Two 56602-byte files, different contents.
- A prompt constrains intent, not capability. Q2 is not satisfied by wording.
- Read the error before proposing a fix. authFailed and socket disconnect are different problems.
- Do not loop failed ssh attempts.

## Provenance

Authored 2026-08-30 by a Claude Code Remote Control session on box 69 (srv1659197). All findings
in sections 1 to 4 are direct observations from read-only commands on that box, not expectations.
Source documents read: CLAUDE.md and vault-inbox/AI Stack/260830_AI-Stack_Runbook-01_Skills-and-
Cron_v1.md, both from github.com/MoGravy/regulated-app branch claude/hermes-cron-jobs-setup-crgemx.
No file under /root/.hermes/cron/ was modified.

## Addendum, added from the cloud session on review

Two corrections to section 5's ordering, and one sequencing opportunity.

**The Mac is the only perishable resource here.** jobs.json, the toolset registry and jkt all sit
on always-on machines and will still be there tomorrow. The Mac sleeps. Section 5 puts it at step
5, after four steps that cannot expire, while its own section 3 says to act while it is awake.
Those contradict. Do the Mac first.

**The jkt key install may be solvable during the same Mac window.** Section 3 says the fix
"requires a session that already has access to jkt" and does not name one. Box 69 is refused. The
Mac is the untested candidate: if the Mac holds a key for jkt, box 69's public key can be appended
to jkt's authorized_keys from the Mac while it is awake, which unblocks runbook task 1 without
waiting. Check `ssh -o BatchMode=yes root@187.77.127.100 true` from the Mac before assuming a
blocker. Two attempts maximum, then stop.

**One extra read is worth doing alongside the toolset registry.** The Claude Credit Watchdog
failure was found incidentally, not by looking. The same one-line jq over `last_status` across all
31 entries would reveal every other job that has been failing silently. That is a zero-risk read
with a real chance of finding more six-day-old breakage, and it doubles as the baseline job c is
supposed to reproduce.
