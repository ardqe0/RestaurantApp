@echo off
setlocal
call "%~dp0..\customer-mobile\pnpm-local.cmd" start -- --host lan --port 8082 %*
exit /b %ERRORLEVEL%
