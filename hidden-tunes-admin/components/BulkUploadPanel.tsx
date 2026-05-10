"use client";

import { useEffect, useMemo, useState } from "react";

type UploadStatus = "queued" | "uploading" | "done" | "failed";

type UploadItem = {
  id: string;
  file: File;
  title: string;
  cover?: File;
  lyrics?: File;
  progress: number;
  status: UploadStatus;
  error?: string;
  result?: any;
};

type ArtistOption = {
  id: string;
  name: string;
  slug?: string;
  image_url?: string;
};

const MAX_PARALLEL_UPLOADS = 3;

const COLLECTION_TYPES = [
  "Singles",
  "Album",
  "EP",
  "Radio",
  "Live Session",
  "Playlist",
  "Podcast",
];

const GENRES = [
  "Afrobeat",
  "Afrobeats",
  "Afro Gospel",
  "Afro Soul",
  "Afro Pop",
  "Amapiano",
  "Gospel",
  "Worship",
  "Highlife",
  "Dancehall",
  "Reggae",
  "Hip Hop",
  "R&B",
  "Soul",
  "Pop",
  "Instrumental",
];

const MOODS = [
  "Premium",
  "Worship",
  "Praise",
  "Emotional",
  "Romantic",
  "Happy",
  "Dance",
  "Chill",
  "Deep",
  "Inspirational",
  "Motivational",
  "Street",
  "Club",
  "Relaxing",
  "Sad",
  "Spiritual",
];

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function cleanTitleFromFile(fileName: string) {
  return fileName
    .replace(/\.[^/.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getFileName(file: File) {
  return String(file.name || "").toLowerCase();
}

function isAudioFile(file: File) {
  const name = getFileName(file);

  return (
    file.type.startsWith("audio/") ||
    name.endsWith(".mp3") ||
    name.endsWith(".m4a") ||
    name.endsWith(".wav") ||
    name.endsWith(".aac")
  );
}

function isImageFile(file: File) {
  const name = getFileName(file);

  return (
    file.type.startsWith("image/") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".png") ||
    name.endsWith(".webp")
  );
}

function isLyricsFile(file: File) {
  const name = getFileName(file);

  return (
    name.endsWith(".lrc") ||
    name.endsWith(".txt") ||
    file.type === "text/plain"
  );
}

function baseName(fileName: string) {
  return fileName.replace(/\.[^/.]+$/, "").toLowerCase().trim();
}

export default function BulkUploadPanel() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [lastSelectionMessage, setLastSelectionMessage] = useState("");

  const [artists, setArtists] = useState<ArtistOption[]>([]);
  const [defaultArtist, setDefaultArtist] = useState("Caasi Wills");
  const [defaultAlbum, setDefaultAlbum] = useState("Singles");
  const [defaultGenre, setDefaultGenre] = useState("Afro Gospel");
  const [defaultMood, setDefaultMood] = useState("Worship");

  useEffect(() => {
    async function loadArtists() {
      try {
        const res = await fetch("/api/admin/artists");
        const json = await res.json();

        if (json.success && Array.isArray(json.artists)) {
          setArtists(json.artists);
        }
      } catch (error) {
        console.error("Failed to load artists:", error);
      }
    }

    loadArtists();
  }, []);

  const stats = useMemo(() => {
    return {
      total: items.length,
      withCovers: items.filter((item) => item.cover).length,
      withLyrics: items.filter((item) => item.lyrics).length,
      done: items.filter((item) => item.status === "done").length,
      failed: items.filter((item) => item.status === "failed").length,
      uploading: items.filter((item) => item.status === "uploading").length,
    };
  }, [items]);

  function addFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) {
      setLastSelectionMessage("No files selected.");
      return;
    }

    const files = Array.from(fileList);
    const audioFiles = files.filter(isAudioFile);
    const imageFiles = files.filter(isImageFile);
    const lyricsFiles = files.filter(isLyricsFile);

    if (audioFiles.length === 0) {
      setLastSelectionMessage(
        `Selected ${files.length} file(s), but no audio file was detected. Try selecting an .mp3 directly.`
      );
      return;
    }

    const newItems: UploadItem[] = audioFiles.map((audio) => {
      const audioBase = baseName(audio.name);

      const matchedCover = imageFiles.find(
        (image) => baseName(image.name) === audioBase
      );

      const matchedLyrics = lyricsFiles.find(
        (lyrics) => baseName(lyrics.name) === audioBase
      );

      return {
        id: makeId(),
        file: audio,
        title: cleanTitleFromFile(audio.name),
        cover: matchedCover,
        lyrics: matchedLyrics,
        progress: 0,
        status: "queued",
      };
    });

    setItems((current) => [...current, ...newItems]);

    setLastSelectionMessage(
      `Added ${newItems.length} audio file(s). Covers matched: ${
        newItems.filter((item) => item.cover).length
      }. Lyrics matched: ${newItems.filter((item) => item.lyrics).length}.`
    );
  }

  function updateItemTitle(id: string, title: string) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, title } : item))
    );
  }

  function updateItemCover(id: string, cover?: File) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, cover } : item))
    );
  }

  function updateItemLyrics(id: string, lyrics?: File) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, lyrics } : item))
    );
  }

  function removeItem(id: string) {
    if (isUploading) return;
    setItems((current) => current.filter((item) => item.id !== id));
  }

  function uploadOne(item: UploadItem): Promise<void> {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();

      formData.append("audio", item.file);
      formData.append("titleOverride", item.title);
      formData.append("defaultArtist", defaultArtist);
      formData.append("defaultAlbum", defaultAlbum);
      formData.append("defaultGenre", defaultGenre);
      formData.append("defaultMood", defaultMood);

      if (item.cover) {
        formData.append("cover", item.cover);
      }

      if (item.lyrics) {
        formData.append("lyrics", item.lyrics);
      }

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;

        const progress = Math.round((event.loaded / event.total) * 100);

        setItems((current) =>
          current.map((entry) =>
            entry.id === item.id
              ? { ...entry, progress, status: "uploading" }
              : entry
          )
        );
      };

      xhr.onload = () => {
        try {
          const response = JSON.parse(xhr.responseText);

          if (xhr.status >= 200 && xhr.status < 300 && response.success) {
            setItems((current) =>
              current.map((entry) =>
                entry.id === item.id
                  ? {
                      ...entry,
                      progress: 100,
                      status: "done",
                      result: response.track,
                    }
                  : entry
              )
            );

            const uploadedArtist = response.track?.artist;

            if (
              uploadedArtist &&
              !artists.some(
                (artist) =>
                  artist.name.toLowerCase() === uploadedArtist.toLowerCase()
              )
            ) {
              setArtists((current) =>
                [...current, { id: uploadedArtist, name: uploadedArtist }].sort(
                  (a, b) => a.name.localeCompare(b.name)
                )
              );
            }
          } else {
            setItems((current) =>
              current.map((entry) =>
                entry.id === item.id
                  ? {
                      ...entry,
                      status: "failed",
                      error: response.error || "Upload failed.",
                    }
                  : entry
              )
            );
          }
        } catch {
          setItems((current) =>
            current.map((entry) =>
              entry.id === item.id
                ? {
                    ...entry,
                    status: "failed",
                    error: "Invalid server response.",
                  }
                : entry
            )
          );
        }

        resolve();
      };

      xhr.onerror = () => {
        setItems((current) =>
          current.map((entry) =>
            entry.id === item.id
              ? { ...entry, status: "failed", error: "Network error." }
              : entry
          )
        );

        resolve();
      };

      xhr.open("POST", "/api/admin/upload-track");
      xhr.send(formData);
    });
  }

  async function startUpload() {
    setIsUploading(true);

    const queued = items.filter(
      (item) => item.status === "queued" || item.status === "failed"
    );

    for (let i = 0; i < queued.length; i += MAX_PARALLEL_UPLOADS) {
      const batch = queued.slice(i, i + MAX_PARALLEL_UPLOADS);
      await Promise.all(batch.map(uploadOne));
    }

    setIsUploading(false);
  }

  function clearAll() {
    if (isUploading) return;
    setItems([]);
    setLastSelectionMessage("");
  }

  return (
    <div className="min-h-screen bg-[#050509] px-6 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10">
          <p className="text-sm uppercase tracking-[0.35em] text-yellow-400">
            Hidden Tunes Admin
          </p>

          <h1 className="mt-4 text-5xl font-black">Premium Bulk Upload</h1>

          <p className="mt-4 max-w-3xl text-zinc-400">
            Upload MP3 files, matching cover images, and matching synced lyrics.
            Example: Divinity.mp3 + Divinity.jpg + Divinity.lrc.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <select
              value={defaultArtist}
              onChange={(e) => setDefaultArtist(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/30 p-4 text-white"
            >
              <option value={defaultArtist} className="bg-black">
                {defaultArtist || "Select Artist"}
              </option>

              {artists.map((artist) => (
                <option key={artist.id} value={artist.name} className="bg-black">
                  {artist.name}
                </option>
              ))}
            </select>

            <input
              value={defaultArtist}
              onChange={(e) => setDefaultArtist(e.target.value)}
              placeholder="Or type new artist"
              className="mt-3 w-full rounded-2xl border border-white/10 bg-black/30 p-4 text-white"
            />
          </div>

          <select
            value={defaultAlbum}
            onChange={(e) => setDefaultAlbum(e.target.value)}
            className="rounded-2xl border border-white/10 bg-black/30 p-4 text-white"
          >
            {COLLECTION_TYPES.map((type) => (
              <option key={type} value={type} className="bg-black">
                {type}
              </option>
            ))}
          </select>

          <select
            value={defaultGenre}
            onChange={(e) => setDefaultGenre(e.target.value)}
            className="rounded-2xl border border-white/10 bg-black/30 p-4 text-white"
          >
            {GENRES.map((genre) => (
              <option key={genre} value={genre} className="bg-black">
                {genre}
              </option>
            ))}
          </select>

          <select
            value={defaultMood}
            onChange={(e) => setDefaultMood(e.target.value)}
            className="rounded-2xl border border-white/10 bg-black/30 p-4 text-white"
          >
            {MOODS.map((mood) => (
              <option key={mood} value={mood} className="bg-black">
                {mood}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-8">
          <h2 className="text-2xl font-bold">Upload Music + Covers + Lyrics</h2>

          <p className="mt-2 text-zinc-400">
            Select everything together. The system auto-pairs files by name:
            Divinity.mp3 + Divinity.jpg + Divinity.lrc.
          </p>

          <input
            type="file"
            multiple
            accept="audio/*,image/*,.mp3,.m4a,.wav,.aac,.jpg,.jpeg,.png,.webp,.lrc,.txt"
            onChange={(event) => {
              addFiles(event.target.files);
              event.currentTarget.value = "";
            }}
            className="mt-6 block w-full rounded-2xl border border-white/10 bg-black/30 p-4 text-white"
          />

          {lastSelectionMessage ? (
            <p className="mt-3 text-sm text-yellow-300">
              {lastSelectionMessage}
            </p>
          ) : null}
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-6">
          <Stat label="Total" value={stats.total} />
          <Stat label="Covers" value={stats.withCovers} />
          <Stat label="Lyrics" value={stats.withLyrics} />
          <Stat label="Uploading" value={stats.uploading} />
          <Stat label="Done" value={stats.done} />
          <Stat label="Failed" value={stats.failed} />
        </div>

        <div className="mt-8 flex gap-4">
          <button
            onClick={startUpload}
            disabled={isUploading || items.length === 0}
            className="rounded-2xl bg-yellow-400 px-6 py-4 font-bold text-black disabled:opacity-50"
          >
            {isUploading ? "Uploading..." : "Start Upload"}
          </button>

          <button
            onClick={clearAll}
            disabled={isUploading}
            className="rounded-2xl border border-red-400/30 px-6 py-4 font-bold text-red-300 disabled:opacity-50"
          >
            Clear
          </button>
        </div>

        <div className="mt-10 space-y-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"
            >
              <div className="grid gap-5 md:grid-cols-[96px_1fr_auto] md:items-start">
                <div className="h-24 w-24 overflow-hidden rounded-2xl border border-white/10 bg-black/40">
                  {item.cover ? (
                    <img
                      src={URL.createObjectURL(item.cover)}
                      alt="Cover preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-zinc-500">
                      No Cover
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="font-bold">{item.file.name}</h3>

                  <p className="mt-1 text-sm text-zinc-400">
                    {(item.file.size / 1024 / 1024).toFixed(2)} MB
                  </p>

                  <input
                    value={item.title}
                    onChange={(e) => updateItemTitle(item.id, e.target.value)}
                    placeholder="Song title"
                    className="mt-4 w-full rounded-2xl border border-white/10 bg-black/30 p-3 text-white"
                  />

                  <input
                    type="file"
                    accept="image/*,.jpg,.jpeg,.png,.webp"
                    onChange={(event) => {
                      updateItemCover(item.id, event.target.files?.[0]);
                      event.currentTarget.value = "";
                    }}
                    className="mt-3 block w-full rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-white"
                  />

                  {item.cover ? (
                    <p className="mt-2 text-xs text-green-300">
                      Cover attached: {item.cover.name}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-zinc-500">
                      No cover attached. Embedded artwork or fallback image will
                      be used.
                    </p>
                  )}

                  <input
                    type="file"
                    accept=".lrc,.txt,text/plain"
                    onChange={(event) => {
                      updateItemLyrics(item.id, event.target.files?.[0]);
                      event.currentTarget.value = "";
                    }}
                    className="mt-3 block w-full rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-white"
                  />

                  {item.lyrics ? (
                    <p className="mt-2 text-xs text-cyan-300">
                      Lyrics attached: {item.lyrics.name}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-zinc-500">
                      No lyrics attached. Add .lrc for synced lyrics or .txt for
                      plain lyrics.
                    </p>
                  )}

                  {item.error ? (
                    <p className="mt-2 text-sm text-red-400">{item.error}</p>
                  ) : null}
                </div>

                <div className="flex flex-col items-end gap-3">
                  <div className="rounded-full bg-white/10 px-4 py-2 text-xs uppercase tracking-wide">
                    {item.status}
                  </div>

                  <button
                    onClick={() => removeItem(item.id)}
                    disabled={isUploading}
                    className="rounded-full border border-red-400/30 px-4 py-2 text-xs text-red-300 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-yellow-400 transition-all"
                  style={{ width: `${item.progress}%` }}
                />
              </div>

              {item.result ? (
                <div className="mt-4 rounded-2xl bg-black/30 p-4 text-sm text-zinc-300">
                  <p>
                    <strong>Title:</strong> {item.result.title}
                  </p>
                  <p>
                    <strong>Artist:</strong> {item.result.artist}
                  </p>
                  <p>
                    <strong>Collection:</strong> {item.result.album}
                  </p>
                  <p>
                    <strong>Genre:</strong> {item.result.genre}
                  </p>
                  <p>
                    <strong>Mood:</strong> {item.result.mood}
                  </p>
                  <p>
                    <strong>Duration:</strong> {item.result.duration_seconds}s
                  </p>
                  <p>
                    <strong>Artwork:</strong> {item.result.artworkSource}
                  </p>
                  <p>
                    <strong>Lyrics:</strong>{" "}
                    {item.result.hasLyrics
                      ? `${item.result.lyricsType || "attached"} lyrics saved`
                      : "No lyrics"}
                  </p>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <p className="text-sm uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-3 text-4xl font-black">{value}</p>
    </div>
  );
}