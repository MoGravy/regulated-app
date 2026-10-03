#!/usr/bin/env python3
"""Local Supabase client -> PostgREST -> PostgreSQL timeout and rollback check."""

import argparse
import importlib.util
import json
import os
import re
import select
import socketserver
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("native_progress", ROOT / "tests/deletion-progress-concurrency.check.py")
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)
DOCKER, run, sql, require = native.DOCKER, native.run, native.sql, native.require
ACCOUNT, RECEIPT = native.ACCOUNT, native.RECEIPT
IMAGE = "postgrest/postgrest:v12.2.12"

# Direct PostgREST has no Supabase gateway prefix or JWT gateway. Only this
# isolated fixture removes the synthetic bearer and selects db-anon-role.
CLIENT = """
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { prepareProgressCleanup, executeProgressCleanup } from './scripts/deletion-progress.mjs';
const input = JSON.parse(readFileSync(0, 'utf8'));
const origin = new URL(input.origin);
assert.equal(origin.hostname, '127.0.0.1');
const client = createClient(origin.href, 'local-fixture-only', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: (url, options) => {
    const target = new URL(url);
    assert.equal(target.origin, origin.origin);
    assert.ok(target.pathname.startsWith('/rest/v1/'));
    target.pathname = target.pathname.slice('/rest/v1'.length);
    const headers = new Headers(options.headers);
    headers.delete('authorization');
    headers.set('connection', 'close');
    return fetch(target, { ...options, headers });
  } },
});
let result;
if (input.operation === 'prepare') {
  result = await prepareProgressCleanup(client, input.requestId);
} else if (input.operation === 'timeout') {
  const observed = { rpc: async (...args) => {
    const response = await client.rpc(...args);
    result = { data: response.data, code: response.error?.code,
      message: response.error?.message, status: response.status };
    return response;
  } };
  await assert.rejects(executeProgressCleanup(observed, input.claim, input.planHash),
    { message: 'Progress cleanup needs review' });
} else {
  assert.equal(input.operation, 'execute');
  result = await executeProgressCleanup(client, input.claim, input.planHash);
}
process.stdout.write(JSON.stringify(result));
"""


def rpc(origin, operation, **payload):
    result = run(["node", "--input-type=module", "-e", CLIENT], cwd=ROOT,
                 input=json.dumps(dict(origin=origin, operation=operation, **payload)))
    require(result.returncode == 0, f"Supabase {operation} call failed")
    return json.loads(result.stdout)


def ready_rest(origin):
    deadline = time.monotonic() + 15
    while True:
        try:
            with urllib.request.urlopen(origin, timeout=1) as response:
                if response.status == 200:
                    return
        except (OSError, urllib.error.URLError):
            pass
        require(time.monotonic() < deadline, "PostgREST startup timed out")
        time.sleep(0.1)


def loopback_relay(container):
    # Docker does not publish ports on an internal network. Forward raw HTTP
    # through this owned container, preserving isolation and real REST behavior.
    applets = run(DOCKER + ["exec", container, "busybox", "--list"])
    require(applets.returncode == 0 and "nc" in applets.stdout.splitlines(), "Fixture needs cached BusyBox nc")

    class Relay(socketserver.BaseRequestHandler):
        def handle(self):
            process = subprocess.Popen(DOCKER + ["exec", "-i", container, "busybox", "nc", "-w", "5", "rest", "3000"],
                                       stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
            try:
                streams = [self.request, process.stdout]
                while True:
                    readable, _, _ = select.select(streams, [], [], 10)
                    if not readable:
                        return
                    for stream in readable:
                        if stream is self.request:
                            data = self.request.recv(65536)
                            if not data:
                                process.stdin.close()
                                streams.remove(self.request)
                            else:
                                process.stdin.write(data)
                                process.stdin.flush()
                        else:
                            data = os.read(process.stdout.fileno(), 65536)
                            if not data:
                                return
                            self.request.sendall(data)
            finally:
                if process.poll() is None:
                    process.kill()
                process.wait(timeout=3)
                if not process.stdin.closed:
                    process.stdin.close()
                process.stdout.close()

    relay = socketserver.ThreadingTCPServer(("127.0.0.1", 0), Relay)
    threading.Thread(target=relay.serve_forever, daemon=True).start()
    return relay


def fixture(container):
    sql(container, """
      create role anon; create role authenticated; create role service_role bypassrls;
      create role authenticator login noinherit; grant service_role to authenticator;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
      create function auth.role() returns text language sql stable as $$select current_user::text$$;
      create table storage.buckets(id text primary key,name text,public boolean);
    """)
    for path in ["supabase-schema.sql"] + ["migrations/" + name for name in [
        "001_auth_and_program.sql", "007_courses.sql", "009_care.sql",
        "008_account_deletion_requests.sql", "011_account_deletion_workflow.sql",
        "019_deletion_dispatch.sql", "020_deletion_progress.sql", "021_deletion_progress_rpc.sql",
    ]]:
        sql(container, (ROOT / path).read_text(), path)
    sql(container, f"""
      insert into auth.users(id) values ('{ACCOUNT}');
      insert into public.account_deletion_requests(id,account_id) values ('{RECEIPT}','{ACCOUNT}');
      insert into public.programs(id,slug,title)
        values ('00000000-0000-4000-8000-000000000021','fixture','fixture');
      insert into public.program_days(id,program_id,week,day)
        values ('{native.RESOURCES[0][2]}','00000000-0000-4000-8000-000000000021',1,1);
      insert into public.courses(id,slug,title)
        values ('00000000-0000-4000-8000-000000000031','fixture','fixture');
      insert into public.course_lessons(id,course_id,title,position)
        values ('{native.RESOURCES[1][2]}','00000000-0000-4000-8000-000000000031','fixture',1);
      create sequence public.fixture_timeout_marker;
    """)
    for table, column, first, _ in native.RESOURCES:
        sql(container, f"insert into public.{table}(user_id,{column}) values ('{ACCOUNT}','{first}')")


def approve(container):
    sql(container, f"""
      update public.deletion_progress_plans set approved_at=now(),approved_by='fixture operator'
        where request_id='{RECEIPT}';
      update public.account_deletion_requests set reviewed_at=now(),reviewed_by='fixture operator'
        where id='{RECEIPT}';
    """)


def check(container, rest, origin, report):
    plan = rpc(origin, "prepare", requestId=RECEIPT)
    require(plan["counts"] == {"user_progress": 1, "course_progress": 1} and plan["approved"] is False,
            "REST preparation returned the wrong plan")
    claim = json.loads(sql(container,
        "set role service_role; select row_to_json(c) from public.claim_deletion_requests(1) c;"))
    approve(container)
    state_sql = """select jsonb_build_object(
      'progress',(select jsonb_agg(to_jsonb(t)) from public.user_progress t),
      'courses',(select jsonb_agg(to_jsonb(t)) from public.course_progress t),
      'plans',(select jsonb_agg(to_jsonb(t)) from public.deletion_progress_plans t),
      'requests',(select jsonb_agg(to_jsonb(t)) from public.account_deletion_requests t))"""
    before = sql(container, state_sql)
    result = rpc(origin, "timeout", claim=claim, planHash=plan["planHash"])
    require(result.get("code") == "57014" and "statement timeout" in result.get("message", ""),
            "PostgREST did not enforce the function statement timeout")
    require(result.get("data") is None and result["status"] >= 400, "Timed-out RPC reported success")
    require(sql(container, "select is_called and last_value=1 from public.fixture_timeout_marker") == "t",
            "Timeout did not reach the injected pause after the first deletion")
    require(sql(container, state_sql) == before, "Timeout changed progress, the plan or the receipt")
    sql(container, f"""
      begin; set local lock_timeout='1s';
      lock table public.user_progress,public.course_progress,public.deletion_progress_plans in access exclusive mode;
      select id from public.account_deletion_requests where id='{RECEIPT}' for update nowait;
      select id from auth.users where id='{ACCOUNT}' for update nowait;
      rollback;
    """, "Timeout released table and row locks")
    report.update(timeout_sqlstate=result["code"], timed_out_after_first_delete=True,
                  rollback_preserved_rows_and_ledger=True, locks_released=True)

    sql(container, (ROOT / "migrations/021_deletion_progress_rpc.sql").read_text(), "Restore canonical RPC")
    # Restart only this owned instance so function settings are reloaded before the next call.
    require(run(DOCKER + ["restart", rest]).returncode == 0, "PostgREST restart failed")
    ready_rest(origin)
    sql(container, f"update public.deletion_progress_plans set approved_at=null,approved_by=null where request_id='{RECEIPT}';")
    canonical = rpc(origin, "prepare", requestId=RECEIPT)
    approve(container)
    outcome = rpc(origin, "execute", claim=claim, planHash=canonical["planHash"])
    require(outcome == {"progressCleaned": True, "alreadyCleaned": False, "accountDeleted": False},
            "Canonical REST cleanup result was incorrect")
    require(sql(container, f"""select
      (select count(*) from public.user_progress)+(select count(*) from public.course_progress)=0
      and (select completed_at is not null from public.deletion_progress_plans where request_id='{RECEIPT}')
      and (select ordinary_state<>'done' and held_state<>'done'
           from public.account_deletion_requests where id='{RECEIPT}')""") == "t",
      "Canonical RPC did not complete only the progress stage")
    report["canonical_supabase_rpc_cleanup"] = True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence", type=Path)
    args = parser.parse_args()
    report = {"scope": "isolated local Supabase client/PostgREST/PostgreSQL", "image": IMAGE, "passed": False}
    network = ""
    relay = None
    with tempfile.TemporaryDirectory(prefix="regulated-progress-rest-") as scratch:
        cidfiles = [Path(scratch) / "postgres-id", Path(scratch) / "postgrest-id"]
        try:
            created = run(DOCKER + ["network", "create", "--internal", "regulated-progress-rest-" + uuid.uuid4().hex[:12]])
            network = created.stdout.strip()
            require(created.returncode == 0 and re.fullmatch(r"[a-f0-9]{64}", network),
                    "Internal network creation failed: " + created.stderr.strip())
            started = run(DOCKER + ["run", "--rm", "--pull=never", "-d", "--network", network,
                "--network-alias", "database", "--cidfile", str(cidfiles[0]),
                "--tmpfs", "/var/lib/postgresql/data:rw,nosuid,nodev,size=256m",
                "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:16-alpine"])
            require(started.returncode == 0, "Local PostgreSQL start failed")
            container = cidfiles[0].read_text().strip()
            require(re.fullmatch(r"[a-f0-9]{64}", container), "Invalid PostgreSQL container ID")
            deadline = time.monotonic() + 25
            while True:
                process = run(DOCKER + ["exec", container, "cat", "/proc/1/comm"])
                ready = run(DOCKER + ["exec", container, "pg_isready", "-U", "postgres"])
                if process.stdout.strip() == "postgres" and ready.returncode == 0:
                    break
                require(time.monotonic() < deadline, "Local PostgreSQL startup timed out")
                time.sleep(0.1)
            fixture(container)
            canonical = (ROOT / "migrations/021_deletion_progress_rpc.sql").read_text()
            before, execute = canonical.split("create or replace function public.execute_progress_cleanup(", 1)
            second_delete = "  delete from public.course_progress where user_id=v_plan.account_id;"
            require(execute.count(second_delete) == 1, "Expected one second deletion")
            require(execute.count("set statement_timeout = '30s'") == 1, "Expected canonical function timeout")
            execute = execute.replace("set statement_timeout = '30s'", "set statement_timeout = '150ms'")
            execute = execute.replace(second_delete,
                "  perform nextval('public.fixture_timeout_marker');\n  perform pg_catalog.pg_sleep(0.5);\n" + second_delete)
            sql(container, before + "create or replace function public.execute_progress_cleanup(" + execute,
                "Disposable timeout fixture")

            started = run(DOCKER + ["run", "--rm", "--pull=never", "-d", "--network", network,
                "--network-alias", "rest", "--cidfile", str(cidfiles[1]),
                "-e", "PGRST_DB_URI=postgresql://authenticator@database:5432/postgres",
                "-e", "PGRST_DB_SCHEMAS=public", "-e", "PGRST_DB_ANON_ROLE=service_role", IMAGE])
            require(started.returncode == 0, "Local PostgREST start failed; cache the official image first")
            rest = cidfiles[1].read_text().strip()
            require(re.fullmatch(r"[a-f0-9]{64}", rest), "Invalid PostgREST container ID")
            relay = loopback_relay(container)
            origin = "http://127.0.0.1:" + str(relay.server_address[1])
            ready_rest(origin)
            check(container, rest, origin, report)
            report["passed"] = True
        except AssertionError as error:
            report["error"] = str(error)
        except Exception as error:
            report["error"] = f"Local check interrupted: {type(error).__name__}"
        finally:
            if relay is not None:
                relay.shutdown()
                relay.server_close()
                report["loopback_relay_closed"] = True
            # Only container IDs and the network ID created by this invocation are removed.
            stopped = []
            for cidfile in reversed(cidfiles):
                owned = cidfile.read_text().strip() if cidfile.exists() else ""
                if re.fullmatch(r"[a-f0-9]{64}", owned):
                    result = run(DOCKER + ["stop", "--time", "1", owned])
                    stopped.append(result.returncode == 0 or "No such container" in result.stderr)
            report["owned_container_count"] = len(stopped)
            report["owned_containers_stopped"] = all(stopped)
            if re.fullmatch(r"[a-f0-9]{64}", network):
                report["owned_network_removed"] = run(DOCKER + ["network", "rm", network]).returncode == 0
            elif not network:
                report["owned_network_removed"] = True
            if not report["owned_containers_stopped"] or not report.get("owned_network_removed", False):
                report.update(passed=False, cleanup_error="Owned fixture cleanup could not be confirmed")
    if args.evidence:
        args.evidence.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, sort_keys=True))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
