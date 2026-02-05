# GitHub Actions Setup Guide

## Overview

This repository uses GitHub Actions for continuous integration and testing. Workflows are configured to run tests for different modules in the project.

## Project Structure

```
/Users/alfredorubin/Desktop/public/
├── .github/
│   └── workflows/
│       ├── connection-tests.yml    # CI/CD for connection module
│       └── README.md               # Workflow documentation
├── connection/                     # Connection module
│   ├── src/                       # Source code
│   ├── __tests__/                 # Tests
│   ├── package.json               # Dependencies
│   └── tsconfig.json              # TypeScript config
└── ... (other modules)
```

## Connection Module Workflow

**File:** `.github/workflows/connection-tests.yml`

**Features:**
- Runs only when `connection/` files change (path-based triggering)
- Sets working directory to `connection/` for all jobs
- Multiple Node.js versions (18.x, 20.x)
- Separate jobs for Neo4j and PostgreSQL tests
- Coverage reporting with Codecov

**Jobs:**
1. **lint** - TypeScript type checking
2. **test** - All tests on multiple Node versions
3. **coverage** - Coverage report generation
4. **neo4j-tests** - Neo4j-specific integration tests
5. **postgres-tests** - PostgreSQL-specific integration tests

## Triggers

The connection tests workflow runs on:

```yaml
on:
  push:
    branches: [ main, develop, feat/*, fix/* ]
    paths:
      - 'connection/**'
  pull_request:
    branches: [ main, develop ]
    paths:
      - 'connection/**'
```

**Important:** The workflow only runs when files in `connection/` are modified. This prevents unnecessary CI runs when other parts of the project change.

## Running Tests Locally

Before pushing, test your changes locally:

```bash
# Navigate to the module
cd connection

# Install dependencies
npm install

# Run all tests
npm test

# Run specific test suites
npm test -- postgres
npm test -- neo4j

# Run with coverage
npm run test:coverage

# Type check
npx tsc --noEmit
```

## Working Directory Configuration

Each job uses `defaults.run.working-directory` to set the context:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: connection  # All commands run from here

    steps:
      - uses: actions/setup-node@v4
        with:
          cache-dependency-path: connection/package-lock.json
      - run: npm ci  # Runs in connection/
      - run: npm test  # Runs in connection/
```

## Adding New Module Workflows

To add workflows for other modules:

1. Create a new workflow file: `.github/workflows/<module-name>-tests.yml`
2. Set the working directory to your module
3. Configure path-based triggers
4. Update cache-dependency-path

Example for a hypothetical `api` module:

```yaml
name: API Module Tests

on:
  push:
    paths:
      - 'api/**'

jobs:
  test:
    defaults:
      run:
        working-directory: api
    steps:
      - uses: actions/setup-node@v4
        with:
          cache-dependency-path: api/package-lock.json
      - run: npm ci
      - run: npm test
```

## Environment Requirements

### GitHub Actions Runners

The workflows run on `ubuntu-latest` which includes:
- Docker (for Testcontainers)
- Node.js (installed via actions/setup-node)
- npm/yarn

### Testcontainers

The connection module uses [Testcontainers](https://testcontainers.com/) for integration tests:
- Automatically downloads and runs Neo4j container
- Automatically downloads and runs PostgreSQL container
- No manual database setup required
- Containers are cleaned up after tests

### Optional Secrets

**CODECOV_TOKEN** (optional):
- Used to upload coverage reports to Codecov
- Workflow continues even if token is missing
- Add via: Repository Settings → Secrets → Actions → New repository secret

## Troubleshooting

### Tests fail in CI but pass locally

1. Check Node.js version matches (18.x or 20.x)
2. Ensure `package-lock.json` is committed
3. Clear npm cache: `npm ci` (not `npm install`)
4. Check Docker is available (for Testcontainers)

### Workflow doesn't trigger

1. Verify path filters match your changes
2. Check branch name matches trigger patterns
3. Ensure `.github/workflows/` files are committed to the branch

### Type checking fails

1. Run `npx tsc --noEmit` locally
2. Fix TypeScript errors
3. Commit fixes

### Cache issues

Clear cache by:
1. Go to Actions → Caches
2. Delete relevant caches
3. Re-run workflow

## Best Practices

1. **Test locally first** - Run tests before pushing
2. **Keep workflows fast** - Use path-based triggers
3. **Use working-directory** - Keep module contexts separate
4. **Version matrix** - Test on multiple Node versions
5. **Fail fast** - Use `continue-on-error` sparingly
6. **Document changes** - Update README when adding workflows

## Monitoring

View workflow runs:
1. Go to repository on GitHub
2. Click "Actions" tab
3. Select workflow from left sidebar
4. View run history and logs

## Support

For issues with:
- **Workflows**: Check `.github/workflows/README.md`
- **Connection tests**: Check `connection/README.md`
- **Testcontainers**: See [Testcontainers documentation](https://testcontainers.com/)
