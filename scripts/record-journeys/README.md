# NeoBoard Journey Recorder

Automated video recordings of every user journey in NeoBoard.

## Prerequisites

- Docker demo environment running (`neoboard demo`)
- Playwright chromium installed (`npx playwright install chromium`)
- Optional: `ffmpeg` for mp4 conversion

## Usage

```bash
# Record all journeys
node scripts/record-journeys/record.mjs

# Record a specific journey
node scripts/record-journeys/record.mjs 01-sign-in

# List available journeys
node scripts/record-journeys/record.mjs --list
```

Or via npm:

```bash
npm run record:journeys
npm run record:journeys -- 02-create-dashboard
```

## Output

Videos are saved to `videos/` (gitignored). Each file is named after
its journey: `01-sign-in.webm`, `02-create-dashboard.webm`, etc.

## Adding a journey

1. Create a new file in `journeys/` with the naming convention
   `NN-slug.mjs` (number prefix controls recording order).

2. Export a `title` string and a `run(page)` async function:

   ```js
   import { login } from "../helpers/login.mjs";
   import { narrate, clearNarration } from "../helpers/narrate.mjs";
   import { wait, MEDIUM, HERO } from "../helpers/pace.mjs";

   export const title = "My Journey";

   export async function run(page) {
     await login(page);
     await narrate(page, "Step 1: Do something");
     // ... interact with the page ...
     await wait(page, HERO);
     await clearNarration(page);
   }
   ```

3. Run `node scripts/record-journeys/record.mjs my-journey` to test.

## Helpers

- **`narrate(page, text)`** — shows a semi-transparent overlay banner
- **`clearNarration(page)`** — removes the banner
- **`wait(page, ms)`** — deliberate pause (use `SHORT`/`MEDIUM`/`LONG`/`HERO`)
- **`login(page)`** — shared sign-in flow

## Architecture

```
scripts/record-journeys/
├── record.mjs           # CLI runner
├── README.md
├── helpers/
│   ├── login.mjs        # shared sign-in
│   ├── narrate.mjs      # text overlay
│   └── pace.mjs         # timing constants
└── journeys/
    ├── 01-sign-in.mjs
    ├── 02-create-dashboard.mjs
    └── 03-chart-gallery-tour.mjs
```
