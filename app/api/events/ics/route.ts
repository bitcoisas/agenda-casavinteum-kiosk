import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/events/ics?id=xxx          → ICS for a single event
 * GET /api/events/ics?start=ISO&end=ISO → ICS for all events in range
 *
 * Returns a valid iCalendar (.ics) file that can be imported into any
 * calendar app (iOS Calendar, Google Calendar, etc.).
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const id = searchParams.get("id");
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  const eventsRes = await fetch(`${origin}/api/events`, { cache: "no-store" });
  if (!eventsRes.ok) {
    return NextResponse.json({ error: "Failed to fetch events" }, { status: 502 });
  }
  const all: any[] = await eventsRes.json();

  let filtered = all;
  if (id) {
    filtered = all.filter((e) => e.id === id);
  } else if (start && end) {
    const s = new Date(start);
    const e = new Date(end);
    filtered = all.filter((ev) => {
      const evStart = new Date(ev.start);
      return evStart >= s && evStart < e;
    });
  }

  if (filtered.length === 0) {
    return NextResponse.json({ error: "No events found" }, { status: 404 });
  }

  const esc = (s: string) =>
    s.replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\n/g, "\\n");
  const stripHtml = (s: string) => s.replace(/<[^>]+>/g, "");
  const fmt = (d: string) =>
    new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  const vevents = filtered
    .map((e) => {
      const endDt = e.end
        ? fmt(e.end)
        : fmt(new Date(new Date(e.start).getTime() + 3600000).toISOString());
      return [
        "BEGIN:VEVENT",
        `DTSTART:${fmt(e.start)}`,
        `DTEND:${endDt}`,
        `SUMMARY:${esc(e.title || "")}`,
        e.description
          ? `DESCRIPTION:${esc(stripHtml(String(e.description)))}`
          : "",
        e.location?.name ? `LOCATION:${esc(e.location.name)}` : "",
        e.url ? `URL:${e.url}` : "",
        `UID:${e.id}@casavinteum`,
        "END:VEVENT",
      ]
        .filter(Boolean)
        .join("\r\n");
    })
    .join("\r\n");

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Casa Vinteum//Agenda//PT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    vevents,
    "END:VCALENDAR",
  ].join("\r\n");

  const filename =
    filtered.length === 1
      ? `evento-${filtered[0].id}.ics`
      : "eventos-casa-vinteum.ics";

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar;charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
