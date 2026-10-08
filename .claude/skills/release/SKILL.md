---
name: release
description: Cut a NeoBoard release (readiness check, version bump PR, complete changelog section, release branch into dev, rc tag, final tag). Run on purpose, because a tag publishes an image.
disable-model-invocation: true
allowed-tools: Read, Edit, Bash(gh *), Bash(git *), Bash(npm *), Bash(npx *), Bash(node *)
---

# Release — NeoBoard

Every step that publishes something (a merge into `dev`, a tag, a package made public) needs the owner's explicit go in this session. $ARGUMENTS = the version, e.g. `1.6.0`.

## 1. Ready?

- **Milestones:** the release's milestones are empty (`vX.Y`, and `vX.Y.1` for bugs found during it).
- **CI:** the release branch's latest push run is green, with no E2E test that failed its first attempt. Use the scan in `pr`, merge bar step 3.
- **Audit:** `npm audit --package-lock-only --omit=dev` shows no critical. Every remaining high is accepted by the owner.
- **Changelog:** `CHANGELOG.md`'s `## [X.Y.Z]` section covers every user-facing issue of those milestones, and leaves internal ones out (test-only, CI, tooling). Check for numbers missing from the section:

  ```bash
  for n in $(gh issue list --repo alfredo1996/neoboard --milestone "<milestone>" --state closed --limit 300 --json number,stateReason --jq '.[] | select(.stateReason=="COMPLETED") | .number'); do grep -qE "#$n([^0-9]|$)" CHANGELOG.md || echo "#$n"; done
  ```

## 2. The release PR, on the release branch

- **Versions:** set root, `app`, `component`, `connection` and `docs` `package.json` to X.Y.Z, then sync `package-lock.json` and `docs/package-lock.json`. `cli/package.json` keeps its own version, so the CLI publish job skips. `scripts/__tests__/release-workflow.test.mjs` pins all of this.
- **Heading:** `## [X.Y.Z] — YYYY-MM-DD — <title>`. `release.yml` publishes everything under it, up to the next `## [`, as the GitHub Release text.
- **Merge:** follow `pr`, at the full bar.

## 3. Consolidate (owner's go)

Fast-forward `release/X.Y` into `dev`. `dev` → `main` is the owner's.

## 4. Tag (owner's go)

1. **`vX.Y.Z-rc.1` first.** `release.yml` builds and pushes the image and creates a GitHub pre-release; this is its rehearsal. Watch the run until it is green.
2. **Rehearse a clean install:** in a fresh clone, run `bash install.sh`, then `neoboard demo`.
3. **`vX.Y.Z`** on the consolidation commit.

## 5. Owner-only, after the first public tag

- Make the ghcr package public.
- Protect `main` and `dev`.
- Turn on GitHub Pages, and set the `DOCS_DEPLOY` repo variable.
- Turn on private vulnerability reporting, Dependabot alerts and secret scanning.

## 6. After

Check the GitHub Release text and close the milestones. Record the release in the vault's `roadmap/Release history.md`.
