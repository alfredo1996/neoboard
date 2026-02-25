---
name: test
description: Run tests for the affected package(s). Detects which packages changed and runs only relevant test suites.
model: haiku
disable-model-invocation: true
allowed-tools: Bash(npm *), Bash(npx *), Bash(git *), Bash(cd *)
---
# Test — NeoBoard

## State
- Branch: !`git branch --show-current`
- Changed files: !`git diff --name-only HEAD~1 2>/dev/null || git diff --name-only`

## Instructions

Detect which packages have changes and run the appropriate test suites.

### 1. Detect affected packages

```bash
# Check which packages have changes
CHANGED=$(git diff --name-only HEAD~1 2>/dev/null || git diff --name-only)
RUN_APP=false
RUN_COMPONENT=false
RUN_CONNECTION=false

echo "$CHANGED" | grep -q '^app/' && RUN_APP=true
echo "$CHANGED" | grep -q '^component/' && RUN_COMPONENT=true
echo "$CHANGED" | grep -q '^connection/' && RUN_CONNECTION=true
```

### 2. Run tests per package

**App tests** (if app/ changed):
```bash
cd app && npm test
```

**Component tests** (if component/ changed):
```bash
cd component && npm test
```

**Connection tests** (if connection/ changed — needs Docker):
```bash
cd connection && npm test
```

### 3. Always run lint + build

```bash
npm run lint
npm run build
```

### 4. Report results

Output: which suites ran, pass/fail counts, any failures to fix.

If $ARGUMENTS contains "coverage", also run `npm run test:coverage` in affected packages.
If $ARGUMENTS contains "all", run all test suites regardless of changes.
