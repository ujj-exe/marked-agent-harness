#!/bin/sh
set -eu

main() {
    REPO_URL=${MARKED_REPO_URL:-https://github.com/ujj-exe/marked-agent-harness.git}
    REF=${MARKED_REF:-main}
    PYTHON_SOURCE=${MARKED_PYTHON_SOURCE:-git+${REPO_URL}@${REF}}
    INSTALL_DIR=${MARKED_INSTALL_DIR:-$HOME/.marked/harness}

    printf '\n  ▐██ MARKED\n'
    printf '  Installing the agent harness…\n\n'

    command -v node >/dev/null 2>&1 || {
        printf '%s\n' "Marked requires Node.js 20 or newer." >&2
        exit 1
    }
    command -v npm >/dev/null 2>&1 || {
        printf '%s\n' "Marked requires npm." >&2
        exit 1
    }
    command -v git >/dev/null 2>&1 || {
        printf '%s\n' "Marked requires git." >&2
        exit 1
    }

    printf '  [1/2] Installing Codex authentication…\n'
    if command -v uv >/dev/null 2>&1; then
        uv tool install --force --quiet "$PYTHON_SOURCE"
    else
        command -v python3 >/dev/null 2>&1 || {
            printf '%s\n' "Marked requires uv or Python 3.11+." >&2
            exit 1
        }
        python3 -m pip install --quiet --user --upgrade "marked-agent-harness @ $PYTHON_SOURCE"
    fi

    printf '  [2/2] Installing the Marked terminal…\n'
    mkdir -p "$(dirname "$INSTALL_DIR")"
    if [ -d "$INSTALL_DIR/.git" ]; then
        if [ -n "$(git -C "$INSTALL_DIR" status --porcelain)" ]; then
            BACKUP_DIR="${INSTALL_DIR}.backup-$(date +%Y%m%d%H%M%S)-$$"
            mv "$INSTALL_DIR" "$BACKUP_DIR"
            printf '  Local changes preserved at %s\n' "$BACKUP_DIR"
            git clone --quiet --depth 1 --branch "$REF" "$REPO_URL" "$INSTALL_DIR"
        else
            git -C "$INSTALL_DIR" pull --quiet --ff-only origin "$REF"
        fi
    elif [ -e "$INSTALL_DIR" ]; then
        printf '%s\n' "Cannot install: $INSTALL_DIR already exists and is not a Git checkout." >&2
        exit 1
    else
        git clone --quiet --depth 1 --branch "$REF" "$REPO_URL" "$INSTALL_DIR"
    fi
    npm install --prefix "$INSTALL_DIR" --omit=dev --ignore-scripts --no-audit --no-fund --silent

    BIN_DIR="$(npm prefix --global)/bin"
    mkdir -p "$BIN_DIR"
    npm uninstall --global --silent marked-agent-harness >/dev/null 2>&1 || true
    ln -sf "$INSTALL_DIR/bin/marked" "$BIN_DIR/marked"
    ln -sf "$INSTALL_DIR/bin/marked-onboard" "$BIN_DIR/marked-onboard"
    ln -sf "$INSTALL_DIR/bin/marked-chart" "$BIN_DIR/marked-chart"

    printf '\n  ✓ Installed. Starting onboarding…\n'
    exec "$BIN_DIR/marked" --onboard
}

# A function body is parsed before execution, so a curl pipe can safely hand
# interactive input to the terminal without downloading this script again.
if [ -t 0 ]; then
    main "$@"
else
    main "$@" </dev/tty
fi
