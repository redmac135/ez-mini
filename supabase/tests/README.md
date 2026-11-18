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
It is a rehearsal, not a substitute for checking the target catalog, role memberships,
function ownership, grants, policies and schema drift immediately before rollout.
Privileged roles and owners remain able to bypass the protocol and require a separate
writer audit.

The migration is not backward compatible with the legacy API: its direct reads and
writes stop working. Rollout requires a verified backup and coordinated deployment of
the revision-aware API and frontend, including a plan for preserving offline drafts
and handling mixed versions. After revisioned writes begin, do not restore legacy
grants or API writes: they bypass CAS and the change feed. Prefer a reviewed,
data-preserving forward repair. Production migration and deployment require separate
approval.
