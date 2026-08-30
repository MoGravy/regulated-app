# AI Stack Handoff 03 (2026-08-30)

This is Handoff-03 in the series. Earlier handoffs in this series are not in this repo.

## CONTEXT

Two sessions on 2026-08-30 produced this handoff.

Session 1: run from iPhone via Blink into box 69. Working surface was Claude chat with
no MCP connection to any machine, so every command was executed by Matthew by hand.
Completed and verified in that session, on box 69 (root@69.62.75.37, srv1659197):

- Backed up /root/.hermes/cron/jobs.json to jobs.json.PRE-BOB-20260830.
  Both files 56602 bytes, verified equal. Nothing has been written to jobs.json yet.
- Audited the Lead Gen Jay skills installer before running it. Findings:
  the installer writes only into $HOME/.claude/{skills,commands,agents}, requires jq
  (present at /usr/bin/jq), and at line 207 runs eval "$POST_INSTALL" as root on any
  catalog item carrying a postInstall field. Full catalog dumped to /tmp/lgj-catalog.json
  on box 69 (88696 bytes; the items= filter is ignored on the /api/skills endpoint, it
  returns everything). Only two items in the entire catalog carry hooks: codex-consensus
  (npm install -g @openai/codex) and notes (curl leadgenjay.com/install/claude-review | sh).
  Neither is on our install list, so no hook fired.
- Installed 5 skills on box 69, all clean, verified by byte count:
  obsidian-markdown 5367, launch-page 12861, conversion-copywriting 6440,
  browser-automation 33069, hero-section-designer 9292.
  Pre-existing brightdata-scraper-studio 6612 untouched.

Session 2: Claude Code in a cloud container attached to the MoGravy/regulated-app repo.
That container has no SSH, Tailscale, or Hermes access to box 69, jkt, or the Mac, so it
changed nothing on any machine. Its only output is this file, committed on branch
claude/hermes-cron-jobs-setup-crgemx.

Delivery flag: the standing rule routes handoffs through Hermes files_write into
vault-inbox on box 69. Session 2 could not do that, so this file lives in the repo
instead. That is a flagged workaround, not a new convention. First step for the next
session that can reach box 69: place this file at
vault-inbox/AI Stack/260830_AI-Stack_Handoff-03_v1.md via Hermes files_write if it is
not already there, and treat the vault copy as canonical. If that folder already holds
a handoff numbered 03 or higher, bump this file's number to one past the highest when
placing it.

Not started: jkt install, Mac install, all Hermes cron work.

Background on the cron jobs in task 4: they are adapted from the published daily
schedule of "Bob", a Telegram agent product at leadgenjay.com/bob (02:30 self-review,
06:50 brief, 08:00 research, 12:00 article, 21:30 digest). The product itself is not
being bought. Only the schedule shape is being reused, on Hermes, which already does
this job.

## TASK

1. jkt (root@187.77.127.100, tailnet 100.106.62.14). Confirm jq is present. Install
   browser-automation and obsidian-markdown. On jkt:

   ```
   curl -sL "https://leadgenjay.com/api/skills/install.sh?items=browser-automation,obsidian-markdown" | bash
   ```

   Verify by listing every SKILL.md under ~/.claude/skills with byte counts. Report
   anything zero-length or missing. Do not install any other item from that catalog
   without re-checking its postInstall field first.

2. Mac (matthews-m1.tail9810ef.ts.net). Install @playwright/cli globally, then install
   live-test, mobile-test, test-improve, guided-browser, launch-page, obsidian-markdown,
   nano-banana from the same installer. zsh globs the ? in the URL, so prefix with noglob
   or quote the URL. Verify by byte count as above.

3. live-test as shipped ends with rm -f /tmp/playwright-test-*.png and rm -rf
   .playwright-cli/ as a mandatory cleanup phase. This violates the move-aside rule.
   Patch that phase in the installed SKILL.md to move artifacts to a
   .REMOVED-YYYYMMDD suffix instead of deleting. Read the file back after editing.

4. Hermes cron on box 69. Add five jobs to /root/.hermes/cron/jobs.json, one at a time,
   reading the file back and confirming the previous job landed before writing the next.
   Times are Adelaide local. jobs.json.PRE-BOB-20260830 is the rollback point.

   - a. 06:50 daily morning brief to Telegram: uptime on matthewtweediehypnosis.com.au
     and lumacounselling.com.au, Cloudflare and Varnish status, overnight WooCommerce
     orders, Luma enquiry submissions, today's calendar, YouTube channel delta.
   - b. 12:00 daily Luma article draft, next item from the grief programme (what is
     grief, how long does grief last, types of grief, coping with grief). Writes to
     vault-inbox/Luma/ only. This job must never call a WordPress write endpoint.
     Gate it draft-only in the job definition itself, not by convention.
   - c. 21:30 daily evening digest: what changed on both sites today, tail of
     ~/pipeline/pipeline.log, any failed jobs.
   - d. 02:30 daily self-review: mine the day's Hermes logs for failures and
     workarounds, write a patch proposal to vault-inbox/AI Stack/. Propose only,
     never self-apply.
   - e. Mon/Wed/Fri 08:00: LLM visibility trend delta from
     /usr/local/lib/hermes-agent/data/visibility_log.csv, so there is a mid-week read
     instead of only the Sunday 21:30 UTC report. Switch this slot to the Nadia
     outreach report once that pipeline is live.

5. After all five are in, confirm each one is actually registered in the internal
   scheduler, not just present in the file. Telling Hermes in chat to stop a job does
   not remove it from the internal scheduler, and the inverse failure mode is assumed
   to exist until proven otherwise.

6. Backlog carried forward, not for this session: Cloudflare Access on /wp-login.php
   and /wp-admin for both sites. Box 69 maintenance window, 25 pending updates and a
   restart-required flag, needs the 2.2GB Hermes backup moved off box first.

7. When this session's work is done, write the handoff for the following session to
   vault-inbox/AI Stack/, same naming pattern, dated that day, numbered one higher than
   the highest handoff already in that folder.

## STANDING RULES PERMANENT

- App is the Cloudways clone 6590589. Every script guards on that string in
  MTH_WORDPRESS_URL. Never write to any other WordPress site.
- Box 69 is root@69.62.75.37. Single-line commands only, no heredocs, one command per
  fenced code block, state the machine before the command.
- Scripts live in /srv/claude-content/luma/images/ as .txt, copied to .py before running,
  secrets sourced from /etc/hermes-gateway.secrets.
- One content-mutating operation at a time, read-back between. A 200 is acceptance, not
  confirmation. Verify by stored values, never byte length.
- No model-rewritten content on the site. No em dashes anywhere. Move-aside, never delete.
- Automation first. Manual steps are a flagged temporary workaround, not an answer.
- Back up before any update, upgrade, or restart, and verify the tarball is not truncated.
- Write all handoffs and vault deliverables via Hermes files_write to
  vault-inbox/MTH Migration/ on box 69. Never manual download-and-drag.
