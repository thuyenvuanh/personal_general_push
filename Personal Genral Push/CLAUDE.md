# Personal Push — Web Push PWA for iPhone Notifications

## Goal

Thuyen wants to receive push notifications on his iPhone from his own services (scripts, home automation, monitoring, etc.) without writing Swift or owning an Apple Developer account. The solution: a minimal installable PWA that subscribes to the browser's native **Web Push API**, plus a small backend that any of his services can call to trigger a push.

This file is the spec/handoff doc for building it. No code exists yet — build from scratch per the requirements below.

## Why this approach

- iOS Safari supports Web Push for PWAs installed to the Home Screen since iOS 16.4 (no App Store, no Apple Developer Program, no Swift).
- The PWA itself never needs to be "open" — once subscribed, the OS delivers pushes to the installed app via its service worker.
- Any service that can make an HTTPS POST request (cron job, Home Assistant, a monitoring script, etc.) can trigger a notification.

## Hard constraints (iOS Web Push)

- Requires iOS 16.4+.
- Push only works for the PWA **installed to the Home Screen** (Safari → Share → Add to Home Screen). A regular Safari tab cannot use `PushManager`.
- The app must be opened from the Home Screen icon (standalone display mode) at least once to enable notifications.
- The notification-permission prompt must be triggered by a direct user gesture (e.g. a tap on an "Enable Notifications" button) — it cannot fire automatically on page load.
- `manifest.json` is mandatory, must include `display: "standalone"` (or `"fullscreen"`), `start_url`, `name`, and icons.
- Everything must be served over HTTPS.

## Architecture

Three pieces:

1. **PWA frontend** (static) — manifest, service worker, a single page with an "Enable Notifications" button.
2. **Backend API** — stores push subscriptions and exposes an authenticated endpoint to send notifications.
3. **Calling services** — anything Thuyen owns (scripts, cron, Home Assistant, monitoring tools) that POSTs to the backend to fire a notification.

```
[Your services / scripts / Home Assistant]
        |  POST /api/notify  (Bearer token)
        v
[Backend API] <----> [Subscription store]
        |  Web Push (VAPID-signed)
        v
[iOS Push Service] --> [Installed PWA service worker] --> [Notification on iPhone]
```

## Recommended stack (default — swap freely if preferred)

- **Hosting:** Vercel (Hobby/free tier). Serves the static PWA and the API as serverless functions on one HTTPS domain — avoids CORS issues and cold-start delay is negligible for this use case.
- **Subscription store:** Upstash Redis (free tier). A subscription is just a small JSON blob keyed by device label — no need for a relational DB. (Swap-in alternative: Neon/Supabase Postgres if relational queries become useful later.)
- **Push sending:** `web-push` npm package — handles VAPID signing and payload encryption.
- **Language/runtime:** Node.js (TypeScript or JS, either is fine).

## Data model

One record per subscribed device:

```ts
{
  id: string;            // generated, e.g. uuid
  endpoint: string;       // from PushSubscription
  keys: { p256dh: string; auth: string };
  label: string;          // user-chosen device name, e.g. "Thuyen's iPhone"
  topics: string[];       // optional tags for filtering, e.g. ["home", "alerts"]
  status: "pending" | "approved" | "rejected"; // see Device approval workflow below
  createdAt: string;
  lastSeenAt: string;
}
```

Design must support **multiple devices/subscribers from day one** — do not hardcode a single subscription.

## Device approval workflow

Unauthorized devices must not be able to receive notifications just by visiting the page and subscribing. Every new subscription starts in `"pending"` status and is invisible to `/api/notify` until manually approved.

Flow:
1. Someone opens the PWA, installs it, taps "Enable Notifications," and subscribes → backend stores it as `status: "pending"`.
2. The PWA shows the device's own status ("Waiting for approval") by polling `GET /api/subscribe/status`.
3. Thuyen opens the `/admin` page (protected by `API_SECRET_KEY`), sees the pending device (label, creation time), and clicks **Approve** or **Reject**.
4. Only `"approved"` devices ever receive pushes from `/api/notify` — pending and rejected ones are silently skipped, even if explicitly targeted by label.

Rejection is sticky: if a rejected device's endpoint subscribes again, it stays `"rejected"` rather than flipping back to pending — this stops a stranger's PWA from auto-retrying its way back into the queue. To give a device a second chance, delete its record from `/admin`; a fresh subscribe attempt then creates a new `"pending"` entry.

This manual review step is the only gate against unauthorized registration in v1 — there's no invite code or signup restriction. Fine for a personal project; it's what prevents a stranger who finds the URL from getting your notifications pushed to them, or from receiving anything you send via `/api/notify`.

## API contract

### `POST /api/subscribe`
Body: the raw `PushSubscription` object (from `pushManager.subscribe()`) plus `{ label: string, topics?: string[] }`.
Effect: upserts the subscription (match on `endpoint`):
- New endpoint → created with `status: "pending"`.
- Existing endpoint already `"approved"` → just updates `lastSeenAt`.
- Existing endpoint already `"rejected"` → stays `"rejected"` (sticky — see Device approval workflow above).
Auth: none required (called by the PWA itself after permission grant) — but rate-limit to prevent abuse.

### `GET /api/subscribe/status?endpoint=<endpoint>`
Public, no auth — the endpoint URL is the only thing needed to check it, and it's not guessable/sensitive enough to warrant a login for this use case.
Returns: `{ "status": "pending" | "approved" | "rejected" }` for that one subscription. Used by the PWA to show the user where their device stands.

### `DELETE /api/subscribe`
Body: `{ endpoint: string }`. Removes a subscription (called on unsubscribe).

### `POST /api/notify`
Auth: required — `Authorization: Bearer <API_SECRET_KEY>`.
Body:
```json
{
  "title": "Backup complete",
  "body": "Nightly backup finished OK",
  "icon": "/icons/icon-192.png",
  "url": "https://example.com/backups",
  "target": "all"
}
```
- `target` is either `"all"` or a specific `label` (or could later support a `topic`).
- **Only sends to subscriptions with `status: "approved"`** — pending and rejected devices are silently skipped, even if explicitly targeted by label.
- On send failure with HTTP 404/410 from the push service, delete the stale subscription automatically.

### Admin endpoints (device review)
Auth: required on all of these — `Authorization: Bearer <API_SECRET_KEY>` (same shared secret as `/api/notify` for v1 simplicity).

- `GET /api/admin/devices` — lists all devices with `id`, `label`, `status`, `createdAt`, `lastSeenAt`. Powers the admin review page.
- `POST /api/admin/devices/:id/approve` — sets `status: "approved"`.
- `POST /api/admin/devices/:id/reject` — sets `status: "rejected"`.
- `DELETE /api/admin/devices/:id` — permanently removes a record (cleanup, or to let a rejected device re-register).

## Service worker requirements (`sw.js`)

- `push` event: parse JSON payload, call `self.registration.showNotification(title, { body, icon, data: { url } })`.
- `notificationclick` event: close the notification, focus an existing client window if one matches the URL, otherwise open a new one at `data.url`.
- Standard install/activate lifecycle (cache nothing fancy needed for v1 — this isn't an offline-first app).

## Frontend page requirements

### Main page (`/`)
- Single page, mobile-first, minimal styling.
- "Enable Notifications" button:
  - Requests `Notification.requestPermission()`.
  - On grant, calls `navigator.serviceWorker.ready` then `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: <VAPID_PUBLIC_KEY> })`.
  - POSTs the resulting subscription (plus a device label — prompt the user for one, default to something like "My iPhone") to `/api/subscribe`.
- After subscribing, show approval status — "Pending review", "Approved ✅", or "Rejected ❌" — via `GET /api/subscribe/status`. Poll periodically (e.g. every 30s while open, or on focus/`visibilitychange`) since approval happens asynchronously, whenever Thuyen gets to it.
- Show current subscription status (subscribed / not subscribed) and a way to unsubscribe.
- Optional: a "send test notification" button for debugging — only useful once approved; calls `/api/notify` with the user's own API key entered locally (never hardcode the key in client code).

### Admin page (`/admin`)
- Not linked from the main page nav — reached by typing the URL directly.
- Prompts for `API_SECRET_KEY` on load; keep it in memory/`sessionStorage` only, never persisted to disk.
- Lists devices grouped by status, pending first: label, created time, last seen, with Approve/Reject buttons (and Delete for cleanup).
- Actions call the `/api/admin/devices/*` endpoints using the entered key as the Bearer token.

## Environment variables

| Variable | Purpose |
|---|---|
| `VAPID_PUBLIC_KEY` | Public VAPID key, embedded in frontend |
| `VAPID_PRIVATE_KEY` | Private VAPID key, backend only |
| `VAPID_SUBJECT` | `mailto:` contact required by the push spec, e.g. `mailto:thuyenvuanh2412@gmail.com` |
| `API_SECRET_KEY` | Bearer token required to call `/api/notify` |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Subscription storage |

Generate VAPID keys once with `npx web-push generate-vapid-keys` and store them as env vars — never commit them.

## Suggested file structure

```
/
├── public/
│   ├── manifest.json
│   ├── sw.js
│   ├── icons/ (192x192, 512x512 at minimum)
│   ├── index.html
│   └── admin.html        # device review page
├── api/
│   ├── subscribe.ts       # POST subscribe, GET status, DELETE unsubscribe
│   ├── notify.ts          # POST notify (approved devices only)
│   └── admin/
│       └── devices.ts     # GET list, POST :id/approve, POST :id/reject, DELETE :id
├── lib/
│   ├── store.ts        # Redis subscription read/write helpers
│   └── push.ts          # web-push wrapper
├── package.json
└── CLAUDE.md
```//(adjust to whatever framework convention is used, e.g. Next.js `app/api/...` routes)

## Deployment steps (high level)

1. Generate VAPID keys, set all env vars in Vercel project settings.
2. Create the Upstash Redis database (free tier), copy REST URL/token into env vars.
3. Deploy to Vercel.
4. On iPhone: open the deployed URL in Safari → Share → Add to Home Screen.
5. Open the app from the Home Screen icon, tap "Enable Notifications," grant permission. The page will show "Pending review."
6. Visit `/admin`, enter the `API_SECRET_KEY`, find the new device, and click **Approve**.
7. Test with: `curl -X POST https://<deployment>/api/notify -H "Authorization: Bearer <API_SECRET_KEY>" -H "Content-Type: application/json" -d '{"title":"Test","body":"It works"}'`

## Out of scope for v1 (possible later additions)

- Web dashboard with notification history/log.
- Per-service API keys (instead of one shared secret) for granular revocation.
- Notification action buttons / rich media.
- Topic-based subscriptions (subscribe to only "home" or "alerts" topics).
- Rate limiting on `/api/subscribe`.
- Separate admin credential from `API_SECRET_KEY` (currently reused for simplicity).
- Auto-cleanup/expiry of stale `pending` or `rejected` entries.

## Known caveat

There has been back-and-forth in past iOS versions around availability of installed web apps / web push in EU countries due to DMA compliance changes. Shouldn't affect Thuyen unless using an EU Apple ID/region — worth a quick check if notifications don't work and the device is EU-registered.
