# debugmcp

Full-stack debug MCP server. Give [Claude Code](https://claude.ai/code) eyes on your **frontend**, **backend**, and **database** — all from one package.

```
You: "The checkout page isn't updating the order total correctly — trace it"

Claude Code: [opens browser, navigates to checkout, captures network requests,
              queries the database, reads the API source code, finds the bug]
```

## Architecture

debugmcp is a **tool provider**, not an orchestrator. It registers tools with Claude Code via the [Model Context Protocol](https://modelcontextprotocol.io). Claude Code decides when and how to use them.

```
┌──────────────────────────────────────────────────────────┐
│                     CLAUDE CODE                          │
│              (MCP Client / Orchestrator)                 │
│                                                          │
│  Claude decides:                                         │
│  - Which tools to call and in what order                 │
│  - How to correlate browser state with database state    │
│  - How to read your source code to find root causes      │
│  - What to report back to you                            │
└──────┬──────────────────────┬────────────────────────────┘
       │ MCP tool calls       │ MCP tool calls
       ▼                      ▼
┌─────────────┐        ┌──────────────┐
│  Browser     │        │  Database     │
│  Tools (8)   │        │  Tools (5)    │
│              │        │               │
│  Navigate    │        │  list_tables  │
│  Snapshot    │        │  get_schema   │
│  Screenshot  │        │  run_query    │
│  Click/Type  │        │  describe_proc│
│  Network     │        │  list_schemas │
│  Console     │        │               │
│  Eval        │        │  ┌──────────┐ │
│              │        │  │Validator │ │
│  (Playwright)│        │  │73+ tests │ │
│              │        │  └──────────┘ │
└──────┬───────┘        └──────┬────────┘
       │                       │
       ▼                       ▼
   Any website            PostgreSQL / MySQL
   Dev sites              SQL Server / SQLite
   Localhost              Any SQL database
```

**What debugmcp does:** Connects to browsers and databases, exposes them as MCP tools, validates all SQL for safety, and returns results.

**What debugmcp does NOT do:** It does not decide what to query, interpret results, correlate data, or generate conclusions — that's all Claude Code.

## Real-World Debug Scenarios

### "Checkout total mismatch"

```
You: "The checkout page shows $147.50 but the user was charged $152.00"

Claude Code:
  1. browser_navigate → opens checkout page
  2. browser_snapshot → reads the displayed line items and total
  3. run_query → SELECT * FROM order_items WHERE order_id = 4521
  4. Compares: UI shows 3 items totaling $147.50, but DB has 4 items
     totaling $152.00 — the 4th item (shipping insurance, $4.50)
     was added after the page loaded
  5. browser_network → confirms the page never re-fetched after
     the insurance was added via a different tab
  → Root cause: no real-time sync between tabs sharing a cart
```

### "UI says saved, but DB row is missing"

```
You: "User clicked Save and got a success toast, but their profile changes are gone"

Claude Code:
  1. browser_navigate → opens the profile edit page
  2. browser_type → fills in test data, clicks Save
  3. browser_network → sees POST /api/profile returned 200
  4. run_query → SELECT * FROM user_profiles WHERE user_id = 42
     → Row still has OLD data
  5. Reads API source code → finds the endpoint returns 200
     before the async queue processes the update
  → Root cause: fire-and-forget queue with no error callback;
    the 200 is sent optimistically
```

### "API returns 200 but wrong data"

```
You: "Product search returns results but the prices are all wrong"

Claude Code:
  1. browser_navigate → opens search page, searches "laptop"
  2. browser_network → GET /api/search?q=laptop returns 200
     with price_cents: 99900 displayed as "$99.90" (should be $999.00)
  3. run_query → SELECT price_cents FROM products WHERE name ILIKE '%laptop%'
     → DB has 99900 (correct, stored in cents)
  4. Reads frontend code → finds: price = data.price_cents / 10000
  → Root cause: frontend divides by 10000 instead of 100
```

### "Stale cache serving old data"

```
You: "Updated a product price 30 minutes ago but the page still shows the old one"

Claude Code:
  1. browser_navigate → opens product page
  2. browser_network → response header shows Cache-Control: max-age=3600
  3. run_query → SELECT price, updated_at FROM products WHERE id = 123
     → DB shows $29.99 updated 30 mins ago
  4. browser_eval → fetches /api/products/123 with cache-bust
     → fresh response returns $29.99 (correct)
  → Root cause: CDN/browser cache TTL is 1 hour; the old $24.99
    will self-correct in ~30 more minutes, or needs a cache purge
```

## Quick Start

### Browser Only (no database)

```bash
claude mcp add debugger -- npx debugmcp --browser-only
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
claude mcp add debugger -- npx debugmcp \
  --driver postgres --connection "postgresql://user:pass@localhost/mydb" \
  --browser
```

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

## Safety & Security

### Database: Read-Only by Design

**Two independent layers of protection:**

1. **Application layer** — The SQL validator blocks INSERT, UPDATE, DELETE, DROP, ALTER, EXEC, and 20+ dangerous keywords before any query reaches the database. Dialect-specific rules block COPY (Postgres), LOAD DATA (MySQL), xp_cmdshell (MSSQL), ATTACH (SQLite). **73+ test cases** cover injection patterns including comment-hidden attacks and multi-statement injection.

2. **Database layer** — Always create a dedicated read-only user (see [Database Setup](#database-setup)). Even if someone finds a way past the application validator, the database itself will reject writes.

### Connection Strings: Keep Them Out of Git

Connection strings contain credentials. **Never put them in your config file if that file is committed.** Use one of these approaches:

| Approach | How |
|----------|-----|
| **Environment variables** | Set `DEBUGMCP_CONNECTION` in your shell profile or `.env` file (gitignored) |
| **Config with env interpolation** | Use `"connection": "$DATABASE_URL"` in config — debugmcp resolves `$VAR` references at runtime |
| **CLI args from a secret manager** | `claude mcp add debugger -- npx debugmcp --connection "$(vault read -field=conn secret/db)"` |

### Browser: What Gets Captured

Browser tools can expose sensitive data. Be aware of what flows through:

| Tool | What it captures | Sensitivity |
|------|-----------------|-------------|
| `browser_screenshot` | Full page PNG — may include PII, tokens in URL bars, logged-in content | **High** |
| `browser_network` | URLs, status codes, timing — may include auth tokens in headers/URLs | **High** |
| `browser_snapshot` | Visible DOM text — may include user data displayed on page | **Medium** |
| `browser_console` | Console output — may include logged tokens or error details | **Medium** |
| `browser_eval` | Arbitrary JS execution — can access cookies, localStorage, sessionStorage | **High** |

**Recommendations for production-adjacent use:**

- Use a **staging/dev environment**, not production, whenever possible
- Use a **test account** with synthetic data, not real user accounts
- Run in `--headless` mode to avoid leaving visible browser sessions open
- The MCP transport is local stdio — data stays between Claude Code and the server on your machine. Nothing is sent to external services by debugmcp itself.

### What debugmcp Does NOT Do

- Does not store, log, or transmit any data externally
- Does not execute write operations against your database
- Does not persist browser sessions, cookies, or screenshots to disk
- Does not phone home or collect telemetry

## Database Setup

Create a dedicated read-only user for debugmcp. This is your safety net — even if the SQL validator were bypassed, the database itself blocks writes.

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

## Troubleshooting

### Browser: "Browser not started"

The browser launches lazily on first `browser_navigate`. Make sure you navigate to a URL first.

### Browser: Login required

For authenticated pages, use visible mode (default). Log in manually in the visible browser, then let Claude take over. Use `--headless` only for pages that don't require login.

### Database: "driver requires X package"

Install the database driver:
```bash
npm install pg          # PostgreSQL
npm install mssql       # SQL Server
npm install mysql2      # MySQL
npm install better-sqlite3  # SQLite
```

### Database: Query blocked

Only SELECT queries are allowed. The validator blocks INSERT, UPDATE, DELETE, DROP, and other write operations. This is intentional — use a database GUI for writes.

## License

MIT
