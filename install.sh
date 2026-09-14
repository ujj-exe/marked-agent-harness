#!/bin/sh
set -eu

REPO_URL=${MARKED_REPO_URL:-https://github.com/ujjwalpreenja1308-web/marked-agent-harness.git}
REF=${MARKED_REF:-main}
SOURCE=${MARKED_INSTALL_SOURCE:-git+${REPO_URL}@${REF}}

if command -v uv >/dev/null 2>&1; then
    uv tool install --force --quiet "$SOURCE"
    BIN_DIR=$(uv tool dir --bin)
    if [ -x "$BIN_DIR/marked" ]; then
        exec "$BIN_DIR/marked" onboard "$@" </dev/tty
    fi
    exec marked onboard "$@" </dev/tty
fi

if ! command -v python3 >/dev/null 2>&1; then
    printf '%s\n' "Marked requires uv or Python 3.11+." >&2
    exit 1
fi

python3 -m pip install --quiet --user --upgrade "marked-agent-harness @ $SOURCE"
exec python3 -m market_data.onboarding onboard "$@" </dev/tty
