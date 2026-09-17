import { maskNonCode, type SqlLexicon } from "./lexer";

export type ReadOnlyStatementCheck =
  { allowed: true } | { allowed: false; reason: string };

/**
 * Every way a server might lex the text: T-SQL, MySQL, and MySQL under
 * NO_BACKSLASH_ESCAPES. Literals and comments close in different places under
 * each, so a statement one reading hides can be one another server runs; a
 * query passes only when all of them see a single read. `[…]` is an identifier
 * in all three: MySQL has no `[` token, so text containing one never runs there.
 */
const READINGS: SqlLexicon[] = [
  { backslashEscapes: false, mysqlComments: false, bracketIdentifiers: true },
  { backslashEscapes: true, mysqlComments: true, bracketIdentifiers: true },
  { backslashEscapes: false, mysqlComments: true, bracketIdentifiers: true },
];

/**
 * Words that change data, schema, permissions, session or server state in
 * T-SQL or MySQL. Looked for anywhere, not only at a statement start: T-SQL
 * needs no `;` between statements, so `SELECT 1 DELETE FROM t` is two.
 */
const DENIED = new Set([
  // data
  "INSERT",
  "UPDATE",
  "DELETE",
  "MERGE",
  "INTO",
  "BULK",
  "UPDATETEXT",
  "WRITETEXT",
  // schema and permissions
  "CREATE",
  "ALTER",
  "DROP",
  "TRUNCATE",
  "ADD",
  "ENABLE",
  "DISABLE",
  "GRANT",
  "REVOKE",
  "DENY",
  // procedures, dynamic SQL, external data
  "EXEC",
  "EXECUTE",
  "CALL",
  "OPENROWSET",
  "OPENDATASOURCE",
  "OPENQUERY",
  // session and transaction state
  "DECLARE",
  "SET",
  "USE",
  "SETUSER",
  "BEGIN",
  "COMMIT",
  "ROLLBACK",
  // server state and queues
  "WAITFOR",
  "SEND",
  "RECEIVE",
  "CONVERSATION",
  "BACKUP",
  "RESTORE",
  "DBCC",
  "KILL",
  "SHUTDOWN",
  "RECONFIGURE",
  "CHECKPOINT",
]);

const SET_OPERATORS = new Set([
  "UNION",
  "EXCEPT",
  "INTERSECT",
  "ALL",
  "DISTINCT",
]);

/**
 * T-SQL ends a number where letters start — `1DROP` is `1` then `DROP`, and
 * `0x0TRUNCATE` is `0x0` then `TRUNCATE`. Where a number ends is itself
 * ambiguous (`1e5`, `1e`), so every candidate ending is checked.
 */
const NUMBER_PREFIXES = [/^\$?\d+/, /^\$?\d+E[+-]?\d*/, /^0X[0-9A-F]*/];

const MULTIPLE = "Only one statement can run at a time";

/**
 * Whether `sql` is a single SELECT or WITH statement, for a connector whose
 * database has no read-only transaction to enforce that (#1698). Keywords
 * inside string literals, quoted identifiers and comments are ignored.
 *
 * Defence in depth, not a substitute for a read-only database user: a keyword
 * scan cannot see a side effect inside a function the query calls (a MySQL
 * stored function that writes, `NEXT VALUE FOR`).
 */
export function checkReadOnlyStatement(sql: string): ReadOnlyStatementCheck {
  // `\r` on its own ends a line comment for some servers and not for others.
  if (/\r(?!\n)/.test(sql)) {
    return deny(
      "A carriage return outside a line ending makes comment boundaries ambiguous",
    );
  }
  for (const reading of READINGS) {
    const code = maskNonCode(sql, reading);
    if (code === null) {
      return deny("Unterminated string, quoted identifier or comment");
    }
    const statements = code.split(";").filter((part) => part.trim() !== "");
    if (statements.length === 0) return deny("No statement to run");
    const problem =
      statements.length > 1 ? MULTIPLE : singleReadProblem(statements[0]);
    if (problem) return deny(problem);
  }
  return { allowed: true };
}

function singleReadProblem(statement: string): string | undefined {
  const tokens = statement.match(/[()]|[\w@#$]+/g) ?? [];
  const first = tokens.find((token) => token !== "(")?.toUpperCase();
  if (first !== "SELECT" && first !== "WITH") {
    return "Only a SELECT or WITH statement can run on a read-only connection";
  }

  let depth = 0;
  let previous = "";
  let queries = 0;
  for (const token of tokens) {
    const word = token.toUpperCase();
    const readings = [word, ...NUMBER_PREFIXES.map((n) => word.replace(n, ""))];
    const denied = readings.find((candidate) => DENIED.has(candidate));
    if (denied) return `${denied} is not allowed on a read-only connection`;

    if (token === "(") depth += 1;
    if (token === ")") depth -= 1;
    // After the first top-level query another may only follow a set operator.
    // ponytail: a parenthesised first query followed by a bare second one,
    // `(SELECT 1) SELECT 2`, slips through; both are still reads.
    if (
      readings[1] === "SELECT" &&
      depth === 0 &&
      !SET_OPERATORS.has(previous)
    ) {
      queries += 1;
    }
    previous = word;
  }
  return queries > 1 ? MULTIPLE : undefined;
}

function deny(reason: string): ReadOnlyStatementCheck {
  return { allowed: false, reason };
}
