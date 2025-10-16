# Chat Media Bridge Integration

The chat overlay now expects native shells to expose a `chatMediaBridge` so the in-app media picker can show the device gallery without falling back to system file dialogs. This document outlines the contract implemented in `lib/native/mediaLibrary.js` and the native responsibilities for iOS (PhotoKit) and Android (MediaStore).

## Bridge contract

Create a global object or message handler that satisfies one of the following forms on `window`:

- `window.chatMediaBridge.requestPermission(payload)` / `fetchTimeline(payload)` / `fetchAsset(payload)` (each may return a value or `Promise`).
- `window.chatMediaBridge.invoke(method, payload)` that resolves the same payloads.
- A `postMessage` interface (`window.chatMediaBridge.postMessage`, `window.ReactNativeWebView.postMessage`, or `window.webkit.messageHandlers.chatMediaBridge.postMessage`). In this mode respond with `window.__chatMediaBridgeDispatch__({ id, result, error })`.

All methods receive JSON serialisable payloads and must resolve within 20 seconds. Expected methods:

| Method | Payload | Response |
| ------ | ------- | -------- |
| `requestPermission` | `{ kind: 'read' }` | `{ status: 'granted' | 'limited' | 'denied' }` |
| `fetchTimeline` | `{ mediaType: 'image' | 'video', cursor, limit }` | `{ entries: [...], cursor, hasMore }` |
| `fetchAsset` | `{ id, mediaType, quality }` | `{ base64 | url | blob, mimeType, name, width, height, duration, size }` |
| `openSettings` | `{}` | `void` |

### Timeline entries

Return the newest assets first. Each entry should include:

```json
{
  "id": "local-identifier-or-uri",
  "name": "IMG_1234.JPG",
  "mimeType": "image/jpeg",
  "size": 1234567,
  "width": 3024,
  "height": 4032,
  "duration": 0,
  "previewUrl": "data:image/webp;base64,...",
  "takenAt": "2024-11-17T14:52:03Z",
  "addedAt": "2024-11-17T14:52:05Z"
}
```

`previewUrl` should be a small (≈280px) thumbnail encoded as a data URL. The picker caches thumbnails by `id`.

### Asset fetches

`fetchAsset` must return a binary payload for the selected item. The bridge may respond with one of:

- `{ base64: '...', mimeType: 'image/webp' }`
- `{ url: 'https://signed-url' }` (the client will fetch and revoke it immediately)
- `{ blob: Blob }` (only if the bridge runs inside the same JS context, e.g. Capacitor)

The chat client compresses and uploads attachments to Supabase Storage after receiving this blob.

## iOS implementation (PhotoKit)

1. Request permission with `PHPhotoLibrary.requestAuthorization(for: .readWrite)`.
2. Honour `.limited` responses by showing an "upgrade permissions" CTA that opens `UIApplication.shared.open(URL(string: UIApplication.openSettingsURLString)!)` when requested.
3. Query the unified library with `PHAsset.fetchAssets(with: options)` sorted by `creationDate DESC`, falling back to `modificationDate`.
4. Group HEIC+Live Photo pairs with `PHAsset.mediaSubtypes` if you want to display them as a single tile.
5. Generate thumbnails through `PHImageManager.requestImage(targetSize: ...)` with caching.
6. Register for `PHPhotoLibrary` changes so incremental updates can be pushed through the bridge.
7. When `fetchAsset` is invoked, stream `PHAssetResourceManager` data, compress or transcode when necessary, and return base64 + metadata.

## Android implementation (MediaStore)

1. Request permissions:
   - Android 13+: `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO`.
   - Android 10–12: `READ_EXTERNAL_STORAGE` (respect scoped storage rules).
   - Offer the system Photo Picker as a fallback if the user denies full access.
2. Query `MediaStore.Images.Media.EXTERNAL_CONTENT_URI` or `MediaStore.Video.Media.EXTERNAL_CONTENT_URI` with a projection that includes `_ID`, `DATE_TAKEN`, `DATE_ADDED`, `RELATIVE_PATH`, `MIME_TYPE`, `WIDTH`, `HEIGHT`, `DURATION`, `SIZE`.
3. Sort by `DATE_TAKEN DESC`, falling back to `DATE_ADDED DESC` when metadata is missing.
4. De-duplicate obvious copies (downloads/screenshots) by size + timestamp heuristics if required.
5. Build thumbnails via `ThumbnailUtils`/`ContentResolver` or a library such as Coil/Glide. Cache them on disk.
6. Register a `ContentObserver` for incremental updates and emit change events through the bridge.
7. When `fetchAsset` is called, open the URI with `ContentResolver.openInputStream`, compress the payload if needed, and return base64 + metadata (duration, width, height, size).

## UI behaviours

- The picker keeps multi-select and long-press behaviours identical across native and browser backends.
- When the bridge reports `status: 'limited'` or `status: 'denied'`, the UI exposes a "설정 열기" button that triggers `openSettings`.
- The grid can request more results via `fetchTimeline` with the returned cursor. Provide a new `cursor` until `hasMore` is `false`.

## Failure handling

- Respond with `{ error: 'message' }` or throw to reject a request. The chat UI will surface the message and keep previous results.
- If the bridge goes offline, omit the object from `window`; the UI will fall back to curated filesystem buckets. The picker asks for read access once and then scans common Android directories (DCIM/Camera, Screenshots, Download, KakaoTalk 등) or iOS DCIM buckets to rebuild a recent timeline without relying on the system picker.
- When permissions are revoked, return `{ status: 'denied' }` from `requestPermission` so the chat overlay can guide the user back to settings.

## Testing checklist

- Grant and revoke permissions in native shells and confirm the picker reacts accordingly.
- Verify multi-select long-press, batching uploads, and error copy against limited access scenarios.
- Ensure thumbnails load quickly and original assets stream without blocking the UI thread.
