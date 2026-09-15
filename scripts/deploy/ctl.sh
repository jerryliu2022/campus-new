#!/usr/bin/env bash
# 岳阳学院智慧校园 —— 后台服务控制脚本（Linux / 阿里云 ECS）
#
# 用法：
#   ./scripts/deploy/ctl.sh start           启动后端 + 前端
#   ./scripts/deploy/ctl.sh start-backend   只启动后端（推荐：npm run build 后后端直接托管 dist）
#   ./scripts/deploy/ctl.sh start-frontend  只启动前端（vite dev，仅调试用）
#   ./scripts/deploy/ctl.sh status          查看端口 / PID / 是否存活
#   ./scripts/deploy/ctl.sh log backend     实时看日志（backend / frontend）
#   ./scripts/deploy/ctl.sh restart         全部重启
#   ./scripts/deploy/ctl.sh stop            全部停止
#
# 注意：本文件必须保存成 LF 换行。若在 Windows 上编辑过，先执行：
#   dos2unix scripts/deploy/ctl.sh   或   sed -i 's/\r$//' scripts/deploy/ctl.sh

set -u

# ---------- 按你的环境改这几行 ----------
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-python3}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-4175}"
# ---------------------------------------

LOG_DIR="$APP_DIR/logs"
PID_DIR="$LOG_DIR"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"
BACKEND_PID="$PID_DIR/backend.pid"
FRONTEND_PID="$PID_DIR/frontend.pid"

mkdir -p "$LOG_DIR"

# setsid + nohup + </dev/null：三个零件缺一不可
#   setsid     → 自立为新会话组长，脱离当前终端，也躲开 systemd-logind 的用户进程清理
#   nohup      → 忽略 SSH 断开时的 SIGHUP
#   </dev/null → 切断 stdin，避免进程读终端时被 SIGTTIN 挂起（状态变 T）
launch() {
  local name=$1 logfile=$2 pidfile=$3
  shift 3
  cd "$APP_DIR" || exit 1
  setsid nohup "$@" </dev/null >>"$logfile" 2>&1 &
  local pid=$!
  echo "$pid" >"$pidfile"
  sleep 2
  if kill -0 "$pid" 2>/dev/null; then
    echo "  [OK]   $name 已启动  PID=$pid  日志=$logfile"
  else
    echo "  [FAIL] $name 启动失败，看日志：$logfile"
    tail -n 20 "$logfile"
    return 1
  fi
}

stop_one() {
  local name=$1 pidfile=$2 port=$3
  if [[ -f "$pidfile" ]]; then
    local pid
    pid=$(cat "$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null && echo "  [OK]   $name (PID=$pid) 已停止"
    fi
    rm -f "$pidfile"
  fi
  # 兜底：进程可能是别人起的，pid 文件不对，再按端口清一次
  local pids
  pids=$(ss -lntp 2>/dev/null | grep ":$port " | grep -oP 'pid=\K[0-9]+' | sort -u)
  if [[ -n "$pids" ]]; then
    echo "  [i]    端口 $port 上还有进程：$pids"
    for p in $pids; do kill "$p" 2>/dev/null; done
    sleep 1
  fi
}

show_status() {
  local name=$1 port=$2 pidfile=$3
  local pid="-"
  [[ -f "$pidfile" ]] && pid=$(cat "$pidfile")
  local alive="未运行"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 3 "http://127.0.0.1:$port/" 2>/dev/null)
  if [[ -n "$code" && "$code" != "000" ]]; then
    alive="运行中 (HTTP $code)"
  elif [[ "$pid" != "-" ]] && kill -0 "$pid" 2>/dev/null; then
    alive="进程在，但端口没响应"
  fi
  printf "  %-8s 端口 %-5s PID %-8s %s\n" "$name" "$port" "$pid" "$alive"
}

case "${1:-}" in
  start)
    echo "启动服务（目录 $APP_DIR）"
    launch "后端" "$BACKEND_LOG" "$BACKEND_PID" \
      "$PYTHON_BIN" -m uvicorn backend.main:app --host 0.0.0.0 --port "$BACKEND_PORT"
    launch "前端" "$FRONTEND_LOG" "$FRONTEND_PID" \
      npx vite --host 0.0.0.0 --port "$FRONTEND_PORT"
    ;;

  start-backend)
    echo "只启动后端（需已执行 npm run build）"
    launch "后端" "$BACKEND_LOG" "$BACKEND_PID" \
      "$PYTHON_BIN" -m uvicorn backend.main:app --host 0.0.0.0 --port "$BACKEND_PORT"
    ;;

  start-frontend)
    echo "只启动前端"
    launch "前端" "$FRONTEND_LOG" "$FRONTEND_PID" \
      npx vite --host 0.0.0.0 --port "$FRONTEND_PORT"
    ;;

  stop)
    echo "停止服务"
    stop_one "前端" "$FRONTEND_PID" "$FRONTEND_PORT"
    stop_one "后端" "$BACKEND_PID" "$BACKEND_PORT"
    ;;

  restart)
    "$0" stop
    sleep 1
    "$0" start
    ;;

  status)
    echo "服务状态："
    show_status "后端" "$BACKEND_PORT" "$BACKEND_PID"
    show_status "前端" "$FRONTEND_PORT" "$FRONTEND_PID"
    echo
    echo "健康检查："
    curl -s -m 3 "http://127.0.0.1:$BACKEND_PORT/api/health" || echo "  （后端无响应）"
    echo
    ;;

  log)
    case "${2:-backend}" in
      backend)  tail -f "$BACKEND_LOG" ;;
      frontend) tail -f "$FRONTEND_LOG" ;;
      *) echo "用法：$0 log {backend|frontend}" ;;
    esac
    ;;

  *)
    # 打印文件头部注释块作为用法说明（遇到第一行非注释内容即停止）
    awk 'NR==1{next} /^#/{sub(/^# ?/,"");print;next} /^$/{print "";next} {exit}' "${BASH_SOURCE[0]}"
    ;;
esac
