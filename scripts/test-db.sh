#!/usr/bin/env bash
# Applies the Supabase migrations to a throwaway local Postgres and runs the
# row-level security checks. Needs PostgreSQL binaries (initdb, pg_ctl, psql).
set -euo pipefail

cd "$(dirname "$0")/.."

# Postgres refuses to run as root; hand over to the postgres user if needed.
if [ "$(id -u)" = 0 ] && id postgres >/dev/null 2>&1; then
  exec runuser -u postgres -- "$0" "$@"
fi
BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DATA="$(mktemp -d)"
PORT="${PG_PORT:-54329}"
trap '"$BIN/pg_ctl" -D "$DATA" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DATA"' EXIT

"$BIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
"$BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $DATA -c listen_addresses=''" -w start >/dev/null

PSQL=(psql -h "$DATA" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f supabase/tests/stub_auth.sql
for migration in supabase/migrations/*.sql; do
  "${PSQL[@]}" -f "$migration"
done
"${PSQL[@]}" -f supabase/tests/rls.sql
