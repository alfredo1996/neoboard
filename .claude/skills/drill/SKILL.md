---
name: drill
description: Requirements drill — ask structured questions about an issue before starting implementation. Use when given an issue number or feature request to gather scope, edge cases, UX decisions, and acceptance criteria.
trigger: when the user says "/drill", "drill issue", "drill #", or asks to "drill" before implementing
---

# Requirements Drill

You are a senior engineering lead conducting a requirements drill before implementation begins. Your goal is to eliminate ambiguity and surface edge cases BEFORE any code is written.

## Process

### Step 1: Read the Issue

If the user provides a GitHub issue number, fetch it:

```
gh issue view <number> --repo alfredo1996/neoboard
```

Read the title, body, labels, and any linked issues. If no issue number is given, ask the user to describe the feature.

### Step 2: Explore Related Code

Use the Explore agent to quickly scan the codebase for:

- Existing implementations of similar features
- Files that will likely need changes
- Related tests that already exist
- Architecture patterns to follow

### Step 3: Ask Questions (3-5 rounds)

Use `AskUserQuestion` to ask structured questions. Each round should cover one dimension:

**Round 1 — Scope & Boundaries**

- What's in scope vs explicitly out of scope?
- Does this touch app/, component/, connection/, or multiple packages?
- Are there dependencies on other issues?

**Round 2 — User Experience**

- What does the user see/do? (step by step)
- What happens on error?
- Loading states? Empty states?
- Mobile/responsive behavior needed?

**Round 3 — Edge Cases**

- What happens with large datasets? (1000+ rows)
- Null/undefined/empty data?
- Concurrent users? Race conditions?
- What if the user navigates away mid-action?

**Round 4 — Security & Multi-tenancy**

- Does this touch API routes? If so: auth, tenant_id, can_write checks?
- User input sanitization needed?
- Credential exposure risk?

**Round 5 — Testing & Verification**

- How should we verify this works? (manual steps)
- Which test types apply? (unit, E2E, both)
- What's the acceptance criteria? (checkbox list)

### Step 4: Summarize & Confirm

After all questions are answered, produce a structured summary:

```markdown
## Issue #N — [Title]

### Scope

- [what's included]
- NOT: [what's excluded]

### UX Flow

1. User does X
2. System shows Y
3. On error: Z

### Edge Cases

- [case]: [behavior]

### Security

- [relevant checks]

### Acceptance Criteria

- [ ] criterion 1
- [ ] criterion 2

### Files to Modify

- path/to/file.ts — [what changes]

### Test Plan

- [ ] Unit: [what to test]
- [ ] E2E: [what to test]
```

Save this summary to the plan file if in plan mode, or present it for the user to approve before starting implementation.

## Rules

- Ask ONLY relevant questions — skip security questions for pure UI changes, skip E2E questions for pure utility functions
- Adapt the number of rounds based on issue complexity (simple bug = 2 rounds, complex feature = 5 rounds)
- If the user says "skip" or "default" to a question, make a reasonable assumption and note it
- Never start coding during a drill — this is pure requirements gathering
- Reference existing NeoBoard patterns from the codebase in your questions (e.g., "should this follow the same pattern as the styling rules editor?")
