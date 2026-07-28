@echo off
setlocal
cd /d "%~dp0"
set "EAS_NO_VCS=1"
set "EXPO_PUBLIC_API_URL=http://localhost:5223"
set "UPDATE_MESSAGE=%~1"

if not defined UPDATE_MESSAGE set "UPDATE_MESSAGE=Preview update"

call "%~dp0pnpm-local.cmd" dlx eas-cli@latest whoami >nul 2>&1
if errorlevel 1 (
  echo Expo account is not logged in.
  echo Run this command first: .\login-expo.cmd
  exit /b 1
)

call "%~dp0pnpm-local.cmd" dlx eas-cli@latest update --channel preview --environment preview --message "%UPDATE_MESSAGE%"
set "UPDATE_EXIT_CODE=%ERRORLEVEL%"

endlocal & exit /b %UPDATE_EXIT_CODE%
