// A small D1 stand-in on Node's built-in SQLite, so API tests run real SQL
// against the real migrations without needing a Workers runtime.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
type SqlValue = string | number | null;

class FakeStatement {
  constructor(
    private db: InstanceType<typeof DatabaseSync>,
    private sql: string,
    private params: SqlValue[] = [],
  ) {}
  bind(...params: SqlValue[]) {
    return new FakeStatement(this.db, this.sql, params);
  }
  async first<T>() {
    return (this.db.prepare(this.sql).get(...this.params) ?? null) as T | null;
  }
  async all<T>() {
    return { results: this.db.prepare(this.sql).all(...this.params) as T[] };
  }
  async run() {
    return { meta: { changes: Number(this.db.prepare(this.sql).run(...this.params).changes) } };
  }
}

export function createFakeD1(): D1Database {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
  const fake = {
    prepare: (sql: string) => new FakeStatement(db, sql),
    batch: async (statements: FakeStatement[]) => {
      db.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return fake as unknown as D1Database;
}
