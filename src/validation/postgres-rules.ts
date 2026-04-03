import type { DialectRules } from "../types.js";

export const postgresRules: DialectRules = {
  name: "PostgreSQL",
  blockedPatterns: [
    /\bCOPY\b/i,
    /\\copy\b/i,
    /\bDO\s*\$\$/i, // DO $$ anonymous code blocks
    /\bSET\s+SESSION\b/i,
    /\bRESET\b/i,
    /\bLOAD\b/i,
  ],
  blockedPrefixes: [],
};
