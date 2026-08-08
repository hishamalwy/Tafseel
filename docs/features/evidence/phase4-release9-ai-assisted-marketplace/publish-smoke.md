# Publish Smoke

An isolated Release publish completed with 0 errors and the same two pre-existing nullable warnings.

The isolated published host on `127.0.0.1:5094` returned:

- `/health/live` 200 with no-store/no-cache;
- `/health/ready` 200;
- Landing, Browse, and Guided Request 200 with no-cache;
- locale and CSS assets 200 with no-cache;
- unauthenticated `/api/v1/ai/discovery` 401 with no-store.

AI was intentionally disabled because no Groq key was available; normal surfaces remained healthy. The process was stopped and port 5094 was confirmed not listening. No deploy occurred.
