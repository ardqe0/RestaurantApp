@echo off
setlocal

set "CODEX_RUNTIME=C:\Users\ardag\.cache\codex-runtimes\codex-primary-runtime\dependencies"
set "NODE_BIN=%CODEX_RUNTIME%\node\bin"
set "PNPM_CMD=%CODEX_RUNTIME%\bin\fallback\pnpm.cmd"

if not exist "%NODE_BIN%\node.exe" (
  echo Node.js bulunamadi: %NODE_BIN%\node.exe
  exit /b 1
)

if not exist "%PNPM_CMD%" (
  echo pnpm bulunamadi: %PNPM_CMD%
  exit /b 1
)

set "PATH=%NODE_BIN%;%CODEX_RUNTIME%\bin\override;%CODEX_RUNTIME%\bin\fallback;%PATH%"
call "%PNPM_CMD%" %*
set "COMMAND_EXIT_CODE=%ERRORLEVEL%"

endlocal & exit /b %COMMAND_EXIT_CODE%
