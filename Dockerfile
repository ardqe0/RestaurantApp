# syntax=docker/dockerfile:1

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY RestaurantApp/RestaurantApp.csproj RestaurantApp/
RUN dotnet restore RestaurantApp/RestaurantApp.csproj

COPY RestaurantApp/ RestaurantApp/
RUN dotnet publish RestaurantApp/RestaurantApp.csproj \
    --configuration Release \
    --output /app/publish \
    --no-restore \
    /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

ENV ASPNETCORE_URLS=http://+:8080 \
    DOTNET_EnableDiagnostics=0

EXPOSE 8080

COPY --from=build --chown=$APP_UID:$APP_UID /app/publish .

USER $APP_UID

ENTRYPOINT ["dotnet", "RestaurantApp.dll"]
