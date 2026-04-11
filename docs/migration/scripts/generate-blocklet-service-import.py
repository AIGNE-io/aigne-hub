#!/usr/bin/env python3
"""
Generate dry-run import SQL for migrating a source Blocklet Server's auth data
into a blocklet-service-* CF Worker D1 database.

Scope (fixed by this migration task):
  users               INSERT OR IGNORE   (global PK; avatar forced to NULL so
                                          bn:// refs don't create broken links)
  connected_accounts  INSERT OR IGNORE   (global PK)
  memberships         INSERT OR IGNORE   (from source passports where
                                          issuer.id = <source_instance_did>, one
                                          row per user_did, highest rank wins;
                                          written with instance_did = <target>)

Source vs target instance_did:
  --source-instance-did   the site DID used to *filter* source passports
                          (= the source Blocklet Server's own site DID; derived
                          from APP_PSK when the hub's SK was rotated).
  --target-instance-did   the site DID used to *write* memberships on CF
                          (= the CF station DID currently running in
                          blocklet-service-*; derived from APP_SK).
  The two values differ whenever CF is a fresh station (not a hard identity
  continuation of the source). When they are equal, pass the same value to
  both flags.

Skipped on purpose:
  access_policies     — connect-cloudflare migration 0004_seed_policies.sql already
                        seeds the same 4 built-in policies (public / invited-only /
                        admin-only / owner-only).
  security_rules      — only the 'default' rule is portable (also seeded by 0004);
                        the component-specific rules reference blocklet-server
                        component DIDs that don't exist on CF.
  access_keys         — source has 0 rows.
  audit_logs          — source table does not exist in this dataset.
  invitations         — not in scope.

Usage:
  python3 docs/migration/scripts/generate-blocklet-service-import.py \\
      --source migration-backups/source/blocklet-zNKWm5HBg.db \\
      --source-instance-did zNKWm5HBgaTLptTZBzjHo6PPFAp8X3n8pabY \\
      --target-instance-did zNKti3S7gEFuvJVbxjtQTQAzUm1fNKPfNzTq \\
      --out-dir migration-backups

The script creates migration-backups/<ISO-UTC-timestamp>-staging/ and writes:
  - blocklet-service-auth-import.sql
  - row-counts.txt
  - README.md   (how to apply the dry-run, verification commands)

The generated SQL is NOT executed. This script writes files only.
"""

import argparse
import datetime as dt
import json
import os
import sqlite3
import sys
from pathlib import Path


# Rank used to dedupe overlapping passport roles for a single user_did.
# Higher = more privileged; owner wins over admin wins over everything else.
ROLE_RANK = {
    "owner": 5,
    "admin": 4,
    "member": 3,
    "email": 2,
    "guest": 1,
}


def sql_literal(value):
    """Render a Python value as a SQLite literal (NULL / integer / quoted string)."""
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, (bytes, bytearray)):
        return "x'" + value.hex() + "'"
    return "'" + str(value).replace("'", "''") + "'"


def build_insert_or_ignore(table, columns, rows):
    """Return a list of INSERT OR IGNORE statements, one per row."""
    stmts = []
    col_list = ", ".join(columns)
    for row in rows:
        values = ", ".join(sql_literal(row.get(c)) for c in columns)
        stmts.append(f"INSERT OR IGNORE INTO {table} ({col_list}) VALUES ({values});")
    return stmts


def fetch_users(conn):
    """Return source users with avatar blanked (bn:// refs aren't usable on CF)."""
    rows = conn.execute("SELECT * FROM users").fetchall()
    users = []
    for row in rows:
        d = dict(row)
        d["avatar"] = None  # bn://avatar/... -> deterministic avatar on CF
        if not d.get("pk"):
            d["pk"] = ""  # target schema: NOT NULL DEFAULT ''
        users.append(d)
    return users


def fetch_connected_accounts(conn):
    return [dict(r) for r in conn.execute("SELECT * FROM connected_accounts").fetchall()]


def build_memberships(conn, source_instance_dids, target_instance_did):
    """
    Source passports are stored with issuer = JSON blob.  Only passports whose
    issuer.id matches any of source_instance_dids (= source site DIDs — there
    can be more than one if the same blocklet was re-registered, SK was
    rotated, or an older 'staging' instance lived alongside the current one)
    become memberships.

    If a user has multiple valid passports across any of these source
    instances (e.g. 'owner' here + 'email' there, or both 'owner' and 'admin'
    on the same instance), keep the highest-ranked one.

    Memberships are written with instance_did = target_instance_did, which is
    the *CF* station DID (may differ from any source site DID when CF runs a
    fresh station under a rotated APP_SK).
    """
    if source_instance_dids:
        placeholders = ",".join("?" * len(source_instance_dids))
        sql = f"""
          SELECT userDid, role, firstLoginAt, issuanceDate
            FROM passports
           WHERE json_extract(issuer, '$.id') IN ({placeholders})
             AND status = 'valid'
        """
        rows = [dict(r) for r in conn.execute(sql, tuple(source_instance_dids)).fetchall()]
    else:
        # Runbook default: no issuer filter — the whole blocklet.db is one site.
        sql = """
          SELECT userDid, role, firstLoginAt, issuanceDate
            FROM passports
           WHERE status = 'valid'
        """
        rows = [dict(r) for r in conn.execute(sql).fetchall()]
    by_user = {}
    for row in rows:
        user_did = row["userDid"]
        rank = ROLE_RANK.get(row["role"], 0)
        existing = by_user.get(user_did)
        if existing is None or rank > existing["_rank"]:
            by_user[user_did] = {
                "_rank": rank,
                "user_did": user_did,
                "instance_did": target_instance_did,
                "role": row["role"],
                "invited_by": None,
                "joined_at": row["firstLoginAt"] or row["issuanceDate"] or dt.datetime.utcnow().isoformat(),
            }
    memberships = []
    for m in by_user.values():
        m.pop("_rank", None)
        memberships.append(m)
    memberships.sort(key=lambda m: (m["role"], m["user_did"]))
    return memberships, len(rows)


# Column lists — must match @arcblock/did-connect-cloudflare D1 schema
# (node_modules/@arcblock/did-connect-cloudflare/migrations/0001_*.sql + 0002_*.sql).
USERS_COLUMNS = [
    "did", "pk", "fullName", "email", "avatar", "role", "remark", "sourceProvider",
    "locale", "approved", "extra", "firstLoginAt", "lastLoginAt", "lastLoginIp",
    "createdAt", "updatedAt", "sourceAppPid", "didSpace", "url", "phone",
    "inviter", "generation", "emailVerified", "phoneVerified", "passkeyCount",
    "metadata", "address",
]

CONNECTED_ACCOUNTS_COLUMNS = [
    "did", "pk", "userDid", "provider", "id", "firstLoginAt", "lastLoginAt",
    "lastLoginIp", "userInfo", "extra", "counter",
]

MEMBERSHIPS_COLUMNS = [
    "user_did", "instance_did", "role", "invited_by", "joined_at",
]


def write_sql_file(out_path, *, users, cas, memberships, source_path, source_instance_dids, target_instance_did, passport_total):
    filter_desc = (", ".join(source_instance_dids) if source_instance_dids
                   else "(none — take all valid passports, runbook default)")
    lines = []
    lines.append("-- AIGNE Hub auth migration into blocklet-service-staging D1 (dry-run output)")
    lines.append(f"-- Source DB:           {source_path}")
    lines.append(f"-- Source filter:       {filter_desc}")
    lines.append(f"-- Target instance:     {target_instance_did}  (CF station DID; memberships written with this)")
    lines.append(f"-- Generated:           {dt.datetime.utcnow().isoformat()}Z")
    lines.append(f"-- Users:               {len(users)}")
    lines.append(f"-- Connected accounts:  {len(cas)}")
    lines.append(f"-- Memberships:         {len(memberships)} (from {passport_total} source passports for this source instance)")
    lines.append("-- Strategy:            INSERT OR IGNORE (non-destructive, safe to re-run)")
    lines.append("-- Note: D1 rejects BEGIN TRANSACTION / COMMIT in `wrangler d1 execute --remote`")
    lines.append("--       ('use state.storage.transaction() ... instead'). Each INSERT OR IGNORE")
    lines.append("--       is individually atomic and the whole file is idempotent, so wrapping")
    lines.append("--       these inserts in an explicit transaction would add no safety.")
    lines.append("")
    lines.append(f"-- users ({len(users)})")
    lines.extend(build_insert_or_ignore("users", USERS_COLUMNS, users))
    lines.append("")
    lines.append(f"-- connected_accounts ({len(cas)})")
    lines.extend(build_insert_or_ignore("connected_accounts", CONNECTED_ACCOUNTS_COLUMNS, cas))
    lines.append("")
    lines.append(f"-- memberships ({len(memberships)})")
    lines.extend(build_insert_or_ignore("memberships", MEMBERSHIPS_COLUMNS, memberships))
    lines.append("")
    out_path.write_text("\n".join(lines))


def write_row_counts(out_path, *, users, cas, memberships, passport_total, source_instance_dids, target_instance_did, source_path):
    filter_desc = (", ".join(source_instance_dids) if source_instance_dids
                   else "(none — take all valid passports, runbook default)")
    lines = [
        f"Source DB:        {source_path}",
        f"Source filter:    {filter_desc}",
        f"Target instance:  {target_instance_did}  (written as memberships.instance_did)",
        "",
        "Tables to import (INSERT OR IGNORE):",
        f"  users               {len(users)}",
        f"  connected_accounts  {len(cas)}",
        f"  memberships         {len(memberships)}  (from {passport_total} source passports, deduped owner>admin>member>email>guest)",
        "",
        "Tables intentionally skipped:",
        "  access_policies     connect-cloudflare 0004_seed_policies already provides the 4 defaults",
        "  security_rules      only 'default' is portable (already seeded); component-specific rules don't apply on CF",
        "  access_keys         source has 0 rows",
        "  audit_logs          source does not have this table",
        "  invitations         out of scope",
        "",
        "Membership detail:",
    ]
    for m in memberships:
        lines.append(f"  {m['role']:<7} {m['user_did']}")
    out_path.write_text("\n".join(lines) + "\n")


def write_readme(out_path, *, sql_file, source_instance_dids, target_instance_did):
    if source_instance_dids:
        source_label = "`" + "`, `".join(source_instance_dids) + "`"
        source_line = f"{source_label} | Source site DID(s) used to **filter** passports via `json_extract(issuer, '$.id') IN (...)`."
    else:
        source_line = "_(none — runbook default: take all valid passports regardless of issuer)_ | `blocklet.db` is a site-level auth store; all passports in it belong to that site."
    body = f"""# Dry-run: AIGNE Hub -> blocklet-service-staging auth migration

Generated by `docs/migration/scripts/generate-blocklet-service-import.py`.

## Source vs target instance

| | DID | Role |
|---|---|---|
| source | {source_line} |
| target | `{target_instance_did}`  | Current CF station DID under `blocklet-service-staging`. Used to **write** `memberships.instance_did`. |

The target CF station is shared by all three business workers (aigne-hub,
media-kit, payment-kit) via Service Binding, so any membership written here
grants access to all three.

## What this writes

`{sql_file.name}` — a single transaction that uses `INSERT OR IGNORE` for:

- `users` (global PK; avatar set to NULL because source uses `bn://avatar/*` which
  is not resolvable on CF Workers — deterministic avatar takes over)
- `connected_accounts` (global PK)
- `memberships` (one row per `user_did`, highest rank wins when a user has multiple
  source passports; `instance_did` is rewritten from source to target)

## What is NOT in the SQL

| Table | Why skipped |
|---|---|
| `access_policies` | `connect-cloudflare` migration `0004_seed_policies.sql` already seeds the 4 default policies |
| `security_rules` | Only `default` is portable; the other rows reference component DIDs that don't exist on CF |
| `access_keys` | Source has 0 rows |
| `audit_logs` | Source does not have this table |
| `invitations` | Out of scope for this task |
| `settings` | Already populated for target `{target_instance_did}` by the existing CF station (app:sk / app:psk / app:ek / app:name / app:branding) |

## How to apply (manual, only after review)

```bash
# 1. Confirm the target D1 binding name (already verified: blocklet-service-staging)
wrangler d1 list

# 2. Snapshot current state BEFORE applying (safety.snapshot contract):
SNAP=migration-backups/$(date -u +%Y%m%dT%H%M%SZ)-staging-before
mkdir -p "$SNAP"
for t in users connected_accounts memberships; do
  wrangler d1 execute blocklet-service-staging --remote \\
    --command "SELECT * FROM $t" --json > "$SNAP/before-$t.json"
done

# 3. Remote apply (idempotent thanks to INSERT OR IGNORE):
wrangler d1 execute blocklet-service-staging --remote \\
  --file={sql_file.name}

# 4. Verify row counts:
wrangler d1 execute blocklet-service-staging --remote \\
  --command "SELECT 'users' AS t, COUNT(*) FROM users
             UNION ALL SELECT 'connected_accounts', COUNT(*) FROM connected_accounts
             UNION ALL SELECT 'memberships@target', COUNT(*) FROM memberships
               WHERE instance_did='{target_instance_did}'"

# 5. Spot-check one owner user is queryable by session logic:
wrangler d1 execute blocklet-service-staging --remote \\
  --command "SELECT u.did, u.fullName, m.role
               FROM users u
               JOIN memberships m ON m.user_did = u.did
              WHERE m.instance_did='{target_instance_did}' AND m.role='owner'"
```

## Rollback

Because the SQL is pure `INSERT OR IGNORE`, running it twice is a no-op on the
rows that already exist. If any newly inserted row needs to be removed, use the
snapshot captured in step 2 above to compute a targeted DELETE with explicit
`safety.allow_destructive_d1_sql=true`.
"""
    out_path.write_text(body)


def parse_args():
    p = argparse.ArgumentParser(description="Generate dry-run auth migration SQL")
    p.add_argument("--source", required=True, help="path to source blocklet.db")
    p.add_argument(
        "--source-instance-did",
        nargs="*",
        default=[],
        help="source site DID(s) to filter passports on issuer.id. Pass zero "
             "values (omit the flag) to take ALL valid passports regardless of "
             "issuer — this is the runbook default because blocklet.db is a "
             "site-level auth store and all its passports belong to that site.",
    )
    p.add_argument(
        "--target-instance-did",
        required=True,
        help="target CF station DID; written as memberships.instance_did. Pass "
             "the same value as --source-instance-did for hard identity continuity.",
    )
    p.add_argument("--out-dir", default="migration-backups", help="parent dir for the timestamped output folder")
    p.add_argument("--env", default="staging", help="environment tag used in the output folder name")
    return p.parse_args()


def main():
    args = parse_args()
    source_path = Path(args.source).resolve()
    if not source_path.exists():
        print(f"ERROR: source DB not found: {source_path}", file=sys.stderr)
        sys.exit(1)

    ts = dt.datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    out_dir = Path(args.out_dir) / f"{ts}-{args.env}"
    out_dir.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(f"file:{source_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row

    users = fetch_users(conn)
    cas = fetch_connected_accounts(conn)
    memberships, passport_total = build_memberships(
        conn, args.source_instance_did, args.target_instance_did
    )

    sql_file = out_dir / "blocklet-service-auth-import.sql"
    write_sql_file(
        sql_file,
        users=users,
        cas=cas,
        memberships=memberships,
        source_path=source_path,
        source_instance_dids=args.source_instance_did,
        target_instance_did=args.target_instance_did,
        passport_total=passport_total,
    )
    write_row_counts(
        out_dir / "row-counts.txt",
        users=users,
        cas=cas,
        memberships=memberships,
        passport_total=passport_total,
        source_instance_dids=args.source_instance_did,
        target_instance_did=args.target_instance_did,
        source_path=source_path,
    )
    write_readme(
        out_dir / "README.md",
        sql_file=sql_file,
        source_instance_dids=args.source_instance_did,
        target_instance_did=args.target_instance_did,
    )

    print(f"Wrote {sql_file}")
    print(f"Wrote {out_dir / 'row-counts.txt'}")
    print(f"Wrote {out_dir / 'README.md'}")
    print()
    source_disp = (", ".join(args.source_instance_did) if args.source_instance_did
                   else "(all passports, no filter)")
    print(f"Source filter:       {source_disp}")
    print(f"Target instance:     {args.target_instance_did}")
    print(f"Users:               {len(users)}")
    print(f"Connected accounts:  {len(cas)}")
    print(f"Memberships:         {len(memberships)}  (from {passport_total} source passports)")


if __name__ == "__main__":
    main()
