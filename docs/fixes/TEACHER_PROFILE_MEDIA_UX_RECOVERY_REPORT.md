# Teacher Profile Media & UX Recovery

Date: 2026-08-01  
Scope: focused browser-proven media recovery and Teacher Profile presentation.

## Root Cause

Classification: **CSP / media-src Issue**.

Quality previews fetch protected MP4 content into `blob:` URLs. The previous CSP had no `media-src`, so the media request could be valid while the browser refused to load the blob into `<video>`. The shared design runtime also passed empty Boolean attributes such as `controls` as false DOM properties.

The stored MP4 was inspected as a valid MP4 with H.264/AVC High Profile 4.0 (`avc1`/`avcC`) video and AAC (`mp4a`/`esds`) audio tracks. It is 592×1280, about 5.7 seconds, with `moov` present at offset 1,159,074 after `mdat`. The profile’s business duration label is 2:00, but the media container itself is about 5.7 seconds; this is metadata drift, not a playback blocker. No authorization or storage-key change was made.

## Fix

- Added `media-src 'self' blob:` to the existing CSP.
- Normalized empty Boolean DOM attributes in the shared renderer.
- Revoked the Quality demo object URL on component cleanup.
- Added `js/media-preview.js` for shared media state, accessible labels, controls, inline playback, loading/error/unsupported states, and download fallback.
- Applied the helper to Quality qualification/showcase previews and public Teacher Profile qualification/showcase media.
- Enlarged Profile media cards to responsive 360px minimum columns and kept qualification/showcase trust labels distinct.
- Added complete Arabic/English localization keys.

## Validation

- Frontend integrity: passed, 13 entry points.
- Localization parity: passed, 2,640 paired keys.
- Localization usage coverage: passed.
- Focused media/security integration tests: 9 passed.
- Public media Range: `206`, `video/mp4`, `Content-Range: bytes 0-1023/1163763`.
- Health endpoints after restart: live 200, ready 200.
- Release build: passed after controlled process handoff, 0 warnings and 0 errors.

## Remaining Browser Verification

The normal-browser rerun must confirm actual frames, metadata, play/pause, seek, audio, fullscreen, repeated tab switching, all requested viewports, and both language/theme modes. Do not declare staging ready until those observations pass.
