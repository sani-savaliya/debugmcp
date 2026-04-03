import type {
  DatabaseDriver,
  ConnectionConfig,
  TableInfo,
  ColumnInfo,
  QueryResult,
  ProcedureInfo,
  SchemaInfo,
} from "../types.js";

export function createDriver(): DatabaseDriver {
  let db: any = null;

  return {
    driverName: "sqlite",

    async connect(config: ConnectionConfig): Promise<void> {
      const BetterSqlite3 = (await import("better-sqlite3")).default;
      db = new BetterSqlite3(config.connection, { readonly: true });
      db.pragma("journal_mode = WAL");
    },

    async disconnect(): Promise<void> {
      if (db) {
        db.close();
        db = null;
      }
    },

    async listTables(): Promise<readonly TableInfo[]> {
      const rows = db
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
           ORDER BY name`
        )
        .all() as { name: string }[];

      return rows.map((row) => {
        let rowCount: number | null = null;
        try {
          const countResult = db
            .prepare(`SELECT COUNT(*) as cnt FROM "${row.name}"`)
            .get() as { cnt: number };
          rowCount = countResult.cnt;
        } catch {
          // table might be locked or inaccessible
        }
        return {
          schema: "main",
          name: row.name,
          rowCount,
        };
      });
    },

    async getTableSchema(
      table: string
    ): Promise<readonly ColumnInfo[]> {
      const columns = db
        .prepare(`PRAGMA table_info("${table}")`)
        .all() as {
        cid: number;
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | null;
        pk: number;
      }[];

      // Get foreign keys
      const fks = db
        .prepare(`PRAGMA foreign_key_list("${table}")`)
        .all() as {
        from: string;
        table: string;
        to: string;
      }[];

      const fkMap = new Map(
        fks.map((fk) => [fk.from, { table: fk.table, column: fk.to }])
      );

      return columns.map((col) => {
        const fk = fkMap.get(col.name);
        return {
          name: col.name,
          dataType: col.type || "TEXT",
          maxLength: null,
          isNullable: col.notnull === 0,
          defaultValue: col.dflt_value,
          isPrimaryKey: col.pk > 0,
          foreignKeyTable: fk?.table ?? null,
          foreignKeyColumn: fk?.column ?? null,
        };
      });
    },

    async runQuery(query: string, maxRows: number): Promise<QueryResult> {
      const stmt = db.prepare(query);
      const allRows = stmt.all() as Record<string, unknown>[];

      const truncated = allRows.length > maxRows;
      const rows = truncated ? allRows.slice(0, maxRows) : allRows;
      const columns =
        rows.length > 0 ? Object.keys(rows[0]) : [];

      return {
        columns,
        rows,
        rowCount: allRows.length,
        truncated,
      };
    },

    async describeProcedure(): Promise<ProcedureInfo | null> {
      // SQLite does not support stored procedures
      return null;
    },

    async listSchemas(): Promise<readonly SchemaInfo[]> {
      const rows = db
        .prepare("PRAGMA database_list")
        .all() as { name: string }[];
      return rows.map((r) => ({ name: r.name }));
    },
  };
}
