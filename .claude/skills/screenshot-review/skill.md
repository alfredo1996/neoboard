# Screenshot Review Skill

Defines how to capture, compare, and manage UI screenshots for NeoBoard design reviews.

## When to Use

- **Before any UI change**: Capture "before" screenshots of affected pages/states.
- **After any UI change**: Capture "after" screenshots and compare.
- **When adding new pages/flows**: Add to the baseline screenshot suite.
- **During design reviews**: Reference baseline screenshots for comparison.

---

## 1. Directory Structure

```
.screenshots/
  baseline-YYYY-MM-DD/         # Full baseline suite (one per audit)
    01-login-default.png
    02-login-error.png
    ...
  before/                      # Temporary "before" shots for current change
    dashboard-list.png
    widget-editor-step2.png
  after/                       # Temporary "after" shots for current change
    dashboard-list.png
    widget-editor-step2.png
  diff/                        # Visual diff outputs (if tooling available)
    dashboard-list-diff.png
```

## 2. Naming Convention

Screenshots follow the user story numbering from the inventory:

```
{NN}-{page}-{state}.png
```

Examples:
- `01-login-default.png`
- `07-dashboard-list-populated-admin.png`
- `25-widget-editor-step1.png`
- `36-connections-populated.png`
- `80-dashboard-list-mobile.png` (responsive)

## 3. Capture Workflow

### Full Baseline Capture

1. Start the dev server: `cd app && npm run dev`
2. For each user story in the inventory:
   a. Navigate to the appropriate URL
   b. Set up the required state (login as correct role, seed data, trigger modal)
   c. Wait for all data to load (no spinners, no skeletons)
   d. Capture at **1280x720** (Desktop Chrome default from Playwright config)
   e. For responsive stories, resize viewport to target breakpoint
3. Save all screenshots to `.screenshots/baseline-{date}/`

### Before/After Workflow

1. **Before starting UI work:**
   ```
   mkdir -p .screenshots/before
   ```
   Capture screenshots of all pages/states your change will affect.

2. **After completing UI work:**
   ```
   mkdir -p .screenshots/after
   ```
   Capture the same pages/states.

3. **Compare:** Place before/after side by side. Document changes in PR description.

4. **Clean up:** After PR is merged, delete `before/` and `after/` directories.

## 4. Using Playwright for Screenshots

You can leverage the existing Playwright setup for automated screenshots:

```typescript
// In a scratch test file or standalone script
import { test } from './e2e/fixtures';

test('capture baseline', async ({ page, authPage }) => {
  // Login
  await authPage.login({ email: 'alice@example.com', password: 'password123' });

  // Dashboard list
  await page.waitForSelector('[data-testid="dashboard-card"]');
  await page.screenshot({ path: '.screenshots/baseline/07-dashboard-list.png', fullPage: true });

  // Navigate to connections
  await page.click('text=Connections');
  await page.waitForSelector('[data-testid="connection-card"]');
  await page.screenshot({ path: '.screenshots/baseline/36-connections.png', fullPage: true });
});
```

### Viewport Sizes for Responsive Shots
```typescript
// Mobile
await page.setViewportSize({ width: 375, height: 812 });

// Tablet
await page.setViewportSize({ width: 768, height: 1024 });

// Desktop (default)
await page.setViewportSize({ width: 1280, height: 720 });

// Wide desktop
await page.setViewportSize({ width: 1920, height: 1080 });
```

## 5. State Setup Guide

### Auth States
- **Logged out**: Don't call `authPage.login()`, just navigate
- **Admin**: Login as Alice (seeded admin)
- **Creator**: Create a creator user via API, then login
- **Reader**: Create a reader user via API, then login

### Data States
- **Empty state**: Delete all items via API before navigating
- **Populated**: Use seeded data (Movie Analytics dashboard, connections)
- **Error state**: Use invalid connection credentials, then trigger test
- **Loading**: Intercept network requests with `page.route()` to add delay

### Modal/Overlay States
- **Dialog open**: Click the trigger button, then screenshot
- **Confirm dialog**: Trigger delete action to open confirmation
- **Sheet/drawer**: Click assignments button (admin editor page)

### Chart States
- **Bar/Line/Pie**: Navigate to seeded dashboard with chart widgets
- **Graph**: Create a graph widget with a Cypher query
- **Empty chart**: Create widget with query returning 0 rows
- **Map**: Create a map widget with geo data (if available)

## 6. Flagging Unreachable States

Some states may not be programmatically reachable:
- States requiring specific timing (race conditions)
- States requiring external service failures
- States requiring specific data distributions

For these, add to the inventory with status `[UNREACHABLE]` and explain why. Example:
```
17-dashboard-viewer-loading.png  [UNREACHABLE] — skeleton only visible during real network latency, Playwright tests too fast
```

## 7. Summary Table Template

After capturing, produce a table:

```markdown
| # | Story | Screenshot Path | Status | Visual Issues |
|---|-------|----------------|--------|---------------|
| 01 | Login default | baseline-2026-02-24/01-login-default.png | OK | — |
| 02 | Login error | baseline-2026-02-24/02-login-error.png | OK | Alert text could use more contrast |
| 03 | Login loading | — | UNREACHABLE | Button state too transient |
```

## 8. Git Rules

- `.screenshots/baseline-*` directories: committed to repo (reference baseline)
- `.screenshots/before/` and `.screenshots/after/`: gitignored (temporary per-PR)
- `.screenshots/diff/`: gitignored (generated artifacts)

Add to `.gitignore`:
```
.screenshots/before/
.screenshots/after/
.screenshots/diff/
```
