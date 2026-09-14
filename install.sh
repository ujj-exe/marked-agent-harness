#!/bin/sh
set -eu

SELF_URL=${MARKED_INSTALL_SELF_URL:-https://raw.githubusercontent.com/ujjwalpreenja1308-web/marked-agent-harness/main/install.sh}
if [ ! -t 0 ] && [ "${MARKED_INSTALL_REEXEC:-0}" != "1" ]; then
    TEMP_INSTALLER=$(mktemp "${TMPDIR:-/tmp}/marked-install.XXXXXX")
    trap 'rm -f "$TEMP_INSTALLER"' EXIT INT TERM
    curl -fsSL "$SELF_URL" -o "$TEMP_INSTALLER"
    MARKED_INSTALL_REEXEC=1 sh "$TEMP_INSTALLER" "$@" </dev/tty
    exit $?
fi

REPO_URL=${MARKED_REPO_URL:-https://github.com/ujjwalpreenja1308-web/marked-agent-harness.git}
REF=${MARKED_REF:-main}
NODE_SOURCE=${MARKED_NODE_SOURCE:-${REPO_URL}#${REF}}
PYTHON_SOURCE=${MARKED_PYTHON_SOURCE:-git+${REPO_URL}@${REF}}

command -v node >/dev/null 2>&1 || { printf '%s\n' "Marked requires Node.js." >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { printf '%s\n' "Marked requires npm." >&2; exit 1; }

if command -v uv >/dev/null 2>&1; then
    # The Python sidecar owns Codex authentication and transport only.
    uv tool install --force --quiet "$PYTHON_SOURCE"
else
    command -v python3 >/dev/null 2>&1 || {
        printf '%s\n' "Marked requires uv or Python 3.11+." >&2
        exit 1
    }
    python3 -m pip install --quiet --user --upgrade "marked-agent-harness @ $PYTHON_SOURCE"
fi

# Install Node last so an upgrade from the old Python package cannot remove
# the `marked` and `marked-onboard` executable links.
npm install --global --force "$NODE_SOURCE"

exec marked --onboard </dev/tty
