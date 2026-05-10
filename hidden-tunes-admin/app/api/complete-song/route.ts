import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const title = String(body.title || "").trim();
    const artistName = String(body.artistName || "Unknown Artist").trim();
    const albumTitle = String(body.albumTitle || "Singles").trim();

    if (!title || !body.audioUrl || !body.r2AudioKey) {
      return NextResponse.json(
        { error: "Missing title, audioUrl, or r2AudioKey" },
        { status: 400 }
      );
    }

    const artistSlug = slugify(artistName);
    const albumSlug = slugify(albumTitle);
    const songSlug = slugify(`${artistName}-${title}`);

    const { data: artist, error: artistError } = await supabaseAdmin
      .from("artists")
      .upsert(
        {
          name: artistName,
          slug: artistSlug,
          image_url: body.artworkUrl || null,
        },
        { onConflict: "slug" }
      )
      .select("*")
      .single();

    if (artistError) throw artistError;

    const { data: album, error: albumError } = await supabaseAdmin
      .from("albums")
      .upsert(
        {
          artist_id: artist.id,
          title: albumTitle,
          slug: albumSlug,
          artwork_url: body.artworkUrl || null,
          release_year: body.releaseYear || null,
        },
        { onConflict: "artist_id,slug" }
      )
      .select("*")
      .single();

    if (albumError) throw albumError;

    const { data: song, error: songError } = await supabaseAdmin
      .from("songs")
      .upsert(
        {
          artist_id: artist.id,
          album_id: album.id,

          title,
          slug: songSlug,
          artist_name: artistName,
          album_title: albumTitle,
          genre: body.genre || "Afrobeat",
          mood: body.mood || "Premium",

          duration_seconds: Number(body.durationSeconds || 0),
          track_number: body.trackNumber || null,
          explicit: Boolean(body.explicit || false),

          audio_url: body.audioUrl,
          artwork_url: body.artworkUrl || null,
          r2_audio_key: body.r2AudioKey,
          r2_artwork_key: body.r2ArtworkKey || null,

          lyrics: body.lyrics || null,
          synced_lyrics: body.syncedLyrics || null,

          source_name: "Hidden Tunes",
          type: "r2",
          is_online: true,
          is_downloadable: true,
        },
        { onConflict: "artist_id,slug" }
      )
      .select("*")
      .single();

    if (songError) throw songError;

    return NextResponse.json({
      success: true,
      artist,
      album,
      song,
    });
  } catch (error: any) {
    console.error("complete-song error:", error);

    return NextResponse.json(
      {
        error: "Song completion failed",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}