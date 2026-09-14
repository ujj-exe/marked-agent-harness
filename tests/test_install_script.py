from pathlib import Path


def test_install_script_is_posix_shell_and_bootstraps_onboard():
    script = Path(__file__).parents[1] / "install.sh"
    text = script.read_text()
    assert text.startswith("#!/bin/sh\n")
    assert "uv tool install --force --quiet" in text
    assert "marked\" onboard" in text
    assert "</dev/tty" in text
