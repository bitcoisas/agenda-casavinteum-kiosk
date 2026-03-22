/**
 * POST /api/admin/add-event
 *
 * Creates a new manual event in the Supabase `manual_events` table.
 *
 * The request body must include:
 *  - password    : must match the ADMIN_PASSWORD environment variable.
 *  - title       : event title (required).
 *  - start       : ISO 8601 timestamp with timezone offset, e.g. "2026-03-22T18:00:00-03:00".
 *  - end         : ISO 8601 timestamp (optional).
 *  - description : plain text or HTML (optional).
 *  - location    : venue name string (optional).
 *  - external_url: link to an external event page (optional).
 *  - organizer   : organiser name (optional).
 *  - platform    : event platform name, e.g. Luma, Sympla (optional).
 *
 * Password verification is intentionally server-side only.
 * The service role key bypasses Row Level Security — this is safe because
 * the password is verified before any write is performed.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  const { password, title, start, end, description, location, external_url, organizer, platform } = await req.json();

  // Verify admin password server-side before touching the database.
  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Senha incorreta" }, { status: 401 });
  }

  if (!title || !start) {
    return NextResponse.json({ error: "Título e data de início são obrigatórios" }, { status: 400 });
  }

  // Service role key bypasses RLS — safe here because the password is verified above.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await supabase
    .from("manual_events")
    .insert([{
      title,
      start,
      end: end || null,
      description: description || null,
      location: location || null,
      external_url: external_url || null,
      organizer: organizer || null,
      platform: platform || null,
    }])
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data[0]);
}
