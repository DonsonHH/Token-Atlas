#!/usr/bin/env bash
set -Eeuo pipefail

output_path="${1:-}"
device_name="${2:-}"
agent_source="${3:-codex}"

if [[ -z "$output_path" ]]; then
  output_path="$HOME/jetson-orin-nano.json"
fi

if [[ -z "$device_name" ]]; then
  device_name="NVIDIA Jetson Orin Nano"
fi

mkdir -p "$(dirname "$output_path")"
temporary_path="$(mktemp)"
trap 'rm -f "$temporary_path"' EXIT

command_args=(daily --json --offline --last 90)
if [[ "$agent_source" != "all" ]]; then
  command_args=("$agent_source" "${command_args[@]}")
fi

if command -v ccusage >/dev/null 2>&1; then
  ccusage "${command_args[@]}" > "$temporary_path"
elif command -v pnpm >/dev/null 2>&1; then
  pnpm dlx ccusage@20.0.19 "${command_args[@]}" > "$temporary_path"
else
  echo "没有找到 ccusage 或 pnpm。请先安装其中之一。" >&2
  exit 1
fi

if command -v python3 >/dev/null 2>&1; then
  TOKEN_ATLAS_SOURCE="$agent_source" python3 - "$temporary_path" "$output_path" "$device_name" <<'PY'
import datetime
import json
import os
import sys

input_path, output_path, device_name = sys.argv[1:]

with open(input_path, "r", encoding="utf-8") as source:
    payload = json.load(source)

payload["deviceName"] = device_name
payload["exportedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
payload["source"] = os.environ.get("TOKEN_ATLAS_SOURCE", "all")

with open(output_path, "w", encoding="utf-8") as destination:
    json.dump(payload, destination, ensure_ascii=False, indent=2)
    destination.write(chr(10))
PY
else
  cp "$temporary_path" "$output_path"
fi

echo "已生成：$output_path"
echo "文件已包含最近 90 天汇总。请打开后复制全部 JSON，再到 Windows 运行 import-usage.ps1。"

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$output_path" >/dev/null 2>&1 || true
elif command -v nano >/dev/null 2>&1; then
  nano "$output_path"
else
  cat "$output_path"
fi
