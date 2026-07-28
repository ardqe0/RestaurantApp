@echo off
set "NODE_BIN=C:\Users\example\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
set "PNPM_CLI=C:\Users\example\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\pnpm\bin\pnpm.cjs"
set "PATH=%NODE_BIN%;%PATH%"
"%NODE_BIN%\node.exe" "%PNPM_CLI%" start -- --host lan --port 8082 %*
