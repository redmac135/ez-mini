# Blank page sync migration rehearsal

Run this only against an empty disposable database, never a shared or production database.
The following creates a temporary PostgreSQL 17.6 container with no network, using only
synthetic data. It does not connect to Supabase or mutate the host database:

```sh
docker run --rm --network none --user 100:101 \
  -v "$(pwd)/supabase:/fixture:ro" --entrypoint bash \
  public.ecr.aws/supabase/postgres:17.6.1.156 -ec '
    initdb -D /tmp/pgdata -A trust --no-instructions >/dev/null
    pg_ctl -D /tmp/pgdata -o "-k /tmp -c listen_addresses= -c unix_socket_permissions=0700" -l /tmp/pg.log start >/dev/null
    trap "pg_ctl -D /tmp/pgdata -m immediate stop >/dev/null" EXIT
    psql -h /tmp -U postgres -d postgres -f /fixture/tests/blank_page_sync_production_fixture.sql
  '
```

The fixture models the observed table, roles, full PostgreSQL 17 grants, default ACLs,
RLS, foreign key and timestamp trigger. It also exercises separately granted column
privileges. It runs the migration as `postgres` in a transaction and checks effective
grants, ownership, security-definer functions, direct access denial and RPC behavior.
For production rollout requirements and the sync contract, see the [API README](../../apps/api/README.md#api-shape).
