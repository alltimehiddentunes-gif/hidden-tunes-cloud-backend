import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import ytdlp from "yt-dlp-exec";
import { createClient } from "@supabase/supabase-js";

import songsRouter from "./routes/songs.js";
import adminUploadRoutes from "./routes/adminUpload.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.use(cors());
app.use(express.json({ limit: "25mb" }));

app.use("/api/songs", songsRouter);
app.use("/admin/upload", adminUploadRoutes);

const streamCache = new Map();

const HIDDEN_TUNES_CHANNEL_ID =
  process.env.HIDDEN_TUNES_CHANNEL_ID || "UCr_GiZYfGzmzwdidgKPRWsg";

const HIDDEN_TUNES_CHANNEL_URL =
  process.env.HIDDEN_TUNES_CHANNEL_URL ||
  "https://www.youtube.com/@HiddenTunes-Wills";

function extractYouTubeId(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  if (/^[a-zA-Z0-9_-]{11}$/.test(text)) return text;

  try {
    const url = new URL(text);
    const watchId = url.searchParams.get("v");

    if (watchId && /^[a-zA-Z0-9_-]{11}$/.test(watchId)) return watchId;

    const shortsMatch = url.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (shortsMatch?.[1]) return shortsMatch[1];

    const embedMatch = url.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embedMatch?.[1]) return embedMatch[1];

    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.replace("/", "").trim();
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }
  } catch {}

  const match = text.match(/[a-zA-Z0-9_-]{11}/);
  return match ? match[0] : "";
}

function decodeXml(value = "") {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeYouTubeItem(item) {
  if (!item) return null;

  const id = extractYouTubeId(
    item.id || item.videoId || item.url || item.webpage_url || item.original_url
  );

  if (!id) return null;

  const title = String(item.title || "Unknown Title").trim();
  if (!title) return null;

  const lowerTitle = title.toLowerCase();
  if (lowerTitle.includes("deleted video")) return null;
  if (lowerTitle.includes("private video")) return null;

  const artist =
    item.artist ||
    item.channelTitle ||
    item.uploader ||
    item.channel ||
    item.uploader_id ||
    "Hidden Tunes";

  const thumbnail =
    item.thumbnail ||
    item.cover ||
    item.image ||
    `https://img.youtube.com/vi/${id}/hqdefault.jpg`;

  return {
    id: `youtube-${id}`,
    videoId: id,
    title,
    artist,
    channelTitle: artist,
    thumbnail,
    artwork: thumbnail,
    cover: thumbnail,
    sourceName: "YouTube",
    source: "youtube",
    isYouTube: true,
    isOnline: true,
    type: "youtube_video",
    duration: item.duration || item.duration_string || undefined,
  };
}

function dedupeTracks(tracks) {
  const seen = new Set();

  return tracks.filter((track) => {
    if (!track?.videoId) return false;
    if (seen.has(track.videoId)) return false;
    seen.add(track.videoId);
    return true;
  });
}

async function fetchHiddenTunesRss(limit = 20) {
  const safeLimit = Math.min(Number(limit || 20), 20);
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${HIDDEN_TUNES_CHANNEL_ID}`;

  const response = await fetch(feedUrl);

  if (!response.ok) {
    throw new Error(`RSS request failed: ${response.status}`);
  }

  const xml = await response.text();
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];

  const tracks = entries
    .map((entry) => {
      const videoId = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1] || "";
      const title = decodeXml(entry.match(/<title>(.*?)<\/title>/)?.[1] || "");
      const channelTitle = decodeXml(
        entry.match(/<name>(.*?)<\/name>/)?.[1] || "Hidden Tunes"
      );

      return normalizeYouTubeItem({
        id: videoId,
        videoId,
        title,
        artist: channelTitle,
        channelTitle,
        thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      });
    })
    .filter(Boolean);

  return {
    source: feedUrl,
    channelId: HIDDEN_TUNES_CHANNEL_ID,
    channelUrl: HIDDEN_TUNES_CHANNEL_URL,
    mode: "youtube_rss",
    tracks: dedupeTracks(tracks).slice(0, safeLimit),
  };
}

async function searchYouTubeSafe(query, limit = 20) {
  const safeLimit = Math.min(Number(limit || 20), 20);

  try {
    const result = await ytdlp(`ytsearch${safeLimit}:${query}`, {
      dumpSingleJson: true,
      skipDownload: true,
      noWarnings: true,
      noPlaylist: true,
      flatPlaylist: false,
    });

    const tracks = (result?.entries || [])
      .map(normalizeYouTubeItem)
      .filter(Boolean);

    return dedupeTracks(tracks);
  } catch (error) {
    console.log("yt-dlp blocked or failed. Using fallback.", error.message);
    return [];
  }
}

async function getM4aUrl(videoId) {
  const safeVideoId = extractYouTubeId(videoId);

  if (!safeVideoId) {
    throw new Error("Missing or invalid YouTube video ID");
  }

  if (streamCache.has(safeVideoId)) {
    return streamCache.get(safeVideoId);
  }

  const videoUrl = `https://www.youtube.com/watch?v=${safeVideoId}`;

  const rawUrl = await ytdlp(videoUrl, {
    getUrl: true,
    noWarnings: true,
    noPlaylist: true,
    format: "140/bestaudio[ext=m4a]/bestaudio",
  });

  const streamUrl = String(rawUrl || "").split("\n")[0].trim();

  streamCache.set(safeVideoId, streamUrl);

  return streamUrl;
}

app.get("/", (req, res) => {
  res.json({
    status: "Hidden Tunes backend running",
    playback: "YouTube WebView discovery",
    hiddenTunesCatalog: "Supabase + Cloudflare R2",
    routes: [
      "/api/health",
      "/api/songs",
      "/api/songs/:id/lyrics",
      "/admin/upload/song",
      "/api/youtube/search?q=burna",
      "/api/youtube/trending",
      "/api/youtube/hidden-tunes",
      "/api/youtube/audio/:videoId",
      "/api/youtube/stream/:videoId",
    ],
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    status: "connected",
    service: "Hidden Tunes backend",
  });
});

app.get("/api/songs/:id/lyrics", async (req, res) => {
  try {
    const songId = String(req.params.id || "").trim();

    if (!songId) {
      return res.status(400).json({
        success: false,
        error: "Missing song id.",
      });
    }

    const { data, error } = await supabaseAdmin
      .from("track_lyrics")
      .select("*")
      .eq("song_id", songId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        error: "No lyrics found.",
        songId,
      });
    }

    return res.json({
      success: true,
      songId: data.song_id,
      lyrics_type: data.lyrics_type,
      lyricsType: data.lyrics_type,
      synced_lrc: data.synced_lrc,
      syncedLrc: data.synced_lrc,
      lrc: data.synced_lrc,
      plain_lyrics: data.plain_lyrics,
      plainLyrics: data.plain_lyrics,
      lyrics: data.plain_lyrics,
      lyrics_url: data.lyrics_url,
      lyricsUrl: data.lyrics_url,
      source: data.source,
    });
  } catch (error) {
    console.error("Lyrics fetch failed:", error);

    return res.status(500).json({
      success: false,
      error: error?.message || "Lyrics fetch failed.",
    });
  }
});

app.get("/api/youtube/search", async (req, res) => {
  const query = String(req.query.q || "").trim();
  const limit = Math.min(Number(req.query.limit || 20), 20);

  if (!query) {
    return res.status(400).json({ error: "Missing search query" });
  }

  try {
    const tracks = await searchYouTubeSafe(query, limit);

    if (tracks.length > 0) {
      return res.json({
        query,
        mode: "yt_dlp_search",
        tracks,
      });
    }

    const fallback = await fetchHiddenTunesRss(limit);

    return res.json({
      query,
      mode: "rss_fallback",
      tracks: fallback.tracks,
    });
  } catch (error) {
    console.error("YouTube search fallback error:", error);

    return res.json({
      query,
      mode: "safe_empty_fallback",
      tracks: [],
    });
  }
});

app.get("/api/youtube/trending", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 20), 20);

  const query = String(
    req.query.q || "trending afrobeat music amapiano afrobeats dancehall"
  ).trim();

  try {
    const tracks = await searchYouTubeSafe(query, limit);

    if (tracks.length > 0) {
      return res.json({
        title: "Trending YouTube",
        query,
        mode: "yt_dlp_trending",
        tracks,
      });
    }

    const fallback = await fetchHiddenTunesRss(limit);

    return res.json({
      title: "Hidden Tunes Trending",
      query,
      mode: "rss_fallback",
      tracks: fallback.tracks,
    });
  } catch (error) {
    console.error("YouTube trending fallback error:", error);

    return res.json({
      title: "Hidden Tunes Trending",
      query,
      mode: "safe_empty_fallback",
      tracks: [],
    });
  }
});

app.get("/api/youtube/hidden-tunes", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 20), 20);
    const catalog = await fetchHiddenTunesRss(limit);

    return res.json({
      title: "Hidden Tunes Catalog",
      mode: catalog.mode,
      tracks: catalog.tracks,
    });
  } catch (error) {
    console.error("Hidden Tunes RSS failed:", error);

    return res.json({
      title: "Hidden Tunes Catalog",
      mode: "safe_empty_fallback",
      tracks: [],
    });
  }
});

app.get("/api/youtube/audio/:videoId", async (req, res) => {
  try {
    const safeVideoId = extractYouTubeId(req.params.videoId);
    const streamUrl = await getM4aUrl(safeVideoId);

    return res.json({
      videoId: safeVideoId,
      streamUrl,
      format: "m4a",
    });
  } catch (error) {
    console.error("YouTube audio failed:", error);

    return res.status(500).json({
      error: "Failed to get YouTube m4a audio",
      details: error.message,
    });
  }
});

app.get("/api/youtube/stream/:videoId", async (req, res) => {
  try {
    const safeVideoId = extractYouTubeId(req.params.videoId);
    const streamUrl = await getM4aUrl(safeVideoId);

    return res.json({
      videoId: safeVideoId,
      streamUrl,
      format: "m4a",
    });
  } catch (error) {
    console.error("YouTube stream failed:", error);

    return res.status(500).json({
      error: "Failed to get YouTube m4a stream",
      details: error.message,
    });
  }
});

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Hidden Tunes backend running on port ${PORT}`);
});