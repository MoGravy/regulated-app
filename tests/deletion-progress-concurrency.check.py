#!/usr/bin/env python3
"""Native PostgreSQL checks of the deployed cleanup RPC and concurrent writes."""

import argparse
import json
import re
import select
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCKER = ["docker", "--host", "unix:///Users/matthew/.docker/run/docker.sock"]
ACCOUNT = "00000000-0000-4000-8000-000000000001"
OTHER = "00000000-0000-4000-8000-000000000002"
RECEIPT = "00000000-0000-4000-8000-000000000011"
RESOURCES = [
    ("user_progress", "program_day_id", "00000000-0000-4000-8000-000000000022", "00000000-0000-4000-8000-000000000024"),
    ("course_progress", "lesson_id", "00000000-0000-4000-8000-000000000032", "00000000-0000-4000-8000-000000000033"),
]


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def run(args, **options):
    return subprocess.run(args, capture_output=True, text=True, timeout=30, **options)


def psql(container, label="probe"):
    return DOCKER + ["exec", "-i", container, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
                     "-U", "postgres", "-d", f"dbname=postgres application_name={label}"]


def sql(container, source, label="database check"):
    result = run(psql(container), input=source)
    require(result.returncode == 0, f"{label} failed")
    return result.stdout.strip()


class Session:
    def __init__(self, container, label):
        self.process = subprocess.Popen(psql(container, label), stdin=subprocess.PIPE,
                                        stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.buffer = b""

    def write(self, source):
        self.process.stdin.write(source.encode())
        self.process.stdin.flush()

    def ready(self, source):
        marker = ("ready_" + uuid.uuid4().hex).encode()
        self.write(source + "\n\\echo " + marker.decode() + "\n")
        deadline = time.monotonic() + 10
        while marker + b"\n" not in self.buffer:
            require(time.monotonic() < deadline, "Session synchronization timed out")
            readable, _, _ = select.select([self.process.stdout], [], [], 0.1)
            if readable:
                chunk = self.process.stdout.read1(65536)
                require(bool(chunk), "Session ended before synchronization")
                self.buffer += chunk
        output, self.buffer = self.buffer.split(marker + b"\n", 1)
        return output.decode().strip()

    def rejected(self):
        _, errors = self.process.communicate(timeout=10)
        require(self.process.returncode != 0 and b"Progress is unavailable" in errors,
                "Progress write was not refused by the freeze trigger")


def check(container, sessions, report):
    require(int(sql(container, "show server_version_num")) // 10000 == 16,
            "Expected PostgreSQL 16")
    sql(container, """
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
      create function auth.role() returns text language sql stable as $$select current_user::text$$;
      create table storage.buckets(id text primary key,name text,public boolean);
    """, "Supabase fixture stubs")
    files = ["supabase-schema.sql"] + ["migrations/" + name for name in [
        "001_auth_and_program.sql", "007_courses.sql", "009_care.sql",
        "008_account_deletion_requests.sql", "011_account_deletion_workflow.sql",
        "019_deletion_dispatch.sql", "020_deletion_progress.sql", "021_deletion_progress_rpc.sql",
    ]]
    for path in files:
        sql(container, (ROOT / path).read_text(), path)

    exported = run(["node", "--input-type=module", "-e",
                    "import {schemaInspectionSql} from './scripts/deletion-preflight.mjs';"
                    "process.stdout.write(schemaInspectionSql)"], cwd=ROOT)
    require(exported.returncode == 0, "schemaInspectionSql export failed")
    observed = json.loads(sql(container,
        "select coalesce(json_agg(s),'[]'::json) from (" + exported.stdout + ") s"))
    native_nulls = set(json.loads(sql(container, """
      select coalesce(json_agg('constraint:public.deletion_progress_plans.' || conname),'[]'::json)
      from pg_constraint where conrelid='public.deletion_progress_plans'::regclass and contype='n'
    """)))
    controls = [row for row in observed if row["object"] not in native_nulls and (
        "public.deletion_progress_plans" in row["object"] or row["object"] in {
            "function:public.guard_progress_plan()", "function:public.freeze_deleted_progress()",
            "trigger:public.user_progress.freeze_deleted_progress",
            "trigger:public.course_progress.freeze_deleted_progress"})]
    expected = json.loads((ROOT / "scripts/deletion-progress-schema.json").read_text())["objects"]
    expected_map = {row["object"]: {row["fingerprint"], *row.get("alternateFingerprints", [])}
                    for row in expected}
    observed_map = {row["object"]: row["fingerprint"] for row in controls}
    differences = sorted(name for name in expected_map.keys() | observed_map.keys()
                         if observed_map.get(name) not in expected_map.get(name, set()))
    report["schema_differences"] = differences
    report["control_count"] = len(controls)
    report["ledger_fingerprint"] = observed_map.get("relation:public.deletion_progress_plans")
    metadata_sql = exported.stdout.replace(
        "encode(sha256(convert_to(definition,'UTF8')),'hex') as fingerprint", "definition::jsonb as metadata"
    ).replace("from objects order by kind, name",
              "from objects where kind='relation' and name='public.deletion_progress_plans'")
    report["ledger_metadata"] = json.loads(sql(container,
        "select row_to_json(s) from (" + metadata_sql + ") s"))["metadata"]

    sql(container, f"""
      insert into auth.users(id) values ('{ACCOUNT}'),('{OTHER}');
      insert into public.account_deletion_requests(id,account_id) values ('{RECEIPT}','{ACCOUNT}');
      insert into public.care_links(client_id,practitioner_id,client_label,practitioner_label)
        values ('{ACCOUNT}','{OTHER}','fixture client','fixture practitioner');
      insert into public.care_messages(client_id,practitioner_id,sender_id,body)
        values ('{ACCOUNT}','{OTHER}','{ACCOUNT}','fixture clinical record');
      insert into public.sessions(id,title,category,duration)
        values ('00000000-0000-4000-8000-000000000023','fixture','sleep',10);
      insert into public.programs(id,slug,title)
        values ('00000000-0000-4000-8000-000000000021','fixture','fixture');
      insert into public.program_days(id,program_id,week,day)
        values ('{RESOURCES[0][2]}','00000000-0000-4000-8000-000000000021',1,1),
               ('{RESOURCES[0][3]}','00000000-0000-4000-8000-000000000021',1,2);
      insert into public.courses(id,slug,title)
        values ('00000000-0000-4000-8000-000000000031','fixture','fixture');
      insert into public.course_lessons(id,course_id,title,position)
        values ('{RESOURCES[1][2]}','00000000-0000-4000-8000-000000000031','fixture',1),
               ('{RESOURCES[1][3]}','00000000-0000-4000-8000-000000000031','fixture',2);
    """, "Synthetic records")
    for table, column, first, _ in RESOURCES:
        sql(container, f"insert into public.{table}(user_id,{column}) values ('{ACCOUNT}','{first}'),('{OTHER}','{first}')")
    protected = """select jsonb_build_object(
      'auth',(select jsonb_agg(to_jsonb(t) order by id) from auth.users t),
      'care_links',(select jsonb_agg(to_jsonb(t) order by client_id,practitioner_id) from public.care_links t),
      'care_messages',(select jsonb_agg(to_jsonb(t) order by id) from public.care_messages t),
      'deadlines',(select jsonb_agg(jsonb_build_array(requested_at,review_due_at,ordinary_due_at,ordinary_state,held_state)
        order by id) from public.account_deletion_requests))"""
    before = sql(container, protected)

    old_readers = []
    pids = []
    for index in range(2):
        session = Session(container, f"old_snapshot_{index}")
        sessions.append(session)
        pids.append(int(session.ready("begin isolation level repeatable read; select pg_backend_pid();")))
        require(session.ready("select count(*) from public.deletion_progress_plans;") == "0",
                "Old snapshot must precede the plan")
        old_readers.append(session)

    plan = json.loads(sql(container, f"set role service_role; select public.prepare_progress_cleanup('{RECEIPT}');",
                          "Service-role prepare RPC"))
    require(plan["counts"] == {"user_progress": 1, "course_progress": 1} and plan["approved"] is False,
            "Prepare RPC must count only the selected progress and cannot approve")
    claim = json.loads(sql(container, "set role service_role; select row_to_json(c) from public.claim_deletion_requests(1) c;",
                           "Service-role claim"))
    require(claim["account_id"] == ACCOUNT and claim["request_id"] == RECEIPT, "Wrong fixture claim")
    sql(container, f"""
      update public.deletion_progress_plans set approved_at=now(),approved_by='fixture operator'
        where request_id='{RECEIPT}';
      update public.account_deletion_requests set reviewed_at=now(),reviewed_by='fixture operator'
        where id='{RECEIPT}';
    """, "Fixture approval")
    cleanup = Session(container, "progress_cleanup")
    sessions.append(cleanup)
    cleanup_pid = int(cleanup.ready("begin; select pg_backend_pid();"))
    pids.append(cleanup_pid)
    outcome = json.loads(cleanup.ready(f"""
      set local statement_timeout='20s';
      set local role service_role;
      select public.execute_progress_cleanup('{RECEIPT}','{ACCOUNT}',{claim['generation']},
        '{claim['lease_token']}','{plan['planHash']}');
    """))
    require(outcome == {"progressCleaned": True, "alreadyCleaned": False, "accountDeleted": False},
            "Execute RPC result must describe only the progress stage")
    report["service_role_rpc_cleanup"] = True
    writers = []
    for index, (table, column, first, _) in enumerate(RESOURCES):
        writer = Session(container, f"late_writer_{index}")
        sessions.append(writer)
        pids.append(int(writer.ready("select pg_backend_pid();")))
        writer.write(f"set statement_timeout='15s'; insert into public.{table}(user_id,{column}) values ('{ACCOUNT}','{first}');\n")
        writers.append(writer)
    require(len(set(pids)) == 5, "Concurrency check must use five independent sessions")
    deadline = time.monotonic() + 8
    while True:
        blocked = sql(container, f"""select count(distinct a.pid) from pg_stat_activity a
          join pg_locks l on l.pid=a.pid where a.application_name in ('late_writer_0','late_writer_1')
          and a.wait_event_type='Lock' and l.locktype='relation' and not l.granted
          and l.relation in ('public.user_progress'::regclass,'public.course_progress'::regclass)
          and {cleanup_pid}=any(pg_blocking_pids(a.pid))""")
        if blocked == "2":
            break
        require(time.monotonic() < deadline, "Late writers did not block on cleanup table locks")
        time.sleep(0.1)
    cleanup.ready("commit;")
    for writer in writers:
        writer.rejected()
    report["late_writers_blocked_then_rejected"] = 2

    for session, (table, column, first, _) in zip(old_readers, RESOURCES):
        require(session.ready("select count(*) from public.deletion_progress_plans;") == "0",
                "Repeatable-read snapshot unexpectedly saw the new plan")
        session.write(f"insert into public.{table}(user_id,{column}) values ('{ACCOUNT}','{first}');\n")
        session.rejected()
    report["pre_plan_snapshots_rejected"] = 2

    for table, column, _, second in RESOURCES:
        require(sql(container, f"select count(*) from public.{table} where user_id='{ACCOUNT}'") == "0",
                f"Deleted account recreated {table}")
        sql(container, f"""update public.{table} set completed_at=now() where user_id='{OTHER}';
          insert into public.{table}(user_id,{column}) values ('{OTHER}','{second}');""")
        require(sql(container, f"select count(*) from public.{table} where user_id='{OTHER}'") == "2",
                f"Other account cannot write {table}")
    require(sql(container, protected) == before, "Care, Auth or request deadlines/states changed")
    report.update(other_account_writes=True, protected_records_unchanged=True)
    require(not differences, "Control fingerprints differ: " + ", ".join(differences))
    require(len(controls) == 14 and [row["object"] for row in controls] == [row["object"] for row in expected],
            "Expected 14 ordered migration controls")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence", type=Path)
    args = parser.parse_args()
    report = {"scope": "local PostgreSQL 16 cleanup RPC, locks, triggers and schema; no live API", "passed": False}
    sessions = []
    with tempfile.TemporaryDirectory(prefix="regulated-progress-check-") as scratch:
        cidfile = Path(scratch) / "container-id"
        try:
            started = run(DOCKER + ["run", "--rm", "--pull=never", "-d", "--network", "none",
                "--name", "regulated-progress-check-" + uuid.uuid4().hex[:12], "--cidfile", str(cidfile),
                "--tmpfs", "/var/lib/postgresql/data:rw,nosuid,nodev,size=256m",
                "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:16-alpine", "-c", "listen_addresses="])
            require(started.returncode == 0, "Could not start isolated local PostgreSQL")
            container = cidfile.read_text().strip()
            require(re.fullmatch(r"[a-f0-9]{64}", container), "Invalid owned container identifier")
            deadline = time.monotonic() + 25
            while True:
                process = run(DOCKER + ["exec", container, "cat", "/proc/1/comm"])
                ready = run(DOCKER + ["exec", container, "pg_isready", "-U", "postgres"])
                if process.stdout.strip() == "postgres" and ready.returncode == 0:
                    break
                require(time.monotonic() < deadline, "Local PostgreSQL startup timed out")
                time.sleep(0.2)
            check(container, sessions, report)
            report["passed"] = True
        except AssertionError as error:
            report["error"] = str(error)
        except Exception as error:
            report["error"] = f"Local check interrupted: {type(error).__name__}"
        finally:
            # Only the ID written by this invocation's docker run can be stopped.
            owned = cidfile.read_text().strip() if cidfile.exists() else ""
            if re.fullmatch(r"[a-f0-9]{64}", owned):
                stopped = run(DOCKER + ["stop", "--time", "1", owned])
                report["container_stopped"] = stopped.returncode == 0
                if stopped.returncode != 0:
                    report.update(passed=False, cleanup_error="Owned container could not be stopped")
            for session in sessions:
                if session.process.poll() is None:
                    session.process.kill()
                session.process.communicate()
    if args.evidence:
        args.evidence.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({key: value for key, value in report.items()
                      if key not in {"ledger_fingerprint", "ledger_metadata"}}, sort_keys=True))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
