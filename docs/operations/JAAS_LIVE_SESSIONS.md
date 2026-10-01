# JaaS live sessions (MEET-01)

The student and teacher use the same booking room in the Tafseel session page. The existing `/api/v1/live-sessions/{id}/join` endpoint checks participant identity, confirmed status, and the 15-minute join window before issuing a participant JWT. The teacher receives moderator rights; recording, livestreaming, transcription, outbound calls, and file upload are disabled in the token. Leaving the embedded meeting does not change the booking's completion or settlement status.

## Configure

1. In the [JaaS console](https://developer.8x8.com/jaas/docs/jaas-console-api-keys/), upload a public RSA key and copy its **Key ID**. Keep the matching private PEM key in the server's secret store. Never place it in the repository, frontend, logs, or a browser variable.
2. Set `LiveSessions:Provider` to `JaaS` and configure `JaaS:AppId`, `JaaS:KeyId`, and `JaaS:PrivateKeyPem` in server configuration. The supplied AppID is recorded in `src/Tafseel.Api/appsettings.json`; verify that it is the intended account before deploying. `KeyId` must start with `<AppId>/`. The secret store must preserve PEM newlines.
3. Restart the API. Startup validation rejects a missing or invalid key. Production continues to reject `Mock`.

The JWT shown in the HTML example is a short-lived sample token, not a private signing key or deployment credential. It is not used by Tafseel.

## Verify with a JaaS sandbox

- Book and confirm a session, then open the student and teacher pages during the join window. Both should enter the same room with their own names. The teacher should be moderator.
- Check that an outsider receives 404, that joining before the window receives `join_window_closed`, and that a cancelled or unpaid booking cannot join.
- On an Arabic phone viewport, check the embedded controls, leaving and rejoining, and the camera and microphone permission prompts.
- Complete the ordinary post-session mutual settlement flow. Meeting departure alone must not settle payment.

The signing and authorization paths have automated coverage. A real two-party sandbox call and deployment credentials are still required before MEET-01 can be marked done.
