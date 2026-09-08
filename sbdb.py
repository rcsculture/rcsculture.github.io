#!/usr/bin/env python3
"""Supabase DB dump / migrate tool that only needs `psycopg2-binary` and `requests`.

Works around the Supabase CLI TLS/cert problems by talking to Postgres directly
(psycopg2, sslmode=require so the CA is not verified) or, when the DB port is
blocked, by running SQL through the Supabase Management API over HTTPS (requests,
honouring the corporate proxy).

Commands
--------
    py sbdb.py                                          full dump of dev (shorthand)
    py sbdb.py dump    [--env dev]  [--out DIR] [--schema public|all] [--schema-only|--data-only] [--clean] [--include-auth] [--include-storage] [--include-config] [--include-all]
    py sbdb.py exec    [--env prod] --file PATH  [--yes]   PATH is a .sql file or a dump folder
    py sbdb.py query   [--env dev]  "SELECT ..."  [--json]
    py sbdb.py migrate [--from dev] [--to prod] [--out DIR] [--include-data] [--clean] [--include-auth] [--include-storage] [--include-config] [--include-all] [--yes]
    py sbdb.py config  [get|apply] [--env dev] [--out DIR | --file PATH] [--yes]
    py sbdb.py deploy-function [SLUG] [--env dev] [--path DIR] [--entrypoint index.ts] [--no-verify-jwt]
    py sbdb.py delete-user EMAIL_OR_ID [--env dev] [--yes]
    py sbdb.py update-email EMAIL_OR_ID NEW_EMAIL [--env dev] [--yes]

A dump is written as a folder of numbered fragments (00_session, 10_extensions,
20_types, 30_sequences, 40_functions, 50_tables, 60_data/<table>, 62_storage_buckets,
70_constraints, 75_indexes, 80_sequence_values, 85_views, 90_triggers, 95_policies,
96_storage_policies, 97_cron, 98_grants) plus, with --include-config, a
config/<name>.json holding the auth service config (site URL, redirect allow list,
email templates, sign-in settings, external providers). Auth config lives in the
Supabase Management API, not in SQL, so it needs the api backend / access token.
exec/migrate concatenate a folder's *.sql in name order inside one transaction;
config/*.json is applied separately via the Management API.

Backends (--backend, default: api)
    api  Supabase Management API via requests (needs SUPABASE_ACCESS_TOKEN)
    pg   direct Postgres connection via psycopg2

planetraves.env (next to this script) is loaded automatically; real environment
variables take precedence over it.

Environment variables
    # per environment ENV = DEV | PROD
    SUPABASE_<ENV>_PROJECT_ID        project ref (used to build the DB host and API URL)
    SUPABASE_<ENV>_DB_PASSWORD       database password           (pg backend)
    SUPABASE_<ENV>_DB_URL            full postgres URL, overrides everything below
    SUPABASE_<ENV>_DB_HOST           default: db.<ref>.supabase.co
    SUPABASE_<ENV>_DB_PORT           default: 5432
    SUPABASE_<ENV>_DB_USER           default: postgres
    SUPABASE_<ENV>_DB_NAME           default: postgres
    SUPABASE_SSLMODE                 default: require
    SUPABASE_ACCESS_TOKEN            personal access token       (api backend)

Secrets fall back to well-known stores:
    Windows credential 'planetraves.<env>.pwd'   DB password  (pg backend, via keyring)
    ~/.supabase/planetraves.token                access token (api backend)
    # proxy (reused for the api backend, same convention as spb.py)
    PROXY_HOST / PROXY_PORT / PROXY_USER  (password read from keyring)
    SPB_CA_BUNDLE                    path to a CA bundle for requests
    SPB_INSECURE=1                   disable TLS verification for requests
"""
import os
import sys
import argparse
import datetime
from urllib.parse import quote

SCHEMA_DEFAULT = "all"
BATCH = 500

# Management API config resources (fetched over HTTPS, absent from the SQL schema)
_CONFIG_ENDPOINTS = {"auth": "config/auth"}

# order in which constraints must be applied
_CONTYPE_ORDER = {"p": 0, "u": 1, "c": 2, "x": 3, "f": 4}

# Postgres / Supabase-managed schemas skipped by `--schema all`
_SYSTEM_SCHEMAS = {
    "information_schema", "auth", "storage", "realtime", "_realtime", "vault",
    "graphql", "graphql_public", "supabase_functions", "supabase_migrations",
    "extensions", "pgbouncer", "net", "cron", "pgsodium", "pgsodium_masks",
}


# -----------------------------------------------------------------------------
# Small helpers
# -----------------------------------------------------------------------------
def error(msg: str):
    print(f"\u274c {msg}", file=sys.stderr)


def success(msg: str):
    print(f"\u2705 {msg}")


def info(msg: str):
    print(f"   {msg}")


def warn(msg: str):
    print(f"\u26a0\ufe0f  {msg}")


def qi(name: str) -> str:
    """Quote an SQL identifier."""
    return '"' + name.replace('"', '""') + '"'


def qq(schema: str, name: str) -> str:
    return f"{qi(schema)}.{qi(name)}"


def lit(value) -> str:
    """SQL literal for a value already fetched as text (every column is cast ::text)."""
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def _looks_like_uuid(value: str) -> bool:
    import re
    return bool(re.fullmatch(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-"
                             r"[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", value))


# -----------------------------------------------------------------------------
# Backends
# -----------------------------------------------------------------------------
class PgBackend:
    """Direct Postgres connection through psycopg2."""

    def __init__(self, env: str):
        import psycopg2  # imported lazily so the api backend works without it

        self.name = "pg"
        cfg = self._config(env)
        self._conn = psycopg2.connect(**cfg)
        self._conn.autocommit = True

    @staticmethod
    def _config(env: str) -> dict:
        e = env.upper()
        url = os.environ.get(f"SUPABASE_{e}_DB_URL")
        if url:
            return {"dsn": url, "sslmode": os.environ.get("SUPABASE_SSLMODE", "require")}

        ref = os.environ.get(f"SUPABASE_{e}_PROJECT_ID")
        password = (
            os.environ.get(f"SUPABASE_{e}_DB_PASSWORD")
            or _keyring_password(f"planetraves.{env.lower()}.pwd")
        )
        host = os.environ.get(f"SUPABASE_{e}_DB_HOST") or (f"db.{ref}.supabase.co" if ref else None)

        if not host or not password:
            raise SystemExit(
                f"missing DB connection info for {e}: set SUPABASE_{e}_DB_URL, "
                f"SUPABASE_{e}_DB_PASSWORD, or a Windows credential 'planetraves.{env.lower()}.pwd'"
            )

        return {
            "host": host,
            "port": os.environ.get(f"SUPABASE_{e}_DB_PORT", "5432"),
            "user": os.environ.get(f"SUPABASE_{e}_DB_USER", "postgres"),
            "dbname": os.environ.get(f"SUPABASE_{e}_DB_NAME", "postgres"),
            "password": password,
            "sslmode": os.environ.get("SUPABASE_SSLMODE", "require"),
            "connect_timeout": 15,
        }

    def fetch(self, sql: str):
        with self._conn.cursor() as cur:
            cur.execute(sql)
            if cur.description is None:
                return []
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]

    def execute_script(self, sql: str):
        # autocommit is on; the script controls its own BEGIN/COMMIT
        with self._conn.cursor() as cur:
            cur.execute(sql)


class ApiBackend:
    """Run SQL through the Supabase Management API (POST .../database/query)."""

    def __init__(self, env: str):
        import requests  # imported lazily

        self.name = "api"
        self._requests = requests
        ref = os.environ.get(f"SUPABASE_{env.upper()}_PROJECT_ID")
        token = os.environ.get("SUPABASE_ACCESS_TOKEN") or _supabase_home_file("planetraves.token")
        if not ref or not token:
            raise SystemExit(
                "api backend needs SUPABASE_ACCESS_TOKEN and "
                f"SUPABASE_{env.upper()}_PROJECT_ID"
            )
        self._base = f"https://api.supabase.com/v1/projects/{ref}"
        self._url = f"{self._base}/database/query"
        self._headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        self._proxies = _proxies()
        self._verify = _requests_verify()
        if self._verify is False:
            requests.packages.urllib3.disable_warnings()  # user opted out of TLS verification

    def _post(self, sql: str):
        resp = self._requests.post(
            self._url,
            json={"query": sql},
            headers=self._headers,
            proxies=self._proxies,
            verify=self._verify,
            timeout=120,
        )
        if resp.status_code >= 400:
            raise SystemExit(f"API error {resp.status_code}: {resp.text}")
        if not resp.content:
            return []
        data = resp.json()
        return data if isinstance(data, list) else []

    def fetch(self, sql: str):
        return self._post(sql)

    def execute_script(self, sql: str):
        self._post(sql)

    def _request(self, method: str, path: str, payload=None):
        resp = self._requests.request(
            method,
            f"{self._base}/{path}",
            json=payload,
            headers=self._headers,
            proxies=self._proxies,
            verify=self._verify,
            timeout=120,
        )
        if resp.status_code >= 400:
            raise SystemExit(f"API error {resp.status_code}: {resp.text}")
        if not resp.content:
            return {}
        return resp.json()

    def get_config(self, name: str):
        return self._request("GET", _CONFIG_ENDPOINTS[name])

    def update_config(self, name: str, payload: dict):
        return self._request("PATCH", _CONFIG_ENDPOINTS[name], payload)

    def deploy_function(self, slug: str, root_dir: str, entrypoint: str = "index.ts",
                        verify_jwt: bool = True, import_map_path: str = None):
        """Deploy an Edge Function via the Management API (multipart source upload)."""
        import json
        import mimetypes

        metadata = {"name": slug, "entrypoint_path": entrypoint, "verify_jwt": verify_jwt}
        if import_map_path:
            metadata["import_map_path"] = import_map_path

        parts = [("metadata", (None, json.dumps(metadata), "application/json"))]
        opened = []
        try:
            for base, _dirs, filenames in os.walk(root_dir):
                for fn in filenames:
                    full = os.path.join(base, fn)
                    rel = os.path.relpath(full, root_dir).replace(os.sep, "/")
                    ctype = ("application/typescript" if fn.endswith((".ts", ".tsx"))
                             else mimetypes.guess_type(fn)[0] or "application/octet-stream")
                    f = open(full, "rb")
                    opened.append(f)
                    parts.append(("file", (rel, f, ctype)))
            resp = self._requests.post(
                f"{self._base}/functions/deploy",
                params={"slug": slug},
                files=parts,
                headers={"Authorization": self._headers["Authorization"]},  # let requests set multipart boundary
                proxies=self._proxies,
                verify=self._verify,
                timeout=180,
            )
        finally:
            for f in opened:
                f.close()
        if resp.status_code >= 400:
            raise SystemExit(f"API error {resp.status_code}: {resp.text}")
        return resp.json() if resp.content else {}


def make_backend(kind: str, env: str):
    return PgBackend(env) if kind == "pg" else ApiBackend(env)


def _keyring_password(service: str) -> str:
    """Read a password from Windows Credential Manager (any stored username)."""
    try:
        import keyring

        cred = keyring.get_credential(service, None)
        return cred.password if cred else ""
    except Exception:
        return ""


def _supabase_home_file(name: str) -> str:
    """Read a secret from ~/.supabase/<name> (same place as the CLI token)."""
    home = os.environ.get("HOME") or os.environ.get("USERPROFILE") or ""
    path = os.path.join(home, ".supabase", name)
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        return ""


def _proxies():
    host = os.environ.get("PROXY_HOST")
    if not host:
        return None
    port = os.environ.get("PROXY_PORT", "8080")
    user = os.environ.get("PROXY_USER", "")
    password = _keyring_password(host) if user else ""
    auth = f"{quote(user, safe='')}:{quote(password, safe='')}@" if user else ""
    url = f"http://{auth}{host}:{port}"
    return {"http": url, "https": url}


def _requests_verify():
    if os.environ.get("SPB_INSECURE") == "1":
        return False
    return os.environ.get("SPB_CA_BUNDLE", True)


# -----------------------------------------------------------------------------
# Dump
# -----------------------------------------------------------------------------
def _table_columns(backend, schema):
    rows = backend.fetch(f"""
        SELECT c.relname                              AS table_name,
               a.attname                              AS column_name,
               format_type(a.atttypid, a.atttypmod)   AS data_type,
               a.attnotnull                           AS not_null,
               pg_get_expr(ad.adbin, ad.adrelid)      AS default_expr,
               a.attidentity                          AS identity
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
        LEFT JOIN pg_attrdef ad ON ad.adrelid = c.oid AND ad.adnum = a.attnum
        WHERE n.nspname = '{schema}' AND c.relkind = 'r'
        ORDER BY c.relname, a.attnum
    """)
    tables = {}
    for r in rows:
        tables.setdefault(r["table_name"], []).append(r)
    return tables


def _column_def(col) -> str:
    parts = [qi(col["column_name"]), col["data_type"]]
    identity = col.get("identity")
    if identity == "a":
        parts.append("GENERATED ALWAYS AS IDENTITY")
    elif identity == "d":
        parts.append("GENERATED BY DEFAULT AS IDENTITY")
    elif col.get("default_expr"):
        parts.append(f"DEFAULT {col['default_expr']}")
    if col.get("not_null"):
        parts.append("NOT NULL")
    return " ".join(parts)


def _dump_enums(backend, schema, out):
    rows = backend.fetch(f"""
        SELECT t.typname AS name, e.enumlabel AS label
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = '{schema}'
        ORDER BY t.typname, e.enumsortorder
    """)
    if not rows:
        return
    enums = {}
    for r in rows:
        enums.setdefault(r["name"], []).append(r["label"])
    out.write("\n-- Types (enums)\n")
    for name, labels in enums.items():
        values = ", ".join(lit(v) for v in labels)
        out.write(
            f"DO $$ BEGIN\n"
            f"    CREATE TYPE {qq(schema, name)} AS ENUM ({values});\n"
            f"EXCEPTION WHEN duplicate_object THEN null;\n"
            f"END $$;\n"
        )


def _sequences(backend, schema):
    rows = backend.fetch(f"""
        SELECT c.relname AS name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'S' AND n.nspname = '{schema}'
          AND NOT EXISTS (
              SELECT 1 FROM pg_depend d
              WHERE d.objid = c.oid AND d.deptype = 'i'
          )
        ORDER BY c.relname
    """)
    return [r["name"] for r in rows]


def _all_sequences(backend, schema):
    rows = backend.fetch(f"""
        SELECT c.relname AS name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'S' AND n.nspname = '{schema}'
        ORDER BY c.relname
    """)
    return [r["name"] for r in rows]


def _dump_functions(backend, schema, out, user_only=False):
    filt = _USER_OWNED.format(obj="p.oid") if user_only else ""
    rows = backend.fetch(f"""
        SELECT pg_get_functiondef(p.oid) AS def
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        JOIN pg_roles o ON o.oid = p.proowner
        WHERE n.nspname = '{schema}' AND p.prokind IN ('f', 'p') {filt}
        ORDER BY p.proname
    """)
    if not rows:
        return
    out.write("\n-- Functions\n")
    for r in rows:
        out.write(r["def"].rstrip() + ";\n\n")


def _dump_constraints(backend, schema, out):
    rows = backend.fetch(f"""
        SELECT n.nspname AS schema, t.relname AS table_name,
               con.conname AS name, con.contype AS contype,
               pg_get_constraintdef(con.oid) AS def
        FROM pg_constraint con
        JOIN pg_class t ON t.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '{schema}' AND con.contype IN ('p', 'u', 'c', 'f')
    """)
    if not rows:
        return
    rows.sort(key=lambda r: _CONTYPE_ORDER.get(r["contype"], 9))
    out.write("\n-- Constraints\n")
    for r in rows:
        out.write(
            f"DO $$ BEGIN\n"
            f"    ALTER TABLE ONLY {qq(r['schema'], r['table_name'])} "
            f"ADD CONSTRAINT {qi(r['name'])} {r['def']};\n"
            f"EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null;\n"
            f"END $$;\n"
        )


def _dump_indexes(backend, schema, out):
    rows = backend.fetch(f"""
        SELECT pg_get_indexdef(ix.indexrelid) AS def
        FROM pg_index ix
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '{schema}'
          AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = ix.indexrelid)
        ORDER BY i.relname
    """)
    if not rows:
        return
    out.write("\n-- Indexes\n")
    for r in rows:
        # make re-runnable: CREATE [UNIQUE] INDEX IF NOT EXISTS ...
        out.write(r["def"].replace("INDEX ", "INDEX IF NOT EXISTS ", 1) + ";\n")


def _dump_views(backend, schema, out):
    rows = backend.fetch(f"""
        SELECT viewname AS name, definition AS def
        FROM pg_views WHERE schemaname = '{schema}'
        ORDER BY viewname
    """)
    if not rows:
        return
    out.write("\n-- Views\n")
    for r in rows:
        body = r["def"].rstrip().rstrip(";")
        out.write(f"CREATE OR REPLACE VIEW {qq(schema, r['name'])} AS\n{body};\n")


def _dump_triggers(backend, schema, out, user_only=False):
    filt = _USER_OWNED.format(obj="t.oid") if user_only else ""
    rows = backend.fetch(f"""
        SELECT t.tgname AS name, n.nspname AS schema, c.relname AS table_name,
               pg_get_triggerdef(t.oid) AS def
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_proc fp ON fp.oid = t.tgfoid
        JOIN pg_roles o ON o.oid = fp.proowner
        WHERE NOT t.tgisinternal AND n.nspname = '{schema}' {filt}
        ORDER BY t.tgname
    """)
    if not rows:
        return
    out.write("\n-- Triggers\n")
    for r in rows:
        out.write(f"DROP TRIGGER IF EXISTS {qi(r['name'])} ON {qq(r['schema'], r['table_name'])};\n")
        out.write(r["def"] + ";\n")


def _write_policy(schema, p, out):
    roles = p["roles"]
    if isinstance(roles, str):
        roles = roles.strip("{}").split(",") if roles else []
    roles_sql = ", ".join(r.strip('"') for r in roles) or "public"
    out.write(f"DROP POLICY IF EXISTS {qi(p['policyname'])} ON {qq(schema, p['tablename'])};\n")
    clauses = [
        f"CREATE POLICY {qi(p['policyname'])} ON {qq(schema, p['tablename'])}",
        f"  AS {'PERMISSIVE' if p['permissive'] in (True, 'PERMISSIVE', 't') else 'RESTRICTIVE'}",
        f"  FOR {p['cmd']}",
        f"  TO {roles_sql}",
    ]
    if p.get("qual") is not None:
        clauses.append(f"  USING ({p['qual']})")
    if p.get("with_check") is not None:
        clauses.append(f"  WITH CHECK ({p['with_check']})")
    out.write("\n".join(clauses) + ";\n")


def _policies(backend, schema):
    return backend.fetch(f"""
        SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
        FROM pg_policies WHERE schemaname = '{schema}'
        ORDER BY tablename, policyname
    """)


def _dump_policies(backend, schema, out):
    """Policies only (no ENABLE RLS) — for the Supabase-managed storage schema."""
    policies = _policies(backend, schema)
    if not policies:
        return
    out.write("\n-- Policies\n")
    for p in policies:
        _write_policy(schema, p, out)


def _dump_rls(backend, schema, out):
    enabled = backend.fetch(f"""
        SELECT c.relname AS name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r' AND n.nspname = '{schema}' AND c.relrowsecurity
        ORDER BY c.relname
    """)
    policies = _policies(backend, schema)
    if not enabled and not policies:
        return
    out.write("\n-- Row level security\n")
    for r in enabled:
        out.write(f"ALTER TABLE {qq(schema, r['name'])} ENABLE ROW LEVEL SECURITY;\n")
    for p in policies:
        _write_policy(schema, p, out)



def _dump_data(backend, schema, table, cols, out):
    col_names = [c["column_name"] for c in cols]
    select_cols = ", ".join(f"{qi(c)}::text" for c in col_names)
    rows = backend.fetch(f"SELECT {select_cols} FROM {qq(schema, table)}")
    if not rows:
        return
    overriding = " OVERRIDING SYSTEM VALUE" if any(c.get("identity") == "a" for c in cols) else ""
    col_list = ", ".join(qi(c) for c in col_names)
    prefix = f"INSERT INTO {qq(schema, table)} ({col_list}){overriding} VALUES"
    out.write(f"\n-- Data: {table} ({len(rows)} rows)\n")
    for start in range(0, len(rows), BATCH):
        chunk = rows[start:start + BATCH]
        values = ",\n".join(
            "(" + ", ".join(lit(r[c]) for c in col_names) + ")" for r in chunk
        )
        out.write(f"{prefix}\n{values};\n")


def _dump_sequence_values(backend, schema, out):
    seqs = _all_sequences(backend, schema)
    if not seqs:
        return
    out.write("\n-- Sequence values\n")
    for seq in seqs:
        rows = backend.fetch(f"SELECT last_value, is_called FROM {qq(schema, seq)}")
        if not rows:
            continue
        last = rows[0]["last_value"]
        called = rows[0]["is_called"]
        called_sql = "true" if called in (True, "t", "true", 1) else "false"
        out.write(f"SELECT setval('{schema}.{seq}', {last}, {called_sql});\n")


def _dump_extensions(backend, out):
    rows = backend.fetch("""
        SELECT e.extname AS name, n.nspname AS schema
        FROM pg_extension e
        JOIN pg_namespace n ON n.oid = e.extnamespace
        WHERE e.extname <> 'plpgsql'
        ORDER BY e.extname
    """)
    if not rows:
        return
    out.write("\n-- Extensions\n")
    for r in rows:
        out.write(
            f'CREATE EXTENSION IF NOT EXISTS {qi(r["name"])} WITH SCHEMA {qi(r["schema"])};\n'
        )


def _dump_grants(schema, out):
    out.write("\n-- Grants (Supabase API roles; row access still enforced by RLS)\n")
    out.write(f"GRANT USAGE ON SCHEMA {qi(schema)} TO {_API_ROLES};\n")
    out.write(f"GRANT ALL ON ALL TABLES IN SCHEMA {qi(schema)} TO {_API_ROLES};\n")
    out.write(f"GRANT ALL ON ALL SEQUENCES IN SCHEMA {qi(schema)} TO {_API_ROLES};\n")
    out.write(f"GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA {qi(schema)} TO {_API_ROLES};\n")
    out.write(f"ALTER DEFAULT PRIVILEGES IN SCHEMA {qi(schema)} GRANT ALL ON TABLES TO {_API_ROLES};\n")
    out.write(f"ALTER DEFAULT PRIVILEGES IN SCHEMA {qi(schema)} GRANT ALL ON SEQUENCES TO {_API_ROLES};\n")
    out.write(f"ALTER DEFAULT PRIVILEGES IN SCHEMA {qi(schema)} GRANT EXECUTE ON FUNCTIONS TO {_API_ROLES};\n")


def _dump_cron(backend, out):
    if not backend.fetch("SELECT 1 AS ok FROM pg_extension WHERE extname = 'pg_cron'"):
        return
    jobs = backend.fetch("SELECT jobname, schedule, command, active FROM cron.job ORDER BY jobid")
    if not jobs:
        return
    out.write("\n-- Scheduled jobs (pg_cron)\n")
    for j in jobs:
        name = j.get("jobname")
        if name:
            out.write(
                f"SELECT cron.schedule({lit(name)}, {lit(j['schedule'])}, {lit(j['command'])});\n"
            )
        else:
            out.write(f"SELECT cron.schedule({lit(j['schedule'])}, {lit(j['command'])});\n")


def _plain_columns(backend, schema, table):
    """Ordered, non-generated column names for a table (empty if it doesn't exist)."""
    rows = backend.fetch(f"""
        SELECT a.attname AS name, a.attgenerated AS gen
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = '{schema}' AND c.relname = '{table}'
          AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY a.attnum
    """)
    return [r["name"] for r in rows if not r["gen"]]


def _dump_storage_buckets(backend, out):
    cols = _plain_columns(backend, "storage", "buckets")
    if not cols:
        return
    select_cols = ", ".join(f"{qi(c)}::text" for c in cols)
    rows = backend.fetch(f"SELECT {select_cols} FROM storage.buckets ORDER BY id")
    if not rows:
        return
    out.write("\n-- Storage buckets\n")
    col_list = ", ".join(qi(c) for c in cols)
    set_cols = ", ".join(f"{qi(c)} = EXCLUDED.{qi(c)}" for c in cols if c != "id")
    values = ",\n".join("(" + ", ".join(lit(r[c]) for c in cols) + ")" for r in rows)
    out.write(f'INSERT INTO "storage"."buckets" ({col_list}) VALUES\n{values}\n')
    out.write(f"ON CONFLICT (id) DO UPDATE SET {set_cols};\n")


def _emit(path, write_fn) -> bool:
    """Run write_fn against a buffer; write the file only if it produced content."""
    import io

    buf = io.StringIO()
    write_fn(buf)
    text = buf.getvalue()
    if not text.strip():
        return False
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    return True


def _resolve_schemas(backend, schema: str):
    """Return the list of schemas to dump; 'all' expands to every user schema."""
    if schema != "all":
        return [schema]
    rows = backend.fetch("""
        SELECT nspname AS name
        FROM pg_namespace
        WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'
        ORDER BY (nspname <> 'public'), nspname
    """)
    return [r["name"] for r in rows if r["name"] not in _SYSTEM_SCHEMAS]


# auth tables worth migrating (data only); ephemeral tables like sessions,
# refresh_tokens and audit logs are deliberately left out
_AUTH_TABLES = ["users", "identities", "mfa_factors", "sso_providers", "sso_domains", "saml_providers"]

# keep only user-created objects: skip Supabase-managed roles and extension-owned objects
_USER_OWNED = (
    " AND o.rolname NOT LIKE 'supabase_%'"
    " AND o.rolname NOT IN ('authenticator', 'pgbouncer', 'dashboard_user')"
    " AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = {obj} AND d.deptype = 'e')"
)

# Supabase API roles that need privileges on user objects (access still gated by RLS)
_API_ROLES = "anon, authenticated, service_role"


def _fk_order(backend, schema, names):
    """Order tables so referenced tables come before the tables that reference them."""
    nameset = set(names)
    deps = {n: set() for n in names}
    rows = backend.fetch(f"""
        SELECT t.relname AS child, r.relname AS parent
        FROM pg_constraint con
        JOIN pg_class t ON t.oid = con.conrelid
        JOIN pg_class r ON r.oid = con.confrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_namespace nr ON nr.oid = r.relnamespace
        WHERE con.contype = 'f' AND n.nspname = '{schema}' AND nr.nspname = '{schema}'
    """)
    for row in rows:
        child, parent = row["child"], row["parent"]
        if child in nameset and parent in nameset and child != parent:
            deps[child].add(parent)
    order, visited = [], set()

    def visit(n):
        if n in visited:
            return
        visited.add(n)
        for d in sorted(deps[n]):
            visit(d)
        order.append(n)

    for n in sorted(names):
        visit(n)
    return order


def _dump_schema_data_ordered(backend, schema, datadir, only=None):
    """Emit numbered data files for one schema in FK order (referenced tables first)."""
    tables = _table_columns(backend, schema)
    names = [t for t in tables if only is None or t in only]
    if not names:
        return
    order = _fk_order(backend, schema, names)
    sdir = os.path.join(datadir, schema)
    os.makedirs(sdir, exist_ok=True)
    for i, table in enumerate(order):
        _emit(
            os.path.join(sdir, f"{i:02d}_{table}.sql"),
            lambda o, t=table: _dump_data(backend, schema, t, tables[t], o),
        )
    if not os.listdir(sdir):
        os.rmdir(sdir)


def do_dump(backend, schema, outdir, *, schema_only=False, data_only=False, clean=False,
            include_auth=False, include_storage=False):
    schemas = _resolve_schemas(backend, schema)
    tables = {s: _table_columns(backend, s) for s in schemas}
    seqs = {s: _sequences(backend, s) for s in schemas}
    multi = len(schemas) > 1
    os.makedirs(outdir, exist_ok=True)

    def p(name):
        return os.path.join(outdir, name)

    def _session(out):
        out.write(f"-- Supabase dump of schema(s): {', '.join(schemas)}\n")
        out.write(f"-- generated {datetime.datetime.now().isoformat(timespec='seconds')}\n")
        out.write("SET check_function_bodies = off;\n")
        out.write("SET standard_conforming_strings = on;\n")
        out.write("SET client_min_messages = warning;\n")
        path = ", ".join(qi(s) for s in schemas if s != "public")
        out.write(f'SET search_path = {path + ", " if path else ""}public;\n')

    def _schemas_file(out):
        out.write("-- Schemas\n")
        for s in schemas:
            if s != "public":
                out.write(f"CREATE SCHEMA IF NOT EXISTS {qi(s)};\n")

    def _tables(out):
        out.write("-- Tables\n")
        for s in schemas:
            for table in sorted(tables[s]):
                body = ",\n    ".join(_column_def(c) for c in tables[s][table])
                out.write(f"CREATE TABLE IF NOT EXISTS {qq(s, table)} (\n    {body}\n);\n")

    def _seqs(out):
        out.write("-- Sequences\n")
        for s in schemas:
            for seq in seqs[s]:
                out.write(f"CREATE SEQUENCE IF NOT EXISTS {qq(s, seq)};\n")

    def _clean(out):
        out.write("-- Clean\n")
        for s in schemas:
            for table in sorted(tables[s]):
                out.write(f"DROP TABLE IF EXISTS {qq(s, table)} CASCADE;\n")

    def _for_each(fn):
        return lambda o: [fn(backend, s, o) for s in schemas]

    _emit(p("00_session.sql"), _session)
    if clean:
        _emit(p("05_clean.sql"), _clean)

    if not data_only:
        if multi:
            _emit(p("08_schemas.sql"), _schemas_file)
        _emit(p("10_extensions.sql"), lambda o: _dump_extensions(backend, o))
        _emit(p("20_types.sql"), _for_each(_dump_enums))
        if any(seqs.values()):
            _emit(p("30_sequences.sql"), _seqs)
        _emit(p("40_functions.sql"), _for_each(_dump_functions))
        _emit(p("50_tables.sql"), _tables)

    if not schema_only:
        datadir = p("60_data")
        os.makedirs(datadir, exist_ok=True)
        for s in schemas:
            sdir = os.path.join(datadir, s) if multi else datadir
            os.makedirs(sdir, exist_ok=True)
            for table in sorted(tables[s]):
                _emit(
                    os.path.join(sdir, f"{table}.sql"),
                    lambda o, s=s, t=table: _dump_data(backend, s, t, tables[s][t], o),
                )
            if multi and not os.listdir(sdir):
                os.rmdir(sdir)
        if include_auth:
            _dump_schema_data_ordered(backend, "auth", datadir, only=_AUTH_TABLES)
        if not os.listdir(datadir):
            os.rmdir(datadir)

    if not data_only:
        _emit(p("70_constraints.sql"), _for_each(_dump_constraints))
        _emit(p("75_indexes.sql"), _for_each(_dump_indexes))

    if include_auth and not data_only:
        _emit(p("42_auth_functions.sql"), lambda o: _dump_functions(backend, "auth", o, user_only=True))
        _emit(p("92_auth_triggers.sql"), lambda o: _dump_triggers(backend, "auth", o, user_only=True))

    if include_storage and not data_only:
        _emit(p("62_storage_buckets.sql"), lambda o: _dump_storage_buckets(backend, o))
        _emit(p("96_storage_policies.sql"), lambda o: _dump_policies(backend, "storage", o))

    if not schema_only:
        _emit(p("80_sequence_values.sql"), _for_each(_dump_sequence_values))

    if not data_only:
        _emit(p("85_views.sql"), _for_each(_dump_views))
        _emit(p("90_triggers.sql"), _for_each(_dump_triggers))
        _emit(p("95_policies.sql"), _for_each(_dump_rls))
        _emit(p("97_cron.sql"), lambda o: _dump_cron(backend, o))
        _emit(p("98_grants.sql"), lambda o: [_dump_grants(s, o) for s in schemas])


def _load_sql(path: str) -> str:
    """Read a .sql file, or concatenate a dump folder's fragments in apply order."""
    if os.path.isfile(path):
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    files = []
    for root, _, names in os.walk(path):
        for n in names:
            if n.endswith(".sql"):
                files.append(os.path.join(root, n))
    files.sort(key=lambda fp: os.path.relpath(fp, path).replace("\\", "/"))
    parts = []
    for fp in files:
        rel = os.path.relpath(fp, path).replace("\\", "/")
        with open(fp, "r", encoding="utf-8") as f:
            parts.append(f"-- >>> {rel}\n{f.read().rstrip()}\n")
    return "BEGIN;\n" + "\n".join(parts) + "\nCOMMIT;\n"


# -----------------------------------------------------------------------------
# Project config (auth service: URL config, email templates, sign-in, providers)
# -----------------------------------------------------------------------------
def _config_api(backend, env: str):
    """Config lives in the Management API, so reuse or build an ApiBackend for it."""
    return backend if isinstance(backend, ApiBackend) else ApiBackend(env)


def do_dump_config(api, cfgdir: str):
    """Write each config resource as pretty JSON into cfgdir; return the names written."""
    import json

    os.makedirs(cfgdir, exist_ok=True)
    written = []
    for name in _CONFIG_ENDPOINTS:
        data = api.get_config(name)
        with open(os.path.join(cfgdir, f"{name}.json"), "w", encoding="utf-8", newline="\n") as f:
            json.dump(data, f, indent=2, sort_keys=True, default=str)
            f.write("\n")
        written.append(name)
    return written


def _config_files(path: str):
    """Resolve (name, filepath) pairs from a JSON file, a config dir, or a dump folder."""
    if os.path.isfile(path):
        name = os.path.splitext(os.path.basename(path))[0]
        return [(name if name in _CONFIG_ENDPOINTS else "auth", path)]
    found = []
    for base in (path, os.path.join(path, "config")):
        for name in _CONFIG_ENDPOINTS:
            fp = os.path.join(base, f"{name}.json")
            if os.path.isfile(fp):
                found.append((name, fp))
    return found


def do_apply_config(api, path: str):
    """PATCH the Management API with config JSON found at path; return the names applied."""
    import json

    files = _config_files(path)
    if not files:
        raise SystemExit(f"no config JSON found in {path}")
    names = []
    for name, fp in files:
        with open(fp, "r", encoding="utf-8") as f:
            payload = json.load(f)
        api.update_config(name, payload)
        names.append(name)
    return names


# -----------------------------------------------------------------------------
# Commands
# -----------------------------------------------------------------------------
def _resolve_include_all(args):
    """--include-all turns on every include-* flag present on the command."""
    if getattr(args, "include_all", False):
        for name in ("include_data", "include_auth", "include_storage", "include_config"):
            if hasattr(args, name):
                setattr(args, name, True)


def cmd_dump(args) -> int:
    _resolve_include_all(args)
    backend = make_backend(args.backend, args.env)
    out_dir = args.out or os.path.join(
        "dump", f"{args.env}_{datetime.datetime.now():%Y%m%d_%H%M%S}"
    )
    do_dump(
        backend, args.schema, out_dir,
        schema_only=args.schema_only,
        data_only=args.data_only,
        clean=args.clean,
        include_auth=args.include_auth,
        include_storage=args.include_storage,
    )
    if getattr(args, "include_config", False):
        names = do_dump_config(_config_api(backend, args.env), os.path.join(out_dir, "config"))
        warn(f"config/ contains secrets (provider secrets, SMTP password): {', '.join(names)}")
    success(f"dumped {args.env} -> {out_dir}{os.sep}")
    return 0


def cmd_config(args) -> int:
    api = ApiBackend(args.env)
    if args.action == "apply":
        if not args.file or not os.path.exists(args.file):
            error(f"path not found: {args.file}")
            return 1
        if not _confirm(f"apply config from {args.file} to {args.env}", args.yes):
            return 1
        names = do_apply_config(api, args.file)
        success(f"applied config ({', '.join(names)}) to {args.env}")
        return 0

    if args.out:
        names = do_dump_config(api, args.out)
        warn("config JSON contains secrets (provider secrets, SMTP password)")
        success(f"dumped {args.env} config ({', '.join(names)}) -> {args.out}{os.sep}")
    else:
        import json

        for name in _CONFIG_ENDPOINTS:
            print(json.dumps(api.get_config(name), indent=2, sort_keys=True, default=str))
    return 0


def cmd_deploy_function(args) -> int:
    api = ApiBackend(args.env)
    root = args.path or os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "supabase", "functions", args.slug
    )
    if not os.path.isdir(root):
        error(f"function folder not found: {root}")
        return 1
    if not os.path.isfile(os.path.join(root, args.entrypoint)):
        error(f"entrypoint not found: {os.path.join(root, args.entrypoint)}")
        return 1
    info(f"deploying '{args.slug}' from {root} to {args.env} ...")
    result = api.deploy_function(
        args.slug, root, entrypoint=args.entrypoint, verify_jwt=not args.no_verify_jwt
    )
    success(f"deployed '{args.slug}' to {args.env} (version {result.get('version', '?')})")
    return 0


def cmd_delete_user(args) -> int:
    # auth.users deletion cascades to public.profiles (ON DELETE CASCADE);
    # events.created_by is set NULL. Runs as postgres, so it bypasses RLS.
    ident = args.identifier.strip()
    col = "id" if _looks_like_uuid(ident) else "email"
    backend = make_backend(args.backend, args.env)

    rows = backend.fetch(
        f"SELECT id::text, email::text FROM auth.users WHERE {col} = {lit(ident)}"
    )
    if not rows:
        error(f"no auth user with {col} = {ident} in {args.env}")
        return 1
    if len(rows) > 1:
        error(f"{len(rows)} users match {col} = {ident}; refine the identifier")
        return 1

    user = rows[0]
    warn(f"this permanently deletes auth user {user['email']} ({user['id']}) "
         f"and cascades to its profile in {args.env}")
    if not _confirm(f"delete user {user['email']} from {args.env}", args.yes):
        return 1

    deleted = backend.fetch(
        f"DELETE FROM auth.users WHERE id = {lit(user['id'])} RETURNING id::text, email::text"
    )
    success(f"deleted user {deleted[0]['email']} ({deleted[0]['id']}) from {args.env}")
    return 0


def cmd_update_email(args) -> int:
    # There is no email-sync trigger, so update auth.users, the email identity, and
    # public.profiles together (profiles.email is UNIQUE). Runs as postgres.
    ident = args.identifier.strip()
    new_email = args.email.strip().lower()
    if "@" not in new_email:
        error(f"invalid email: {args.email}")
        return 1
    col = "id" if _looks_like_uuid(ident) else "email"
    backend = make_backend(args.backend, args.env)

    rows = backend.fetch(
        f"SELECT id::text, email::text FROM auth.users WHERE {col} = {lit(ident)}"
    )
    if not rows:
        error(f"no auth user with {col} = {ident} in {args.env}")
        return 1
    if len(rows) > 1:
        error(f"{len(rows)} users match {col} = {ident}; refine the identifier")
        return 1

    user = rows[0]
    if not _confirm(f"change email of {user['email']} to {new_email} in {args.env}", args.yes):
        return 1

    uid, new = lit(user["id"]), lit(new_email)
    script = (
        "BEGIN;\n"
        f"UPDATE auth.users SET email = {new}, email_change = '', "
        "email_change_token_new = '', email_change_token_current = '', "
        f"email_change_confirm_status = 0, updated_at = now() WHERE id = {uid};\n"
        "UPDATE auth.identities "
        f"SET identity_data = jsonb_set(identity_data, '{{email}}', to_jsonb({new}::text)), "
        f"updated_at = now() WHERE user_id = {uid} AND provider = 'email';\n"
        f"UPDATE public.profiles SET email = {new} WHERE id = {uid};\n"
        "COMMIT;"
    )
    backend.execute_script(script)
    success(f"updated email {user['email']} -> {new_email} ({user['id']}) in {args.env}")
    return 0


def cmd_exec(args) -> int:
    if not os.path.exists(args.file):
        error(f"path not found: {args.file}")
        return 1
    sql = _load_sql(args.file)
    if "drop " in sql.lower():
        warn(f"{args.file} contains DROP statements — existing objects/data in {args.env} may be ERASED")
    if not _confirm(f"execute {args.file} on {args.env}", args.yes):
        return 1
    backend = make_backend(args.backend, args.env)
    backend.execute_script(sql)
    success(f"executed {args.file} on {args.env}")
    return 0


def cmd_query(args) -> int:
    backend = make_backend(args.backend, args.env)
    rows = backend.fetch(args.sql)
    if args.json:
        import json

        print(json.dumps(rows, default=str, indent=2))
    else:
        _print_table(rows)
    return 0


def cmd_migrate(args) -> int:
    _resolve_include_all(args)
    src = make_backend(args.backend, getattr(args, "from"))
    out_dir = args.out or os.path.join(
        "dump", f"migrate_{getattr(args, 'from')}_to_{args.to}_{datetime.datetime.now():%Y%m%d_%H%M%S}"
    )
    do_dump(src, args.schema, out_dir, clean=args.clean,
            schema_only=not args.include_data,
            include_auth=args.include_auth,
            include_storage=args.include_storage)
    if args.include_config:
        do_dump_config(_config_api(src, getattr(args, "from")), os.path.join(out_dir, "config"))
    success(f"dumped {getattr(args, 'from')} -> {out_dir}{os.sep}")

    if args.clean:
        warn(f"--clean will DROP ALL TABLES in {args.to} and ERASE their data before reapplying")
    if not _confirm(f"apply {out_dir} to {args.to}", args.yes):
        info("stopped before applying; the dump folder is kept")
        return 0
    dst = make_backend(args.backend, args.to)
    dst.execute_script(_load_sql(out_dir))
    if args.include_config:
        do_apply_config(_config_api(dst, args.to), out_dir)
    success(f"migrated {getattr(args, 'from')} -> {args.to}")
    return 0



def _confirm(action: str, yes: bool) -> bool:
    if yes:
        return True
    ans = input(f"About to {action}. Continue? (y/N) ").strip().lower()
    return ans == "y"


def _print_table(rows):
    if not rows:
        print("(0 rows)")
        return
    cols = list(rows[0].keys())
    widths = {c: max(len(c), *(len(str(r.get(c, ""))) for r in rows)) for c in cols}
    header = " | ".join(c.ljust(widths[c]) for c in cols)
    print(header)
    print("-+-".join("-" * widths[c] for c in cols))
    for r in rows:
        print(" | ".join(str(r.get(c, "")).ljust(widths[c]) for c in cols))
    print(f"({len(rows)} rows)")


# -----------------------------------------------------------------------------
# CLI
# -----------------------------------------------------------------------------
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Supabase DB dump / migrate tool")
    parser.add_argument("--backend", choices=["pg", "api"], default="api")
    parser.add_argument("--schema", default=SCHEMA_DEFAULT,
                        help='schema to dump, or "all" for every user schema')
    # bare `python sbdb.py` runs a full dev dump
    parser.set_defaults(func=cmd_dump, env="dev", out=None,
                        schema_only=False, data_only=False, clean=False,
                        include_auth=False, include_storage=False, include_config=False,
                        include_all=False)
    sub = parser.add_subparsers(dest="command")

    p_dump = sub.add_parser("dump", help="dump a project to a .sql file")
    p_dump.add_argument("--env", default="dev")
    p_dump.add_argument("--out")
    p_dump.add_argument("--schema-only", action="store_true")
    p_dump.add_argument("--data-only", action="store_true")
    p_dump.add_argument("--clean", action="store_true", help="drop tables before recreating")
    p_dump.add_argument("--include-auth", action="store_true",
                        help="also dump auth.users and related tables (data only)")
    p_dump.add_argument("--include-storage", action="store_true",
                        help="also dump storage buckets and storage policies")
    p_dump.add_argument("--include-config", action="store_true",
                        help="also dump auth config (url config, email templates, sign-in, providers)")
    p_dump.add_argument("--include-all", action="store_true",
                        help="shortcut for --include-auth --include-storage --include-config")
    p_dump.set_defaults(func=cmd_dump)

    p_exec = sub.add_parser("exec", help="run a .sql file or dump folder against a project")
    p_exec.add_argument("--env", default="prod")
    p_exec.add_argument("--file", required=True, help="a .sql file or a dump folder")
    p_exec.add_argument("--yes", action="store_true")
    p_exec.set_defaults(func=cmd_exec)

    p_query = sub.add_parser("query", help="run a SQL statement and print the result")
    p_query.add_argument("--env", default="dev")
    p_query.add_argument("sql")
    p_query.add_argument("--json", action="store_true")
    p_query.set_defaults(func=cmd_query)

    p_mig = sub.add_parser("migrate", help="dump one project and apply it to another")
    p_mig.add_argument("--from", default="dev")
    p_mig.add_argument("--to", default="prod")
    p_mig.add_argument("--out")
    p_mig.add_argument("--include-data", action="store_true", help="also migrate table data (schema only by default)")
    p_mig.add_argument("--clean", action="store_true", help="drop tables before recreating")
    p_mig.add_argument("--include-auth", action="store_true",
                       help="also migrate auth.users and related tables (data only)")
    p_mig.add_argument("--include-storage", action="store_true",
                       help="also migrate storage buckets and storage policies")
    p_mig.add_argument("--include-config", action="store_true",
                       help="also migrate auth config (url config, email templates, sign-in, providers)")
    p_mig.add_argument("--include-all", action="store_true",
                       help="shortcut for --include-data --include-auth --include-storage --include-config")
    p_mig.add_argument("--yes", action="store_true")
    p_mig.set_defaults(func=cmd_migrate)

    p_cfg = sub.add_parser("config", help="get or apply auth config (url, email templates, sign-in, providers)")
    p_cfg.add_argument("action", nargs="?", choices=["get", "apply"], default="get")
    p_cfg.add_argument("--env", default="dev")
    p_cfg.add_argument("--out", help="folder to write config JSON (default: print to stdout)")
    p_cfg.add_argument("--file", help="config JSON file or dump folder to apply")
    p_cfg.add_argument("--yes", action="store_true")
    p_cfg.set_defaults(func=cmd_config)

    p_fn = sub.add_parser("deploy-function", help="deploy an Edge Function to a project via the Management API")
    p_fn.add_argument("slug", nargs="?", default="send-email", help="function slug (default: send-email)")
    p_fn.add_argument("--env", default="dev")
    p_fn.add_argument("--path", help="function source folder (default: supabase/functions/<slug>)")
    p_fn.add_argument("--entrypoint", default="index.ts")
    p_fn.add_argument("--no-verify-jwt", action="store_true",
                      help="disable gateway JWT verification (function does its own auth)")
    p_fn.set_defaults(func=cmd_deploy_function)

    p_del = sub.add_parser("delete-user", help="delete an auth user by email or id (cascades to its profile)")
    p_del.add_argument("identifier", help="user email or UUID")
    p_del.add_argument("--env", default="dev")
    p_del.add_argument("--yes", action="store_true")
    p_del.set_defaults(func=cmd_delete_user)

    p_em = sub.add_parser("update-email", help="change an auth user's email (updates identity and profile too)")
    p_em.add_argument("identifier", help="current user email or UUID")
    p_em.add_argument("email", help="the new email address")
    p_em.add_argument("--env", default="dev")
    p_em.add_argument("--yes", action="store_true")
    p_em.set_defaults(func=cmd_update_email)

    return parser


def _load_env_file():
    """Load KEY=VALUE lines from planetraves.env next to this script (env wins if set)."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "planetraves.env")
    try:
        with open(path, "r", encoding="utf-8") as f:
            lines = f.readlines()
    except OSError:
        return
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def main() -> int:
    _load_env_file()
    args = build_parser().parse_args()
    try:
        return args.func(args)
    except SystemExit:
        raise
    except Exception as exc:  # surface a clean message instead of a traceback
        error(str(exc))
        return 1


if __name__ == "__main__":
    sys.exit(main())
