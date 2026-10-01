# syntax=docker/dockerfile:1.7
# The site is the Angular client. The SDK image has no Node, so the client is built in its own
# stage and handed to the publish step, which is told not to build it again.
FROM node:22-bookworm-slim@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9 AS webclient
WORKDIR /src
COPY assets/ assets/
COPY css/ css/
COPY frontend-angular/package.json frontend-angular/package-lock.json frontend-angular/
RUN cd frontend-angular && npm ci
COPY frontend-angular/ frontend-angular/
RUN cd frontend-angular && npm run build

FROM mcr.microsoft.com/dotnet/sdk:8.0@sha256:78235e09001f52b6592c458ac010775ebac6725422e80cd0c1650590f67b2743 AS build
WORKDIR /src
COPY Directory.Build.props Tafseel.sln ./
COPY src/Tafseel.Domain/Tafseel.Domain.csproj src/Tafseel.Domain/packages.lock.json src/Tafseel.Domain/
COPY src/Tafseel.Application/Tafseel.Application.csproj src/Tafseel.Application/packages.lock.json src/Tafseel.Application/
COPY src/Tafseel.Infrastructure/Tafseel.Infrastructure.csproj src/Tafseel.Infrastructure/packages.lock.json src/Tafseel.Infrastructure/
COPY src/Tafseel.Api/Tafseel.Api.csproj src/Tafseel.Api/packages.lock.json src/Tafseel.Api/
RUN dotnet restore src/Tafseel.Api/Tafseel.Api.csproj --locked-mode
COPY src/ src/
COPY --from=webclient /src/frontend-angular/dist/tafseel/browser frontend-angular/dist/tafseel/browser
ARG VERSION=0.0.0
ARG REVISION=unknown
RUN dotnet publish src/Tafseel.Api/Tafseel.Api.csproj -c Release --no-restore -o /out -p:BuildWebClient=false \
    -p:Version=${VERSION} -p:InformationalVersion=${VERSION}+${REVISION}

FROM mcr.microsoft.com/dotnet/aspnet:8.0@sha256:2f202e1169ec507bdc07007cf68c14d0ff3a098110b17c460a60185e1f36a9d1 AS runtime
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
