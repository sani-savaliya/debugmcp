import { z } from "zod";
import type { DatabaseDriver } from "../types.js";

export const name = "describe_procedure";
export const description =
  "Get the definition and parameters of a stored procedure or function.";
export const params = {
  procedure: z
    .string()
    .describe("Stored procedure or function name"),
};

export async function handler(
  driver: DatabaseDriver,
  { procedure }: { procedure: string }
) {
  const info = await driver.describeProcedure(procedure);

  if (!info) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Procedure '${procedure}' not found, or this database does not support stored procedures.`,
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(info, null, 2),
      },
    ],
  };
}
