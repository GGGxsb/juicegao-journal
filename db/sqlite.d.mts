export interface DatabaseResult<T = Record<string, unknown>> {
  success: true;
  results: T[];
  meta: { changes: number; last_row_id: number };
}

export interface DatabaseStatement {
  bind(...parameters: unknown[]): DatabaseStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  first<T = unknown>(columnName: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<DatabaseResult<T>>;
  run<T = Record<string, unknown>>(): Promise<DatabaseResult<T>>;
  raw<T extends unknown[] = unknown[]>(options?: { columnNames?: boolean }): Promise<T[]>;
}

export interface DatabaseAdapter {
  prepare(sql: string): DatabaseStatement;
  batch<T = Record<string, unknown>>(statements: DatabaseStatement[]): Promise<DatabaseResult<T>[]>;
  exec(sql: string): Promise<{ count: number; duration: number }>;
}

export function migrateDatabase(migrationsDirectory?: string): { applied: number; total: number };
export function initializeDatabase(): { applied: number; total: number };
export function getDatabaseAdapter(): DatabaseAdapter;
export function closeDatabase(): void;
