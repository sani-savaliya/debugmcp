import type { DialectRules } from "../types.js";

export const sqliteRules: DialectRules = {
  name: "SQLite",
  blockedPatterns: [
    /\bATTACH\b/i,
    /\bDETACH\b/i,
    /\bVACUUM\b/i,
    /\bREINDEX\b/i,
    /\bPRAGMA\s+\w+\s*=/i, // PRAGMA writes (e.g., PRAGMA journal_mode = WAL)
  ],
  blockedPrefixes: [],
};
