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

  return {
    driverName: "postgres",

    async connect(config: ConnectionConfig): Promise<void> {
      const pg = await import("pg");
      pool = new pg.default.Pool({
        connectionString: config.connection,
        max: 3,
        idleTimeoutMillis: 60_000,
        connectionTimeoutMillis: config.connectionTimeout,
        statement_timeout: config.requestTimeout,
      });
      // Test the connection
      const client = await pool.connect();
      client.release();
    },

    async disconnect(): Promise<void> {
      if (pool) {
        await pool.end();
        pool = null;
      }
    },

    async listTables(schema?: string): Promise<readonly TableInfo[]> {
      const query = `
        SELECT
          t.table_schema AS schema,
          t.table_name AS name,
          s.n_live_tup AS row_count
        FROM information_schema.tables t
        LEFT JOIN pg_stat_user_tables s
          ON t.table_name = s.relname AND t.table_schema = s.schemaname
        WHERE t.table_type = 'BASE TABLE'
          ${schema ? "AND t.table_schema = $1" : "AND t.table_schema NOT IN ('pg_catalog', 'information_schema')"}
        ORDER BY t.table_schema, t.table_name
      `;
      const params = schema ? [schema] : [];
      const result = await pool.query(query, params);
      return result.rows.map((r: any) => ({
        schema: r.schema,
        name: r.name,
        rowCount: r.row_count != null ? Number(r.row_count) : null,
      }));
    },

    async getTableSchema(
      table: string,
      schema?: string
    ): Promise<readonly ColumnInfo[]> {
      const schemaFilter = schema ?? "public";
      const result = await pool.query(
        `
        SELECT
          c.column_name,
          c.data_type,
          c.character_maximum_length,
          c.is_nullable,
          c.column_default,
          CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_primary_key,
          fk.foreign_table_name,
          fk.foreign_column_name
        FROM information_schema.columns c
        LEFT JOIN (
          SELECT kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
          WHERE tc.constraint_type = 'PRIMARY KEY'
            AND tc.table_name = $1
            AND tc.table_schema = $2
        ) pk ON c.column_name = pk.column_name
        LEFT JOIN (
          SELECT
            kcu.column_name,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
          JOIN information_schema.constraint_column_usage ccu
            ON tc.constraint_name = ccu.constraint_name
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_name = $1
            AND tc.table_schema = $2
        ) fk ON c.column_name = fk.column_name
        WHERE c.table_name = $1 AND c.table_schema = $2
        ORDER BY c.ordinal_position
        `,
        [table, schemaFilter]
      );

      return result.rows.map((r: any) => ({
        name: r.column_name,
        dataType: r.data_type,
        maxLength: r.character_maximum_length,
        isNullable: r.is_nullable === "YES",
        defaultValue: r.column_default,
        isPrimaryKey: r.is_primary_key,
        foreignKeyTable: r.foreign_table_name ?? null,
        foreignKeyColumn: r.foreign_column_name ?? null,
      }));
    },

    async runQuery(query: string, maxRows: number): Promise<QueryResult> {
      const result = await pool.query(query);
      const allRows = result.rows;
      const truncated = allRows.length > maxRows;
      const rows = truncated ? allRows.slice(0, maxRows) : allRows;
      const columns = result.fields?.map((f: any) => f.name) ?? [];

      return { columns, rows, rowCount: allRows.length, truncated };
    },

    async describeProcedure(name: string): Promise<ProcedureInfo | null> {
      const result = await pool.query(
        `
        SELECT
          p.proname AS name,
          pg_get_functiondef(p.oid) AS definition
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.proname = $1
          AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        LIMIT 1
        `,
        [name]
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      const paramResult = await pool.query(
        `
        SELECT
          p.parameter_name AS name,
          p.data_type,
          p.parameter_mode
        FROM information_schema.parameters p
        WHERE p.specific_name = (
          SELECT specific_name FROM information_schema.routines
          WHERE routine_name = $1 LIMIT 1
        )
        ORDER BY p.ordinal_position
        `,
        [name]
      );

      return {
        name: row.name,
        parameters: paramResult.rows.map((p: any) => ({
          name: p.name ?? "",
          dataType: p.data_type,
          isOutput: p.parameter_mode === "OUT" || p.parameter_mode === "INOUT",
        })),
        definition: row.definition,
      };
    },

    async listSchemas(): Promise<readonly SchemaInfo[]> {
      const result = await pool.query(
        `SELECT schema_name AS name
         FROM information_schema.schemata
         WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
         ORDER BY schema_name`
      );
      return result.rows.map((r: any) => ({ name: r.name }));
    },
  };
}
