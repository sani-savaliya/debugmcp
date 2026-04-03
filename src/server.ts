import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig, ConnectionConfig, DatabaseDriver } from "./types.js";
import type { BrowserConfig } from "./browser/browser-manager.js";
import { createDriver } from "./drivers/driver-registry.js";
import { registerBrowserTools } from "./browser/browser-tools.js";
import { closeBrowser } from "./browser/browser-manager.js";

// Tool modules
import * as listTablesTool from "./tools/list-tables.js";
import * as getTableSchemaTool from "./tools/get-table-schema.js";
import * as runQueryTool from "./tools/run-query.js";
import * as describeProcedureTool from "./tools/describe-procedure.js";
import * as listSchemasTool from "./tools/list-schemas.js";

interface ActiveConnection {
  readonly config: ConnectionConfig;
  readonly driver: DatabaseDriver;
}

export async function startServer(
  appConfig: AppConfig,
  browserConfig: BrowserConfig | null
): Promise<void> {
  const server = new McpServer({
    name: "debugmcp",
    version: "0.1.0",
  });

  const connections: ActiveConnection[] = [];
  const isMultiDb = appConfig.connections.length > 1;
  const hasDb = appConfig.connections.length > 0;
  const hasBrowser = browserConfig !== null;

  // Connect to databases
  for (const connConfig of appConfig.connections) {
    console.error(
      `Connecting to ${connConfig.name} (${connConfig.driver})...`
    );
    const driver = await createDriver(connConfig.driver);
    await driver.connect(connConfig);
    connections.push({ config: connConfig, driver });
    console.error(`Connected: ${connConfig.name}`);
  }

  // Register database tools
  for (const { config: cc, driver } of connections) {
    const prefix = isMultiDb ? `${cc.name}_` : "";

    server.tool(
      `${prefix}${listTablesTool.name}`,
      listTablesTool.description,
      listTablesTool.params,
      (args) => listTablesTool.handler(driver, args)
    );

    server.tool(
      `${prefix}${getTableSchemaTool.name}`,
      getTableSchemaTool.description,
      getTableSchemaTool.params,
      (args) => getTableSchemaTool.handler(driver, args)
    );

    const queryHandler = runQueryTool.createHandler(
      cc.driver,
      cc.maxRows
    );
    server.tool(
      `${prefix}${runQueryTool.name}`,
      runQueryTool.description,
      runQueryTool.params,
      (args) => queryHandler(driver, args)
    );

    server.tool(
      `${prefix}${describeProcedureTool.name}`,
      describeProcedureTool.description,
      describeProcedureTool.params,
      (args) => describeProcedureTool.handler(driver, args)
    );

    server.tool(
      `${prefix}${listSchemasTool.name}`,
      listSchemasTool.description,
      listSchemasTool.params,
      () => listSchemasTool.handler(driver)
    );
  }

  // Register browser tools
  if (hasBrowser) {
    registerBrowserTools(server, browserConfig);
    console.error("Browser tools registered (Playwright)");
  }

  // Start stdio transport
  const { StdioServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/stdio.js"
  );
  const transport = new StdioServerTransport();
  await server.connect(transport);

  const dbToolCount = connections.length * 5;
  const browserToolCount = hasBrowser ? 8 : 0;
  const totalTools = dbToolCount + browserToolCount;

  console.error(
    `debugmcp running — ${connections.length} database(s), ${hasBrowser ? "browser enabled" : "no browser"}, ${totalTools} tools`
  );

  // Graceful shutdown
  const shutdown = async () => {
    console.error("Shutting down debugmcp...");
    for (const { config: cc, driver } of connections) {
      try {
        await driver.disconnect();
      } catch (err) {
        console.error(`Error disconnecting ${cc.name}:`, err);
      }
    }
    if (hasBrowser) {
      await closeBrowser();
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
