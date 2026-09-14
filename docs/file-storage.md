# Private File Storage

Phase 3 stores teacher demo and showcase media under the configured `FileStorage:RootPath`. Generated storage keys prevent path traversal; original file names are never used as paths.

Current teaching-media rules (Local and Azure Blob share `PrivateMediaRules`):

- **Qualification demo (video only):** `.mp4` / `video/mp4`, `.webm` / `video/webm`.
- **Teacher Showcase / samples:** video (MP4, WebM), audio (WAV, MP3, M4A, AAC, OGG), images (JPEG, PNG, WebP, GIF).
- **Order delivery (teacher → student):** showcase media plus existing homework documents (PDF, DOCX, PPTX, ZIP). One confirmation may include at most **6** files. Declared Content-Type may be empty or `application/octet-stream`; the server sniffs magic bytes and stores the canonical type.
- Declared Content-Type may be empty, `application/octet-stream`, or include parameters (`video/mp4; charset=binary`). The server sniffs magic bytes and stores the canonical type. A declared type that conflicts with the sniffed bytes is rejected — fake types are not accepted.
- Signatures: MP4/M4A `ftyp`, WebM EBML, WAV `RIFF….WAVE`, JPEG/PNG/WebP/GIF, MP3 ID3 or frame sync, AAC ADTS, OGG `OggS`.
- Rejected: executables, HTML, JavaScript, SVG, and other non-media types. Student/teacher **avatars** stay JPEG/PNG only (2 MB).
- Size limit: `FileStorage:MaxDemoBytes`, **250 MB** by default.
- Showcase count: at most **6** active roots per Teacher and **3** per subject (`TeacherShowcases:MaxPublicPerTeacher` / `MaxPublicPerSubject`). One picker batch may include at most **6** files (`TeacherShowcases:MaxFilesPerUpload`), matching the public root cap.
- Qualification-topic duration limit still applies to apply-wizard demos.
- Files are private and are not exposed through static-file middleware.

The local adapter is the Staging/runasp provider (no Azure required). Azure Blob uses the same sniff + allowlist before Production object storage.
