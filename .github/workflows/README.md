# GitHub Workflows

This directory contains GitHub Actions workflows for the entire project.

## Workflows

### Connection Module Tests (`connection-tests.yml`)

Runs tests for the connection module located in the `connection/` subdirectory.

**Jobs:**
- **Lint**: TypeScript type checking for the connection module
- **Test**: Runs all connection module tests on Node.js 18.x and 20.x
- **Coverage**: Generates and uploads test coverage reports
- **Neo4j Tests**: Dedicated job for Neo4j integration tests
- **PostgreSQL Tests**: Dedicated job for PostgreSQL integration tests

**Triggers:**
- Push to `main`, `develop`, `feat/*`, `fix/*` branches (when connection/ files change)
- Pull requests to `main` and `develop` (when connection/ files change)

**Features:**
- Path-based triggering (only runs when connection/ files change)
- Working directory set to `connection/` for all jobs
- Separate test jobs for different database integrations
- Coverage reporting with Codecov integration

## Running Tests Locally

### Connection Module Tests

```bash
# Navigate to connection directory
cd connection

# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run only PostgreSQL tests
npm test -- postgres

# Run only Neo4j tests
npm test -- neo4j
```

## Environment Variables

No environment variables are required for running tests. The workflows use testcontainers which automatically spin up Docker containers for Neo4j and PostgreSQL during testing.

## Required Secrets

For coverage upload (optional):
- `CODECOV_TOKEN`: Token for uploading coverage to Codecov (optional, will continue on error if not present)

## Adding New Workflows

When adding new workflows:

1. Create a new `.yml` file in `.github/workflows/`
2. Use descriptive names (e.g., `frontend-tests.yml`, `api-tests.yml`)
3. Set appropriate `working-directory` in job defaults if needed
4. Use path-based triggers to avoid unnecessary runs
5. Document the workflow in this README

## Workflow Structure

```yaml
name: Workflow Name

on:
  push:
    paths:
      - 'relevant/directory/**'  # Only run when these files change

jobs:
  job-name:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: relevant/directory  # Set working directory

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          cache-dependency-path: relevant/directory/package-lock.json
      # ... rest of the steps
```

## Notes

- Tests use [Testcontainers](https://testcontainers.com/) to spin up real database instances
- Docker must be available in the CI environment (GitHub Actions runners have Docker pre-installed)
- TypeScript type checking runs but won't fail the build (`continue-on-error: true`)
- Coverage reports are generated only on Node.js 20.x to avoid duplicate reports
- Each module can have its own workflow with its own working directory
