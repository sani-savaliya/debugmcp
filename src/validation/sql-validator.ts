import type { ValidationResult, DialectRules } from "../types.js";

// ============================================================
// Base blocked keywords — applies to ALL SQL dialects
// ============================================================
const BASE_BLOCKED_KEYWORDS = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "DROP",
  "ALTER",
  "CREATE",
  "TRUNCATE",
  "MERGE",
  "GRANT",
  "REVOKE",
  "DENY",
  "BACKUP",
  "RESTORE",
  "SHUTDOWN",
] as const;

const BASE_BLOCKED_EXEC = ["EXEC", "EXECUTE"] as const;

/**
 * Strips SQL comments (block and line) to prevent comment-based bypass.
 */
function stripComments(query: string): string {
  let result = query.replace(/\/\*[\s\S]*?\*\//g, " ");
  result = result.replace(/--[^\n]*/g, " ");
  return result;
}

/**
 * Strips string literals to prevent false positives on keywords
 * inside strings, and to detect semicolons outside of strings.
 */
function stripStrings(query: string): string {
  return query
    .replace(/'[^']*'/g, "''")
    .replace(/"[^"]*"/g, '""');
}

/**
 * Validates that a SQL query is read-only.
 *
 * @param query - The SQL query string to validate
 * @param dialect - Optional dialect-specific rules for additional blocking
 * @returns ValidationResult indicating if the query is safe
 */
export function validateQuery(
  query: string,
  dialect?: DialectRules
): ValidationResult {
  if (!query || !query.trim()) {
    return { safe: false, reason: "Query is empty" };
  }

  const stripped = stripComments(query);
  const normalized = stripped.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return { safe: false, reason: "Query is empty after stripping comments" };
  }

  const upper = normalized.toUpperCase();
  const firstToken = upper.split(/[\s(]+/)[0];

  // First token must be SELECT, WITH, or DECLARE
  if (
    firstToken !== "SELECT" &&
    firstToken !== "WITH" &&
    firstToken !== "DECLARE"
  ) {
    return {
      safe: false,
      reason: `Query must start with SELECT, WITH, or DECLARE. Found: ${firstToken}`,
    };
  }

  // DECLARE must contain a SELECT
  if (firstToken === "DECLARE" && !upper.includes("SELECT")) {
    return {
      safe: false,
      reason: "DECLARE block must contain a SELECT statement",
    };
  }

  // Multi-statement detection (non-DECLARE queries)
  if (firstToken !== "DECLARE") {
    const withoutStrings = stripStrings(normalized);
    const semiIndex = withoutStrings.indexOf(";");
    if (semiIndex !== -1 && semiIndex < withoutStrings.trim().length - 1) {
      return {
        safe: false,
        reason: "Multiple statements detected (semicolons not allowed)",
      };
    }
  }

  // Check base blocked keywords
  for (const keyword of BASE_BLOCKED_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, "i");
    if (regex.test(upper)) {
      return { safe: false, reason: `Blocked keyword: ${keyword}` };
    }
  }

  // Check EXEC/EXECUTE
  for (const keyword of BASE_BLOCKED_EXEC) {
    const regex = new RegExp(`\\b${keyword}\\b`, "i");
    if (regex.test(upper)) {
      return { safe: false, reason: `Blocked keyword: ${keyword}` };
    }
  }

  // Check dialect-specific rules
  if (dialect) {
    for (const pattern of dialect.blockedPatterns) {
      if (pattern.test(normalized)) {
        return {
          safe: false,
          reason: `Blocked by ${dialect.name} rule: ${pattern.source}`,
        };
      }
    }

    for (const prefix of dialect.blockedPrefixes) {
      const regex = new RegExp(`\\b${prefix}\\w+`, "i");
      if (regex.test(upper)) {
        return {
          safe: false,
          reason: `Blocked ${dialect.name} prefix: ${prefix}`,
        };
      }
    }
  }

  return { safe: true };
}
