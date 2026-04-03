import type { DialectRules } from "../types.js";

export const mysqlRules: DialectRules = {
  name: "MySQL",
  blockedPatterns: [
    /\bLOAD\s+DATA\b/i,
    /\bINTO\s+OUTFILE\b/i,
    /\bINTO\s+DUMPFILE\b/i,
    /\bSET\s+GLOBAL\b/i,
    /\bSET\s+@@/i,
    /\bFLUSH\b/i,
    /\bPURGE\b/i,
    /\bRESET\s+MASTER\b/i,
    /\bRESET\s+SLAVE\b/i,
  ],
  blockedPrefixes: [],
};
