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
  let pool: any = null;
  let dbName: string = "";

  return {
    driverName: "mysql",

    async connect(config: ConnectionConfig): Promise<void> {
      const mysql = await import("mysql2/promise");
      pool = mysql.createPool({
        uri: config.connection,
        waitForConnections: true,
        connectionLimit: 3,
        idleTimeout: 60_000,
        connectTimeout: config.connectionTimeout,
      });
      // Test connection and get database name
      const [rows] = await pool.query("SELECT DATABASE() AS db");
      dbName = (rows as any[])[0]?.db ?? "";
    },

    async disconnect(): Promise<void> {
      if (pool) {
        await pool.end();
        pool = null;
      }
    },

    async listTables(): Promise<readonly TableInfo[]> {
      const [rows] = await pool.query(
        `SELECT
           TABLE_NAME AS name,
           TABLE_ROWS AS row_count
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
         ORDER BY TABLE_NAME`
      );
      return (rows as any[]).map((r) => ({
        schema: dbName,
        name: r.name,
        rowCount: r.row_count != null ? Number(r.row_count) : null,
      }));
    },

    async getTableSchema(table: string): Promise<readonly ColumnInfo[]> {
      const [columns] = await pool.query(
        `SELECT
           c.COLUMN_NAME,
           c.DATA_TYPE,
           c.CHARACTER_MAXIMUM_LENGTH,
           c.IS_NULLABLE,
           c.COLUMN_DEFAULT,
           c.COLUMN_KEY
         FROM information_schema.COLUMNS c
         WHERE c.TABLE_SCHEMA = DATABASE() AND c.TABLE_NAME = ?
         ORDER BY c.ORDINAL_POSITION`,
        [table]
      );

      const [fks] = await pool.query(
        `SELECT
           k.COLUMN_NAME,
           k.REFERENCED_TABLE_NAME,
           k.REFERENCED_COLUMN_NAME
         FROM information_schema.KEY_COLUMN_USAGE k
         WHERE k.TABLE_SCHEMA = DATABASE()
           AND k.TABLE_NAME = ?
           AND k.REFERENCED_TABLE_NAME IS NOT NULL`,
        [table]
      );

      const fkMap = new Map(
        (fks as any[]).map((fk) => [
          fk.COLUMN_NAME,
          { table: fk.REFERENCED_TABLE_NAME, column: fk.REFERENCED_COLUMN_NAME },
        ])
      );

      return (columns as any[]).map((c) => {
        const fk = fkMap.get(c.COLUMN_NAME);
        return {
          name: c.COLUMN_NAME,
          dataType: c.DATA_TYPE,
          maxLength: c.CHARACTER_MAXIMUM_LENGTH,
          isNullable: c.IS_NULLABLE === "YES",
          defaultValue: c.COLUMN_DEFAULT,
          isPrimaryKey: c.COLUMN_KEY === "PRI",
          foreignKeyTable: fk?.table ?? null,
          foreignKeyColumn: fk?.column ?? null,
        };
      });
    },

    async runQuery(query: string, maxRows: number): Promise<QueryResult> {
      const [rows, fields] = await pool.query(query);
      const allRows = rows as any[];
      const truncated = allRows.length > maxRows;
      const data = truncated ? allRows.slice(0, maxRows) : allRows;
      const columns = (fields as any[])?.map((f: any) => f.name) ?? [];

      return { columns, rows: data, rowCount: allRows.length, truncated };
    },

    async describeProcedure(name: string): Promise<ProcedureInfo | null> {
      try {
        const [defRows] = await pool.query(`SHOW CREATE PROCEDURE \`${name}\``);
        const def = (defRows as any[])[0];
        if (!def) return null;

        const [paramRows] = await pool.query(
          `SELECT
             PARAMETER_NAME AS name,
             DATA_TYPE AS data_type,
             PARAMETER_MODE AS mode
           FROM information_schema.PARAMETERS
           WHERE SPECIFIC_SCHEMA = DATABASE() AND SPECIFIC_NAME = ?
           ORDER BY ORDINAL_POSITION`,
          [name]
        );

        return {
          name,
          parameters: (paramRows as any[]).map((p) => ({
            name: p.name ?? "",
            dataType: p.data_type,
            isOutput: p.mode === "OUT" || p.mode === "INOUT",
          })),
          definition: def["Create Procedure"] ?? "",
        };
      } catch {
        return null;
      }
    },

    async listSchemas(): Promise<readonly SchemaInfo[]> {
      const [rows] = await pool.query("SHOW DATABASES");
      return (rows as any[]).map((r) => ({
        name: r.Database,
      }));
    },
  };
}
