# GitHub Workflows Location

## ✅ Correct Location

The GitHub Actions workflows are located at the **project root level**:

```
/Users/alfredorubin/Desktop/public/
├── .github/
│   ├── GITHUB_ACTIONS_SETUP.md          # Setup guide
│   └── workflows/
│       ├── connection-tests.yml         # Connection module CI/CD
│       └── README.md                    # Workflow documentation
├── connection/                           # Connection module (this directory)
│   ├── src/
│   ├── __tests__/
│   └── package.json
└── ... (other modules)
```

## Why at Project Root?

GitHub Actions workflows must be located at `.github/workflows/` in the **repository root** to be detected and executed by GitHub.

## How It Works

The `connection-tests.yml` workflow:

1. **Path-based triggering** - Only runs when `connection/` files change
   ```yaml
   on:
     push:
       paths:
         - 'connection/**'
   ```

2. **Working directory** - All commands run in the `connection/` subdirectory
   ```yaml
   defaults:
     run:
       working-directory: connection
   ```

3. **Cache configuration** - Points to the connection module's package-lock.json
   ```yaml
   with:
     cache-dependency-path: connection/package-lock.json
   ```

## Running Tests

Even though workflows are at the root, you still run tests from the connection directory:

```bash
# Navigate to connection module
cd /Users/alfredorubin/Desktop/public/connection

# Run tests
npm test

# Run specific tests
npm test -- postgres
npm test -- neo4j

# Coverage
npm run test:coverage
```

## Documentation

- **Workflow setup**: `../.github/GITHUB_ACTIONS_SETUP.md`
- **Workflow reference**: `../.github/workflows/README.md`
- **This module's docs**: All other `.md` files in this directory

## Adding More Modules

If you add more modules (e.g., `frontend/`, `api/`), create separate workflows:

```
.github/workflows/
├── connection-tests.yml    # For connection/
├── frontend-tests.yml      # For frontend/
└── api-tests.yml          # For api/
```

Each workflow sets its own working directory and path filters.
