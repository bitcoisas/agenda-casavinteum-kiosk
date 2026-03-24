# Agenda Casa Vinteum — Kiosk

Event calendar for [Casa Vinteum](https://x.com/casavinteum), a Bitcoin hub in São Paulo, Brazil. Designed to run as a kiosk on a large display and as a mobile-friendly web app.

Built with **Next.js 16 (App Router)**, **FullCalendar 6**, **Supabase**, and **Tailwind CSS v4**.

---

## Features

- **Dual event sources** — pulls events from [evento.so](https://evento.so) (authenticated Public API with API key) and from a Supabase table for manually-added events; evento.so co-hosted events are included
- **Three calendar views** — Month, Week, and List (default on mobile); auto-switches to monthly view when no events exist in the current week
- **Kiosk mode** — optimised for large touchscreens; swipe navigation, auto dark mode outside 06:00–18:00
- **Mobile mode** — compact layout, bottom-sheet modals, direct `.ics` download to add events to the device's calendar
- **Export to calendar (ICS)** — QR code per event (kiosk/desktop) or direct download (mobile); QR code for all events in the current view via `/api/events/ics`
- **QR code sharing** — show the event page URL as a QR code from the event detail modal
- **Suggest an event** — always-visible button linking to a Google Form; QR code on desktop/kiosk, direct link on mobile; also shown in empty-week state
- **Admin panel** — password-protected modal to add, edit, or delete manual events, with location search powered by Nominatim / OpenStreetMap
- **Light / Dark theme** — togglable; defaults based on time of day

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Calendar | FullCalendar 6 (`daygrid`, `timegrid`, `list`, `interaction`) |
| Database | Supabase (PostgreSQL) — manual events only |
| Events API | [evento.so](https://evento.so) Public API v1 (requires API key) |
| Geocoding | Nominatim / OpenStreetMap (server-side proxy) |
| Styling | Tailwind CSS v4 |
| Icons | Lucide React |
| QR codes | `qrcode.react` |
| Font | Figtree (Google Fonts) |

---

## Project structure

```
app/
├── page.tsx                      # Main calendar page (all UI lives here)
├── layout.tsx                    # Root layout, metadata, fonts, viewport
├── globals.css                   # FullCalendar theme overrides + CSS variables
├── components/
│   ├── CalendarPicker.tsx        # Custom inline month/day picker (used in admin form)
│   └── TimeWheelPicker.tsx       # iOS-style scroll-wheel time picker (used in admin form)
└── api/
    ├── events/
    │   ├── route.ts              # GET /api/events — combined events (evento.so + Supabase)
    │   └── ics/
    │       └── route.ts          # GET /api/events/ics — serve .ics calendar files
    ├── location-search/
    │   └── route.ts              # GET /api/location-search — Nominatim proxy
    └── admin/
        ├── add-event/route.ts    # POST   /api/admin/add-event
        ├── update-event/route.ts # PUT    /api/admin/update-event
        └── delete-event/route.ts # DELETE /api/admin/delete-event

lib/
└── utils.ts                      # cn() — Tailwind class merge helper

public/
└── logo.png                      # Organisation logo (square, displayed in header)
```

---

## Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project (free tier is sufficient)
- An [evento.so](https://evento.so) account with at least one published event and an API key
- (Optional) A Google Form URL for the event suggestion button

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/bitcoisas/agenda-casavinteum-kiosk.git
cd agenda-casavinteum-kiosk
npm install
```

### 2. Create the Supabase table

In your Supabase project, open the **SQL Editor** and run:

```sql
create table public.manual_events (
  id           uuid        primary key default gen_random_uuid(),
  created_at   timestamptz not null    default now(),
  title        text        not null,
  start        text        not null,  -- ISO 8601 with tz offset, e.g. "2026-04-01T19:00:00-03:00"
  "end"        text,
  description  text,
  location     text,                  -- plain venue name, e.g. "Rua Queluz 312, Vila Madalena"
  external_url text,
  organizer    text,
  platform     text                   -- e.g. "Luma", "Sympla"
);

alter table public.manual_events enable row level security;
```

> The app accesses this table exclusively through the **service role key** on the server side, which bypasses RLS. No additional RLS policies are needed for the app to work. You may add policies for other tools (e.g. Supabase Studio with the anon key) at your discretion.

### 3. Configure environment variables

```bash
cp env.example .env.local
```

Then fill in the values in `.env.local`:

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → `anon public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` key — **keep secret, server-side only** |
| `EVENTO_SO_USERNAME` | Your evento.so profile slug, e.g. `casa21` |
| `EVENTO_SO_API_KEY` | evento.so dashboard → API Keys → Bearer token |
| `ADMIN_PASSWORD` | A strong password of your choice |

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## API routes

### `GET /api/events`

Returns a merged JSON array of FullCalendar-compatible event objects.

- **evento.so** events are fetched via the Public API (requires `EVENTO_SO_API_KEY`) and cached for **30 minutes**. The Embed API is called in parallel per event to retrieve `location` and the canonical URL, which the Public API omits.
- **Supabase** manual events are always fetched fresh (`force-dynamic`).

Each event object shape:

```ts
{
  id: string           // "evento-<id>" for evento.so, UUID for manual
  title: string
  start: string        // ISO 8601
  end: string | null
  description: string | null
  location: { name: string } | null
  image: string | null // CDN URL (evento.so only)
  url: string | null
  source: "evento.so" | "manual"
}
```

---

### `GET /api/events/ics`

Serves a valid `.ics` iCalendar file compatible with iOS Calendar, Google Calendar, and any standards-compliant app.

| Query param | Description |
|---|---|
| `?id=<event-id>` | Single event |
| `?start=<ISO>&end=<ISO>` | All events in a date range |

The QR codes generated in the UI point to this endpoint using `window.location.origin` as the base, so they work automatically in both local development and production as long as the server is reachable from the scanning device.

---

### `GET /api/location-search?q=<query>`

Server-side proxy to [Nominatim OpenStreetMap](https://nominatim.org). Returns up to 5 suggestions as `{ name: string }[]` with compact Brazilian-style addresses.

---

### `POST /api/admin/add-event`
### `PUT /api/admin/update-event`
### `DELETE /api/admin/delete-event`

Password-protected endpoints for managing manual events. All require `{ password: string }` in the JSON body matching `ADMIN_PASSWORD`. See the JSDoc comment at the top of each route file for the full field reference.

---

## Admin panel

Click the **+** button in the top-right corner of the header (desktop only — hidden on mobile). You will be prompted for the `ADMIN_PASSWORD`. After authenticating:

- **Add** a new manual event (title, date, time, location with search, URL, organiser, description).
- **Edit or delete** any existing manual event by clicking it in the calendar.

Manual events are stored in Supabase and merged with evento.so events on every page load.

---

## Event suggestion

The **chat icon** (MessageSquarePlus) in the header opens the suggestion flow:

- **Desktop / kiosk**: modal with a QR code pointing to the Google Form — visitors scan with their phone.
- **Mobile**: bottom sheet with a direct link to the Google Form.
- **Empty week / no events**: "Responda este formulário" link opens the same modal.

To change the form URL, search for the Google Forms URL string in `app/page.tsx` and replace both occurrences (the `<a href>` and the `<QRCodeSVG value>`).

---

## Calendar export

| Context | Behaviour |
|---|---|
| Event modal — mobile | "Salvar no calendário" downloads a `.ics` file directly to the device |
| Event modal — desktop/kiosk | "Salvar no calendário" shows a QR code; visitor scans with phone → calendar app opens |
| Header — desktop/kiosk | CalendarPlus icon shows a QR code for all events in the current week or month |

---

## Adapting for another organisation

1. Replace `public/logo.png` with your logo (square, ~512×512 px recommended).
2. Update `title`, `description`, and `icons` in `app/layout.tsx`.
3. Set `EVENTO_SO_USERNAME` to your evento.so account, or remove the evento.so block from `app/api/events/route.ts` if not needed.
4. Replace the Google Forms URL in `app/page.tsx` (2 occurrences) with your own form.
5. Choose a strong `ADMIN_PASSWORD`.

---

## Deployment

The app is a standard Next.js project and deploys anywhere that supports Node.js.

**Vercel (recommended):**

```bash
npx vercel
```

Set all six environment variables in the Vercel dashboard under **Settings → Environment Variables**. Mark `SUPABASE_SERVICE_ROLE_KEY` and `ADMIN_PASSWORD` as **server-only** (do not expose to the browser).

**Self-hosted:**

```bash
npm run build
npm start   # requires Node 20+ and all env vars at runtime
```

---

## Contributing

1. Fork the repo and create a branch: `git checkout -b feat/my-feature`
2. Make your changes — the main UI logic lives in `app/page.tsx`; API routes are under `app/api/`
3. Run `npm run build` to catch TypeScript and lint errors before opening a PR
4. Open a pull request against `main`

Please keep PRs focused. For significant new features, open an issue first to discuss.

---

## License

MIT
