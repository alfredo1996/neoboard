# Contributing to NeoBoard Enterprise

NeoBoard ships as two pieces:

- This **public** repo (`alfredo1996/neoboard`) — the OSS core.
- A **private** sibling (`alfredo1996/neoboard-enterprise`) — commercial features (SSO, custom roles, connector labels, environment selector, bulk import, dashboard sharing links, query result caching, connector alias).

You only need this guide if you're building or dogfooding enterprise features locally. OSS contributors can ignore the rest of this file — `npm run dev` works without any enterprise checkout.

## Why two repos, not a submodule or monorepo

- **Submodules** would force every OSS contributor through a private-repo auth wall on clone, conflate licensing, and add operational friction every time the commercial repo moves.
- **One monorepo with edition branches** would leak commercial code into the OSS history and complicate license boundaries.

Two repos with a runtime-resolved npm package mirrors the pattern used by Sentry, Mattermost, and (historically) GitLab. The public app does an _optional dynamic import_:

```ts
// app/src/lib/extensions/bootstrap.ts
const pkg = "@neoboard/enterprise";
try {
  const ent = await import(pkg);
  // wire in enterprise hooks
} catch {
  // community edition — nothing to do
}
```

When the sibling package isn't installed (or `NEOBOARD_EDITION !== "enterprise"`), the import fails silently and the app boots as community. When it _is_ present, the loader wires the extension hooks in `app/src/lib/extensions/bootstrap.ts` and the query middleware bootstrap in `app/src/lib/query/middleware/bootstrap.ts`.

## Local setup (one command)

Place both checkouts side-by-side:

```
~/code/
├── neoboard/                 # this repo
└── neoboard-enterprise/      # private sibling
```

Then from `neoboard/`:

```bash
npm run setup:enterprise
# or, to chain into the dev server in one go:
npm run dev:enterprise
```

The script:

1. Clones the sibling into `../neoboard-enterprise` if it isn't there yet (uses `gh repo clone` so it picks up your existing `gh auth` — no SSH-key gymnastics).
2. Runs `npm install` + `npm run build` in the sibling.
3. `npm link`s the sibling globally, then `npm link @neoboard/enterprise` from `app/`.
4. Prints the env vars to add and a restart hint.

If the sibling already exists, the script reuses it as-is — it never runs `git pull` on your enterprise working tree.

### Prerequisites

- **GitHub CLI** (`gh`) — install from https://cli.github.com, then `gh auth login`. The script uses `gh repo clone` because it works without configuring SSH keys for the private repo.
- **Write access** to `alfredo1996/neoboard-enterprise`. Without it the clone step fails with an authentication error.
- **Node 20+** (already required by the public app).

### Dry-run

`npm run setup:enterprise -- --dry-run` (or `bash scripts/setup-enterprise.sh --dry-run`) prints each step without touching disk. Use it to inspect the flow on a fresh machine or in CI.

## Env vars

Add to `app/.env.local`:

```
NEOBOARD_EDITION=enterprise

# SSO (optional — only if you're working on /settings/authentication)
OIDC_ISSUER=http://localhost:8080/realms/neoboard
OIDC_CLIENT_ID=neoboard
OIDC_CLIENT_SECRET=<from your IdP>
```

Then restart `npm run dev` and visit `/settings/authentication`.

A pre-canned Keycloak compose file lives at `docker/docker-compose.keycloak.yml`:

```bash
docker compose -f docker/docker-compose.keycloak.yml up -d
```

## Version pin

`app/package.json` declares `@neoboard/enterprise` as an `optionalDependencies` entry pinned to a caret range (currently `^1.1.0`). This documents which enterprise major the public app supports; it is never installed from a public registry (the package is private), and `npm install` succeeds without it.

When the enterprise package cuts a major release, bump this pin in lockstep so a stale enterprise build can't silently break things in development.

## Where to file issues

| Surface                                                   | Repo                               |
| --------------------------------------------------------- | ---------------------------------- |
| Public app bug, OSS feature, docs, deployment             | `alfredo1996/neoboard`             |
| Enterprise-only feature, SSO/OIDC bug, license-tier logic | `alfredo1996/neoboard-enterprise`  |
| Setup script itself (`scripts/setup-enterprise.sh`)       | `alfredo1996/neoboard` (this repo) |

## Shipping (post-v1)

Customers will receive enterprise via a separate Docker image — `neoboard/enterprise:1.x` — built by a private CI job that has access to both repos. The public `neoboard/community:1.x` image will never contain `@neoboard/enterprise`. No license keys; the gating is at the image boundary.

## Troubleshooting

- **`gh: command not found`** — install the GitHub CLI from https://cli.github.com.
- **`gh repo clone` fails with 404** — your `gh` account doesn't have access to the private repo. Ask for an invite.
- **`Cannot find module '@neoboard/enterprise'`** in the running app — the `npm link` was undone (often by a later `npm install` in `app/` that rewrote `node_modules`). Re-run `npm run setup:enterprise`.
- **Enterprise features don't show up** — check `NEOBOARD_EDITION=enterprise` is set and the dev server was restarted.
