@echo off
setlocal

set "CODEX_RUNTIME=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies"
set "NODE_BIN=%CODEX_RUNTIME%\node\bin"
set "PNPM_CMD=%CODEX_RUNTIME%\bin\fallback\pnpm.cmd"

if exist "%NODE_BIN%\node.exe" if exist "%PNPM_CMD%" (
  set "PATH=%NODE_BIN%;%CODEX_RUNTIME%\bin\override;%CODEX_RUNTIME%\bin\fallback;%PATH%"
  call "%PNPM_CMD%" %*
  set "COMMAND_EXIT_CODE=%ERRORLEVEL%"
  endlocal & exit /b %COMMAND_EXIT_CODE%
)

where pnpm >nul 2>&1
if errorlevel 1 (
  echo pnpm bulunamadi. Node.js ve pnpm kurulumunu PATH'e ekleyin.
  exit /b 1
)

call pnpm %*
set "COMMAND_EXIT_CODE=%ERRORLEVEL%"

endlocal & exit /b %COMMAND_EXIT_CODE%
