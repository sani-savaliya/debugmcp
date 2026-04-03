import { z } from "zod";
import type { DatabaseDriver, DriverType } from "../types.js";
import { validateQuery } from "../validation/sql-validator.js";
import { mssqlRules } from "../validation/mssql-rules.js";
import { postgresRules } from "../validation/postgres-rules.js";
import { mysqlRules } from "../validation/mysql-rules.js";
import { sqliteRules } from "../validation/sqlite-rules.js";
import type { DialectRules } from "../types.js";

const dialectMap: Record<DriverType, DialectRules | undefined> = {
  mssql: mssqlRules,
  postgres: postgresRules,
  mysql: mysqlRules,
  sqlite: sqliteRules,
};

export const name = "run_query";
export const description =
  "Execute a read-only SQL query. Only SELECT statements are allowed. Use LIMIT/TOP to control result size.";
export const params = {
  query: z.string().describe("SQL SELECT query to execute. Must be read-only."),
  maxRows: z
    .number()
    .optional()
    .describe("Override max rows for this query (default from config)"),
};

export function createHandler(driverType: DriverType, configMaxRows: number) {
  const dialect = dialectMap[driverType];

  return async function handler(
    driver: DatabaseDriver,
    { query, maxRows }: { query: string; maxRows?: number }
  ) {
    const validation = validateQuery(query, dialect);
    if (!validation.safe) {
      return {
        content: [
          {
            type: "text" as const,
            text: `BLOCKED: ${validation.reason}\n\nOnly read-only queries (SELECT, WITH, DECLARE+SELECT) are allowed.`,
          },
        ],
      };
    }

    const limit = Math.min(maxRows ?? configMaxRows, 500);

    try {
      const result = await driver.runQuery(query, limit);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                rowCount: result.rowCount,
                returnedRows: result.rows.length,
                truncated: result.truncated,
                columns: result.columns,
                data: result.rows,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Query error: ${err.message}`,
          },
        ],
      };
    }
  };
}
