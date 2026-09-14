#!/usr/bin/env bash
set -euo pipefail

OPEND_DIR="$HOME/.marked/opend"
OPEND_BIN="$OPEND_DIR/FutuOpenD"
OPEND_CFG="$OPEND_DIR/FutuOpenD.xml"
DOWNLOAD_URL="https://www.futunn.com/download/fetch-lasted-link?name=opend-ubuntu"

# Subcommands: download, configure, start, stop, status, verify-2fa

case "${1:-help}" in
  download)
    if [ -x "$OPEND_BIN" ]; then
      echo '{"status":"already_installed","path":"'"$OPEND_BIN"'"}'
      exit 0
    fi
    mkdir -p "$OPEND_DIR"
    TMPFILE=$(mktemp /tmp/opend-XXXXXX.tar.gz)
    echo '{"status":"downloading","url":"'"$DOWNLOAD_URL"'"}' >&2
    curl -fSL -o "$TMPFILE" "$DOWNLOAD_URL" 2>/dev/null
    # Extract — the tar.gz contains a directory like Futu_OpenD_*/
    tar -xzf "$TMPFILE" -C "$OPEND_DIR" --strip-components=1
    rm -f "$TMPFILE"
    chmod +x "$OPEND_BIN"
    echo '{"status":"installed","path":"'"$OPEND_BIN"'"}'
    ;;

  configure)
    # Usage: setup-opend.sh configure <account> [pwd_md5]
    ACCOUNT="${2:?Usage: setup-opend.sh configure <account>}"
    # Read password interactively (hidden) — never passed via args or agent
    if [ -t 0 ]; then
      read -s -p "Moomoo password: " RAW_PWD
      echo >&2
    else
      # Allow piping for non-interactive use (testing)
      read -r RAW_PWD
    fi
    if [ -n "$RAW_PWD" ]; then
      PWD_MD5=$(printf '%s' "$RAW_PWD" | md5sum | cut -d' ' -f1)
    else
      PWD_MD5=""
    fi

    cat > "$OPEND_CFG" << XMLEOF
<?xml version="1.0" encoding="utf-8"?>
<config>
    <ip>127.0.0.1</ip>
    <api_port>11111</api_port>
    <websocket_ip>127.0.0.1</websocket_ip>
    <websocket_port>33333</websocket_port>
    <telnet_ip>127.0.0.1</telnet_ip>
    <telnet_port>22222</telnet_port>
    <login_account>$ACCOUNT</login_account>
    <login_pwd_md5>$PWD_MD5</login_pwd_md5>
    <lang>en</lang>
    <log_level>info</log_level>
</config>
XMLEOF
    chmod 600 "$OPEND_CFG"
    echo '{"status":"configured","config":"'"$OPEND_CFG"'","account":"'"$ACCOUNT"'"}'
    ;;

  start)
    if [ ! -x "$OPEND_BIN" ]; then
      echo '{"status":"error","message":"OpenD not installed. Run: setup-opend.sh download"}'
      exit 1
    fi
    if [ ! -f "$OPEND_CFG" ]; then
      echo '{"status":"error","message":"OpenD not configured. Run: setup-opend.sh configure <account>"}'
      exit 1
    fi
    # Check if already running
    if pgrep -f FutuOpenD >/dev/null 2>&1; then
      PID=$(pgrep -f FutuOpenD | head -1)
      echo '{"status":"already_running","pid":'"$PID"'}'
      exit 0
    fi
    cd "$OPEND_DIR"
    nohup ./FutuOpenD -cfg_file="$OPEND_CFG" -console=0 > "$OPEND_DIR/opend.log" 2>&1 &
    OPEND_PID=$!
    sleep 2
    if kill -0 "$OPEND_PID" 2>/dev/null; then
      echo '{"status":"started","pid":'"$OPEND_PID"',"log":"'"$OPEND_DIR/opend.log"'"}'
    else
      echo '{"status":"error","message":"OpenD failed to start. Check '"$OPEND_DIR/opend.log"'"}'
      exit 1
    fi
    ;;

  stop)
    if pgrep -f FutuOpenD >/dev/null 2>&1; then
      pkill -f FutuOpenD
      echo '{"status":"stopped"}'
    else
      echo '{"status":"not_running"}'
    fi
    ;;

  status)
    RUNNING=false
    TCP_OK=false
    WS_OK=false
    PID=0
    if pgrep -f FutuOpenD >/dev/null 2>&1; then
      RUNNING=true
      PID=$(pgrep -f FutuOpenD | head -1)
    fi
    # Check TCP 11111
    if (echo >/dev/tcp/127.0.0.1/11111) 2>/dev/null; then
      TCP_OK=true
    fi
    # Check WS 33333
    if (echo >/dev/tcp/127.0.0.1/33333) 2>/dev/null; then
      WS_OK=true
    fi
    echo '{"status":"ok","running":'"$RUNNING"',"tcp_port":'"$TCP_OK"',"ws_port":'"$WS_OK"',"pid":'"$PID"'}'
    ;;

  verify-2fa)
    # Usage: setup-opend.sh verify-2fa <code> [type]
    # type: phone (default) or pic
    CODE="${2:?Usage: setup-opend.sh verify-2fa <code> [type]}"
    TYPE="${3:-phone}"
    if [ "$TYPE" = "pic" ]; then
      CMD="input_pic_verify_code -code=$CODE"
    else
      CMD="input_phone_verify_code -code=$CODE"
    fi
    # Send via telnet
    RESULT=$(echo "$CMD" | nc -w 3 127.0.0.1 22222 2>&1) || true
    echo '{"status":"sent","command":"'"$CMD"'","response":"'"${RESULT//\"/\\\"}"'"}'
    ;;

  help|*)
    echo 'Usage: setup-opend.sh <download|configure|start|stop|status|verify-2fa>'
    echo ''
    echo 'Commands:'
    echo '  download                    Download and extract OpenD to ~/.marked/opend/'
    echo '  configure <account> [md5]   Generate config with WebSocket enabled'
    echo '  start                       Start OpenD daemon'
    echo '  stop                        Stop OpenD daemon'
    echo '  status                      Check if OpenD is running and ports are open'
    echo '  verify-2fa <code> [type]    Send 2FA code (type: phone or pic)'
    ;;
esac
