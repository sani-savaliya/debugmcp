import type { DialectRules } from "../types.js";

export const mssqlRules: DialectRules = {
  name: "MSSQL",
  blockedPatterns: [
    /\bOPENROWSET\b/i,
    /\bOPENDATASOURCE\b/i,
    /\bOPENQUERY\b/i,
    /\bBULK\s+INSERT\b/i,
    /\bDBCC\b/i,
  ],
  blockedPrefixes: ["xp_", "sp_"],
};
