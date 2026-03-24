/**
 * GET /api/events
 *
 * Returns a combined list of events from two sources:
 *  1. evento.so  — fetched via the authenticated Public API (requires API key),
 *                  which returns all events associated with the account including
 *                  co-hosted events created by other users.
 *                  Embed API is called in parallel per-event to retrieve location
 *                  and the canonical URL (fields the Public API omits).
 *                  Both sets of requests are cached for 30 minutes.
 *  2. Supabase   — manual events added through the admin modal,
 *                  always fetched fresh (no cache).
 *
 * Both sources are merged into a single array of FullCalendar-compatible
 * event objects and returned as JSON.
 *
 * The Supabase service role key is used here so that Row Level Security
 * does not silently filter out manual events for unauthenticated reads.
 * This route is server-side only — the keys are never exposed to the browser.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Disable Next.js route caching so Supabase data is always fresh.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // ── 1. evento.so (Public API with API key) ──────────────────────────────
    // The Public API includes co-hosted events (events created by others but
    // associated with the casa21 account), unlike the Embed API which only
    // returns events created by that username directly.
    const publicRes = await fetch(
      `https://evento.so/api/public/v1/users/${process.env.EVENTO_SO_USERNAME}/events?limit=100`,
      {
        headers: { Authorization: `Bearer ${process.env.EVENTO_SO_API_KEY}` },
        next: { revalidate: 1800 }, // cache for 30 minutes
      },
    );
    const publicData = await publicRes.json();
    const events: any[] = publicData.data?.events || [];

    // Fetch embed details in parallel to get location + canonical URL.
    // The Public API omits these fields; the Embed API single-event endpoint
    // returns them even for events the authenticated user didn't create.
    const embedDetails = await Promise.all(
      events.map((e: any) =>
        fetch(`https://evento.so/api/embed/v1/events/${e.id}`, {
          next: { revalidate: 1800 },
        })
          .then((r) => r.json())
          .then((d) => d.data)
          .catch(() => null),
      ),
    );

    const eventoEvents = events.map((e: any, i: number) => {
      const detail = embedDetails[i];
      // Normalise cover to a full CDN URL (cover may or may not have a leading slash).
      const coverPath = e.cover
        ? e.cover.startsWith("/")
          ? e.cover
          : `/${e.cover}`
        : null;
      return {
        id: `evento-${e.id}`,
        title: e.title,
        start: e.start_date,
        end: e.end_date,
        description: e.description,
        location: detail?.location || null,
        image: coverPath
          ? `https://api.evento.so/storage/v1/object/public/cdn${coverPath}`
          : null,
        url: detail?.url || `https://evento.so/e/${e.id}`,
        source: "evento.so",
      };
    });

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
