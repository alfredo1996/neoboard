# SonarCloud & Code Coverage

SonarCloud (cloud) for code quality, coverage, and issues on PRs and main.
Local SonarQube (Docker) for offline analysis during development.
CodeRabbit for automated AI code review on PRs.
Codecov for coverage trend tracking on GitHub.

**SonarCloud dashboard:** https://sonarcloud.io/project/overview?id=alfredo1996_neoboard

---

## Coverage setup

Coverage is generated from all three packages in **lcov format**, which both SonarQube and Codecov consume.

| Package | Framework | Config file | Output |
|---|---|---|---|
| `app/` (unit) | Vitest + `@vitest/coverage-v8` | `app/vitest.config.ts` | `app/coverage/lcov.info` |
| `app/` (E2E) | Playwright + nextcov | `app/playwright.config.ts` | `app/coverage-e2e/lcov.info` |
| `component/` | Vitest + `@vitest/coverage-v8` | `component/vite.config.ts` | `component/coverage/lcov.info` |
| `connection/` | Jest + `ts-jest` | `connection/jest.config.js` | `connection/coverage/lcov.info` |

### Generate all coverage locally (run serially — connection tests use shared Docker containers)

```bash
# From repo root
npm run test:coverage --prefix app          # Vitest unit coverage
npm run test:e2e:coverage --prefix app      # Playwright E2E coverage (needs Docker)
npm run test:coverage --prefix component
npm run test:coverage --prefix connection
```

> **Important:** Never run connection tests in parallel with themselves. They share a Neo4j testcontainer and will deadlock. Always run serially.

---

## Local SonarQube

### Start / stop

```bash
# Start (first time pulls ~700MB of images)
docker compose --profile sonar -f docker/docker-compose.yml up -d

# Stop (keeps data volumes)
docker compose --profile sonar -f docker/docker-compose.yml down

# Stop and wipe all data (reset)
docker compose --profile sonar -f docker/docker-compose.yml down -v
```

UI: **http://localhost:9000** — default credentials: `admin` / `admin`
(SonarQube will prompt you to change the password on first login)

The `sonarqube` and `sonarqube-db` services use `profiles: ["sonar"]` so they are **not started** by the default `docker compose up` (which only starts Neo4j + PostgreSQL for the app).

### Run the scanner

The scanner runs via Docker (no local install needed):

```bash
# 1. Generate coverage for all packages first (see above)

# 2. Run scanner — replace TOKEN with your token from http://localhost:9000
TOKEN="your-token-here"

docker run --rm \
  --network host \
  -v "$(pwd):/usr/src" \
  sonarsource/sonar-scanner-cli:latest \
  -Dsonar.projectKey=neoboard \
  -Dsonar.host.url=http://localhost:9000 \
  -Dsonar.token="$TOKEN"
```

The rest of the config is read from `sonar-project.properties` at the repo root.

### Generate a token

1. Go to http://localhost:9000 → My Account → Security
2. Generate a new token (type: User Token)
3. Copy it — it's shown only once

### First-time project setup

The project (`neoboard`) must exist before the first scan:

```bash
curl -u admin:admin -X POST \
  "http://localhost:9000/api/projects/create" \
  -d "project=neoboard&name=NeoBoard"
```

After the first successful scan the project auto-populates in the UI.

### sonar-project.properties

Located at **repo root** (`sonar-project.properties`). Key settings:

```properties
sonar.projectKey=alfredo1996_neoboard
sonar.organization=alfredo1996
sonar.sources=app/src,component/src,connection/src
sonar.javascript.lcov.reportPaths=app/coverage/lcov.info,app/coverage-e2e/lcov.info,component/coverage/lcov.info,connection/coverage/lcov.info
sonar.exclusions=**/node_modules/**,**/__tests__/**,**/*.test.ts,...
```

> Note: the local Docker SonarQube uses `projectKey=neoboard` (created manually). The cloud project uses `alfredo1996_neoboard`. Both read the same `sonar-project.properties` but the local scanner overrides `projectKey` via `-D` flag if needed.

---

## SonarCloud CI (GitHub Actions)

Workflow: `.github/workflows/sonarqube.yml`
SonarCloud project: **alfredo1996_neoboard** / org: **alfredo1996**

Triggers on push to `main` or `dev`, and PRs targeting `main` or `dev`. Steps:
1. Checks out with `fetch-depth: 0` (needed for new code detection and blame)
2. Starts Postgres + Neo4j service containers for connection integration tests
3. Runs `test:coverage` for all three packages (serially)
4. Runs `SonarSource/sonarcloud-github-action@v3`

`GITHUB_TOKEN` is automatic — PR decoration (inline issues, Quality Gate badge) works out of the box.

### Required GitHub secret

| Secret | How to get it |
|---|---|
| `SONAR_TOKEN` | SonarCloud → My Account → Security → Generate Token |

Add it at: `https://github.com/alfredo1996/neoboard/settings/secrets/actions`

### Local scanner against SonarCloud

```bash
# Generate coverage first (see above), then:
TOKEN="your-sonarcloud-token"

docker run --rm \
  --network host \
  -v "$(pwd):/usr/src" \
  sonarsource/sonar-scanner-cli:latest \
  -Dsonar.host.url=https://sonarcloud.io \
  -Dsonar.token="$TOKEN"
```

---

## Codecov

Codecov uploads are already wired in the existing per-package CI workflows:

| Workflow | Flag | Uploads from |
|---|---|---|
| `app-tests.yml` | `app-unit` | `app/coverage/` |
| `connection-tests.yml` | `connection-module` | `connection/coverage/` |

Component coverage is not yet uploaded to Codecov (only SonarQube). To add it, add a `codecov/codecov-action@v4` step to `component-tests.yml`.

No secrets needed for public repos — Codecov auto-detects the GitHub repo.

---

## CodeRabbit

Config: `.coderabbit.yaml` at repo root.

Install the GitHub App: https://github.com/apps/coderabbitai
Free for public repos — reviews trigger automatically on every PR.

Key per-path instructions configured:
- `app/src/**` — multi-tenancy, parameterized queries, `can_write` enforcement
- `component/src/**` — no business logic, no API calls, ECharts modular imports
- `connection/src/**` — no UI, parameterized queries, read-only transactions
- `app/src/app/api/**` — tenant JWT validation, credential logging

To interact with CodeRabbit on a PR: `@coderabbitai explain this` or `@coderabbitai review`.

---

## E2E Coverage (nextcov)

Playwright E2E tests collect V8 code coverage via [nextcov](https://github.com/stevez/nextcov). This captures client-side coverage for the `app/` package during real browser interactions.

### How it works

1. `E2E_COVERAGE=1` env var enables coverage collection
2. `global-setup.ts` calls `initCoverage()` to initialize nextcov
3. The `coverage` fixture in `e2e/fixtures.ts` collects per-test client coverage via CDP
4. `global-teardown.ts` calls `finalizeCoverage()` to process and write reports
5. Output is written to `app/coverage-e2e/` (lcov, json, text-summary)

### CI integration

- The **E2E Tests** workflow (`e2e-tests.yml`) runs with `E2E_COVERAGE=1` and uploads `app/coverage-e2e/` as an artifact
- The **SonarCloud** workflow (`sonarqube.yml`) downloads that artifact so `app/coverage-e2e/lcov.info` is available during the scan
- SonarCloud merges both `app/coverage/lcov.info` (Vitest) and `app/coverage-e2e/lcov.info` (Playwright)

### Config

- `app/playwright.config.ts` exports a `nextcov` config object read by `loadNextcovConfig()`
- `app/next.config.ts` enables full source maps when `E2E_COVERAGE` is set
- `collectServer: false` — only client-side coverage is collected (dev mode, no CDP inspector)

---

## Known issues

### Connection test: bad-URI auth test (pre-existing)

File: `connection/__tests__/authentication/authentication.ts`

```
Neo4jAuthenticationModule with native auth
› creating an authenticationModule with native auth, but wrong URI throws
Received promise resolved instead of rejected
```

The Neo4j driver changed behavior for invalid URIs — it now resolves to `false` instead of throwing. The test assertion needs to be updated from `.rejects.toThrow()` to checking the returned value.

### SonarQube coverage: 4 inconsistencies warning

```
WARN  Found 4 inconsistencies in coverage report.
```

Minor — caused by generated files (e.g. Drizzle schema, index barrel files) being in the lcov report but not indexed as sources. Harmless; does not affect coverage percentages for tracked files.
