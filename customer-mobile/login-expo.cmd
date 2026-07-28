@echo off
setlocal
cd /d "%~dp0"

call "%~dp0pnpm-local.cmd" dlx eas-cli@latest login
set "LOGIN_EXIT_CODE=%ERRORLEVEL%"

endlocal & exit /b %LOGIN_EXIT_CODE%
