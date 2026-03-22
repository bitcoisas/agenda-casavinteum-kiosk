/**
 * GET /api/events
 *
 * Returns a combined list of events from two sources:
 *  1. evento.so  — fetched via the public Embed API (no API key required),
 *                  cached for 30 minutes on the server.
 *  2. Supabase   — manual events added through the admin modal,
 *                  always fetched fresh (no cache).
 *
 * Both sources are merged into a single array of FullCalendar-compatible
 * event objects and returned as JSON.
 *
 * The Supabase service role key is used here so that Row Level Security
 * does not silently filter out manual events for unauthenticated reads.
 * This route is server-side only — the key is never exposed to the browser.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Disable Next.js route caching so Supabase data is always fresh.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // ── 1. evento.so (public Embed API, no key needed) ──────────────────────
    const eventoRes = await fetch(
      `https://evento.so/api/embed/v1/users/${process.env.EVENTO_SO_USERNAME}/events?limit=100`,
      { next: { revalidate: 1800 } }, // cache for 30 minutes
    );
    const eventoData = await eventoRes.json();
    const eventoEvents =
      eventoData.data?.map((e: any) => ({
        id: `evento-${e.id}`,
        title: e.title,
        start: e.start_date || e.start,
        end: e.end_date || e.end,
        description: e.description,
        location: e.location,
        // Cover images are stored as relative paths — prepend the CDN base URL.
        image: e.cover ? `https://api.evento.so/storage/v1/object/public/cdn${e.cover}` : null,
        url: e.url || `https://evento.so/e/${e.id}`,
        source: "evento.so",
      })) || [];

    // ── 2. Manual events from Supabase ──────────────────────────────────────
    // Uses the service role key to bypass RLS on the manual_events table.
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data: manual, error } = await supabase.from("manual_events").select("*");
    if (error) console.error("Supabase manual_events error:", error.message);

    const manualEvents =
      manual?.map((e: any) => ({
        ...e,
        // Normalise location to the same shape as evento.so events.
        location: e.location ? { name: e.location } : null,
        url: e.external_url || null,
        source: "manual",
      })) || [];

    return NextResponse.json([...eventoEvents, ...manualEvents]);
  } catch (error) {
    console.error(error);
    return NextResponse.json([], { status: 500 });
  }
}
