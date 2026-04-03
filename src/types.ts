// ============================================================
// Core types for dbmcp — Universal Database MCP Server
// ============================================================

/** Supported database driver types */
export type DriverType = "mssql" | "postgres" | "mysql" | "sqlite";

/** Connection configuration for a single database */
export interface ConnectionConfig {
  readonly name: string;
  readonly driver: DriverType;
  readonly connection: string;
  readonly maxRows: number;
  readonly connectionTimeout: number;
  readonly requestTimeout: number;
}

/** Full application config */
export interface AppConfig {
  readonly connections: readonly ConnectionConfig[];
}

/** Table information returned by list_tables */
export interface TableInfo {
  readonly schema: string;
  readonly name: string;
  readonly rowCount: number | null;
}

/** Column information returned by get_table_schema */
export interface ColumnInfo {
  readonly name: string;
  readonly dataType: string;
  readonly maxLength: number | null;
  readonly isNullable: boolean;
  readonly defaultValue: string | null;
  readonly isPrimaryKey: boolean;
  readonly foreignKeyTable: string | null;
  readonly foreignKeyColumn: string | null;
}

/** Query result returned by run_query */
export interface QueryResult {
  readonly columns: readonly string[];
  readonly rows: readonly Record<string, unknown>[];
  readonly rowCount: number;
  readonly truncated: boolean;
}

/** Schema information returned by list_schemas */
export interface SchemaInfo {
  readonly name: string;
}

/** Stored procedure/function info returned by describe_procedure */
export interface ProcedureInfo {
  readonly name: string;
  readonly parameters: readonly ProcedureParam[];
  readonly definition: string;
}

/** Stored procedure parameter */
export interface ProcedureParam {
  readonly name: string;
  readonly dataType: string;
  readonly isOutput: boolean;
}

/** Query validation result */
export interface ValidationResult {
  readonly safe: boolean;
  readonly reason?: string;
}

/** Dialect-specific validation rules */
export interface DialectRules {
  readonly name: string;
  readonly blockedPatterns: readonly RegExp[];
  readonly blockedPrefixes: readonly string[];
}

// ============================================================
// Driver Interface — every database driver implements this
// ============================================================

export interface DatabaseDriver {
  readonly driverName: string;

  /** Establish connection to the database */
  connect(config: ConnectionConfig): Promise<void>;

  /** Close the connection and clean up resources */
  disconnect(): Promise<void>;

  /** List all tables with optional schema filter */
  listTables(schema?: string): Promise<readonly TableInfo[]>;

  /** Get column definitions for a table */
  getTableSchema(
    table: string,
    schema?: string
  ): Promise<readonly ColumnInfo[]>;

  /** Execute a read-only query */
  runQuery(query: string, maxRows: number): Promise<QueryResult>;

  /** Get stored procedure/function definition */
  describeProcedure(name: string): Promise<ProcedureInfo | null>;

  /** List database schemas/namespaces */
  listSchemas(): Promise<readonly SchemaInfo[]>;
}

/** Factory function to create a driver instance */
export type DriverFactory = () => DatabaseDriver;
