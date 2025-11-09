#!/usr/bin/env python3
"""HTTP-based SQL runner for Supabase (table-level queries via REST)

This script uses the service_role key (or anon key if present) found in `ai-roomchat/SPPP`.
It performs table-level SELECTs using the PostgREST endpoints (GET /rest/v1/<table>?select=...).

Note: This does NOT execute raw SQL. Use `tools/run_sql.py` (Postgres) if you have direct DB access.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from typing import Optional

import requests

DEFAULT_SPPP = os.path.join("ai-roomchat", "SPPP")
DEFAULT_OUTPUT = os.path.join("assistant-sql", "results.json")


def parse_sppp_for_http(path: str) -> dict:
    if not os.path.exists(path):
        raise FileNotFoundError(f"SPPP file not found: {path}")
    with open(path, "r", encoding="utf-8") as f:
        txt = f.read()
    # Normalize lines
    lines = [l.strip() for l in txt.splitlines() if l.strip()]
    if not lines:
        raise ValueError("SPPP file is empty")

    # Try detect URL-first format (some files have URL on first line, key on second)
    url_regex = re.compile(r"https?://[0-9a-zA-Z.-]+")
    first = lines[0]
    url = None
    key = None

    if url_regex.search(first):
        url = url_regex.search(first).group(0).rstrip('/')
        # key may be on second line
        if len(lines) >= 2:
            key = lines[1]
        else:
            # try find any JWT-like token in the whole file
            m = re.search(r"[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+", txt)
            if m:
                key = m.group(0)
    else:
        # old behavior: first non-empty line is key, find URL anywhere
        key = first
        m = url_regex.search(txt)
        if m:
            url = m.group(0).rstrip('/')

    if not url:
        raise ValueError("Could not find Supabase URL in SPPP file")
    if not key:
        raise ValueError("Could not find Supabase key/token in SPPP file")

    return {"url": url, "key": key}


def run_table_query(base_url: str, key: str, table: str, select: str = "*", filters: Optional[str] = None):
    """
    Perform a REST request against the PostgREST endpoint for `table`.

    This helper originally performed GET/select. We keep that behaviour but
    allow callers to use the `requests` API for POST/PATCH/DELETE when a body
    is provided and `allow_write` is explicitly granted by the caller.
    """
    endpoint = f"{base_url}/rest/v1/{table}"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
    }
    params = {"select": select} if select else {}

    # The caller will choose the HTTP method and provide data as needed.
    # This function will not itself enforce write-safety; the CLI wrapper
    # must only call write methods when explicitly allowed.
    resp = requests.get(endpoint, headers=headers, params=params, timeout=15)
    resp.raise_for_status()
    return resp.json()


def run_request(base_url: str, key: str, table: str, method: str = "GET", select: str = "*", filters: Optional[str] = None, body: Optional[dict] = None):
    endpoint = f"{base_url}/rest/v1/{table}"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }

    # build params for GET/select or append filters for other methods
    params = {}
    if method.upper() == "GET":
        params = {"select": select}
        if filters:
            # requests will encode params correctly
            # append filters by adding them to query string manually
            url = endpoint + "?" + filters + f"&select={select}"
            resp = requests.get(url, headers=headers, timeout=15)
        else:
            resp = requests.get(endpoint, headers=headers, params=params, timeout=15)
    else:
        # For write methods, allow filters to be included in querystring
        url = endpoint
        if filters:
            url = endpoint + "?" + filters
        # Use requests.request to support POST/PATCH/DELETE etc.
        resp = requests.request(method.upper(), url, headers=headers, json=body, timeout=15)

    resp.raise_for_status()

    # Try to return parsed JSON if possible, otherwise return raw text
    try:
        return resp.json()
    except ValueError:
        return resp.text


def ensure_dirs(path: str):
    d = os.path.dirname(path)
    if d and not os.path.exists(d):
        os.makedirs(d, exist_ok=True)


def main(argv: Optional[list[str]] = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--table", help="Table name to query (required)")
    p.add_argument("--select", default="*", help="Columns to select (default '*')")
    p.add_argument("--filters", help="Optional PostgREST filters, e.g. 'id=eq.1' or 'name=like.*john*' (no leading '?')")
    p.add_argument("--method", default="GET", help="HTTP method to use (GET, POST, PATCH, DELETE). Writes require --allow-write")
    p.add_argument("--body", help="JSON body for write requests (inline JSON string)")
    p.add_argument("--body-file", help="Path to JSON file to use as request body")
    p.add_argument("--allow-write", action="store_true", help="Explicitly allow POST/PATCH/DELETE operations (dangerous)")
    p.add_argument("--sppp", default=DEFAULT_SPPP, help="Path to local SPPP file (default: ai-roomchat/SPPP)")
    p.add_argument("--out", default=DEFAULT_OUTPUT, help="Output JSON file (default: assistant-sql/results.json)")
    args = p.parse_args(argv)

    if not args.table:
        print("--table is required for HTTP-based queries", file=sys.stderr)
        return 2

    try:
        cfg = parse_sppp_for_http(args.sppp)
    except Exception as e:
        print("Error reading SPPP:", e, file=sys.stderr)
        return 3

    method = (args.method or "GET").upper()

    # refuse to do writes unless explicitly allowed
    if method != "GET" and not args.allow_write:
        print("Write methods (POST/PATCH/DELETE) require --allow-write flag", file=sys.stderr)
        return 5

    # prepare body if provided
    body = None
    if args.body_file:
        if not os.path.exists(args.body_file):
            print("--body-file not found:", args.body_file, file=sys.stderr)
            return 6
        # Accept files that may contain a UTF-8 BOM by using utf-8-sig
        with open(args.body_file, "r", encoding="utf-8-sig") as bf:
            body = json.load(bf)
    elif args.body:
        try:
            body = json.loads(args.body)
        except Exception as e:
            print("--body must be valid JSON:", e, file=sys.stderr)
            return 7

    try:
        if method == "GET":
            res = run_request(cfg["url"], cfg["key"], args.table, method=method, select=args.select, filters=args.filters)
        else:
            res = run_request(cfg["url"], cfg["key"], args.table, method=method, select=args.select, filters=args.filters, body=body)
    except Exception as e:
        print("HTTP query error:", e, file=sys.stderr)
        return 4

    ensure_dirs(args.out)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump({"meta": {"source": cfg["url"], "table": args.table, "method": method}, "result": res}, f, indent=2, ensure_ascii=False)

    print("Wrote results to", args.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
