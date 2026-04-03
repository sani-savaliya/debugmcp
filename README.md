# debugmcp

Full-stack debug MCP server. Give [Claude Code](https://claude.ai/code) eyes on your **frontend**, **backend**, and **database** — all from one tool.

<!-- TODO: Add demo GIF here -->
<!-- ![demo](./assets/demo.gif) -->

> I was debugging a checkout issue — jumping between browser devtools, Postman, and pgAdmin for 30 minutes, copying values between windows, trying to figure out where the data went wrong. I built debugmcp so Claude can do that entire trace in seconds, from one prompt.

## Try It in 60 Seconds

**Browser only** — zero config, nothing to connect:

```bash
npx debugmcp --browser-only
```

That's it. Now register it with your AI tool:

<details>
<summary><b>Claude Code</b></summary>

```bash
claude mcp add debugger -- npx debugmcp --browser-only
```

</details>

<details>
<summary><b>Claude Desktop</b></summary>

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "debugger": {
      "command": "npx",
      "args": ["debugmcp", "--browser-only"]
    }
  }
}
```

</details>

<details>
<summary><b>Cursor</b></summary>

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "debugger": {
      "command": "npx",
      "args": ["debugmcp", "--browser-only"]
    }
  }
}
```

</details>

**With a database** — add your connection string:

```bash
# PostgreSQL
npx debugmcp --driver postgres --connection "postgresql://user:pass@localhost/mydb" --browser

# SQL Server
npx debugmcp --driver mssql --connection "Server=localhost;Database=mydb;User Id=sa;Password=pass;Encrypt=true" --browser

# MySQL
npx debugmcp --driver mysql --connection "mysql://user:pass@localhost/mydb" --browser

# SQLite
npx debugmcp --driver sqlite --connection "./mydb.sqlite" --browser
```

## Before vs After

```
Without debugmcp                          With debugmcp
─────────────────                         ──────────────
1. Open browser devtools                  1. "Why is the checkout total wrong?"
2. Check network tab                      2. ...that's it. Claude traces the
3. Copy API response                         full stack automatically.
4. Open database GUI
5. Write a query
6. Compare values manually
7. Check API source code
8. Guess what went wrong
9. Repeat for 30 minutes
```

## How It Works

debugmcp is a **tool provider**, not an AI. It gives Claude access to your browser and database. Claude decides what to do with them.

```
┌─────────────────────────────────────────────────┐
│                  CLAUDE CODE                     │
│                                                  │
│  Decides what to query, correlates results,      │
│  reads your source code, finds root causes       │
└──────┬───────────────────────┬───────────────────┘
       │ MCP tool calls        │ MCP tool calls
       ▼                       ▼
┌─────────────┐         ┌──────────────┐
│  Browser     │         │  Database     │
│  8 tools     │         │  5 tools      │
│              │         │               │
│  Navigate    │         │  list_tables  │
│  Snapshot    │         │  get_schema   │
│  Screenshot  │         │  run_query    │
│  Click/Type  │         │  describe_proc│
│  Network     │         │  list_schemas │
│  Console     │         │               │
│  Eval/Close  │         │  ┌──────────┐ │
│              │         │  │Validator │ │
│ (Playwright) │         │  │73+ tests │ │
│              │         │  └──────────┘ │
└──────┬───────┘         └──────┬────────┘
       │                        │
       ▼                        ▼
   Any website             PostgreSQL / MySQL
   Localhost               SQL Server / SQLite
```

## Real-World Debug Scenarios

### "UI shows 5 items but DB has 6"

```
You: "The checkout page shows $147.50 but the user was charged $152.00"

Claude:
  1. browser_navigate  → opens checkout page
  2. browser_snapshot  → reads displayed line items and total
  3. run_query         → SELECT * FROM order_items WHERE order_id = 4521
  4. Compares: UI shows 3 items ($147.50), DB has 4 items ($152.00)
     — the 4th item (shipping insurance, $4.50) was added from another tab
  5. browser_network   → confirms page never re-fetched after the add

  → Root cause: no real-time sync between tabs sharing a cart
```

### "User clicked Save but data is gone"

```
You: "User saved their profile, got a success message, but changes disappeared"

Claude:
  1. browser_navigate  → opens profile edit page
  2. browser_type      → fills test data, clicks Save
  3. browser_network   → sees POST /api/profile returned 200
  4. run_query         → SELECT * FROM user_profiles WHERE user_id = 42
     → Row still has OLD data
  5. Reads API source  → endpoint returns 200 before async queue processes

  → Root cause: fire-and-forget queue, 200 is sent optimistically
```

### "Price shows $10 but API returns $12"

```
You: "Product search prices are all wrong"

Claude:
  1. browser_navigate  → opens search, types "laptop"
  2. browser_network   → GET /api/search?q=laptop returns price_cents: 99900
     → displayed as "$99.90" (should be $999.00)
  3. run_query         → SELECT price_cents FROM products WHERE name ILIKE '%laptop%'
     → DB has 99900 (correct, stored in cents)
  4. Reads frontend    → finds: price = data.price_cents / 10000

  → Root cause: divides by 10000 instead of 100
```

### "Cache showing stale data"

```
You: "Updated a product price 30 min ago, page still shows old price"

Claude:
  1. browser_navigate  → opens product page
  2. browser_network   → Cache-Control: max-age=3600
  3. run_query         → SELECT price, updated_at FROM products WHERE id = 123
     → DB shows $29.99 updated 30 min ago
  4. browser_eval      → fetches /api/products/123 with cache-bust → $29.99 (correct)

  → Root cause: CDN cache TTL is 1 hour, old $24.99 still being served
```

### "User can't login but record exists"

```
You: "User says they can't login, but I can see their account in the DB"

Claude:
  1. run_query         → SELECT email, is_active, locked_at FROM users WHERE email = '...'
     → is_active = true, locked_at = NULL
  2. browser_navigate  → opens login page
  3. browser_type      → enters credentials, clicks Login
  4. browser_network   → POST /api/auth returns 401, body: "invalid_grant"
  5. browser_console   → no client-side errors
  6. Reads auth code   → finds bcrypt version mismatch after migration

  → Root cause: password hash uses bcrypt $2a$ but verifier expects $2b$
```

## Safety First

> **Safe mode is ON by default.** debugmcp cannot write to your database. Period.

### Two independent layers of protection

| Layer | What it does |
|-------|-------------|
| **Application validator** | Blocks INSERT, UPDATE, DELETE, DROP, ALTER, EXEC, and 20+ dangerous keywords *before* any query reaches the database. Dialect-specific rules block COPY (Postgres), LOAD DATA (MySQL), xp_cmdshell (MSSQL), ATTACH (SQLite). |
| **Database permissions** | Use a read-only DB user (see [setup](#database-setup)). Even if the validator were bypassed, the database itself rejects writes. |

**73 test cases** cover injection patterns including comment-hidden attacks, multi-statement injection, and dialect-specific exploits.

### What debugmcp does NOT do

- Does not store, log, or transmit any data externally
- Does not write to your database (blocked at application AND database level)
- Does not persist browser sessions, cookies, or screenshots to disk
- Does not phone home or collect telemetry
- Does not require internet access (runs entirely local via stdio)

### Connection strings: keep them out of git

| Approach | Example |
|----------|---------|
| **Environment variable** | `export DEBUGMCP_CONNECTION="postgresql://..."` |
| **Env interpolation in config** | `"connection": "$DATABASE_URL"` — resolved at runtime |
| **Secret manager** | `--connection "$(vault read -field=conn secret/db)"` |

### Browser data sensitivity

| Tool | Captures | Risk |
|------|----------|------|
| `browser_screenshot` | Full page PNG — may include PII, tokens in URL bar | High |
| `browser_network` | URLs, headers — may include auth tokens | High |
| `browser_eval` | Arbitrary JS — can access cookies, localStorage | High |
| `browser_snapshot` | Visible DOM text — may include user data | Medium |
| `browser_console` | Console output — may include logged secrets | Medium |

**Recommendation:** Use a staging environment with test accounts, not production with real users.

## Tools Reference

### Browser Tools (8)

| Tool | Description |
|------|-------------|
| `browser_navigate` | Navigate to URL (launches browser on first call) |
| `browser_snapshot` | Extract page content: headings, links, buttons, forms, tables |
| `browser_screenshot` | PNG screenshot of current page |
| `browser_click` | Click element by CSS selector or text |
| `browser_type` | Type into input by selector, label, or placeholder |
| `browser_network` | Recent network requests with status codes and timing |
| `browser_console` | Console errors and DOM error messages |
| `browser_eval` | Execute JavaScript in page context |
| `browser_close` | Close the browser |

### Database Tools (5 per connection)

| Tool | Description |
|------|-------------|
| `list_tables` | All tables with row counts |
| `get_table_schema` | Columns, types, keys, foreign keys |
| `run_query` | Read-only SQL (SELECT only — enforced) |
| `describe_procedure` | Stored procedure source and parameters |
| `list_schemas` | Database schemas/namespaces |

## Configuration

### CLI Flags

```
debugmcp [options]

Database:
  -d, --driver <type>        postgres, mssql, mysql, sqlite
  -c, --connection <string>  Connection string or file path
  -n, --name <name>          Display name for the connection
  --max-rows <number>        Max rows per query (default: 100)

Browser:
  -b, --browser              Enable browser tools alongside database
  --browser-only             Browser tools only, no database
  --headless                 Run browser headless (default: visible)

Config:
  --config <path>            Path to JSON config file
```

### Environment Variables

```bash
export DEBUGMCP_DRIVER=postgres
export DEBUGMCP_CONNECTION="postgresql://user:pass@localhost/mydb"
export DEBUGMCP_MAX_ROWS=200
```

### Config File (Multi-Database)

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
      "connection": "$ANALYTICS_DB_URL",
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

Multiple connections get prefixed tools: `app_list_tables`, `analytics_run_query`, etc.

## Database Setup

Create a read-only user. This is your safety net — even if the application validator were somehow bypassed, the database blocks writes.

<details>
<summary><b>PostgreSQL</b></summary>

```sql
CREATE ROLE debugmcp_readonly WITH LOGIN PASSWORD 'your_password';
GRANT CONNECT ON DATABASE mydb TO debugmcp_readonly;
GRANT USAGE ON SCHEMA public TO debugmcp_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO debugmcp_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO debugmcp_readonly;
```

</details>

<details>
<summary><b>SQL Server</b></summary>

```sql
CREATE LOGIN debugmcp_readonly WITH PASSWORD = 'your_password';
CREATE USER debugmcp_readonly FOR LOGIN debugmcp_readonly;
ALTER ROLE db_datareader ADD MEMBER debugmcp_readonly;
GRANT VIEW DEFINITION TO debugmcp_readonly;
DENY INSERT ON SCHEMA::dbo TO debugmcp_readonly;
DENY UPDATE ON SCHEMA::dbo TO debugmcp_readonly;
DENY DELETE ON SCHEMA::dbo TO debugmcp_readonly;
```

</details>

<details>
<summary><b>MySQL</b></summary>

```sql
CREATE USER 'debugmcp_readonly'@'%' IDENTIFIED BY 'your_password';
GRANT SELECT, SHOW VIEW ON mydb.* TO 'debugmcp_readonly'@'%';
FLUSH PRIVILEGES;
```

</details>

## Supported Databases

| Driver | Package | Install |
|--------|---------|---------|
| PostgreSQL | `pg` | `npm install pg` |
| SQL Server | `mssql` | `npm install mssql` |
| MySQL / MariaDB | `mysql2` | `npm install mysql2` |
| SQLite | `better-sqlite3` | `npm install better-sqlite3` |

Drivers are optional — only install what you need.

## Troubleshooting

**"Browser not started"** — The browser launches on first `browser_navigate`. Navigate to a URL first.

**Login required** — Use visible mode (default). Log in manually, then let Claude take over.

**"driver requires X package"** — Install the driver: `npm install pg` / `mssql` / `mysql2` / `better-sqlite3`

**Query blocked** — Only SELECT is allowed. This is by design. Use a database GUI for writes.

## License

MIT
