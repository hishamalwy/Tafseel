# Deployment Configuration

Configuration uses ASP.NET Core environment-variable names with double underscores. Required runtime names include:

```text
ConnectionStrings__Tafseel
Jwt__SigningKey
Jwt__Issuer
Jwt__Audience
Resend__ApiToken
Email__From
Email__ConfirmationUrl
Email__PasswordResetUrl
Email__AppBaseUrl
Payments__Provider
Payments__WebhookSecret
LiveSessions__Provider
FileStorage__Provider
DataProtection__KeysPath
Cors__AllowedOrigins__0
```

Tracked `appsettings.Production.json` contains placeholders only. Secret values belong in GitHub Environment secrets or the deployment platform secret manager.

The current application deliberately has only mock payment/session and local-file implementations. Its Production startup validation therefore remains fail closed until real providers and durable storage are implemented and registered. CI/CD must not weaken that guard.
