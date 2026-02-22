---
name: plan
description: Architecture plan for complex features. Analyzes impact, security, scalability, breaks into tasks.
model: opus
context: fork
allowed-tools: Read, Bash(cat *), Bash(ls *), Bash(find *), Bash(grep *), Bash(gh *), Bash(git log *)
---
# Plan — Opus
Use ultrathink. Analyze: requirements, architecture impact, security, scalability, dependencies.
Read relevant docs in `claude_code_docs/`.

Output a plan with: Summary, Architecture Decision, Affected Packages, Ordered Tasks (S/M/L), Migration needed?, Security Checklist, Testing Strategy, Risks, Suggested GitHub Issues.

Save to `claude_code_docs/plans/`.

$ARGUMENTS = feature or change to plan.
