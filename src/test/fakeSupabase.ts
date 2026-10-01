import type { SupabaseClient } from "@supabase/supabase-js";

// A tiny in-memory stand-in for the parts of the Supabase query builder the
// server code uses. Enough for unit tests; the real rules are also tested on
// Postgres by scripts/test-db.sh.

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

class Query {
  private filters: ((row: Row) => boolean)[] = [];
  private op: "select" | "insert" | "update" | "delete" = "select";
  private values: Row | Row[] = {};
  private columns = "*";

  constructor(
    private tables: Tables,
    private table: string,
    private nextId: () => number,
  ) {}

  private rows() {
    return (this.tables[this.table] ??= []);
  }

  select(columns = "*") {
    this.columns = columns;
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  is(column: string, value: unknown) {
    this.filters.push((row) => (row[column] ?? null) === value);
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  insert(values: Row | Row[]) {
    this.op = "insert";
    this.values = values;
    return this;
  }
  update(values: Row) {
    this.op = "update";
    this.values = values;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  upsert(values: Row, options: { onConflict: string; ignoreDuplicates?: boolean }) {
    const keys = options.onConflict.split(",");
    const existing = this.rows().find((row) => keys.every((k) => row[k] === values[k]));
    if (existing && !options.ignoreDuplicates) Object.assign(existing, values);
    if (!existing) this.rows().push({ ...values });
    return Promise.resolve({ data: null, error: null });
  }

  private run(): Row[] {
    const matching = () => this.rows().filter((row) => this.filters.every((f) => f(row)));
    if (this.op === "insert") {
      const inserted = (Array.isArray(this.values) ? this.values : [this.values]).map((v) => ({ id: this.nextId(), ...v }));
      this.rows().push(...inserted);
      return inserted;
    }
    if (this.op === "update") {
      const rows = matching();
      rows.forEach((row) => Object.assign(row, this.values));
      return rows;
    }
    if (this.op === "delete") {
      const rows = matching();
      this.tables[this.table] = this.rows().filter((row) => !rows.includes(row));
      return rows;
    }
    const rows = matching();
    // Joins like reports → messages(body, user_id) through message_id, or
    // direct_messages(...) through direct_message_id.
    const joins = [...this.columns.matchAll(/(\w+)\(([^)]*)\)/g)].map((m) => m[1]);
    if (!joins.length) return rows;
    return rows.map((row) => {
      const joined: Row = { ...row };
      for (const table of joins) {
        const key = `${table.replace(/s$/, "")}_id`;
        joined[table] = (this.tables[table] ?? []).find((r) => row[key] != null && r.id === row[key]) ?? null;
      }
      return joined;
    });
  }

  maybeSingle() {
    return Promise.resolve({ data: this.run()[0] ?? null, error: null });
  }
  single() {
    return Promise.resolve({ data: this.run()[0] ?? null, error: null });
  }
  then<A = { data: unknown; error: null }, B = never>(
    resolve?: ((value: { data: unknown; error: null }) => A | PromiseLike<A>) | null,
    reject?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    return Promise.resolve({ data: this.run() as unknown, error: null as null }).then(resolve, reject);
  }
}

export function fakeSupabase(tables: Tables = {}) {
  let id = 1000;
  const client = { from: (table: string) => new Query(tables, table, () => ++id) };
  return { db: client as unknown as SupabaseClient, tables };
}
