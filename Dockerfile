# syntax=docker/dockerfile:1.7
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY Directory.Build.props Tafseel.sln ./
COPY src/Tafseel.Domain/Tafseel.Domain.csproj src/Tafseel.Domain/packages.lock.json src/Tafseel.Domain/
COPY src/Tafseel.Application/Tafseel.Application.csproj src/Tafseel.Application/packages.lock.json src/Tafseel.Application/
COPY src/Tafseel.Infrastructure/Tafseel.Infrastructure.csproj src/Tafseel.Infrastructure/packages.lock.json src/Tafseel.Infrastructure/
COPY src/Tafseel.Api/Tafseel.Api.csproj src/Tafseel.Api/packages.lock.json src/Tafseel.Api/
RUN dotnet restore src/Tafseel.Api/Tafseel.Api.csproj --locked-mode
COPY src/ src/
COPY Tafseel-*.dc.html support.js ./
COPY js/ js/
COPY css/ css/
ARG VERSION=0.0.0
ARG REVISION=unknown
RUN dotnet publish src/Tafseel.Api/Tafseel.Api.csproj -c Release --no-restore -o /out \
    -p:Version=${VERSION} -p:InformationalVersion=${VERSION}+${REVISION}

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
ARG VERSION=0.0.0
ARG REVISION=unknown
ARG BUILD_DATE=unknown
LABEL org.opencontainers.image.source="https://github.com/hishamalwy/Tafseel" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.created="${BUILD_DATE}"
WORKDIR /app
COPY --from=build --chown=$APP_UID:$APP_UID /out ./
USER $APP_UID
ENV ASPNETCORE_HTTP_PORTS=8080 \
    DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false \
    TZ=Etc/UTC
EXPOSE 8080
ENTRYPOINT ["dotnet", "Tafseel.Api.dll"]
