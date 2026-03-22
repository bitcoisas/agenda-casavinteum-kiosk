# Agenda Casa Vinteum

A public event kiosk for [Casa Vinteum](https://x.com/casavinteum) — a Bitcoin hub in São Paulo, Brazil.

Built with Next.js (App Router), FullCalendar, Supabase, and Tailwind CSS.

## Features

- Aggregates events from [evento.so](https://evento.so) via the public Embed API (no API key required)
- Manual events created, edited, and deleted through an in-app admin modal (password-protected)
- Light / dark theme toggle (Apple Calendar-style UI)
- iOS-style scroll-wheel time picker and calendar date picker
- Location search powered by OpenStreetMap / Nominatim
- QR code sharing for event links
- Auto-switches to monthly view when no events exist in the current week

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15+ (App Router, Turbopack) |
| Calendar UI | FullCalendar v6 |
| Database | Supabase (PostgreSQL) |
| Styling | Tailwind CSS v4 |
| Geocoding | Nominatim (OpenStreetMap) |
| QR codes | qrcode.react |

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/your-org/agenda-casavinteum-kiosk.git
cd agenda-casavinteum-kiosk
npm install
```

### 2. Set up environment variables

Copy the example file and fill in your values:

```bash
cp env.example .env.local
```

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only, never exposed to the browser) |
| `EVENTO_SO_USERNAME` | Your evento.so username (e.g. `casa21`) |
| `ADMIN_PASSWORD` | Password for the admin modal (add / edit / delete manual events) |

### 3. Set up Supabase

Create a table called `manual_events` with the following columns:

| Column | Type |
|---|---|
| `id` | `uuid` (primary key, default `gen_random_uuid()`) |
| `title` | `text` |
| `start` | `timestamptz` |
| `end` | `timestamptz` (nullable) |
| `description` | `text` (nullable) |
| `location` | `text` (nullable) |
| `platform` | `text` (nullable) |
| `external_url` | `text` (nullable) |
| `organizer` | `text` (nullable) |
| `created_at` | `timestamptz` (default `now()`) |

Enable Row Level Security (RLS) on the table. All reads and writes go through server-side API routes using the service role key, so no client-side RLS policies are needed.

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Adapting for Another Organisation

1. Replace `public/logo.png` with your organisation's logo (square, ~512×512 px).
2. Update the title and description in `app/layout.tsx`.
3. Set `EVENTO_SO_USERNAME` to your evento.so account (or remove the evento.so integration from `app/api/events/route.ts` if not needed).
4. Choose a strong `ADMIN_PASSWORD`.

## License

MIT
