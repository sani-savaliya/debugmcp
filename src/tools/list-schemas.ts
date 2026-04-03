import { z } from "zod";
import type { DatabaseDriver } from "../types.js";

export const name = "list_schemas";
export const description = "List all schemas or namespaces in the database.";
export const params = {};

export async function handler(driver: DatabaseDriver) {
  const schemas = await driver.listSchemas();
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          { schemaCount: schemas.length, schemas },
          null,
          2
        ),
      },
    ],
  };
}
