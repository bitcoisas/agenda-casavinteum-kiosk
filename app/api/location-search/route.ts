/**
 * GET /api/location-search?q={query}
 *
 * Proxies a geocoding search to the Nominatim OpenStreetMap API and returns
 * a compact list of location suggestions.
 *
 * Why a server-side proxy?
 *  - Nominatim requires a meaningful User-Agent header that identifies the app.
 *  - Keeps the Nominatim usage policy compliance centralised.
 *
 * Response: Array of { name: string } objects with short, human-readable
 * addresses in the format "Street, Neighbourhood, City".
 */

import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  if (!q) return NextResponse.json([]);

  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=1`,
    { headers: { "User-Agent": "CasaVinteum-Kiosk/1.0" } },
  );
  const data = await res.json();

  return NextResponse.json(
    data.map((r: any) => {
      const a = r.address ?? {};
      // Build a compact address: "Street, Number, Neighbourhood, City"
      const street = [a.road || a.pedestrian || a.footway, a.house_number].filter(Boolean).join(", ");
      const parts = [
        street || null,
        a.suburb || a.neighbourhood || a.city_district || a.quarter,
        a.city || a.town || a.village || a.municipality,
      ].filter(Boolean);
      // Fall back to the first 3 segments of the full display_name if structured data is sparse.
      return {
        name: parts.length >= 2
          ? parts.join(", ")
          : r.display_name.split(",").slice(0, 3).join(",").trim(),
      };
    }),
  );
}
