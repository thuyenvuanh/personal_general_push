Design the UI for "Personal Push" — a small personal PWA that lets one person (me) receive Web Push notifications on an iPhone, triggered by my own scripts/services. It has two screens: a public subscribe page and a private admin review page. Full functional spec is in the project's CLAUDE.md if you need it, but for this task you only need to design the UI — no real API wiring, just layout, components, and states using placeholder data.

## Style constraints

- Minimalist and utilitarian — this is a personal tool, not a product. No decorative UI, no custom illustrations, no animations or transitions beyond whatever shadcn/ui ships with by default.
- Use shadcn/ui components (Button, Card, Input, Badge, Table, Separator, Dialog, etc.) with Tailwind. Don't invent custom styled components where a shadcn primitive already fits.
- Neutral color palette (shadcn's default zinc/slate theme is fine). Status should be communicated with Badge variants (e.g. outline/secondary/destructive), not custom colors.
- Mobile-first for the main page — it's opened almost exclusively on an iPhone (installed as a home-screen PWA, so no browser chrome). Admin page can assume a wider screen (desktop browser) but should still degrade reasonably on mobile.
- No sidebar, no nav bar, no branding flourishes. Each page is a single focused column.

## Screen 1 — Main page (`/`)

Single centered column, generous spacing, max-width ~400px even on desktop.

States to design (same layout, different content/status):

1. **Not subscribed** — app name/short one-line description, a text input for device label (default value "My iPhone"), and a primary "Enable Notifications" button.
2. **Pending review** — confirmation that the device subscribed, a Badge reading "Pending review", short helper text ("Waiting for approval — check back later"), and a secondary "Unsubscribe" button.
3. **Approved** — Badge reading "Approved", helper text, an "Unsubscribe" button, and an optional collapsible/small section below for "Send test notification" (an Input for the API key, Input or Textarea for a title/body, a Button to send) — visually de-emphasized since it's a debug feature.
4. **Rejected** — Badge reading "Rejected" (destructive variant), short helper text, "Unsubscribe" / re-try button.

## Screen 2 — Admin page (`/admin`)

1. **Login gate** — centered Card, single password-style Input for the API key, Submit button. Nothing else on the page.
2. **Device list** (after auth) — single column, max-width ~640px. Devices grouped under three headings in this order: Pending, Approved, Rejected. Each device is a row/Card with: label, created date, last seen, status Badge, and action buttons (Approve + Reject for pending rows; Reject + Delete for approved rows; Delete for rejected rows — use a Dialog to confirm Delete). Show a simple empty-state message ("No devices yet") if a group has none. Use a Table if it reads cleaner than stacked Cards — your call, just keep it plain.

## Deliverable

Produce the layouts as React components (Next.js, shadcn/ui, Tailwind) for each screen/state above, with placeholder/mock data — no real fetch calls or business logic needed. Optimize purely for clarity and restraint; if in doubt, remove an element rather than add one.
