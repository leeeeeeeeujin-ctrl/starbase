#!/usr/bin/env python3
"""
Parse a Postgres URL and print shell assignments for eval.
Usage: python3 parse_supabase_db_url.py "<SUPABASE_DB_URL>"
Outputs: PGUSER='...';PGPASSWORD='...';PGHOST='...';PGPORT='...';PGDATABASE='...'
"""
import sys
from urllib.parse import urlparse

def main():
    if len(sys.argv) < 2:
        return
    u = sys.argv[1]
    if not u:
        return
    p = urlparse(u)
    user = p.username or ""
    password = p.password or ""
    host = p.hostname or ""
    port = p.port or 5432
    dbname = (p.path.lstrip('/') or 'postgres')
    # print shell assignments for eval
    print(f"PGUSER='{user}';PGPASSWORD='{password}';PGHOST='{host}';PGPORT='{port}';PGDATABASE='{dbname}'")

if __name__ == '__main__':
    main()
