@echo off
setlocal
cd /d "%~dp0"

call "%~dp0pnpm-local.cmd" start -- --host lan %*
exit /b %ERRORLEVEL%
