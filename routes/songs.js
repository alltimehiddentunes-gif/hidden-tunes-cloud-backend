import express from "express";
import { supabase } from "../services/supabase.js";

const router = express.Router();

const FALLBACK_COVER =
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1000";

const PUBLIC_R2_BASE_URL =
  process.env.PUBLIC_R2_BASE_URL ||
  process.env.R2_PUBLIC_BASE_URL ||
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

  if (isFullUrl(clean)) return clean;
  if (!PUBLIC_R2_BASE_URL) return fallback;

  return `${PUBLIC_R2_BASE_URL.replace(/\/+$/, "")}/${cleanPath(clean)}`;
}

function normalizeSong(row) {
  const artwork =
    makePublicUrl(
      row.cover_url ||
        row.artwork_url ||
        row.albums?.cover_url ||
        row.albums?.artwork_url ||
        row.artists?.image_url,
      FALLBACK_COVER
    ) || FALLBACK_COVER;

  const audioUrl = makePublicUrl(row.audio_url || row.url, null);

  return {
    id: row.id,
    title: row.title || "Untitled",
    slug: row.slug || null,

    artist: row.artist || row.artist_name || row.artists?.name || "Unknown Artist",
    artist_name:
      row.artist_name || row.artist || row.artists?.name || "Unknown Artist",

    artistId: row.artist_id,
    artist_id: row.artist_id,

    album: row.album || row.album_title || row.albums?.title || "Singles",
    album_title: row.album_title || row.album || row.albums?.title || "Singles",

    albumId: row.album_id,
    album_id: row.album_id,

    genre: row.genre || null,
    mood: row.mood || null,

    duration: row.duration_seconds || row.duration || 0,
    duration_seconds: row.duration_seconds || row.duration || 0,

    url: audioUrl,
    audio_url: audioUrl,
    streamUrl: audioUrl,
    stream_url: audioUrl,

    artwork,
    cover: artwork,
    cover_url: artwork,
    thumbnail: artwork,

    sourceName: "Hidden Tunes",
    source_name: "Hidden Tunes",

    type: row.type || "r2",
    source_type: row.source_type || row.type || "r2",

    isOnline: true,
    is_online: true,
    is_public: row.is_public ?? true,

    created_at: row.created_at || null,

    artists: row.artists || null,
    albums: row.albums || null,
  };
}

router.get("/", async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    const page = Math.max(Number(req.query.page) || 1, 1);

    const offset =
      req.query.offset !== undefined
        ? Math.max(Number(req.query.offset) || 0, 0)
        : (page - 1) * limit;

    const query = String(req.query.q || req.query.search || "").trim();

    let request = supabase
      .from("songs")
      .select(`
        id,
        title,
        slug,
        artist,
        artist_name,
        album,
        album_title,
        genre,
        mood,
        duration,
        duration_seconds,
        audio_url,
        url,
        cover_url,
        artwork_url,
        source_type,
        type,
        artist_id,
        album_id,
        is_public,
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
          cover_url,
          artwork_url
        )
      `)
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (query) {
      request = request.or(
        `title.ilike.%${query}%,artist.ilike.%${query}%,artist_name.ilike.%${query}%,album.ilike.%${query}%,album_title.ilike.%${query}%,genre.ilike.%${query}%,mood.ilike.%${query}%`
      );
    }

    const { data, error } = await request;

    if (error) {
      console.error("Songs fetch error:", error);

      return res.status(500).json({
        error: "Failed to fetch songs",
        details: error.message,
      });
    }

    const normalizedSongs = (data || []).map(normalizeSong);

    return res.json(normalizedSongs);
  } catch (error) {
    console.error("Songs route server error:", error);

    return res.status(500).json({
      error: "Server error",
      details: error.message,
    });
  }
});

export default router;