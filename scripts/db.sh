#!/bin/bash
# Helper run inside WSL by deploy-once.ps1.
#   db.sh file <sql-path>   run a SQL file in a single transaction (stops at first error)
#   db.sh out  <sql-path>   run a SQL file and print plain rows (for queries)
#   db.sh dump <out-path>   gzip'd pg_dump of the whole postgres database
set -e
PSQL="docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1"
case "$1" in
  file) $PSQL --single-transaction -q < "$2" ;;
  out) $PSQL -At -q < "$2" ;;
  dump)
    mkdir -p "$(dirname "$2")"
    docker exec supabase-db pg_dump -U supabase_admin -d postgres --no-owner | gzip > "$2"
    ;;
  *) echo "usage: db.sh file|out|dump <path>" >&2; exit 2 ;;
esac
