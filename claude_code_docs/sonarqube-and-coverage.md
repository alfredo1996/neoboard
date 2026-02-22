# SonarQube & Code Coverage

Local SonarQube for code quality, coverage analysis, and issues tracking.
CodeRabbit for automated AI code review on PRs.
Codecov for coverage trend tracking on GitHub.

---

## Coverage setup

Coverage is generated from all three packages in **lcov format**, which both SonarQube and Codecov consume.

| Package | Framework | Config file | Output |
|---|---|---|---|
| `app/` | Vitest + `@vitest/coverage-v8` | `app/vitest.config.ts` | `app/coverage/lcov.info` |
| `component/` | Vitest + `@vitest/coverage-v8` | `component/vite.config.ts` | `component/coverage/lcov.info` |
| `connection/` | Jest + `ts-jest` | `connection/jest.config.js` | `connection/coverage/lcov.info` |

### Generate all coverage locally (run serially — connection tests use shared Docker containers)

```bash
# From repo root
npm run test:coverage --prefix app
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
sonar.sources=app/src,component/src,connection/src
sonar.javascript.lcov.reportPaths=app/coverage/lcov.info,component/coverage/lcov.info,connection/coverage/lcov.info
sonar.exclusions=**/node_modules/**,**/__tests__/**,**/*.test.ts,...
```

---

## SonarQube CI (GitHub Actions)

Workflow: `.github/workflows/sonarqube.yml`

Triggers on push to `main` and all PRs. Steps:
1. Checks out with `fetch-depth: 0` (needed for blame info)
2. Runs `test:coverage` for all three packages (serially)
3. Runs `sonarqube-scan-action@v4`

### Required GitHub secrets

| Secret | Value |
|---|---|
| `SONAR_HOST_URL` | Your SonarQube server URL (e.g. `https://sonarqube.example.com`) |
| `SONAR_TOKEN` | Token from SonarQube → My Account → Security |

For self-hosted SonarQube the server must be reachable from GitHub Actions runners.

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
