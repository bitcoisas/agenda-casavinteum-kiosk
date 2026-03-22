/**
 * PUT /api/admin/update-event
 *
 * Updates an existing manual event in the Supabase `manual_events` table.
 *
 * The request body must include:
 *  - password    : must match the ADMIN_PASSWORD environment variable.
 *  - id          : UUID of the event to update (required).
 *  - title       : event title (required).
 *  - start       : ISO 8601 timestamp with timezone offset (required).
 *  - end         : ISO 8601 timestamp (optional).
 *  - description : plain text or HTML (optional).
 *  - location    : venue name string (optional).
 *  - external_url: link to an external event page (optional).
 *  - organizer   : organiser name (optional).
 *  - platform    : event platform name (optional).
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function PUT(req: Request) {
  const { password, id, title, start, end, description, location, external_url, organizer, platform } = await req.json();

  // Verify admin password server-side before touching the database.
  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Senha incorreta" }, { status: 401 });
  }
  if (!id || !title || !start) {
    return NextResponse.json({ error: "ID, título e início são obrigatórios" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await supabase
    .from("manual_events")
    .update({
      title,
      start,
      end: end || null,
      description: description || null,
      location: location || null,
      external_url: external_url || null,
      organizer: organizer || null,
      platform: platform || null,
    })
    .eq("id", id)
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data[0]);
}
