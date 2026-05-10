import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing song id." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("track_lyrics")
      .select("*")
      .eq("song_id", id)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return NextResponse.json(
        { success: false, error: "No lyrics found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      songId: data.song_id,
      lyrics_type: data.lyrics_type,
      synced_lrc: data.synced_lrc,
      plain_lyrics: data.plain_lyrics,
      lyrics_url: data.lyrics_url,
      source: data.source,
    });
  } catch (error: any) {
    console.error("Lyrics fetch failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Lyrics fetch failed.",
      },
      { status: 500 }
    );
  }
}