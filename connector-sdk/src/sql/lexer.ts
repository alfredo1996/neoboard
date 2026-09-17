/**
 * Where a string literal, quoted identifier or comment starts and ends. The
 * rules differ per database — and for MySQL per server setting — so a helper
 * that skips literals names the rules it reads SQL by.
 */
export interface SqlLexicon {
  /** `\` escapes the next character inside '…' and "…" (MySQL's default). */
  backslashEscapes: boolean;
  /**
   * MySQL comments: `#` runs to end of line, `--` starts a comment only before
   * a space or control character, block comments do not nest, and the body of
   * a `/*!` (MariaDB: `/*M!`) comment is executed, so it is code.
   */
  mysqlComments: boolean;
  /** `[…]` quotes an identifier (T-SQL). */
  bracketIdentifiers: boolean;
}

/** The databases whose placeholder and quoting rules the SQL helpers know. */
export type SqlDialect = "postgres" | "mysql" | "mssql";

export const DIALECT_LEXICON: Record<SqlDialect, SqlLexicon> = {
  // ponytail: no dollar-quoted ($$…$$) or E'…' strings; add them when a
  // PostgreSQL-dialect caller has to skip text that uses them.
  postgres: {
    backslashEscapes: false,
    mysqlComments: false,
    bracketIdentifiers: false,
  },
  mysql: {
    backslashEscapes: true,
    mysqlComments: true,
    bracketIdentifiers: false,
  },
  mssql: {
    backslashEscapes: false,
    mysqlComments: false,
    bracketIdentifiers: true,
  },
};

/**
 * `sql` with every string literal, quoted identifier and comment blanked to
 * spaces. Same length, so an index into the result is an index into `sql`.
 * `null` when one of them is never closed.
 */
export function maskNonCode(sql: string, lexicon: SqlLexicon): string | null {
  let code = "";
  let i = 0;
  while (i < sql.length) {
    const end = nonCodeEnd(sql, i, lexicon);
    if (end === -1) return null;
    if (end === i) {
      code += sql[i];
      i += 1;
    } else {
      code += " ".repeat(end - i);
      i = end;
    }
  }
  return code;
}

/** End (exclusive) of the literal, identifier or comment starting at `i`; `i` when none starts there; -1 when it never closes. */
function nonCodeEnd(sql: string, i: number, lexicon: SqlLexicon): number {
  const char = sql[i];
  const next = sql[i + 1];
  if (char === "'" || char === '"') {
    return quotedEnd(sql, i, char, lexicon.backslashEscapes);
  }
  if (char === "`") return quotedEnd(sql, i, "`", false);
  if (char === "[" && lexicon.bracketIdentifiers) {
    return quotedEnd(sql, i, "]", false);
  }
  if (char === "#" && lexicon.mysqlComments) return lineEnd(sql, i);
  if (char === "-" && next === "-") {
    const after = sql.charCodeAt(i + 2); // NaN past the end
    if (!lexicon.mysqlComments || after <= 32 || after === 127) {
      return lineEnd(sql, i);
    }
  }
  if (char === "/" && next === "*") {
    const executable = sql[i + 2] === "!" || sql.startsWith("M!", i + 2);
    if (!(lexicon.mysqlComments && executable)) {
      return blockCommentEnd(sql, i, !lexicon.mysqlComments);
    }
  }
  return i;
}

function quotedEnd(
  sql: string,
  start: number,
  close: string,
  backslashEscapes: boolean,
): number {
  for (let i = start + 1; i < sql.length; i += 1) {
    if (backslashEscapes && sql[i] === "\\") {
      i += 1;
    } else if (sql[i] === close) {
      if (sql[i + 1] !== close) return i + 1;
      i += 1; // a doubled closing quote is an escaped one
    }
  }
  return -1;
}

function lineEnd(sql: string, start: number): number {
  const newline = sql.indexOf("\n", start);
  return newline === -1 ? sql.length : newline;
}

function blockCommentEnd(sql: string, start: number, nests: boolean): number {
  let depth = 0;
  for (let i = start; i < sql.length - 1; i += 1) {
    if (sql[i] === "/" && sql[i + 1] === "*" && (nests || depth === 0)) {
      depth += 1;
      i += 1;
    } else if (sql[i] === "*" && sql[i + 1] === "/") {
      depth -= 1;
      i += 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}
