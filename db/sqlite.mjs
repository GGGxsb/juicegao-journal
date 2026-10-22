import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const stateKey = Symbol.for("juicegao.sqlite");

function dataDirectory() {
  return path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data"));
}

function normalizeParameter(value) {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "bigint") return value;
  if (typeof value === "boolean") return Number(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return value;
  throw new TypeError("Unsupported SQLite parameter. Use null for an empty value.");
}

class LocalStatement {
  constructor(database, sql, parameters = []) {
    this.database = database;
    this.sql = sql;
    this.parameters = parameters.map(normalizeParameter);
  }

  bind(...parameters) {
    return new LocalStatement(this.database, this.sql, parameters);
  }

  execute(arrayMode = false) {
    const connection = this.database.connection;
    const before = connection.prepare("SELECT total_changes() AS changes").get().changes;
    const statement = connection.prepare(this.sql);
    if (arrayMode) statement.setReturnArrays(true);
    const results = statement.all(...this.parameters);
    const after = connection.prepare("SELECT total_changes() AS changes, last_insert_rowid() AS last_row_id").get();
    return {
      success: true,
      results,
      meta: { changes: Number(after.changes) - Number(before), last_row_id: Number(after.last_row_id) },
    };
  }

  async first(columnName) {
    const row = this.execute().results[0];
    if (!row) return null;
    if (columnName === undefined) return row;
    if (!Object.hasOwn(row, columnName)) throw new Error(`SQLite result has no column named ${columnName}.`);
    return row[columnName];
  }

  async all() {
    return this.execute();
  }

  async run() {
    return this.execute();
  }

  async raw(options) {
    const rows = this.execute(true).results;
    if (options?.columnNames) {
      const columns = this.database.connection.prepare(this.sql).columns().map((column) => column.name);
      return [columns, ...rows];
    }
    return rows;
  }
}

class LocalDatabase {
  constructor(connection) {
    this.connection = connection;
  }

  prepare(sql) {
    return new LocalStatement(this, sql);
  }

  async batch(statements) {
    // Keep the complete transaction synchronous: another request cannot interleave
    // between the password/account update and its associated session mutation.
    this.connection.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => {
        if (statement.database !== this) throw new TypeError("A batch must use statements from the same database.");
        return statement.execute();
      });
      this.connection.exec("COMMIT");
      return results;
    } catch (error) {
      this.connection.exec("ROLLBACK");
      throw error;
    }
  }

  async exec(sql) {
    this.connection.exec(sql);
    return { count: 1, duration: 0 };
  }
}

function getState() {
  const directory = dataDirectory();
  let state = globalThis[stateKey];
  if (state) {
    if (state.directory !== directory) throw new Error("DATA_DIR cannot change while the database is open.");
    return state;
  }
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const connection = new DatabaseSync(path.join(directory, "journal.sqlite"));
  try {
    connection.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
  } catch (error) {
    connection.close();
    throw error;
  }
  state = { directory, connection, adapter: new LocalDatabase(connection), migrated: false };
  globalThis[stateKey] = state;
  return state;
}

export function migrateDatabase(migrationsDirectory = path.join(process.cwd(), "drizzle")) {
  const state = getState();
  const files = readdirSync(migrationsDirectory).filter((name) => /^\d[^/\\]*\.sql$/.test(name)).sort();
  if (files.length === 0) throw new Error("No database migrations were found in the drizzle directory.");
  const migrations = files.map((name) => {
    // Git checkouts may use CRLF on Windows and LF in the Linux container.
    // Their SQL content is identical and must keep the same migration checksum.
    const sql = readFileSync(path.join(migrationsDirectory, name), "utf8").replace(/\r\n/g, "\n");
    return { name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
  });
  const connection = state.connection;
  connection.exec("BEGIN IMMEDIATE");
  try {
    connection.exec("CREATE TABLE IF NOT EXISTS __journal_migrations (name TEXT PRIMARY KEY NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)");
    const applied = connection.prepare("SELECT name, checksum FROM __journal_migrations ORDER BY name").all();
    const byName = new Map(migrations.map((migration) => [migration.name, migration]));
    for (const migration of applied) {
      const source = byName.get(migration.name);
      if (!source || source.checksum !== migration.checksum) {
        throw new Error(`Applied migration ${migration.name} was changed or removed. Restore the original migration before starting.`);
      }
    }
    const appliedNames = new Set(applied.map((migration) => migration.name));
    const recordMigration = connection.prepare("INSERT INTO __journal_migrations (name, checksum, applied_at) VALUES (?, ?, ?)");
    for (const migration of migrations) {
      if (appliedNames.has(migration.name)) continue;
      connection.exec(migration.sql);
      recordMigration.run(migration.name, migration.checksum, new Date().toISOString());
    }
    connection.exec("COMMIT");
    state.migrated = true;
    return { applied: migrations.length - applied.length, total: migrations.length };
  } catch (error) {
    connection.exec("ROLLBACK");
    throw error;
  }
}

export function initializeDatabase() {
  return migrateDatabase();
}

export function getDatabaseAdapter() {
  const state = getState();
  if (!state.migrated) migrateDatabase();
  return state.adapter;
}

export function closeDatabase() {
  const state = globalThis[stateKey];
  if (state) {
    state.connection.close();
    delete globalThis[stateKey];
  }
}
