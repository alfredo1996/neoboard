---
name: review
description: Review changes for code quality, security, and NeoBoard conventions.
model: sonnet
context: fork
allowed-tools: Read, Write, Bash(gh *), Bash(git *), Grep(*), Glob(*)
---
## State
- Branch: !`git branch --show-current`
- Changed: !`git diff origin/dev --name-only 2>/dev/null || git diff --name-only`

## Checklist
Use ultrathink.

### 🔴 Critical
- No credentials logged. Parameterized queries. Read-only transactions.
- can_write server-side. Tenant isolation via tenant_id.
- Timeouts at driver level. Row limits via cursor/stream.

### 🟡 Warning
- component/ has no business logic/stores. connection/ has no UI.
- Charts: next/dynamic + ssr:false. ECharts modular imports.
- No untyped any. Explicit return types.

### 🔵 Suggestion
- Tests for new behavior? JSDoc on complex functions?

### 🤖 External Reviews
- Check CodeRabbit comments: `gh pr view <number> --comments | grep -A5 'coderabbitai'`
- Check SonarQube status: `gh pr checks <number>`
- Address or explicitly dismiss all automated feedback

Output: `[SEVERITY] file:line — Issue → Fix`
End with: ✅ APPROVE, ⚠️ REQUEST CHANGES, or 💬 NEEDS DISCUSSION
