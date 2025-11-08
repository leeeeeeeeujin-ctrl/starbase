# Client-side upload and caching

This document outlines the flow for pre-compressing assets on-device, uploading directly to Cloudflare R2 via presigned URLs, and caching resources locally with LRU eviction.

## Summary

- Images: resized via OffscreenCanvas to WebP (default 1920x1080, q=0.82)
- Videos: best-effort compression via ffmpeg.wasm (lazy-loaded). If not available, uploads original.
- Files: uploaded as-is.
- Storage: Files go to R2 (S3-compatible) using a server API (`/api/storage/presign`) that returns a presigned PUT URL.
- Metadata: App stores only metadata (keys, public URLs) in Supabase tables.
- Cache: IndexedDB-based cache with LRU eviction using `navigator.storage.estimate()` to detect pressure.

## API

POST `/api/storage/presign` body:
- contentType: string (e.g. image/webp)
- ext: string (e.g. .webp)
- folder: string (e.g. chat, character, game-assets/editor)
- size: number (optional)
- cacheControl: string (optional; default 1y immutable)

Response:
```
{ key, url, publicUrl, expiresIn }
```

## Client helpers

- `lib/client/media/compress.js`
  - `compressImage(file, opts)`
  - `compressVideo(file, opts)` (lazy loads `@ffmpeg/ffmpeg`, falls back if unavailable)

- `lib/client/upload/presignedUpload.js`
  - `requestPresignedUrl({...})`
  - `uploadWithPresigned(url, file)`

- `lib/client/cache/resourceCache.js`
  - `cachePut/get/delete/estimate/evictLRU`

## R2 CORS

Ensure CORS allows PUT/GET from your app origin. Use scripts:

```
npm run r2:cors:set
npm run r2:cors:get
```

Requires env: CF_API_TOKEN, R2_ACCOUNT_ID, R2_BUCKET.

## Notes

- Avoid exposing R2 secrets in the client. All uploads use server-issued presigned URLs.
- Eviction uses last-access timestamps and a target free-bytes threshold.
- Character creation flows can queue pending assets in IndexedDB, and only upload on confirm.
