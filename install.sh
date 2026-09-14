#!/bin/sh
set -eu

main() {
    REPO_URL=${MARKED_REPO_URL:-https://github.com/ujjwalpreenja1308-web/marked-agent-harness.git}
    REF=${MARKED_REF:-main}
    NODE_SOURCE=${MARKED_NODE_SOURCE:-${REPO_URL}#${REF}}
    PYTHON_SOURCE=${MARKED_PYTHON_SOURCE:-git+${REPO_URL}@${REF}}

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
    # Install Node last so an upgrade from the old Python package cannot remove
    # the `marked` and `marked-onboard` executable links.
    # npm cannot replace a package created by `npm link`; remove that exact
    # package first so both linked development installs and upgrades work.
    npm uninstall --global --silent marked-agent-harness >/dev/null 2>&1 || true
    npm install --global "$NODE_SOURCE"

    printf '\n  ✓ Installed. Starting onboarding…\n'
    exec marked --onboard
}

# A function body is parsed before execution, so a curl pipe can safely hand
# interactive input to the terminal without downloading this script again.
if [ -t 0 ]; then
    main "$@"
else
    main "$@" </dev/tty
fi
