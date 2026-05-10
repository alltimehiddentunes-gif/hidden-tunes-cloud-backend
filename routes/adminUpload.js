const express = require("express");
const multer = require("multer");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { createClient } = require("@supabase/supabase-js");
const { v4: uuidv4 } = require("uuid");
const mm = require("music-metadata");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 80 * 1024 * 1024,
  },
});

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function uploadToR2({ key, body, contentType }) {
  await r2.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  return `${process.env.R2_PUBLIC_URL}/${key}`;
}

router.post(
  "/song",
  upload.fields([
    { name: "song", maxCount: 1 },
    { name: "cover", maxCount: 1 },
    { name: "lyrics", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const songFile = req.files?.song?.[0];
      const coverFile = req.files?.cover?.[0];
      const lyricsFile = req.files?.lyrics?.[0];

      if (!songFile) {
        return res.status(400).json({ error: "MP3 song file is required." });
      }

      const id = uuidv4();

      const title =
        req.body.title ||
        songFile.originalname.replace(/\.[^/.]+$/, "") ||
        "Untitled Song";

      const artist = req.body.artist || "Unknown Artist";
      const album = req.body.album || "Singles";
      const genre = req.body.genre || "Afrobeat";
      const mood = req.body.mood || "Premium";
      const releaseYear = req.body.releaseYear || new Date().getFullYear();

      let duration = Number(req.body.duration || 0);

      try {
        const metadata = await mm.parseBuffer(songFile.buffer, songFile.mimetype);
        duration = Math.round(metadata.format.duration || duration || 0);
      } catch {
        duration = duration || 0;
      }

      const safeArtist = artist.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");

      const songKey = `songs/${safeArtist}/${id}-${safeTitle}.mp3`;

      const songUrl = await uploadToR2({
        key: songKey,
        body: songFile.buffer,
        contentType: songFile.mimetype || "audio/mpeg",
      });

      let artworkUrl = null;

      if (coverFile) {
        const coverExt = coverFile.originalname.split(".").pop() || "jpg";
        const coverKey = `artwork/${safeArtist}/${id}-${safeTitle}.${coverExt}`;

        artworkUrl = await uploadToR2({
          key: coverKey,
          body: coverFile.buffer,
          contentType: coverFile.mimetype || "image/jpeg",
        });
      }

      let lyricsText = null;
      let syncedLyrics = null;

      if (lyricsFile) {
        const rawLyrics = lyricsFile.buffer.toString("utf8");

        if (lyricsFile.originalname.endsWith(".lrc")) {
          syncedLyrics = rawLyrics;
        } else {
          lyricsText = rawLyrics;
        }
      }

      let artistId = null;
      let albumId = null;

      const { data: existingArtist } = await supabase
        .from("artists")
        .select("*")
        .eq("name", artist)
        .maybeSingle();

      if (existingArtist) {
        artistId = existingArtist.id;
      } else {
        const { data: newArtist, error: artistError } = await supabase
          .from("artists")
          .insert({
            name: artist,
            image_url: artworkUrl,
          })
          .select()
          .single();

        if (artistError) throw artistError;
        artistId = newArtist.id;
      }

      const { data: existingAlbum } = await supabase
        .from("albums")
        .select("*")
        .eq("title", album)
        .eq("artist_id", artistId)
        .maybeSingle();

      if (existingAlbum) {
        albumId = existingAlbum.id;
      } else {
        const { data: newAlbum, error: albumError } = await supabase
          .from("albums")
          .insert({
            title: album,
            artist_id: artistId,
            artwork_url: artworkUrl,
            release_year: releaseYear,
          })
          .select()
          .single();

        if (albumError) throw albumError;
        albumId = newAlbum.id;
      }

      const { data: song, error: songError } = await supabase
        .from("songs")
        .insert({
          id,
          title,
          artist,
          artist_id: artistId,
          album,
          album_id: albumId,
          genre,
          mood,
          duration,
          url: songUrl,
          artwork: artworkUrl,
          source_name: "Hidden Tunes",
          type: "r2",
          is_online: true,
          lyrics: lyricsText,
          synced_lyrics: syncedLyrics,
          release_year: releaseYear,
        })
        .select()
        .single();

      if (songError) throw songError;

      return res.json({
        success: true,
        song,
      });
    } catch (error) {
      console.error("Admin upload error:", error);
      return res.status(500).json({
        error: "Upload failed",
        details: error.message,
      });
    }
  }
);

module.exports = router;