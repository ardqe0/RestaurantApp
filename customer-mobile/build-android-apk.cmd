@echo off
setlocal
cd /d "%~dp0"
set "EAS_NO_VCS=1"

call "%~dp0pnpm-local.cmd" dlx eas-cli@latest whoami >nul 2>&1
if errorlevel 1 (
  echo Expo account is not logged in.
  echo Run this command first: .\login-expo.cmd
  exit /b 1
)

if /i "%~1"=="--check" (
  echo EAS login and Android build script are ready.
  exit /b 0
)

if exist "%~dp0.env.local" (
  call "%~dp0pnpm-local.cmd" dlx eas-cli@latest env:push preview --path "%~dp0.env.local" --force
  if errorlevel 1 (
    echo Local environment variables could not be uploaded to EAS preview.
    exit /b 1
  )
)

call "%~dp0pnpm-local.cmd" dlx eas-cli@latest build --platform android --profile preview %*
set "BUILD_EXIT_CODE=%ERRORLEVEL%"

endlocal & exit /b %BUILD_EXIT_CODE%
