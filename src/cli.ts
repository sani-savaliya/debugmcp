import { Command } from "commander";

export interface CliOptions {
  readonly driver?: string;
  readonly connection?: string;
  readonly config?: string;
  readonly maxRows?: number;
  readonly name?: string;
  readonly browser?: boolean;
  readonly headless?: boolean;
  readonly browserOnly?: boolean;
}

export function parseCli(argv: string[]): CliOptions {
  const program = new Command();

  program
    .name("debugmcp")
    .description(
      "Full-stack debug MCP server — give Claude Code eyes on your frontend, backend, and database"
    )
    .version("0.1.0")
    .option(
      "-d, --driver <type>",
      "Database driver: postgres, mssql, mysql, sqlite"
    )
    .option("-c, --connection <string>", "Database connection string or path")
    .option("--config <path>", "Path to JSON config file")
    .option(
      "--max-rows <number>",
      "Maximum rows per query (default: 100)",
      parseInt
    )
    .option("-n, --name <name>", "Display name for the connection")
    .option(
      "-b, --browser",
      "Enable browser tools (Playwright) alongside database tools"
    )
    .option(
      "--headless",
      "Run browser in headless mode (default: visible)",
      false
    )
    .option(
      "--browser-only",
      "Only start browser tools, no database connection"
    );

  program.parse(argv);
  const opts = program.opts();

  return {
    driver: opts.driver,
    connection: opts.connection,
    config: opts.config,
    maxRows: opts.maxRows,
    name: opts.name,
    browser: opts.browser ?? false,
    headless: opts.headless ?? false,
    browserOnly: opts.browserOnly ?? false,
  };
}
