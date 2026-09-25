#!/bin/bash
# Hook: Enforce E2E testing when UI files are edited
# Three modes:
#   mark          — PostToolUse Edit|Write: flag when UI files change
#   check-commit  — PreToolUse Bash: block git commit if E2E not run
#   clear-on-test — PostToolUse Bash: clear flag after playwright runs
#
# `mark` sees only Edit and Write, so a UI file written through Bash was never
# flagged (#1939). check-commit therefore also reads the checkout itself: a UI
# file that differs from HEAD (staged, unstaged or new) and changed after the
# checkout's last Playwright run blocks a commit there, whatever wrote it — the
# same obligation the marker carries. clear-on-test stamps the run.
#
# The flag belongs to a CHECKOUT, not to the project (#1926). Every session —
# including agents in linked worktrees — runs this script with the main checkout
# as CLAUDE_PROJECT_DIR, so one shared flag let an agent's UI edits block commits
# everywhere (even in another repository) and let anyone's Playwright run clear
# everyone's obligation.

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -z "$PROJECT_DIR" ] && exit 0

# The checkout a directory belongs to: its git top level (a linked worktree has
# its own), else the project dir, so a plain directory behaves as it always did.
# A directory that does not exist yet counts as its nearest existing parent.
# The git top level of a directory (its nearest existing parent if it does not
# exist yet), or nothing outside a git work tree.
git_top() {
  local dir="$1"
  while [ -n "$dir" ] && [ ! -d "$dir" ] && [ "$dir" != "/" ]; do
    dir=$(dirname "$dir")
  done
  git -C "$dir" rev-parse --show-toplevel 2>/dev/null
}

checkout_of() {
  local top
  top=$(git_top "$1")
  echo "${top:-$PROJECT_DIR}"
}

marker_of() { echo "$1/.claude/.e2e-needed"; }

# When checkout $1 last ran Playwright: a file in that worktree's own git dir,
# so it is never tracked and never lands in another repo's working tree.
stamp_of() {
  git -C "$1" rev-parse --path-format=absolute --git-path e2e-last-run 2>/dev/null
}

# The UI files in checkout $1 that differ from HEAD — staged, unstaged or new —
# and changed after its last Playwright run (all of them before a first run),
# as absolute paths. Whatever this commit will carry and however they were
# written: `git add && git commit`, `-a`, `-p` and pathspecs need no parsing.
# ctime, which no command can set back (cp -p, touch -r); `find` compares it
# finely, where /bin/bash 3.2's -nt has whole seconds. One read-only status
# call, NUL-separated, so no name is quoted or split. Deletions don't count,
# as they never did through Edit/Write.
unverified_ui() {
  local checkout="$1" stamp incoming ref entry xy path
  stamp=$(stamp_of "$checkout")
  # Finishing a merge, cherry-pick or revert: files the other side changed
  # arrive freshly written. Only a path that differs from that side too was
  # touched here.
  incoming=""
  for ref in MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD; do
    if git -C "$checkout" rev-parse -q --verify "$ref" >/dev/null 2>&1; then
      incoming="$ref"
      break
    fi
  done
  [ "$incoming" = REVERT_HEAD ] && incoming="REVERT_HEAD^"
  git --no-optional-locks -C "$checkout" status --porcelain -z \
    --untracked-files=all -- app/src/components app/src/app 2>/dev/null |
    while IFS= read -r -d '' entry; do
      xy="${entry:0:2}"
      path="${entry:3}"
      # A rename's source path follows as its own entry.
      case "$xy" in R* | C*) IFS= read -r -d '' _ ;; esac
      case "$xy" in D* | ?D) continue ;; esac
      if [ -n "$incoming" ] &&
        git -C "$checkout" diff --quiet "$incoming" -- "$path" 2>/dev/null; then
        continue
      fi
      case "$xy" in
        # Staged content that is not what is on disk, or a rename (which keeps
        # its old times): nothing on disk can vouch for it.
        [MARC][MD] | R* | C*) echo "$checkout/$path" ;;
        *)
          if [ -z "$stamp" ] || [ ! -e "$stamp" ] ||
            [ -n "$(find "$checkout/$path" -prune -cnewer "$stamp" 2>/dev/null)" ]; then
            echo "$checkout/$path"
          fi
          ;;
      esac
    done
}

# Every git checkout a session could be committing to: the project, the cwd's,
# and each linked worktree of the project.
all_checkouts() {
  {
    git_top "$PROJECT_DIR"
    git_top "$1"
    git -C "$PROJECT_DIR" worktree list --porcelain 2>/dev/null |
      sed -n 's/^worktree //p'
  } | sed '/^$/d' | sort -u
}

# One path token: "double quoted", 'single quoted' or bare.
Q="'"
PATH_TOKEN="(\"[^\"]*\"|${Q}[^${Q}]*${Q}|[^[:space:];&|]+)"

# Make a captured path token absolute against $2. Fails when only the shell
# could expand it ($VAR, `cmd`), because then the hook cannot know the target.
resolve_path() {
  local dir="$1" base="$2"
  dir="${dir#\"}"; dir="${dir%\"}"
  dir="${dir#$Q}"; dir="${dir%$Q}"
  case "$dir" in
    *'$'* | *'`'*) return 1 ;;
    '~' | '~/'*) dir="$HOME${dir#\~}" ;;
  esac
  case "$dir" in
    /*) echo "$dir" ;;
    *) echo "$base/$dir" ;;
  esac
}

# The directory a command acts in: a `cd <dir>` in front of it, then `git -C <dir>`,
# else the session's cwd. Fails when it cannot be known — more than one `cd`, or a
# path the shell would have to expand.
target_dir() {
  local cmd="$1" dir="$2" token
  local re_cd="(^|[;&|({][[:space:]]*)cd[[:space:]]+${PATH_TOKEN}"
  local re_c="git[[:space:]]+-C[[:space:]]+${PATH_TOKEN}"
  local cds
  cds=$(printf '%s\n' "$cmd" | grep -oE "$re_cd" | wc -l | tr -d ' ')
  [ "$cds" -gt 1 ] && return 1
  if [[ "$cmd" =~ $re_cd ]]; then
    token="${BASH_REMATCH[2]}"
    dir=$(resolve_path "$token" "$dir") || return 1
  fi
  if [[ "$cmd" =~ $re_c ]]; then
    token="${BASH_REMATCH[1]}"
    dir=$(resolve_path "$token" "$dir") || return 1
  fi
  echo "$dir"
}

# Every flag this session could be answerable for: the project's, the cwd's
# checkout, and each linked worktree of the project.
all_markers() {
  {
    marker_of "$PROJECT_DIR"
    marker_of "$(checkout_of "$1")"
    git -C "$PROJECT_DIR" worktree list --porcelain 2>/dev/null |
      sed -n 's/^worktree //p' | while read -r wt; do marker_of "$wt"; done
  } | sort -u
}

case "$1" in
  mark)
    INPUT=$(cat)
    FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.filePath // empty')
    [ -z "$FILE_PATH" ] && exit 0
    case "$FILE_PATH" in
      */app/src/components/*|*/app/src/app/*)
        CHECKOUT=$(checkout_of "$(dirname "$FILE_PATH")")
        MARKER=$(marker_of "$CHECKOUT")
        mkdir -p "$CHECKOUT/.claude"
        touch "$MARKER"
        if ! grep -qxF "$FILE_PATH" "$MARKER" 2>/dev/null; then
          echo "$FILE_PATH" >> "$MARKER"
        fi
        ;;
    esac
    ;;

  check-commit)
    INPUT=$(cat)
    CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
    # `git commit` as any subcommand: at the start, after && ; | ( {, behind
    # env assignments, and behind any git options (-C <dir>, -c k=v, --no-pager).
    # `^\s*git commit` alone let `cd app && git commit` through (#1843).
    echo "$CMD" | grep -qE '(^|[;&|({][[:space:]]*)([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*git([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*[[:space:]]+commit([[:space:]]|$)' || exit 0
    BASE=$(echo "$INPUT" | jq -r '.cwd // empty')
    BASE="${BASE:-$PROJECT_DIR}"
    UNRESOLVED=""
    if DIR=$(target_dir "$CMD" "$BASE"); then
      MARKERS=$(marker_of "$(checkout_of "$DIR")")
      # Only a real git checkout: the project-dir fallback is for the marker.
      CHECKOUTS=$(git_top "$DIR")
    else
      # Which checkout this commits to is unknowable, so answer for all of them.
      UNRESOLVED=1
      MARKERS=$(all_markers "$BASE")
      CHECKOUTS=$(all_checkouts "$BASE")
    fi
    FILES=$(
      {
        echo "$MARKERS" | while read -r m; do [ -f "$m" ] && cat "$m"; done
        echo "$CHECKOUTS" | while read -r c; do
          [ -n "$c" ] && unverified_ui "$c"
        done
      } | sort -u
    )
    [ -z "$FILES" ] && exit 0
    COUNT=$(echo "$FILES" | wc -l | tr -d ' ')
    echo "BLOCKED: $COUNT UI file(s) were edited and Playwright E2E has not run since." >&2
    echo "Run first: cd app && npx playwright test <affected spec>" >&2
    if [ -n "$UNRESOLVED" ]; then
      echo "" >&2
      echo "The hook could not tell which checkout this commits to, so it checked all of them." >&2
      echo "Spell the path literally: git -C <path> commit …, or cd <path> && git commit …" >&2
    fi
    echo "" >&2
    echo "Edited UI files:" >&2
    echo "$FILES" | while read -r f; do echo "  - $f" >&2; done
    exit 2
    ;;

  clear-on-test)
    INPUT=$(cat)
    CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
    # Clear marker when playwright tests are run (directly, or through the
    # documented `npm run test:e2e`).
    echo "$CMD" | grep -qE 'playwright test|test:e2e' || exit 0
    # Listing the specs is not running them.
    echo "$CMD" | grep -qE -- '--list' && exit 0
    BASE=$(echo "$INPUT" | jq -r '.cwd // empty')
    BASE="${BASE:-$PROJECT_DIR}"
    # Only the checkout the run happened in; an unknowable one clears nothing.
    DIR=$(target_dir "$CMD" "$BASE") || exit 0
    rm -f "$(marker_of "$(checkout_of "$DIR")")"
    # Stamp only a real git checkout, in its own git dir.
    TOP=$(git_top "$DIR")
    STAMP=""
    [ -n "$TOP" ] && STAMP=$(stamp_of "$TOP")
    [ -n "$STAMP" ] && touch "$STAMP"
    ;;

  *)
    echo "Usage: enforce-e2e.sh <mark|check-commit|clear-on-test>" >&2
    exit 1
    ;;
esac

exit 0
