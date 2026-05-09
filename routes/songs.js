import express from "express";
import { supabase } from "../services/supabase.js";

const router = express.Router();

function normalizeSong(row) {
  return {
    id: row.id,
    title: row.title,
    artist: row.artists?.name || "Unknown Artist",
    artistId: row.artist_id,
    album: row.albums?.title || null,
    albumId: row.album_id,
    genre: row.genre || null,
    mood: row.mood || null,
    duration: row.duration_seconds || 0,
    url: row.audio_url,
    artwork:
      row.cover_url ||
      row.albums?.cover_url ||
      row.artists?.image_url ||
      null,
    sourceName: "Hidden Tunes",
    type: "r2",
    isOnline: true
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
      console.error(error);

      return res.status(500).json({
        error: "Failed to fetch songs"
      });
    }

    return res.json(data.map(normalizeSong));
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Server error"
    });
  }
});

export default router;