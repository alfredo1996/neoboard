#!/usr/bin/env node

/**
 * Lint migration SQL files for non-idempotent DDL patterns.
 *
 * Checks:
 * 1. Bare CREATE TABLE (missing IF NOT EXISTS)
 * 2. Bare CREATE TYPE (not wrapped in EXCEPTION WHEN duplicate_object)
 * 3. Bare ALTER TABLE ... ADD COLUMN (not wrapped in DO $$ IF NOT EXISTS)
 * 4. Bare ALTER TABLE ... ADD CONSTRAINT (not wrapped in DO $$ IF NOT EXISTS)
 *
 * Exit code 0 = all migrations are idempotent.
 * Exit code 1 = violations found.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";

const MIGRATIONS_DIR = join(
  import.meta.dirname,
  "..",
  "drizzle",
  "migrations"
);

const violations = [];

const sqlFiles = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

for (const file of sqlFiles) {
  const filePath = join(MIGRATIONS_DIR, file);
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  // Check if the entire migration is wrapped in a DO $$ block
  const isWrappedInDoBlock = /^\s*DO\s+\$\$/m.test(content);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Skip comments and statement breakpoints
    if (line.trim().startsWith("--") || line.trim() === "") continue;

    // 1. Bare CREATE TABLE without IF NOT EXISTS
    if (
      /CREATE\s+TABLE\b/i.test(line) &&
      !/IF\s+NOT\s+EXISTS/i.test(line) &&
      !isWrappedInDoBlock
    ) {
      violations.push({
        file,
        line: lineNum,
        pattern: "CREATE TABLE without IF NOT EXISTS (outside DO $$ block)",
        text: line.trim(),
      });
    }

    // 2. Bare CREATE TYPE outside a DO $$ EXCEPTION block
    if (/CREATE\s+TYPE\b/i.test(line) && !isWrappedInDoBlock) {
      violations.push({
        file,
        line: lineNum,
        pattern:
          "CREATE TYPE outside DO $$ block (needs EXCEPTION WHEN duplicate_object)",
        text: line.trim(),
      });
    }

    // 3. Bare ALTER TABLE ... ADD COLUMN outside a DO $$ block
    if (/ALTER\s+TABLE\b.*\bADD\s+COLUMN\b/i.test(line) && !isWrappedInDoBlock) {
      violations.push({
        file,
        line: lineNum,
        pattern: "ALTER TABLE ADD COLUMN outside DO $$ block (needs IF NOT EXISTS guard)",
        text: line.trim(),
      });
    }

    // 4. Bare ALTER TABLE ... ADD CONSTRAINT outside a DO $$ block
    if (
      /ALTER\s+TABLE\b.*\bADD\s+CONSTRAINT\b/i.test(line) &&
      !isWrappedInDoBlock
    ) {
      violations.push({
        file,
        line: lineNum,
        pattern:
          "ALTER TABLE ADD CONSTRAINT outside DO $$ block (needs IF NOT EXISTS guard)",
        text: line.trim(),
      });
    }
  }
}

if (violations.length === 0) {
  console.log(`✓ All ${sqlFiles.length} migration files are idempotent.`);
  process.exit(0);
} else {
  console.error(
    `✗ Found ${violations.length} non-idempotent pattern(s) in migration files:\n`
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    Pattern: ${v.pattern}`);
    console.error(`    Line:    ${v.text}\n`);
  }
  console.error(
    "Wrap DDL in idempotent guards. See claude_code_docs/plans/idempotent-migrations.md for patterns."
  );
  process.exit(1);
}
