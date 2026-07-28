@echo off
setlocal
set "PROJECT_ROOT=%~dp0"
cd /d "%PROJECT_ROOT%RestaurantApp"
dotnet run --launch-profile http
