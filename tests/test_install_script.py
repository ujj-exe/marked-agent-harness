from pathlib import Path


def test_install_script_is_posix_shell_and_bootstraps_onboard():
    script = Path(__file__).parents[1] / "install.sh"
    text = script.read_text()
    assert text.startswith("#!/bin/sh\n")
    assert 'npm install --global --force "$NODE_SOURCE"' in text
    assert "uv tool install --force --quiet" in text
    assert "Install Node last" in text
    assert "exec marked --onboard" in text
    assert text.index("uv tool install") < text.index("npm install --global")
    assert 'main "$@" </dev/tty' in text
    assert "Installing the agent harness" in text
    assert "MARKED_INSTALL_REEXEC" not in text
