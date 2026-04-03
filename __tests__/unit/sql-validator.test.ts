import { describe, it, expect } from "vitest";
import { validateQuery } from "../../src/validation/sql-validator.js";
import { mssqlRules } from "../../src/validation/mssql-rules.js";
import { postgresRules } from "../../src/validation/postgres-rules.js";
import { mysqlRules } from "../../src/validation/mysql-rules.js";
import { sqliteRules } from "../../src/validation/sqlite-rules.js";

// ==================== BASE VALIDATOR (NO DIALECT) ====================

describe("validateQuery (base)", () => {
  describe("allows valid read-only queries", () => {
    it("allows simple SELECT", () => {
      expect(validateQuery("SELECT * FROM users")).toEqual({ safe: true });
    });

    it("allows SELECT with TOP", () => {
      expect(validateQuery("SELECT TOP 10 * FROM users")).toEqual({ safe: true });
    });

    it("allows SELECT with WHERE", () => {
      expect(validateQuery("SELECT id, name FROM users WHERE active = 1")).toEqual({ safe: true });
    });

    it("allows CTE (WITH ... SELECT)", () => {
      expect(validateQuery("WITH cte AS (SELECT id FROM users) SELECT * FROM cte")).toEqual({ safe: true });
    });

    it("allows DECLARE with SELECT", () => {
      expect(validateQuery("DECLARE @id INT = 5; SELECT * FROM users WHERE id = @id")).toEqual({ safe: true });
    });

    it("allows lowercase", () => {
      expect(validateQuery("select * from users")).toEqual({ safe: true });
    });

    it("allows mixed case", () => {
      expect(validateQuery("Select Top 10 * From Users")).toEqual({ safe: true });
    });

    it("allows leading/trailing whitespace", () => {
      expect(validateQuery("  SELECT 1  ")).toEqual({ safe: true });
    });

    it("allows subqueries", () => {
      expect(validateQuery("SELECT * FROM users WHERE id IN (SELECT user_id FROM orders)")).toEqual({ safe: true });
    });

    it("allows JOINs", () => {
      expect(validateQuery("SELECT u.id, o.total FROM users u JOIN orders o ON u.id = o.user_id")).toEqual({ safe: true });
    });

    it("allows aggregation", () => {
      expect(validateQuery("SELECT status, COUNT(*) as cnt FROM users GROUP BY status")).toEqual({ safe: true });
    });

    it("allows INFORMATION_SCHEMA", () => {
      expect(validateQuery("SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'users'")).toEqual({ safe: true });
    });

    it("allows trailing semicolon", () => {
      expect(validateQuery("SELECT 1;")).toEqual({ safe: true });
    });

    it("allows LIMIT clause", () => {
      expect(validateQuery("SELECT * FROM users LIMIT 10")).toEqual({ safe: true });
    });

    it("allows OFFSET clause", () => {
      expect(validateQuery("SELECT * FROM users LIMIT 10 OFFSET 20")).toEqual({ safe: true });
    });

    it("allows UNION", () => {
      expect(validateQuery("SELECT id FROM users UNION SELECT id FROM admins")).toEqual({ safe: true });
    });

    it("allows CASE expressions", () => {
      expect(validateQuery("SELECT CASE WHEN active = 1 THEN 'yes' ELSE 'no' END FROM users")).toEqual({ safe: true });
    });

    it("allows window functions", () => {
      expect(validateQuery("SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM users")).toEqual({ safe: true });
    });

    it("allows HAVING clause", () => {
      expect(validateQuery("SELECT status, COUNT(*) FROM users GROUP BY status HAVING COUNT(*) > 5")).toEqual({ safe: true });
    });

    it("allows DISTINCT", () => {
      expect(validateQuery("SELECT DISTINCT status FROM users")).toEqual({ safe: true });
    });
  });

  describe("blocks dangerous queries", () => {
    it("blocks DELETE", () => {
      const r = validateQuery("DELETE FROM users");
      expect(r.safe).toBe(false);
      expect(r.reason).toContain("DELETE");
    });

    it("blocks DROP TABLE", () => {
      expect(validateQuery("DROP TABLE users").safe).toBe(false);
    });

    it("blocks INSERT", () => {
      expect(validateQuery("INSERT INTO users (name) VALUES ('test')").safe).toBe(false);
    });

    it("blocks UPDATE", () => {
      expect(validateQuery("UPDATE users SET name = 'test'").safe).toBe(false);
    });

    it("blocks TRUNCATE", () => {
      expect(validateQuery("TRUNCATE TABLE users").safe).toBe(false);
    });

    it("blocks ALTER", () => {
      expect(validateQuery("ALTER TABLE users ADD col INT").safe).toBe(false);
    });

    it("blocks CREATE", () => {
      expect(validateQuery("CREATE TABLE evil (id INT)").safe).toBe(false);
    });

    it("blocks EXEC", () => {
      expect(validateQuery("EXEC some_proc").safe).toBe(false);
    });

    it("blocks EXECUTE", () => {
      expect(validateQuery("EXECUTE some_proc").safe).toBe(false);
    });

    it("blocks GRANT", () => {
      expect(validateQuery("GRANT SELECT ON users TO someone").safe).toBe(false);
    });

    it("blocks MERGE", () => {
      expect(validateQuery("MERGE INTO users USING src ON users.id = src.id WHEN MATCHED THEN UPDATE SET name = src.name").safe).toBe(false);
    });

    it("blocks BACKUP", () => {
      expect(validateQuery("BACKUP DATABASE mydb TO DISK = 'path'").safe).toBe(false);
    });

    it("blocks SHUTDOWN", () => {
      expect(validateQuery("SHUTDOWN").safe).toBe(false);
    });

    it("blocks REVOKE", () => {
      expect(validateQuery("REVOKE SELECT ON users FROM someone").safe).toBe(false);
    });

    it("blocks DENY", () => {
      expect(validateQuery("DENY SELECT ON users TO someone").safe).toBe(false);
    });

    it("blocks RESTORE", () => {
      expect(validateQuery("RESTORE DATABASE mydb FROM DISK = 'path'").safe).toBe(false);
    });
  });

  describe("blocks injection patterns", () => {
    it("blocks SELECT followed by DELETE via semicolon", () => {
      expect(validateQuery("SELECT 1; DELETE FROM users").safe).toBe(false);
    });

    it("blocks comment-hidden DELETE", () => {
      expect(validateQuery("/* harmless */ DELETE FROM users").safe).toBe(false);
    });

    it("blocks line-comment-hidden DELETE", () => {
      expect(validateQuery("-- comment\nDELETE FROM users").safe).toBe(false);
    });

    it("blocks DECLARE without SELECT", () => {
      const r = validateQuery("DECLARE @x INT = 1");
      expect(r.safe).toBe(false);
      expect(r.reason).toContain("DECLARE block must contain a SELECT");
    });
  });

  describe("edge cases", () => {
    it("blocks empty string", () => {
      expect(validateQuery("").safe).toBe(false);
    });

    it("blocks whitespace only", () => {
      expect(validateQuery("   ").safe).toBe(false);
    });

    it("blocks comments only", () => {
      expect(validateQuery("/* just a comment */").safe).toBe(false);
    });

    it("blocks line comments only", () => {
      expect(validateQuery("-- just a comment").safe).toBe(false);
    });

    it("blocks random text", () => {
      expect(validateQuery("hello world").safe).toBe(false);
    });
  });
});

// ==================== MSSQL DIALECT ====================

describe("validateQuery (MSSQL)", () => {
  it("blocks xp_ procedures", () => {
    const r = validateQuery("SELECT 1; xp_cmdshell 'dir'", mssqlRules);
    expect(r.safe).toBe(false);
  });

  it("blocks sp_ procedures", () => {
    const r = validateQuery("SELECT 1; sp_executesql 'query'", mssqlRules);
    expect(r.safe).toBe(false);
  });

  it("blocks OPENROWSET", () => {
    const r = validateQuery("SELECT * FROM OPENROWSET('provider', 'conn', 'query')", mssqlRules);
    expect(r.safe).toBe(false);
  });

  it("blocks OPENDATASOURCE", () => {
    const r = validateQuery("SELECT * FROM OPENDATASOURCE('provider', 'conn').db.dbo.table", mssqlRules);
    expect(r.safe).toBe(false);
  });

  it("blocks OPENQUERY", () => {
    const r = validateQuery("SELECT * FROM OPENQUERY(server, 'query')", mssqlRules);
    expect(r.safe).toBe(false);
  });

  it("blocks DBCC", () => {
    const r = validateQuery("SELECT 1; DBCC CHECKDB", mssqlRules);
    expect(r.safe).toBe(false);
  });

  it("blocks BULK INSERT", () => {
    const r = validateQuery("SELECT 1; BULK INSERT users FROM 'file.csv'", mssqlRules);
    expect(r.safe).toBe(false);
  });

  it("allows normal SELECT with MSSQL rules", () => {
    expect(validateQuery("SELECT TOP 10 * FROM users", mssqlRules)).toEqual({ safe: true });
  });
});

// ==================== POSTGRESQL DIALECT ====================

describe("validateQuery (PostgreSQL)", () => {
  it("blocks COPY", () => {
    const r = validateQuery("SELECT 1; COPY users TO '/tmp/out.csv'", postgresRules);
    expect(r.safe).toBe(false);
  });

  it("blocks DO $$ blocks", () => {
    const r = validateQuery("SELECT 1; DO $$ BEGIN RAISE NOTICE 'hi'; END $$", postgresRules);
    expect(r.safe).toBe(false);
  });

  it("blocks SET SESSION", () => {
    const r = validateQuery("SELECT 1; SET SESSION AUTHORIZATION 'admin'", postgresRules);
    expect(r.safe).toBe(false);
  });

  it("blocks LOAD", () => {
    const r = validateQuery("SELECT 1; LOAD 'malicious.so'", postgresRules);
    expect(r.safe).toBe(false);
  });

  it("allows normal SELECT with Postgres rules", () => {
    expect(validateQuery("SELECT * FROM users LIMIT 10", postgresRules)).toEqual({ safe: true });
  });

  it("allows pg_catalog queries", () => {
    expect(validateQuery("SELECT * FROM pg_catalog.pg_tables", postgresRules)).toEqual({ safe: true });
  });
});

// ==================== MYSQL DIALECT ====================

describe("validateQuery (MySQL)", () => {
  it("blocks LOAD DATA", () => {
    const r = validateQuery("SELECT 1; LOAD DATA INFILE '/tmp/data.csv' INTO TABLE users", mysqlRules);
    expect(r.safe).toBe(false);
  });

  it("blocks INTO OUTFILE", () => {
    const r = validateQuery("SELECT * FROM users INTO OUTFILE '/tmp/out.csv'", mysqlRules);
    expect(r.safe).toBe(false);
  });

  it("blocks INTO DUMPFILE", () => {
    const r = validateQuery("SELECT * FROM users INTO DUMPFILE '/tmp/dump'", mysqlRules);
    expect(r.safe).toBe(false);
  });

  it("blocks SET GLOBAL", () => {
    const r = validateQuery("SELECT 1; SET GLOBAL max_connections = 1000", mysqlRules);
    expect(r.safe).toBe(false);
  });

  it("blocks SET @@", () => {
    const r = validateQuery("SELECT 1; SET @@global.max_connections = 1000", mysqlRules);
    expect(r.safe).toBe(false);
  });

  it("blocks FLUSH", () => {
    const r = validateQuery("SELECT 1; FLUSH PRIVILEGES", mysqlRules);
    expect(r.safe).toBe(false);
  });

  it("blocks PURGE", () => {
    const r = validateQuery("SELECT 1; PURGE BINARY LOGS BEFORE '2024-01-01'", mysqlRules);
    expect(r.safe).toBe(false);
  });

  it("allows normal SELECT with MySQL rules", () => {
    expect(validateQuery("SELECT * FROM users LIMIT 10", mysqlRules)).toEqual({ safe: true });
  });
});

// ==================== SQLITE DIALECT ====================

describe("validateQuery (SQLite)", () => {
  it("blocks ATTACH", () => {
    const r = validateQuery("SELECT 1; ATTACH DATABASE 'other.db' AS other", sqliteRules);
    expect(r.safe).toBe(false);
  });

  it("blocks DETACH", () => {
    const r = validateQuery("SELECT 1; DETACH DATABASE other", sqliteRules);
    expect(r.safe).toBe(false);
  });

  it("blocks VACUUM", () => {
    const r = validateQuery("SELECT 1; VACUUM", sqliteRules);
    expect(r.safe).toBe(false);
  });

  it("blocks PRAGMA writes", () => {
    const r = validateQuery("SELECT 1; PRAGMA journal_mode = WAL", sqliteRules);
    expect(r.safe).toBe(false);
  });

  it("allows PRAGMA reads (no assignment)", () => {
    expect(validateQuery("SELECT * FROM pragma_table_info('users')", sqliteRules)).toEqual({ safe: true });
  });

  it("allows normal SELECT with SQLite rules", () => {
    expect(validateQuery("SELECT * FROM users LIMIT 10", sqliteRules)).toEqual({ safe: true });
  });
});
