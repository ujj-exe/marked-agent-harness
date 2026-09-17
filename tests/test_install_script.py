from pathlib import Path


def test_install_script_is_posix_shell_and_bootstraps_onboard():
    script = Path(__file__).parents[1] / "install.sh"
    text = script.read_text()
    assert text.startswith("#!/bin/sh\n")
    assert 'git clone --quiet --depth 1 --branch "$REF"' in text
    assert 'npm install --prefix "$INSTALL_DIR" --omit=dev --ignore-scripts' in text
    assert 'ln -sf "$INSTALL_DIR/bin/marked" "$BIN_DIR/marked"' in text
    assert "uv tool install --force --quiet" in text
    assert 'exec "$BIN_DIR/marked" --onboard' in text
    assert text.index("uv tool install") < text.index("git clone")
    assert 'main "$@" </dev/tty' in text
    assert "Installing the agent harness" in text
    assert "MARKED_INSTALL_REEXEC" not in text


def test_install_script_preserves_a_dirty_checkout_before_updating():
    text = (Path(__file__).parents[1] / "install.sh").read_text()
    dirty = text.index('status --porcelain')
    backup = text.index('mv "$INSTALL_DIR" "$BACKUP_DIR"')
    clone = text.index('git clone --quiet --depth 1 --branch "$REF"', backup)
    assert dirty < backup < clone
