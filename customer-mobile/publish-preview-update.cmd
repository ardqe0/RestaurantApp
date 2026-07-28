@echo off
setlocal
cd /d "%~dp0"
set "EAS_NO_VCS=1"
set "UPDATE_MESSAGE=%~1"

if not defined UPDATE_MESSAGE set "UPDATE_MESSAGE=Preview update"

call "%~dp0pnpm-local.cmd" dlx eas-cli@latest whoami >nul 2>&1
if errorlevel 1 (
  echo Expo account is not logged in.
  echo Run this command first: .\login-expo.cmd
  exit /b 1
)

if exist "%~dp0.env.local" (
  call "%~dp0pnpm-local.cmd" dlx eas-cli@latest env:push preview --path "%~dp0.env.local" --force
  if errorlevel 1 (
    echo Local environment variables could not be uploaded to EAS preview.
    exit /b 1
  )
)

call "%~dp0pnpm-local.cmd" dlx eas-cli@latest update --channel preview --environment preview --message "%UPDATE_MESSAGE%"
set "UPDATE_EXIT_CODE=%ERRORLEVEL%"

endlocal & exit /b %UPDATE_EXIT_CODE%
