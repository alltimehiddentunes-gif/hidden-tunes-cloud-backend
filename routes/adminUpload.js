import express from "express";
import multer from "multer";
import crypto from "crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { parseBuffer } from "music-metadata";

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

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function makeUniqueSlug(base, id) {
  const safeBase = slugify(base) || "hidden-tunes";
  return `${safeBase}-${String(id).slice(0, 8)}`;
}

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

async function findOrCreateArtist({ artist, artistSlug, artworkUrl }) {
  const { data: existingArtists, error: findError } = await supabase
    .from("artists")
    .select("*")
    .or(`name.eq.${artist},slug.eq.${artistSlug}`)
    .order("created_at", { ascending: true })
    .limit(1);

  if (findError) throw findError;

  if (Array.isArray(existingArtists) && existingArtists.length > 0) {
    const existingArtist = existingArtists[0];

    if (!existingArtist.image_url && artworkUrl) {
      await supabase
        .from("artists")
        .update({ image_url: artworkUrl })
        .eq("id", existingArtist.id);
    }

    return existingArtist;
  }

  const { data: newArtists, error: artistError } = await supabase
    .from("artists")
    .insert({
      name: artist,
      slug: artistSlug,
      image_url: artworkUrl,
    })
    .select()
    .limit(1);

  if (artistError) throw artistError;

  return newArtists?.[0];
}

async function findOrCreateAlbum({
  album,
  albumSlug,
  artistId,
  artworkUrl,
  releaseYear,
}) {
  const { data: existingAlbums, error: findError } = await supabase
    .from("albums")
    .select("*")
    .eq("title", album)
    .eq("artist_id", artistId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (findError) throw findError;

  if (Array.isArray(existingAlbums) && existingAlbums.length > 0) {
    const existingAlbum = existingAlbums[0];

    if (!existingAlbum.artwork_url && artworkUrl) {
      await supabase
        .from("albums")
        .update({ artwork_url: artworkUrl })
        .eq("id", existingAlbum.id);
    }

    return existingAlbum;
  }

  const { data: newAlbums, error: albumError } = await supabase
    .from("albums")
    .insert({
      title: album,
      slug: albumSlug,
      artist_id: artistId,
      artwork_url: artworkUrl,
      release_year: releaseYear,
    })
    .select()
    .limit(1);

  if (albumError) throw albumError;

  return newAlbums?.[0];
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
        return res.status(400).json({
          error: "MP3 song file is required.",
        });
      }

      const id = crypto.randomUUID();

      const title = String(
        req.body.title ||
          songFile.originalname.replace(/\.[^/.]+$/, "") ||
          "Untitled Song"
      ).trim();

      const artist = String(req.body.artist || "Unknown Artist").trim();
      const album = String(req.body.album || "Singles").trim();
      const genre = String(req.body.genre || "Afrobeat").trim();
      const mood = String(req.body.mood || "Premium").trim();

      const releaseYear = Number(
        req.body.releaseYear || new Date().getFullYear()
      );

      const artistSlug = slugify(artist) || "unknown-artist";
      const albumSlug = makeUniqueSlug(`${artist}-${album}`, id);
      const songSlug = makeUniqueSlug(`${artist}-${title}`, id);

      let duration = Number(req.body.duration || 0);

      try {
        const metadata = await parseBuffer(songFile.buffer, songFile.mimetype);
        duration = Math.round(metadata.format.duration || duration || 0);
      } catch {
        duration = duration || 0;
      }

      const safeArtist = artistSlug;
      const safeTitle = slugify(title) || "untitled-song";

      const songExt = songFile.originalname.split(".").pop() || "mp3";
      const songKey = `songs/${safeArtist}/${id}-${safeTitle}.${songExt}`;

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

        if (lyricsFile.originalname.toLowerCase().endsWith(".lrc")) {
          syncedLyrics = rawLyrics;
        } else {
          lyricsText = rawLyrics;
        }
      }

      const artistRecord = await findOrCreateArtist({
        artist,
        artistSlug,
        artworkUrl,
      });

      if (!artistRecord?.id) {
        throw new Error("Could not create or find artist.");
      }

      const albumRecord = await findOrCreateAlbum({
        album,
        albumSlug,
        artistId: artistRecord.id,
        artworkUrl,
        releaseYear,
      });

      if (!albumRecord?.id) {
        throw new Error("Could not create or find album.");
      }

      const { data: insertedSongs, error: songError } = await supabase
        .from("songs")
        .insert({
          id,
          slug: songSlug,
          title,
          artist,
          artist_id: artistRecord.id,
          album,
          album_id: albumRecord.id,
          genre,
          mood,
          duration,
          audio_url: songUrl,
          artwork_url: artworkUrl,
          source_name: "Hidden Tunes",
          type: "r2",
          is_online: true,
          lyrics: lyricsText,
          synced_lyrics: syncedLyrics,
          release_year: Number.isFinite(releaseYear)
            ? releaseYear
            : new Date().getFullYear(),
        })
        .select()
        .limit(1);

      if (songError) throw songError;

      const song = insertedSongs?.[0];

      if (!song) {
        throw new Error("Song uploaded but database row was not returned.");
      }

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

export default router;