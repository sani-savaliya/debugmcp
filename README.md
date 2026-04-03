# debugmcp

Full-stack debug MCP server. Give [Claude Code](https://claude.ai/code) eyes on your **frontend**, **backend**, and **database** — all from one package.

```
You: "The checkout page isn't updating the order total correctly — trace it"

Claude Code: [opens browser, navigates to checkout, captures network requests,
              queries the database, reads the API source code, finds the bug]
```

## What It Does

```
┌─────────────────────────────────────────────┐
│              CLAUDE CODE                    │
│          (MCP Client / Orchestrator)         │
└────┬──────────────────┬─────────────────────┘
     │                  │
     ▼                  ▼
┌─────────┐      ┌──────────┐
│ Browser  │      │ Database │
│ Tools    │      │ Tools    │
│(Playwright)     │(Any SQL) │
└────┬────┘      └────┬─────┘
     │                │
     ▼                ▼
  Any website     PostgreSQL / MySQL
  Dev sites       SQL Server / SQLite
  Localhost       Any SQL database
```

**Browser tools** let Claude navigate your app, click buttons, fill forms, take screenshots, inspect network requests, and read console errors.

**Database tools** let Claude query your database, inspect schemas, read stored procedures, and trace data — all read-only with injection protection.

**Together**, Claude can trace a bug from the UI all the way to the database row.

## Quick Start

### Browser Only (no database)

```bash
# Register with Claude Code
claude mcp add debugger -- npx debugmcp --browser-only

# Then ask Claude:
# "Open https://myapp.com and check if the login form works"
# "Navigate to the dashboard and screenshot it"
# "What API calls fire when I click Submit?"
```

### Database Only (no browser)

```bash
# PostgreSQL
claude mcp add debugger -- npx debugmcp --driver postgres --connection "postgresql://user:pass@localhost/mydb"

# SQL Server
claude mcp add debugger -- npx debugmcp --driver mssql --connection "Server=localhost;Database=mydb;User Id=sa;Password=pass;Encrypt=true"

# MySQL
claude mcp add debugger -- npx debugmcp --driver mysql --connection "mysql://user:pass@localhost/mydb"

# SQLite
claude mcp add debugger -- npx debugmcp --driver sqlite --connection "./mydb.sqlite"
```

### Full Stack (browser + database)

```bash
# The full power — browser and database together
claude mcp add debugger -- npx debugmcp \
  --driver postgres --connection "postgresql://user:pass@localhost/mydb" \
  --browser
```

Now Claude can navigate your app AND query the database to cross-reference what the UI shows with what's actually in the data.

## Tools

### Browser Tools (8 tools)

| Tool | Description |
|------|-------------|
| `browser_navigate` | Navigate to a URL (launches browser if needed) |
| `browser_snapshot` | Extract page content: headings, links, buttons, forms, tables, text |
| `browser_screenshot` | Take a PNG screenshot of the current page |
| `browser_click` | Click an element by CSS selector or text content |
| `browser_type` | Type text into an input by selector, label, or placeholder |
| `browser_network` | Get recent network requests (API calls, status codes, timing) |
| `browser_console` | Get console errors and DOM error messages |
| `browser_eval` | Execute JavaScript in the page context |
| `browser_close` | Close the browser |

### Database Tools (5 tools per connection)

| Tool | Description |
|------|-------------|
| `list_tables` | List all tables with row counts |
| `get_table_schema` | Column definitions, types, keys, foreign keys |
| `run_query` | Execute read-only SQL (SELECT only — enforced) |
| `describe_procedure` | Stored procedure/function source code and parameters |
| `list_schemas` | List database schemas/namespaces |

## Configuration

### CLI Flags

```bash
debugmcp [options]

Database:
  -d, --driver <type>        Database driver: postgres, mssql, mysql, sqlite
  -c, --connection <string>  Connection string or file path
  -n, --name <name>          Display name for the connection
  --max-rows <number>        Max rows per query (default: 100)

Browser:
  -b, --browser              Enable browser tools alongside database
  --browser-only             Browser tools only, no database
  --headless                 Run browser in headless mode (default: visible)

Config:
  --config <path>            Path to JSON config file
```

### Environment Variables

```bash
export DEBUGMCP_DRIVER=postgres
export DEBUGMCP_CONNECTION="postgresql://user:pass@localhost/mydb"
export DEBUGMCP_MAX_ROWS=200
```

### Config File (Multi-Database + Browser)

```json
{
  "browser": {
    "enabled": true,
    "headless": false
  },
  "connections": {
    "app": {
      "driver": "postgres",
      "connection": "$DATABASE_URL"
    },
    "analytics": {
      "driver": "mysql",
      "connection": "mysql://analyst:pass@analytics-host/warehouse",
      "maxRows": 500
    }
  },
  "defaults": {
    "maxRows": 100
  }
}
```

```bash
claude mcp add debugger -- npx debugmcp --config ./debugmcp.json
```

With multiple database connections, tools are prefixed: `app_list_tables`, `analytics_run_query`, etc.

## Read-Only Safety

**Two layers of protection for database queries:**

1. **Application layer** — Query validator blocks INSERT, UPDATE, DELETE, DROP, ALTER, EXEC, and 20+ dangerous keywords. Dialect-specific rules block COPY (Postgres), LOAD DATA (MySQL), xp_cmdshell (MSSQL), ATTACH (SQLite). **73 test cases** cover injection patterns.

2. **Database layer** — Use a read-only database user. See [Database Setup](#database-setup) below.

## Database Setup

### PostgreSQL

```sql
CREATE ROLE debugmcp_readonly WITH LOGIN PASSWORD 'your_password';
GRANT CONNECT ON DATABASE mydb TO debugmcp_readonly;
GRANT USAGE ON SCHEMA public TO debugmcp_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO debugmcp_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO debugmcp_readonly;
```

### SQL Server

```sql
CREATE LOGIN debugmcp_readonly WITH PASSWORD = 'your_password';
-- Run on your database:
CREATE USER debugmcp_readonly FOR LOGIN debugmcp_readonly;
ALTER ROLE db_datareader ADD MEMBER debugmcp_readonly;
GRANT VIEW DEFINITION TO debugmcp_readonly;
DENY INSERT ON SCHEMA::dbo TO debugmcp_readonly;
DENY UPDATE ON SCHEMA::dbo TO debugmcp_readonly;
DENY DELETE ON SCHEMA::dbo TO debugmcp_readonly;
```

### MySQL

```sql
CREATE USER 'debugmcp_readonly'@'%' IDENTIFIED BY 'your_password';
GRANT SELECT, SHOW VIEW ON mydb.* TO 'debugmcp_readonly'@'%';
FLUSH PRIVILEGES;
```

## Supported Databases

| Driver | Package | Install |
|--------|---------|---------|
| PostgreSQL | `pg` | `npm install pg` |
| SQL Server | `mssql` | `npm install mssql` |
| MySQL / MariaDB | `mysql2` | `npm install mysql2` |
| SQLite | `better-sqlite3` | `npm install better-sqlite3` |

Database drivers are optional dependencies — only install the one you need.

## Examples

### Debug a Full-Stack Bug

```
You: "Users are seeing stale prices on the product page. Trace it."

Claude: [navigates to product page in browser]
        [captures network requests — sees GET /api/products/123]
        [queries database: SELECT price, updated_at FROM products WHERE id = 123]
        [compares: DB shows $29.99 updated 2 mins ago, but API returned $24.99]
        [reads API source code, finds Redis cache with 1-hour TTL]
        "The product page shows stale prices because the API caches product data
         in Redis with a 1-hour TTL. The database has $29.99 but the cached
         response still returns the old $24.99."
```

### Cross-Reference UI and Database

```
You: "The orders table on the admin dashboard shows 150 orders but the count looks wrong"

Claude: [opens admin dashboard, snapshots the orders table]
        [queries: SELECT COUNT(*) FROM orders WHERE status = 'active']
        "The dashboard shows 150 orders but the database has 147 active orders.
         The discrepancy is because the dashboard includes 3 'pending_review' orders
         in the count. The API query at /api/admin/orders uses status IN ('active', 'pending_review')."
```

## Troubleshooting

### Browser: "Browser not started"

The browser launches lazily on first `browser_navigate`. Make sure you navigate to a URL first.

### Browser: Login required

For authenticated pages, use `--headless` (default is visible browser). Log in manually in the visible browser, then let Claude take over.

### Database: "driver requires X package"

Install the database driver:
```bash
npm install pg          # PostgreSQL
npm install mssql       # SQL Server
npm install mysql2      # MySQL
npm install better-sqlite3  # SQLite
```

### Database: Query blocked

Only SELECT queries are allowed. Remove any INSERT/UPDATE/DELETE/DROP statements.

## License

MIT
