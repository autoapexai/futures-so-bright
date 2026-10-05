#!/bin/bash
while true; do
  git -C /workspace/futures-so-bright fetch origin -q
  if git -C /workspace/futures-so-bright log origin/main --oneline | grep -qi 'flag dropdown'; then
    echo "FLAG_READY $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    git -C /workspace/futures-so-bright log origin/main --oneline | grep -i 'flag dropdown' | head -1
    exit 0
  fi
  echo "waiting $(date -u +%H:%M:%S)"
  sleep 90
done
