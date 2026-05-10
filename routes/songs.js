import express from "express";
import { supabase } from "../services/supabase.js";

const router = express.Router();

const FALLBACK_COVER =
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1000";

const PUBLIC_R2_BASE_URL =
  process.env.PUBLIC_R2_BASE_URL ||
  process.env.R2_PUBLIC_URL ||
  process.env.CLOUDFLARE_R2_PUBLIC_URL ||
  "";

function isFullUrl(value) {
  return (
    typeof value === "string" &&
    (value.startsWith("https://") || value.startsWith("http://"))
  );
}

function cleanPath(value) {
  return String(value || "")
    .trim()
    .replace(/^\/+/, "");
}

function makePublicUrl(value, fallback = null) {
  if (!value) return fallback;

  const clean = String(value).trim();

  if (!clean) return fallback;

  if (isFullUrl(clean)) {
    return clean;
  }

  if (!PUBLIC_R2_BASE_URL) {
    return fallback;
  }

  return `${PUBLIC_R2_BASE_URL.replace(/\/+$/, "")}/${cleanPath(clean)}`;
}

function normalizeSong(row) {
  const artwork =
    makePublicUrl(
      row.cover_url ||
        row.albums?.cover_url ||
        row.artists?.image_url,
      FALLBACK_COVER
    ) || FALLBACK_COVER;

  const audioUrl = makePublicUrl(row.audio_url, null);

  return {
    id: row.id,
    title: row.title || "Untitled",
    slug: row.slug || null,

    artist: row.artists?.name || "Unknown Artist",
    artist_name: row.artists?.name || "Unknown Artist",

    artistId: row.artist_id,
    artist_id: row.artist_id,

    album: row.albums?.title || "Singles",
    album_title: row.albums?.title || "Singles",

    albumId: row.album_id,
    album_id: row.album_id,

    genre: row.genre || null,
    mood: row.mood || null,

    duration: row.duration_seconds || 0,
    duration_seconds: row.duration_seconds || 0,

    url: audioUrl,
    audio_url: audioUrl,
    streamUrl: audioUrl,
    stream_url: audioUrl,

    artwork,
    cover: artwork,
    cover_url: artwork,
    thumbnail: artwork,

    sourceName: "Hidden Tunes",
    type: "r2",
    isOnline: true,
    is_public: true,

    created_at: row.created_at || null,

    artists: row.artists || null,
    albums: row.albums || null,
  };
}

router.get("/", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;

    const { data, error } = await supabase
      .from("songs")
      .select(`
        id,
        title,
        slug,
        genre,
        mood,
        duration_seconds,
        audio_url,
        cover_url,
        artist_id,
        album_id,
        created_at,
        artists (
          id,
          name,
          slug,
          image_url
        ),
        albums (
          id,
          title,
          slug,
          cover_url
        )
      `)
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Songs fetch error:", error);

      return res.status(500).json({
        error: "Failed to fetch songs",
      });
    }

    const normalizedSongs = (data || []).map(normalizeSong);

    return res.json(normalizedSongs);
  } catch (error) {
    console.error("Songs route server error:", error);

    return res.status(500).json({
      error: "Server error",
    });
  }
});

export default router;