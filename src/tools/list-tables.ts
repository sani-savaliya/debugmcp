import { z } from "zod";
import type { DatabaseDriver } from "../types.js";

export const name = "list_tables";
export const description =
  "List all tables in the database with approximate row counts.";
export const params = {
  schema: z.string().optional().describe("Filter by schema name"),
};

export async function handler(
  driver: DatabaseDriver,
  { schema }: { schema?: string }
) {
  const tables = await driver.listTables(schema);
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          { tableCount: tables.length, tables },
          null,
          2
        ),
      },
    ],
  };
}
