/**
 * DELETE /api/admin/delete-event
 *
 * Permanently removes a manual event from the Supabase `manual_events` table.
 *
 * The request body must include:
 *  - password : must match the ADMIN_PASSWORD environment variable.
 *  - id       : UUID of the event to delete (required).
 *
 * Only events created through the manual admin flow can be deleted here.
 * evento.so events are managed externally on the evento.so platform.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function DELETE(req: Request) {
  const { password, id } = await req.json();

  // Verify admin password server-side before touching the database.
  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Senha incorreta" }, { status: 401 });
  }
  if (!id) {
    return NextResponse.json({ error: "ID do evento é obrigatório" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { error } = await supabase.from("manual_events").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
