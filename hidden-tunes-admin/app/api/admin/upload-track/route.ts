import { NextRequest, NextResponse } from "next/server";
import { parseBuffer } from "music-metadata";
import { randomUUID } from "crypto";

import { uploadToR2 } from "@/lib/r2";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getArtworkExtension(format?: string) {
  if (!format) return "jpg";
  if (format.includes("png")) return "png";
  if (format.includes("webp")) return "webp";
  return "jpg";
}

function getFileExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() || "jpg";
}

function detectLyricsType(text: string) {
  const hasTimestamp = /\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/.test(text);
  return hasTimestamp ? "lrc" : "plain";
}

function formatLrcTime(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  const wholeSeconds = Math.floor(remainingSeconds);
  const centiseconds = Math.floor((remainingSeconds - wholeSeconds) * 100);

  return `[${String(minutes).padStart(2, "0")}:${String(
    wholeSeconds
  ).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}]`;
}

function isSectionLabel(line: string) {
  return /^\[(intro|verse|chorus|bridge|outro|hook|pre-chorus|pre chorus|refrain|instrumental)\]$/i.test(
    line.trim()
  );
}

function generateEstimatedLrc(rawLyrics: string, durationSeconds: number) {
  const lines = rawLyrics
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isSectionLabel(line));

  if (lines.length === 0) return rawLyrics;

  const safeDuration =
    durationSeconds && durationSeconds > 20
      ? durationSeconds
      : Math.max(lines.length * 5, 60);

  const introSeconds = Math.min(8, Math.max(2, safeDuration * 0.04));
  const endingBufferSeconds = Math.min(8, Math.max(3, safeDuration * 0.04));
  const usableDuration = Math.max(
    safeDuration - introSeconds - endingBufferSeconds,
    lines.length * 3.5
  );

  const spacing = usableDuration / Math.max(lines.length - 1, 1);

  return lines
    .map((line, index) => {
      const time = index === 0 ? 0 : introSeconds + index * spacing;
      return `${formatLrcTime(time)} ${line}`;
    })
    .join("\n");
}

async function upsertArtist(name: string, slug: string, imageUrl: string) {
  const { data: existing } = await supabaseAdmin
    .from("artists")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (existing) return existing;

  const { data, error } = await supabaseAdmin
    .from("artists")
    .insert({
      name,
      slug,
      image_url: imageUrl,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function upsertAlbum(
  title: string,
  slug: string,
  artistId: string,
  artworkUrl: string
) {
  const { data: existing } = await supabaseAdmin
    .from("albums")
    .select("*")
    .eq("slug", slug)
    .eq("artist_id", artistId)
    .maybeSingle();

  if (existing) return existing;

  const { data, error } = await supabaseAdmin
    .from("albums")
    .insert({
      title,
      slug,
      artist_id: artistId,
      artwork_url: artworkUrl,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const audioFile = formData.get("audio") as File | null;
    const coverFile = formData.get("cover") as File | null;
    const lyricsFile = formData.get("lyrics") as File | null;

    const titleOverride = String(formData.get("titleOverride") || "").trim();
    const defaultArtist = String(formData.get("defaultArtist") || "").trim();
    const defaultAlbum = String(formData.get("defaultAlbum") || "").trim();
    const defaultGenre = String(formData.get("defaultGenre") || "").trim();
    const defaultMood = String(formData.get("defaultMood") || "").trim();

    if (!audioFile) {
      return NextResponse.json(
        { success: false, error: "No audio file uploaded." },
        { status: 400 }
      );
    }

    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());

    const metadata = await parseBuffer(
      audioBuffer,
      audioFile.type || "audio/mpeg",
      { duration: true }
    );

    const fallbackName = audioFile.name.replace(/\.[^/.]+$/, "");
    const title = titleOverride || metadata.common.title || fallbackName;

    const artistName =
      metadata.common.artist ||
      metadata.common.albumartist ||
      defaultArtist ||
      "Unknown Artist";

    const albumTitle = metadata.common.album || defaultAlbum || "Singles";
    const genre = metadata.common.genre?.[0] || defaultGenre || "Afrobeat";
    const mood = defaultMood || "Premium";
    const durationSeconds = Math.round(metadata.format.duration || 0);

    const songId = randomUUID();

    const artistSlug = slugify(artistName);
    const titleSlug = slugify(title);
    const albumSlug = slugify(albumTitle);

    const audioKey = `songs/${artistSlug}/${songId}-${titleSlug}.mp3`;

    const audioUrl = await uploadToR2({
      key: audioKey,
      body: audioBuffer,
      contentType: audioFile.type || "audio/mpeg",
    });

    let artworkUrl = `${process.env.R2_PUBLIC_BASE_URL}/artists/${artistSlug}/profile.jpg`;
    let artworkSource: "custom" | "embedded" | "fallback" = "fallback";
    let artworkKey: string | null = null;

    if (coverFile) {
      const coverBuffer = Buffer.from(await coverFile.arrayBuffer());
      const ext = getFileExtension(coverFile.name);

      artworkKey = `covers/${artistSlug}/${songId}-${titleSlug}.${ext}`;

      artworkUrl = await uploadToR2({
        key: artworkKey,
        body: coverBuffer,
        contentType: coverFile.type || "image/jpeg",
      });

      artworkSource = "custom";
    } else {
      const embeddedArtwork = metadata.common.picture?.[0];

      if (embeddedArtwork?.data) {
        const ext = getArtworkExtension(embeddedArtwork.format);

        artworkKey = `covers/${artistSlug}/${songId}-${titleSlug}.${ext}`;

        artworkUrl = await uploadToR2({
          key: artworkKey,
          body: Buffer.from(embeddedArtwork.data),
          contentType: embeddedArtwork.format || "image/jpeg",
        });

        artworkSource = "embedded";
      }
    }

    let lyricsUrl: string | null = null;
    let lyricsKey: string | null = null;
    let lyricsType: "lrc" | null = null;
    let syncedLrc: string | null = null;
    let plainLyrics: string | null = null;

    if (lyricsFile) {
      const originalLyricsBuffer = Buffer.from(await lyricsFile.arrayBuffer());
      const lyricsText = originalLyricsBuffer.toString("utf-8").trim();

      const detectedType = detectLyricsType(lyricsText);

      lyricsType = "lrc";

      if (detectedType === "lrc") {
        syncedLrc = lyricsText;
        plainLyrics = null;
      } else {
        plainLyrics = lyricsText;
        syncedLrc = generateEstimatedLrc(lyricsText, durationSeconds);
      }

      lyricsKey = `lyrics/${artistSlug}/${songId}-${titleSlug}.lrc`;

      lyricsUrl = await uploadToR2({
        key: lyricsKey,
        body: Buffer.from(syncedLrc, "utf-8"),
        contentType: "text/plain; charset=utf-8",
      });
    }

    const artist = await upsertArtist(artistName, artistSlug, artworkUrl);
    const album = await upsertAlbum(albumTitle, albumSlug, artist.id, artworkUrl);

    const { data: song, error: songError } = await supabaseAdmin
      .from("songs")
      .insert({
        id: songId,

        title,
        slug: `${artistSlug}-${titleSlug}-${songId.slice(0, 8)}`,

        artist_id: artist.id,
        album_id: album.id,

        artist: artist.name,
        album: album.title,

        artist_name: artist.name,
        album_title: album.title,

        genre,
        mood,

        duration: durationSeconds,
        duration_seconds: durationSeconds,

        audio_url: audioUrl,
        cover_url: artworkUrl,

        url: audioUrl,
        artwork_url: artworkUrl,

        r2_audio_key: audioKey,
        r2_cover_key: artworkKey,

        lyrics_url: lyricsUrl,
        has_lyrics: Boolean(lyricsUrl),
        lyrics_type: lyricsType,
        lyrics_updated_at: lyricsUrl ? new Date().toISOString() : null,

        source_name: "Hidden Tunes",
        source_type: "r2",

        type: "r2",

        is_online: true,
        isOnline: true,
      })
      .select("*")
      .single();

    if (songError) throw songError;

    if (lyricsUrl && lyricsType) {
      const { error: lyricsError } = await supabaseAdmin
        .from("track_lyrics")
        .insert({
          song_id: song.id,
          lyrics_type: lyricsType,
          plain_lyrics: plainLyrics,
          synced_lrc: syncedLrc,
          word_sync_json: null,
          r2_lyrics_key: lyricsKey,
          lyrics_url: lyricsUrl,
          source: plainLyrics ? "auto_estimated_lrc" : "admin_upload",
        });

      if (lyricsError) throw lyricsError;
    }

    return NextResponse.json({
      success: true,
      track: {
        id: song.id,
        title: song.title,
        slug: song.slug,

        artist: song.artist || song.artist_name || artist.name,
        artistId: song.artist_id || artist.id,
        artist_id: song.artist_id || artist.id,
        artistSlug: artist.slug,

        album: song.album || song.album_title || album.title,
        albumId: song.album_id || album.id,
        album_id: song.album_id || album.id,
        albumSlug: album.slug,

        genre: song.genre,
        mood: song.mood,

        duration: song.duration_seconds || song.duration || durationSeconds,
        duration_seconds: song.duration_seconds || song.duration || durationSeconds,

        url: song.url || song.audio_url || audioUrl,
        audio_url: song.audio_url || song.url || audioUrl,

        artwork: song.artwork_url || song.cover_url || artworkUrl,
        cover_url: song.cover_url || song.artwork_url || artworkUrl,

        artworkSource,

        hasLyrics: Boolean(song.has_lyrics),
        has_lyrics: Boolean(song.has_lyrics),

        lyricsType: song.lyrics_type,
        lyrics_type: song.lyrics_type,

        lyricsUrl: song.lyrics_url,
        lyrics_url: song.lyrics_url,

        sourceName: song.source_name,
        source_name: song.source_name,

        type: song.type || song.source_type || "r2",
        source_type: song.source_type || song.type || "r2",

        isOnline: song.isOnline ?? song.is_online ?? true,
        is_online: song.is_online ?? song.isOnline ?? true,
      },
    });
  } catch (error: any) {
    console.error("Upload failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Upload failed.",
      },
      { status: 500 }
    );
  }
}