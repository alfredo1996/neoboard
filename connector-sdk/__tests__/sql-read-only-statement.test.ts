import { checkReadOnlyStatement } from "../src/sql";

/**
 * The allow-list is the only write guard a connector without read-only
 * transactions has (#1698), so every rejection below is a way a write gets past
 * a naive check. A statement is read the way T-SQL and MySQL (with and without
 * NO_BACKSLASH_ESCAPES) would lex it, and passes only when every reading agrees
 * it is a single read.
 */

const allowed = (sql: string) => checkReadOnlyStatement(sql).allowed;

describe("checkReadOnlyStatement accepts a single read", () => {
  it.each([
    ["a plain SELECT", "SELECT 1"],
    ["lowercase keywords", "select id from users where id = 1"],
    ["a trailing semicolon", "SELECT 1;"],
    [
      "the T-SQL leading-semicolon CTE idiom",
      ";WITH c AS (SELECT 1 AS n) SELECT n FROM c",
    ],
    [
      "a CTE chain",
      "WITH c AS (SELECT 1 AS n), d AS (SELECT n FROM c) SELECT * FROM d",
    ],
    ["a set operation", "SELECT a FROM t UNION ALL SELECT b FROM u"],
    ["parenthesised set operands", "(SELECT 1) UNION (SELECT 2)"],
    ["a subquery", "SELECT a FROM t WHERE id IN (SELECT id FROM u)"],
    [
      "keywords inside longer identifiers",
      "SELECT deleted_at, update_count, insert_ts2 FROM t",
    ],
    [
      "keywords inside a string literal",
      "SELECT 'DELETE FROM t; DROP TABLE x' AS s",
    ],
    ["a doubled quote inside a literal", "SELECT 'it''s; DELETE' AS s"],
    [
      "an escaped backslash inside a literal",
      "SELECT 'C:\\\\temp; DROP' AS path",
    ],
    ["keywords in a double-quoted identifier", 'SELECT "update" FROM t'],
    ["keywords in a backtick identifier", "SELECT `delete` FROM t"],
    ["keywords in a bracket identifier", "SELECT [insert] FROM t"],
    [
      "keywords in a line comment",
      "SELECT 1 -- DELETE FROM t; DROP TABLE x\nFROM t",
    ],
    ["keywords in a block comment", "SELECT 1 /* ; DROP TABLE t */ FROM t"],
    ["CRLF line endings", "SELECT 1 -- note\r\nFROM t"],
    ["an optimizer hint comment", "SELECT /*+ MAX_EXECUTION_TIME(1000) */ 1"],
  ])("%s", (_name, sql) => {
    expect(checkReadOnlyStatement(sql)).toEqual({ allowed: true });
  });
});

describe("checkReadOnlyStatement rejects", () => {
  it.each([
    ["a DELETE", "DELETE FROM t"],
    ["an UPDATE", "UPDATE t SET a = 1"],
    ["an INSERT", "INSERT INTO t VALUES (1)"],
    ["DDL", "DROP TABLE t"],
    ["SHOW", "SHOW TABLES"],
    ["EXEC", "EXEC sp_who"],
    ["EXECUTE", "EXECUTE sp_who"],
    ["CALL", "CALL refresh_stats()"],
    ["a bare T-SQL procedure call", "sp_who"],
    ["punctuation with no keyword at all", "* + -"],
  ])("a statement that is not a SELECT or WITH: %s", (_name, sql) => {
    expect(allowed(sql)).toBe(false);
  });

  it.each([
    ["two reads", "SELECT 1; SELECT 2"],
    ["a read then a write", "SELECT 1; DELETE FROM t"],
    ["a write after a comment line", "SELECT 1;\n-- cleanup\nDELETE FROM t"],
    ["a T-SQL batch with no semicolon", "SELECT 1 DELETE FROM t"],
    ["a T-SQL batch of reads with no semicolon", "SELECT 1 SELECT 2"],
    ["T-SQL dynamic SQL after a read", "SELECT 1 EXEC('DELETE FROM t')"],
  ])("multiple statements: %s", (_name, sql) => {
    expect(allowed(sql)).toBe(false);
  });

  it.each([
    "DELETE FROM t",
    "INSERT INTO t SELECT n FROM c",
    "UPDATE t SET a = 1",
    "MERGE INTO t USING c ON t.id = c.n WHEN MATCHED THEN DELETE",
  ])("a write hidden after a CTE: WITH … %s", (write) => {
    expect(allowed(`WITH c AS (SELECT 1 AS n) ${write}`)).toBe(false);
  });

  it.each([
    [
      "a data-modifying CTE",
      "WITH d AS (DELETE FROM t RETURNING *) SELECT * FROM d",
    ],
    ["SELECT … INTO a new table", "SELECT * INTO copy FROM t"],
    ["SELECT … INTO OUTFILE", "SELECT * FROM t INTO OUTFILE '/tmp/t.csv'"],
    ["a locking read", "SELECT * FROM t FOR UPDATE"],
    ["a session SET in a batch", "SELECT 1 SET NOCOUNT ON"],
    ["WAITFOR", "SELECT 1 WAITFOR DELAY '00:00:05'"],
    [
      "OPENROWSET",
      "SELECT * FROM OPENROWSET(BULK 'C:\\data.txt', SINGLE_CLOB) AS f",
    ],
  ])("a side effect inside a read: %s", (_name, sql) => {
    expect(allowed(sql)).toBe(false);
  });

  it.each([
    ["a MySQL executable comment", "SELECT 1 /*! ; DELETE FROM t */"],
    [
      "a versioned MySQL executable comment",
      "SELECT 1 /*!50000 DELETE FROM t */",
    ],
    ["a MariaDB executable comment", "SELECT 1 /*M! DELETE FROM t */"],
    [
      "`--` that MySQL reads as arithmetic, not a comment",
      "SELECT 1 --1; DELETE FROM t",
    ],
    [
      "`#` that only MySQL reads as a comment",
      "SELECT * FROM #tmp; DELETE FROM t",
    ],
    [
      "block comments that nest in T-SQL but not in MySQL",
      "SELECT 1 /* /* */ DELETE FROM t */",
    ],
    [
      "a quote MySQL escapes with a backslash",
      "SELECT '\\'' ; DELETE FROM t; SELECT '\\''",
    ],
    [
      "a quote MySQL NO_BACKSLASH_ESCAPES does not escape",
      "SELECT 1 --1 'x\\' ; DELETE FROM t; #'",
    ],
    [
      "a bare carriage return some servers end a comment at",
      "SELECT 1 -- x\rDELETE FROM t",
    ],
  ])("a statement hidden from one dialect's reading: %s", (_name, sql) => {
    expect(allowed(sql)).toBe(false);
  });

  it.each([
    "SELECT 1DROP TABLE t",
    "SELECT 1e5DROP TABLE t",
    "SELECT 0x0TRUNCATE TABLE t",
    "SELECT $1DROP TABLE t",
  ])("a T-SQL statement glued to a number literal: %s", (sql) => {
    expect(allowed(sql)).toBe(false);
  });

  it.each([
    "SELECT 'open",
    'SELECT "open',
    "SELECT `open",
    "SELECT [open",
    "SELECT 1 /* open",
  ])("an unterminated literal, identifier or comment: %s", (sql) => {
    expect(allowed(sql)).toBe(false);
  });

  it.each(["", "   ", ";", "-- only a comment"])(
    "no statement at all: %j",
    (sql) => {
      expect(allowed(sql)).toBe(false);
    },
  );
});

describe("checkReadOnlyStatement explains a rejection", () => {
  it("names the statement kinds it accepts", () => {
    expect(checkReadOnlyStatement("SHOW TABLES")).toEqual({
      allowed: false,
      reason: expect.stringContaining("SELECT or WITH"),
    });
  });

  it("names the keyword it refused", () => {
    expect(checkReadOnlyStatement("SELECT 1 EXEC('x')")).toEqual({
      allowed: false,
      reason: expect.stringContaining("EXEC"),
    });
  });

  it("says when there is more than one statement", () => {
    expect(checkReadOnlyStatement("SELECT 1; SELECT 2")).toEqual({
      allowed: false,
      reason: expect.stringContaining("one statement"),
    });
  });
});
