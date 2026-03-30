# Contributing to NeoBoard

Thank you for your interest in contributing to NeoBoard! This guide will help you get started.

## Getting Started

### Prerequisites

- Node.js 20+
- Docker (for Neo4j and PostgreSQL dev containers)
- npm (not pnpm or yarn)

### Setup

```bash
git clone https://github.com/alfredo1996/neoboard.git
cd neoboard
npm install
scripts/setup.sh    # Starts Docker, runs migrations, seeds demo data
npm run dev          # Start dev server at http://localhost:3000
```

### Demo Credentials

- **Admin**: alice@example.com / password123
- **Creator**: bob@example.com / password123

## Development Workflow

### Branch Naming

```
feat/issue-<N>-<slug>    # New features
fix/issue-<N>-<slug>     # Bug fixes
chore/issue-<N>-<slug>   # Maintenance, docs, tests
```

Always branch from `dev`.

### Pull Request Process

1. Branch from `dev`
2. Make your changes following the code style below
3. Write tests (TDD: test before implementation)
4. Run `npm run build` to verify no type errors
5. Run `npm run lint` to check linting
6. Open a PR targeting `dev` with conventional commit title
7. Link the issue via `Closes #N` in the PR body
8. Wait for CI (type-check, unit tests, E2E, CodeRabbit, SonarCloud)

### Conventional Commits

```
feat(scope): add new feature
fix(scope): fix bug description
chore(scope): maintenance task
test(scope): add or update tests
docs(scope): documentation changes
refactor(scope): code refactoring
```

Scopes: `app`, `component`, `connection`, `docker`, `ci`

## Architecture

NeoBoard has three packages with strict boundaries:

| Package       | Purpose              | Rules                                      |
| ------------- | -------------------- | ------------------------------------------ |
| `app/`        | Next.js application  | Orchestrates component/ and connection/    |
| `component/`  | React UI library     | NO business logic, NO API calls, NO stores |
| `connection/` | DB connector library | NO UI, NO React                            |

Before editing any file, check which package it belongs to.

## Code Style

- **TypeScript strict** — no `any` without a comment explaining why
- **ESLint + Prettier** — run automatically on commit via husky/lint-staged
- **No default exports** — use named exports
- **Tests live in `__tests__/`** next to the file under test

## Testing

We practice TDD (Red-Green-Refactor):

1. Write a failing test
2. Write the minimum code to pass
3. Refactor

### Test Commands

```bash
cd app && npm test              # App unit tests (Vitest)
cd component && npm test        # Component unit tests (Vitest)
cd connection && npm test       # Connection integration tests (Jest + Docker)
cd app && npx playwright test   # E2E tests (requires Docker)
```

## Finding Issues

- Look for issues labeled [`good first issue`](https://github.com/alfredo1996/neoboard/labels/good%20first%20issue)
- Check the current milestone for priority items
- Comment on an issue before starting to avoid duplicate work

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## License

By contributing, you agree that your contributions will be licensed under the [Elastic License 2.0](LICENSE) with the AI training restriction addendum.
