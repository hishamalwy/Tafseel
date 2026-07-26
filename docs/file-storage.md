# Private File Storage

Phase 3 stores teacher demo videos under the configured `FileStorage:RootPath`. Generated storage keys prevent path traversal; original file names are never used as paths.

Current demo rules:

- MP4 extension and `video/mp4` content type.
- MP4 `ftyp` signature check.
- Configurable size limit, 250 MB by default.
- Qualification-topic duration limit, 180 seconds by default.
- Files are private and are not exposed through static-file middleware.

The local adapter is for development. Replace it with private object storage and malware scanning before production.
