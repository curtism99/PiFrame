#!/usr/bin/env bash
set -euo pipefail

export PIFRAME_CONFIG_PATH="${PIFRAME_CONFIG_PATH:-config/frame.config.example.json}"
node server/server.js
