#!/usr/bin/env python3
"""Run SQL against local Supabase/Postgres using local SPPP config.

Usage examples:
  python tools/run_sql.py --file assistant-sql/examples/select_version.sql
  python tools/run_sql.py --sql "SELECT now();"

This script reads connection info from `ai-roomchat/SPPP` by default (must be local and git-ignored).
It will write results to assistant-sql/results.json (overwritten).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from typing import Optional

DEFAULT_SPPP = os.path.join("ai-roomchat", "SPPP")
DEFAULT_OUTPUT = os.path.join("assistant-sql", "results.json")


def parse_sppp(path: str) -> dict:
    """Parse ai-roomchat/SPPP file for URL and password.
    Expected lines include the supabase URL (https://...) and a line like '비밀번호: <password>'
    Returns a dict with keys: host, port, dbname, user, password
    """
    if not os.path.exists(path):
        raise FileNotFoundError(f"SPPP file not found: {path}")
    with open(path, "r", encoding="utf-8") as f:
        txt = f.read()

    # Find URL
    m_url = re.search(r"https?://[0-9a-zA-Z.-]+", txt)
    if not m_url:
        raise ValueError("Could not find Supabase URL in SPPP file")
    url = m_url.group(0)
    host = url.split("//", 1)[1]
    # default postgres port
    port = 5432

    # Find password line (Korean label or 'password')
    m_pw = re.search(r"비밀번호\s*[:：]\s*(\S+)", txt)
    if not m_pw:
        m_pw = re.search(r"password\s*[:：]\s*(\S+)", txt, re.I)
    if not m_pw:
        raise ValueError("Could not find password in SPPP file")
    password = m_pw.group(1).strip()

    return {
        "host": host,
        "port": port,
        "dbname": "postgres",
        "user": "postgres",
        "password": password,
        "url": url,
    }


def run_query(conn_info: dict, sql: str):
    """Execute SQL and return list of rows (as dicts) and column names."""
    try:
        import psycopg
    except Exception as e:
        raise RuntimeError("psycopg not installed. Please run: python -m pip install -r tools/requirements.txt") from e

    # Use SSL (required by Supabase) and reasonable connect timeout
    dsn = (
        f"postgresql://{conn_info['user']}:{conn_info['password']}@{conn_info['host']}:{conn_info['port']}/"
        f"{conn_info['dbname']}?sslmode=require&connect_timeout=10"
    )
    # connect and execute
    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            try:
                cols = [d.name for d in cur.description] if cur.description else []
                rows = cur.fetchall() if cur.description else []
            except Exception:
                # no results (e.g., DDL)
                cols = []
                rows = []
    # convert rows to list of dicts
    results = [dict(zip(cols, r)) for r in rows]
    return {"columns": cols, "rows": results}


def ensure_dirs(path: str):
    d = os.path.dirname(path)
    if d and not os.path.exists(d):
        os.makedirs(d, exist_ok=True)


def main(argv: Optional[list[str]] = None) -> int:
    p = argparse.ArgumentParser()
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--file", help="SQL file to execute")
    g.add_argument("--sql", help="SQL string to execute")
    p.add_argument("--sppp", default=DEFAULT_SPPP, help="Path to local SPPP file (default: ai-roomchat/SPPP)")
    p.add_argument("--out", default=DEFAULT_OUTPUT, help="Output JSON file (default: assistant-sql/results.json)")
    p.add_argument("--db-host", help="Override DB host (useful when using SSH tunnel, e.g. localhost)")
    p.add_argument("--db-port", type=int, help="Override DB port (useful when using SSH tunnel, e.g. 5433)")
    p.add_argument("--db-user", help="Override DB user (e.g. postgres.jvopmawzszamguydylwu)")
    p.add_argument("--db-name", help="Override DB name (default: postgres)")
    args = p.parse_args(argv)

    try:
        conn_info = parse_sppp(args.sppp)
    except Exception as e:
        print("Error reading SPPP config:", e, file=sys.stderr)
        return 2

    # allow overriding host/port (useful when connecting via local SSH tunnel)
    if args.db_host:
        conn_info['host'] = args.db_host
    if args.db_port:
        conn_info['port'] = args.db_port
    if getattr(args, 'db_user', None):
        conn_info['user'] = args.db_user
    if getattr(args, 'db_name', None):
        conn_info['dbname'] = args.db_name

    if args.file:
        if not os.path.exists(args.file):
            print("SQL file not found:", args.file, file=sys.stderr)
            return 3
        with open(args.file, "r", encoding="utf-8") as f:
            sql = f.read()
    else:
        sql = args.sql

    # run
    try:
        result = run_query(conn_info, sql)
    except Exception as e:
        print("Error running query:", e, file=sys.stderr)
        return 4

    ensure_dirs(args.out)
    with open(args.out, "w", encoding="utf-8") as f:
        # Some Postgres types (datetime, Decimal, UUID, etc.) are not JSON serializable
        # by default. Use `default=str` to stringify those values so the tool can write
        # general query results without raising TypeError.
        json.dump({"meta": {"source": conn_info.get("url")}, "result": result}, f, indent=2, ensure_ascii=False, default=str)

    print("Wrote results to", args.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
