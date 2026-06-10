$ErrorActionPreference = "Stop"

if (-not $env:PIFRAME_CONFIG_PATH) {
  $env:PIFRAME_CONFIG_PATH = "config/frame.config.example.json"
}

node server/server.js
