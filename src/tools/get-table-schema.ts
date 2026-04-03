import { z } from "zod";
import type { DatabaseDriver } from "../types.js";

export const name = "get_table_schema";
export const description =
  "Get column definitions, data types, constraints, and foreign key relationships for a table.";
export const params = {
  table: z.string().describe("Table name"),
  schema: z.string().optional().describe("Schema name (default varies by DB)"),
};

export async function handler(
  driver: DatabaseDriver,
  { table, schema }: { table: string; schema?: string }
) {
  const columns = await driver.getTableSchema(table, schema);

  if (columns.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Table '${table}' not found. Use list_tables to see available tables.`,
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          { table, columnCount: columns.length, columns },
          null,
          2
        ),
      },
    ],
  };
}
