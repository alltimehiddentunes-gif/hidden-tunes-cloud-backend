import express from "express";
import { supabase } from "../services/supabase.js";

const router = express.Router();

const FALLBACK_ARTIST_IMAGE =
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1000";

function normalizeArtist(artist) {
  const imageUrl = artist.image_url || FALLBACK_ARTIST_IMAGE;

  return {
    id: artist.id,
    name: artist.name || "Unknown Artist",
    slug: artist.slug || null,

    image_url: imageUrl,
    artwork: imageUrl,
    cover: imageUrl,
    thumbnail: imageUrl,

    bio: artist.bio || "",
    created_at: artist.created_at || null,
  };
}

router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("artists")
      .select("id,name,slug,image_url,bio,created_at")
      .order("name", { ascending: true });

    if (error) {
      console.error("Artists fetch error:", error);

      return res.status(500).json({
        error: "Failed to fetch artists",
        details: error.message,
      });
    }

    const artists = Array.isArray(data) ? data.map(normalizeArtist) : [];

    return res.json({
      success: true,
      count: artists.length,
      artists,
    });
  } catch (error) {
    console.error("Artists route crash:", error);

    return res.status(500).json({
      error: "Failed to fetch artists",
      details: error.message,
    });
  }
});

export default router;