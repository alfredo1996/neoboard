#!/bin/bash
# Hook: Enforce E2E testing when UI files are edited
# Three modes:
#   mark          — PostToolUse Edit|Write: flag when UI files change
#   check-commit  — PreToolUse Bash: block git commit if E2E not run
#   clear-on-test — PostToolUse Bash: clear flag after playwright runs
#
# `mark` sees only Edit and Write, so a UI file written through Bash was never
# flagged (#1939). check-commit therefore also reads the checkout itself: a UI
# file that differs from HEAD (staged, unstaged or new) and holds content no
# Playwright run in that checkout has seen blocks a commit there, whatever wrote
# it — the same obligation the marker carries. clear-on-test records what a run
# saw. Content, not file times: a rename, a moved directory, `cp -p` or a stash
# round trip cannot fool it, and nothing depends on /bin/bash 3.2's clock.
# ponytail — known ceilings, each accepted on purpose:
#  - a UI file written AND committed in the same Bash call is written after this
#    PreToolUse check runs (#1989 adds a post-commit audit);
#  - UI content written after a run in the same Bash call counts as seen;
#  - `git commit -p` commits hunks that are neither staged nor on disk;
#  - a filename containing a newline or a tab is not checked (the record is
#    "blob<TAB>path" lines);
#  - a command that only mentions a run (a grep, an echo, an issue body) counts
#    as one: the gate is a reminder, not a proof;
#  - when the commit's checkout is unknowable, every worktree is checked, and
#    past ~36 worktrees that outlasts the hook's timeout and lets the commit by.
#
# The flag belongs to a CHECKOUT, not to the project (#1926). Every session —
# including agents in linked worktrees — runs this script with the main checkout
# as CLAUDE_PROJECT_DIR, so one shared flag let an agent's UI edits block commits
# everywhere (even in another repository) and let anyone's Playwright run clear
# everyone's obligation.

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -z "$PROJECT_DIR" ] && exit 0

# The git top level of a directory (its nearest existing parent if it does not
# exist yet), or nothing outside a git work tree.
git_top() {
  local dir="$1"
  while [ -n "$dir" ] && [ ! -d "$dir" ] && [ "$dir" != "/" ]; do
    dir=$(dirname "$dir")
  done
  git -C "$dir" rev-parse --show-toplevel 2>/dev/null
}

# The checkout a directory belongs to: its git top level (a linked worktree has
# its own), else the project dir, so a plain directory behaves as it always did.
checkout_of() {
  local top
  top=$(git_top "$1")
  echo "${top:-$PROJECT_DIR}"
}

marker_of() { echo "$1/.claude/.e2e-needed"; }

# What Playwright runs in checkout $1 have seen: a file in that worktree's own
# git dir, so it is never tracked and never lands in another repo's working
# tree. "blob<TAB>path" lines, accumulated over runs: the committed UI tree each
# run exercised plus the changed UI content it had on disk, so redoing a commit
# (`git reset --soft`) after a run does not undo it.
seen_of() {
  git -C "$1" rev-parse --path-format=absolute --git-path e2e-seen 2>/dev/null
}

# A merge, cherry-pick, revert or rebase is in progress in checkout $1: the
# state git deletes when the operation ends. REBASE_HEAD is not such a sign —
# it outlives a finished rebase. `merge --squash` and `cherry-pick -n` leave no
# reliable sign, so what they bring needs a run like any change.
op_in_progress() {
  local ref dir
  for ref in MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD; do
    git -C "$1" rev-parse -q --verify "$ref" >/dev/null 2>&1 && return 0
  done
  for dir in rebase-merge rebase-apply; do
    [ -d "$(git -C "$1" rev-parse --path-format=absolute --git-path "$dir" 2>/dev/null)" ] &&
      return 0
  done
  return 1
}

# The committed UI tree of checkout $1's HEAD, as "blob<TAB>path" lines.
head_ui() {
  git -C "$1" ls-tree -r -z HEAD -- app/src/components app/src/app 2>/dev/null |
    while IFS= read -r -d '' entry; do
      # "<mode> <type> <blob><TAB><path>"
      entry="${entry#* }"
      entry="${entry#* }"
      printf '%s\t%s\n' "${entry%%$'\t'*}" "${entry#*$'\t'}"
    done
}

# The UI content checkout $1 holds beyond HEAD, one "blob<TAB>path" line each:
# what is on disk of every changed UI file (staged, unstaged or new) and, with
# $2 set, what is staged where the index differs from HEAD. One read-only
# status call, NUL-separated, so no name is quoted or split; one batched
# hash-object call. A symlink is hashed as git stores it: its target text.
# Deletions carry no content and never counted through Edit/Write.
ui_content() {
  local checkout="$1" staged="$2" entry xy path tmp
  tmp=$(mktemp -d) || return 0
  : > "$tmp/disk"
  : > "$tmp/index"
  while IFS= read -r -d '' entry; do
    xy="${entry:0:2}"
    path="${entry:3}"
    # A rename's source path follows as its own entry.
    case "$xy" in R* | C*) IFS= read -r -d '' _ ;; esac
    case "$xy" in D* | ' D') continue ;; esac
    if [ -L "$checkout/$path" ]; then
      printf '%s\t%s\n' \
        "$(printf '%s' "$(readlink "$checkout/$path")" | git -C "$checkout" hash-object --stdin)" \
        "$path"
    elif [ -f "$checkout/$path" ]; then
      printf '%s\n' "$path" >> "$tmp/disk"
    fi
    case "$xy" in [MARCT]?) printf '%s\n' "$path" >> "$tmp/index" ;; esac
  done < <(git --no-optional-locks -C "$checkout" status --porcelain -z \
    --untracked-files=all -- app/src/components app/src/app 2>/dev/null)
  if [ -s "$tmp/disk" ]; then
    paste <(git -C "$checkout" hash-object --stdin-paths < "$tmp/disk" 2>/dev/null) \
      "$tmp/disk"
  fi
  if [ -n "$staged" ] && [ -s "$tmp/index" ]; then
    git -C "$checkout" ls-files -s -z -- app/src/components app/src/app 2>/dev/null |
      while IFS= read -r -d '' entry; do
        # A submodule is a commit, not content a run could see.
        case "$entry" in 160000\ *) continue ;; esac
        # "<mode> <blob> <stage><TAB><path>" -> "<blob><TAB><path>"
        entry="${entry#* }"
        printf '%s\t%s\n' "${entry%% *}" "${entry#*$'\t'}"
      done |
      awk -F'\t' 'FILENAME == ARGV[1] { want[$0]; next } ($2 in want)' "$tmp/index" -
  fi
  rm -rf "$tmp"
}

# The changed UI files of checkout $1 whose content, on disk or staged, is
# neither in HEAD nor seen by a run there, as absolute paths. Whatever this
# commit will carry and however it was written: `git add && git commit`, `-a`
# and pathspecs need no parsing. Nothing while a merge, cherry-pick, revert or
# rebase is in progress: git wrote what it brought in, which no run can have
# seen, and the Edit/Write marker still applies.
# ponytail: a UI file written through Bash during such an operation is not seen.
unverified_ui() {
  local checkout="$1" seen
  op_in_progress "$checkout" && return 0
  seen=$(seen_of "$checkout")
  [ -n "$seen" ] || return 0
  ui_content "$checkout" staged |
    # FILENAME, not NR == FNR: an empty first input (nothing committed, nothing
    # seen) would otherwise make every line count as seen.
    awk 'FILENAME == ARGV[1] { ok[$0]; next } !($0 in ok)' \
      <(head_ui "$checkout"; [ -f "$seen" ] && cat "$seen") - |
    cut -f2- | sort -u |
    awk -v c="$checkout" '{ print c "/" $0 }'
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
    echo "If the run saw what is on disk but a different version is staged, git add it so the commit carries what was tested." >&2
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
    # A Playwright run, however it is spelled: `playwright test`, or the
    # documented `npm run test:e2e` (not :ui). Anchoring it to "a command that
    # invokes it" missed real runs behind do, then, time and quoted env values;
    # a mention counting as a run is the cheaper mistake (see the ceilings).
    echo "$CMD" | grep -qE 'playwright[[:space:]]+test|run[[:space:]]+test:e2e([^:]|$)' || exit 0
    # Listing the specs, or asking for help, is not running them: those flags on
    # the Playwright command itself, not on a `sort -h` further down the pipe.
    echo "$CMD" | grep -qE -- 'playwright[[:space:]]+test[^;&|]*[[:space:]](--list|--help|-h)([[:space:]]|$)' && exit 0
    BASE=$(echo "$INPUT" | jq -r '.cwd // empty')
    BASE="${BASE:-$PROJECT_DIR}"
    # Only the checkout the run happened in; an unknowable one clears nothing.
    DIR=$(target_dir "$CMD" "$BASE") || exit 0
    rm -f "$(marker_of "$(checkout_of "$DIR")")"
    # Record what the run saw, only for a real git checkout, in its own git dir.
    TOP=$(git_top "$DIR")
    SEEN=""
    [ -n "$TOP" ] && SEEN=$(seen_of "$TOP")
    if [ -n "$SEEN" ]; then
      # Added to what earlier runs saw, and replaced atomically.
      # A file that could not be hashed has an empty blob: never vouch for it.
      { [ -f "$SEEN" ] && cat "$SEEN"; head_ui "$TOP"; ui_content "$TOP"; } |
        grep -v $'^\t' | sort -u > "$SEEN.$$" && mv "$SEEN.$$" "$SEEN"
    fi
    ;;

  *)
    echo "Usage: enforce-e2e.sh <mark|check-commit|clear-on-test>" >&2
    exit 1
    ;;
esac

exit 0
