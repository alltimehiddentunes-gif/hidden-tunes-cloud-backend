import express from "express";
import { supabase } from "../services/supabase.js";

const router = express.Router();

const FALLBACK_ARTIST_IMAGE =
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1000";

function normalizeArtist(row, tracks = []) {
  const artwork = row.image_url || FALLBACK_ARTIST_IMAGE;

  return {
    id: row.id,
    name: row.name || "Unknown Artist",
    slug: row.slug || null,
    artwork,
    image_url: artwork,
    cover: artwork,
    thumbnail: artwork,
    bio: row.bio || "",
    created_at: row.created_at || null,
    songCount: tracks.length,
    tracks,
    albums: [],
  };
}

function normalizeTrack(row) {
  const artwork =
    row.cover_url ||
    row.albums?.cover_url ||
    row.albums?.artwork_url ||
    row.artists?.image_url ||
    FALLBACK_ARTIST_IMAGE;

  const audioUrl = row.audio_url || row.url || null;

  return {
    id: row.id,
    title: row.title || "Untitled",
    slug: row.slug || null,
    artist: row.artists?.name || "Unknown Artist",
    artistId: row.artist_id || row.artists?.id || null,
    album: row.albums?.title || "Singles",
    albumId: row.album_id || row.albums?.id || null,
    genre: row.genre || row.albums?.genre || "Hidden Tunes",
    mood: row.mood || null,
    artwork,
    cover: artwork,
    thumbnail: artwork,
    url: audioUrl,
    streamUrl: audioUrl,
    duration: row.duration_seconds || row.duration || null,
    sourceName: "Hidden Tunes",
    type: "r2",
    isOnline: true,
    isPublic: row.is_public ?? true,
    createdAt: row.created_at || null,
  };
}

router.get("/", async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const offset = (page - 1) * limit;

    const query = String(req.query.q || req.query.search || "").trim();

    let artistRequest = supabase
      .from("artists")
      .select(
        `
        id,
        name,
        slug,
        image_url,
        bio,
        created_at
      `
      )
      .order("name", { ascending: true })
      .range(offset, offset + limit - 1);

    if (query) {
      artistRequest = artistRequest.or(
        `name.ilike.%${query}%,slug.ilike.%${query}%`
      );
    }

    const { data: artistRows, error: artistError } = await artistRequest;

    if (artistError) {
      console.error("Artists fetch error:", artistError);

      return res.status(500).json({
        error: "Failed to fetch artists",
        details: artistError.message,
      });
    }

    const artists = Array.isArray(artistRows) ? artistRows : [];
    const artistIds = artists.map((artist) => artist.id).filter(Boolean);

    if (artistIds.length === 0) {
      return res.json({
        success: true,
        count: 0,
        artists: [],
      });
    }

    const { data: songRows, error: songError } = await supabase
      .from("songs")
      .select(
        `
        id,
        title,
        slug,
        artist_id,
        album_id,
        genre,
        mood,
        duration,
        duration_seconds,
        url,
        audio_url,
        cover_url,
        is_public,
        created_at,
        artists (
          id,
          name,
          image_url
        ),
        albums (
          id,
          title,
          cover_url,
          artwork_url,
          genre
        )
      `
      )
      .in("artist_id", artistIds)
      .order("created_at", { ascending: false });

    if (songError) {
      console.error("Artist songs fetch error:", songError);

      return res.status(500).json({
        error: "Failed to fetch artist songs",
        details: songError.message,
      });
    }

    const songs = Array.isArray(songRows) ? songRows.map(normalizeTrack) : [];

    const songsByArtistId = new Map();

    songs.forEach((song) => {
      const key = song.artistId;
      if (!key) return;

      if (!songsByArtistId.has(key)) {
        songsByArtistId.set(key, []);
      }

      songsByArtistId.get(key).push(song);
    });

    const normalizedArtists = artists.map((artist) =>
      normalizeArtist(artist, songsByArtistId.get(artist.id) || [])
    );

    return res.json({
      success: true,
      count: normalizedArtists.length,
      artists: normalizedArtists,
    });
  } catch (error) {
    console.error("Artists route server error:", error);

    return res.status(500).json({
      error: "Server error",
      details: error.message,
    });
  }
});

export default router;