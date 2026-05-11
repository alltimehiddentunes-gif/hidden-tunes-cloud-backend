"use client";

import { useMemo, useRef, useState } from "react";

type UploadStatus = "idle" | "ready" | "uploading" | "success" | "error";

type TrackUploadItem = {
  id: string;
  file: File;
  title: string;
  artist: string;
  album: string;
  genre: string;
  mood: string;
  duration: number;
  artworkFile?: File | null;
  lyricsFile?: File | null;
  lrcFile?: File | null;
  status: UploadStatus;
  progress: number;
  error?: string;
};

const API_UPLOAD_URL = "/api/admin/upload-track";

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function cleanName(value: string) {
  return value
    .replace(/\.[^/.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchKey(value: string) {
  return cleanName(value).toLowerCase();
}

function guessMetadata(file: File) {
  const name = cleanName(file.name);

  if (name.includes(" - ")) {
    const [artist, ...rest] = name.split(" - ");
    return {
      artist: artist?.trim() || "Unknown Artist",
      title: rest.join(" - ").trim() || name,
    };
  }

  return {
    artist: "Caasi Wills",
    title: name || "Untitled Song",
  };
}

function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(file);

    audio.preload = "metadata";
    audio.src = url;

    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration)
        ? Math.round(audio.duration)
        : 0;

      URL.revokeObjectURL(url);
      resolve(duration);
    };

    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
  });
}

function isAudioFile(file: File) {
  return (
    file.type.startsWith("audio/") ||
    file.name.toLowerCase().endsWith(".mp3") ||
    file.name.toLowerCase().endsWith(".wav") ||
    file.name.toLowerCase().endsWith(".m4a")
  );
}

function isArtworkFile(file: File) {
  return (
    file.type.startsWith("image/") ||
    file.name.toLowerCase().endsWith(".jpg") ||
    file.name.toLowerCase().endsWith(".jpeg") ||
    file.name.toLowerCase().endsWith(".png") ||
    file.name.toLowerCase().endsWith(".webp")
  );
}

function isLyricsFile(file: File) {
  return (
    file.name.toLowerCase().endsWith(".txt") ||
    file.name.toLowerCase().endsWith(".lyrics")
  );
}

function isLrcFile(file: File) {
  return file.name.toLowerCase().endsWith(".lrc");
}

function buildFileMap(files: File[]) {
  const map = new Map<string, File>();

  files.forEach((file) => {
    map.set(matchKey(file.name), file);
  });

  return map;
}

export default function BulkUploadPanel() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const artworkInputRef = useRef<HTMLInputElement | null>(null);
  const lyricsInputRef = useRef<HTMLInputElement | null>(null);
  const lrcInputRef = useRef<HTMLInputElement | null>(null);

  const [items, setItems] = useState<TrackUploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [defaultArtist, setDefaultArtist] = useState("Caasi Wills");
  const [defaultAlbum, setDefaultAlbum] = useState("Singles");
  const [defaultGenre, setDefaultGenre] = useState("Afrobeat");
  const [defaultMood, setDefaultMood] = useState("Premium");
  const [globalArtwork, setGlobalArtwork] = useState<File | null>(null);
  const [globalLyrics, setGlobalLyrics] = useState<File | null>(null);
  const [globalLrc, setGlobalLrc] = useState<File | null>(null);

  const [bulkArtworkFiles, setBulkArtworkFiles] = useState<File[]>([]);
  const [bulkLyricsFiles, setBulkLyricsFiles] = useState<File[]>([]);
  const [bulkLrcFiles, setBulkLrcFiles] = useState<File[]>([]);

  const [isUploadingAll, setIsUploadingAll] = useState(false);

  const artworkMap = useMemo(() => buildFileMap(bulkArtworkFiles), [bulkArtworkFiles]);
  const lyricsMap = useMemo(() => buildFileMap(bulkLyricsFiles), [bulkLyricsFiles]);
  const lrcMap = useMemo(() => buildFileMap(bulkLrcFiles), [bulkLrcFiles]);

  const stats = useMemo(() => {
    const total = items.length;
    const success = items.filter((item) => item.status === "success").length;
    const error = items.filter((item) => item.status === "error").length;
    const uploading = items.filter((item) => item.status === "uploading").length;

    return { total, success, error, uploading };
  }, [items]);

  function findMatchingFile(file: File, map: Map<string, File>) {
    const key = matchKey(file.name);
    return map.get(key) || null;
  }

  async function addFiles(files: FileList | File[]) {
    const allFiles = Array.from(files);

    const audioFiles = allFiles.filter(isAudioFile);
    const artworkFiles = allFiles.filter(isArtworkFile);
    const lyricsFiles = allFiles.filter(isLyricsFile);
    const lrcFiles = allFiles.filter(isLrcFile);

    const nextArtworkFiles = artworkFiles.length
      ? [...bulkArtworkFiles, ...artworkFiles]
      : bulkArtworkFiles;

    const nextLyricsFiles = lyricsFiles.length
      ? [...bulkLyricsFiles, ...lyricsFiles]
      : bulkLyricsFiles;

    const nextLrcFiles = lrcFiles.length
      ? [...bulkLrcFiles, ...lrcFiles]
      : bulkLrcFiles;

    const nextArtworkMap = buildFileMap(nextArtworkFiles);
    const nextLyricsMap = buildFileMap(nextLyricsFiles);
    const nextLrcMap = buildFileMap(nextLrcFiles);

    if (artworkFiles.length) setBulkArtworkFiles(nextArtworkFiles);
    if (lyricsFiles.length) setBulkLyricsFiles(nextLyricsFiles);
    if (lrcFiles.length) setBulkLrcFiles(nextLrcFiles);

    const prepared: TrackUploadItem[] = [];

    for (const file of audioFiles) {
      const guessed = guessMetadata(file);
      const duration = await getAudioDuration(file);

      prepared.push({
        id: makeId(),
        file,
        title: guessed.title,
        artist: guessed.artist || defaultArtist,
        album: defaultAlbum,
        genre: defaultGenre,
        mood: defaultMood,
        duration,
        artworkFile: findMatchingFile(file, nextArtworkMap) || globalArtwork,
        lyricsFile: findMatchingFile(file, nextLyricsMap) || globalLyrics,
        lrcFile: findMatchingFile(file, nextLrcMap) || globalLrc,
        status: "ready",
        progress: 0,
      });
    }

    setItems((current) => {
      const updated = current.map((item) => ({
        ...item,
        artworkFile:
          item.artworkFile || findMatchingFile(item.file, nextArtworkMap) || globalArtwork,
        lyricsFile:
          item.lyricsFile || findMatchingFile(item.file, nextLyricsMap) || globalLyrics,
        lrcFile: item.lrcFile || findMatchingFile(item.file, nextLrcMap) || globalLrc,
      }));

      return [...prepared, ...updated];
    });
  }

  function updateItem(id: string, patch: Partial<TrackUploadItem>) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  function removeItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  function clearCompleted() {
    setItems((current) => current.filter((item) => item.status !== "success"));
  }

  function matchAssetsToExistingSongs() {
    setItems((current) =>
      current.map((item) => ({
        ...item,
        artworkFile: findMatchingFile(item.file, artworkMap) || item.artworkFile || globalArtwork,
        lyricsFile: findMatchingFile(item.file, lyricsMap) || item.lyricsFile || globalLyrics,
        lrcFile: findMatchingFile(item.file, lrcMap) || item.lrcFile || globalLrc,
      }))
    );
  }

  async function uploadSingle(item: TrackUploadItem) {
    updateItem(item.id, {
      status: "uploading",
      progress: 10,
      error: undefined,
    });

    try {
      const formData = new FormData();

      formData.append("audio", item.file);
      formData.append("titleOverride", item.title);
      formData.append("defaultArtist", item.artist || defaultArtist);
      formData.append("defaultAlbum", item.album || defaultAlbum);
      formData.append("defaultGenre", item.genre || defaultGenre);
      formData.append("defaultMood", item.mood || defaultMood);

      if (item.artworkFile || globalArtwork) {
        formData.append("cover", item.artworkFile || globalArtwork!);
      }

      if (item.lrcFile || globalLrc) {
        formData.append("lyrics", item.lrcFile || globalLrc!);
      } else if (item.lyricsFile || globalLyrics) {
        formData.append("lyrics", item.lyricsFile || globalLyrics!);
      }

      updateItem(item.id, { progress: 45 });

      const response = await fetch(API_UPLOAD_URL, {
        method: "POST",
        body: formData,
      });

      updateItem(item.id, { progress: 80 });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.success) {
        throw new Error(
          data?.error ||
            data?.message ||
            `Upload failed with status ${response.status}`
        );
      }

      updateItem(item.id, {
        status: "success",
        progress: 100,
        error: undefined,
      });
    } catch (error: any) {
      updateItem(item.id, {
        status: "error",
        progress: 0,
        error: error?.message || "Upload failed",
      });
    }
  }

  async function uploadAll() {
    const pending = items.filter(
      (item) => item.status === "ready" || item.status === "error"
    );

    if (!pending.length) return;

    setIsUploadingAll(true);

    for (const item of pending) {
      await uploadSingle(item);
    }

    setIsUploadingAll(false);
  }

  function applyDefaultsToAll() {
    setItems((current) =>
      current.map((item) => ({
        ...item,
        artist: item.artist || defaultArtist,
        album: item.album || defaultAlbum,
        genre: item.genre || defaultGenre,
        mood: item.mood || defaultMood,
        artworkFile:
          item.artworkFile || findMatchingFile(item.file, artworkMap) || globalArtwork,
        lyricsFile: item.lyricsFile || findMatchingFile(item.file, lyricsMap) || globalLyrics,
        lrcFile: item.lrcFile || findMatchingFile(item.file, lrcMap) || globalLrc,
      }))
    );
  }

  return (
    <main className="min-h-screen bg-[#050508] text-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#17171f] via-[#0b0b10] to-black p-6 shadow-2xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.3em] text-yellow-400">
                Hidden Tunes Admin
              </p>

              <h1 className="text-3xl font-black tracking-tight sm:text-5xl">
                Bulk Upload Studio
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60 sm:text-base">
                Upload songs, matching artwork, lyrics, synced LRC files, create artists
                and albums, store tracks in Cloudflare R2, and insert catalog
                records into Supabase from one premium panel.
              </p>
            </div>

            <div className="grid grid-cols-4 gap-3 rounded-3xl border border-white/10 bg-white/[0.04] p-3 text-center">
              <div>
                <p className="text-2xl font-black">{stats.total}</p>
                <p className="text-xs text-white/45">Total</p>
              </div>

              <div>
                <p className="text-2xl font-black text-yellow-300">
                  {stats.uploading}
                </p>
                <p className="text-xs text-white/45">Uploading</p>
              </div>

              <div>
                <p className="text-2xl font-black text-emerald-300">
                  {stats.success}
                </p>
                <p className="text-xs text-white/45">Done</p>
              </div>

              <div>
                <p className="text-2xl font-black text-red-300">
                  {stats.error}
                </p>
                <p className="text-xs text-white/45">Errors</p>
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <aside className="flex flex-col gap-5">
            <div className="rounded-[2rem] border border-white/10 bg-[#101017] p-5 shadow-xl">
              <h2 className="text-lg font-black">Default Metadata</h2>

              <div className="mt-5 flex flex-col gap-4">
                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-white/45">
                    Artist
                  </span>
                  <input
                    value={defaultArtist}
                    onChange={(event) => setDefaultArtist(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none transition focus:border-yellow-400"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-white/45">
                    Album
                  </span>
                  <input
                    value={defaultAlbum}
                    onChange={(event) => setDefaultAlbum(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none transition focus:border-yellow-400"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-white/45">
                    Genre
                  </span>
                  <input
                    value={defaultGenre}
                    onChange={(event) => setDefaultGenre(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none transition focus:border-yellow-400"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-white/45">
                    Mood
                  </span>
                  <input
                    value={defaultMood}
                    onChange={(event) => setDefaultMood(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none transition focus:border-yellow-400"
                  />
                </label>

                <button
                  onClick={applyDefaultsToAll}
                  className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-black transition hover:scale-[1.01]"
                >
                  Apply Defaults To All
                </button>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-[#101017] p-5 shadow-xl">
              <h2 className="text-lg font-black">Assets</h2>

              <div className="mt-5 flex flex-col gap-3">
                <button
                  onClick={() => artworkInputRef.current?.click()}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-sm font-bold transition hover:border-yellow-400"
                >
                  Bulk Artwork:{" "}
                  <span className="text-white/50">
                    {bulkArtworkFiles.length
                      ? `${bulkArtworkFiles.length} images selected`
                      : globalArtwork?.name || "Choose one or many images"}
                  </span>
                </button>

                <button
                  onClick={() => lyricsInputRef.current?.click()}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-sm font-bold transition hover:border-yellow-400"
                >
                  Lyrics:{" "}
                  <span className="text-white/50">
                    {bulkLyricsFiles.length
                      ? `${bulkLyricsFiles.length} TXT files selected`
                      : globalLyrics?.name || "Choose TXT"}
                  </span>
                </button>

                <button
                  onClick={() => lrcInputRef.current?.click()}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-sm font-bold transition hover:border-yellow-400"
                >
                  Synced LRC:{" "}
                  <span className="text-white/50">
                    {bulkLrcFiles.length
                      ? `${bulkLrcFiles.length} LRC files selected`
                      : globalLrc?.name || "Choose LRC"}
                  </span>
                </button>

                <button
                  onClick={matchAssetsToExistingSongs}
                  className="rounded-2xl border border-yellow-400/30 bg-yellow-300/10 px-4 py-3 text-left text-sm font-black text-yellow-200 transition hover:bg-yellow-300/15"
                >
                  Match Assets To Songs
                </button>

                <p className="text-xs leading-5 text-white/45">
                  Best format: Lonely Road.mp3 + Lonely Road.jpg. If no matching
                  image exists, the uploader uses the shared artwork or embedded artwork.
                </p>

                <input
                  ref={artworkInputRef}
                  hidden
                  multiple
                  type="file"
                  accept="image/*,.jpg,.jpeg,.png,.webp"
                  onChange={(event) => {
                    const files = Array.from(event.target.files || []).filter(isArtworkFile);

                    if (!files.length) return;

                    if (files.length === 1) {
                      setGlobalArtwork(files[0]);
                    }

                    setBulkArtworkFiles((current) => [...current, ...files]);
                  }}
                />

                <input
                  ref={lyricsInputRef}
                  hidden
                  multiple
                  type="file"
                  accept=".txt,.lyrics"
                  onChange={(event) => {
                    const files = Array.from(event.target.files || []).filter(isLyricsFile);

                    if (!files.length) return;

                    if (files.length === 1) {
                      setGlobalLyrics(files[0]);
                    }

                    setBulkLyricsFiles((current) => [...current, ...files]);
                  }}
                />

                <input
                  ref={lrcInputRef}
                  hidden
                  multiple
                  type="file"
                  accept=".lrc"
                  onChange={(event) => {
                    const files = Array.from(event.target.files || []).filter(isLrcFile);

                    if (!files.length) return;

                    if (files.length === 1) {
                      setGlobalLrc(files[0]);
                    }

                    setBulkLrcFiles((current) => [...current, ...files]);
                  }}
                />
              </div>
            </div>
          </aside>

          <section className="flex flex-col gap-5">
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                addFiles(event.dataTransfer.files);
              }}
              onClick={() => inputRef.current?.click()}
              className={`cursor-pointer rounded-[2rem] border border-dashed p-8 text-center transition ${
                isDragging
                  ? "border-yellow-300 bg-yellow-300/10"
                  : "border-white/15 bg-[#101017]"
              }`}
            >
              <input
                ref={inputRef}
                hidden
                multiple
                type="file"
                accept="audio/*,.mp3,.wav,.m4a,image/*,.jpg,.jpeg,.png,.webp,.txt,.lyrics,.lrc"
                onChange={(event) => {
                  if (event.target.files) addFiles(event.target.files);
                }}
              />

              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-yellow-300 text-3xl text-black">
                ↑
              </div>

              <h2 className="mt-5 text-2xl font-black">
                Drag & drop songs and artwork here
              </h2>

              <p className="mt-2 text-sm text-white/50">
                Supports MP3, WAV, M4A, JPG, PNG, WEBP, TXT, and LRC. Matching
                files by the same name are paired automatically.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={uploadAll}
                disabled={!items.length || isUploadingAll}
                className="flex-1 rounded-2xl bg-yellow-300 px-5 py-4 text-sm font-black text-black transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isUploadingAll ? "Uploading..." : "Upload All To Hidden Tunes"}
              </button>

              <button
                onClick={clearCompleted}
                className="rounded-2xl border border-white/10 px-5 py-4 text-sm font-black text-white/80 transition hover:border-white/30"
              >
                Clear Completed
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {items.map((item) => (
                <article
                  key={item.id}
                  className="rounded-[1.75rem] border border-white/10 bg-[#101017] p-4 shadow-xl"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-widest text-white/40">
                            {item.file.name}
                          </p>
                          <h3 className="mt-1 text-xl font-black">
                            {item.title}
                          </h3>
                        </div>

                        <button
                          onClick={() => removeItem(item.id)}
                          className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-white/50 hover:text-white"
                        >
                          Remove
                        </button>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <input
                          value={item.title}
                          onChange={(event) =>
                            updateItem(item.id, { title: event.target.value })
                          }
                          placeholder="Title"
                          className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-yellow-400"
                        />

                        <input
                          value={item.artist}
                          onChange={(event) =>
                            updateItem(item.id, { artist: event.target.value })
                          }
                          placeholder="Artist"
                          className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-yellow-400"
                        />

                        <input
                          value={item.album}
                          onChange={(event) =>
                            updateItem(item.id, { album: event.target.value })
                          }
                          placeholder="Album"
                          className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-yellow-400"
                        />

                        <input
                          value={item.genre}
                          onChange={(event) =>
                            updateItem(item.id, { genre: event.target.value })
                          }
                          placeholder="Genre"
                          className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-yellow-400"
                        />
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/50">
                        <span className="rounded-full bg-white/[0.06] px-3 py-1">
                          Duration: {item.duration}s
                        </span>

                        <span className="rounded-full bg-white/[0.06] px-3 py-1">
                          Mood: {item.mood}
                        </span>

                        <span className="rounded-full bg-white/[0.06] px-3 py-1">
                          Artwork:{" "}
                          {item.artworkFile?.name || globalArtwork?.name || "No"}
                        </span>

                        <span className="rounded-full bg-white/[0.06] px-3 py-1">
                          Lyrics:{" "}
                          {item.lyricsFile?.name || globalLyrics?.name || "No"}
                        </span>

                        <span className="rounded-full bg-white/[0.06] px-3 py-1">
                          LRC: {item.lrcFile?.name || globalLrc?.name || "No"}
                        </span>
                      </div>

                      {item.status === "uploading" && (
                        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-yellow-300 transition-all"
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                      )}

                      {item.error && (
                        <p className="mt-3 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                          {item.error}
                        </p>
                      )}
                    </div>

                    <div className="flex min-w-[150px] flex-row gap-2 xl:flex-col">
                      <button
                        onClick={() => uploadSingle(item)}
                        disabled={item.status === "uploading"}
                        className="flex-1 rounded-2xl bg-white px-4 py-3 text-sm font-black text-black disabled:opacity-40"
                      >
                        {item.status === "success"
                          ? "Uploaded"
                          : item.status === "uploading"
                            ? "Uploading"
                            : "Upload"}
                      </button>

                      <div
                        className={`rounded-2xl px-4 py-3 text-center text-xs font-black uppercase tracking-widest ${
                          item.status === "success"
                            ? "bg-emerald-400/15 text-emerald-200"
                            : item.status === "error"
                              ? "bg-red-400/15 text-red-200"
                              : item.status === "uploading"
                                ? "bg-yellow-400/15 text-yellow-200"
                                : "bg-white/[0.06] text-white/50"
                        }`}
                      >
                        {item.status}
                      </div>
                    </div>
                  </div>
                </article>
              ))}

              {!items.length && (
                <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-10 text-center">
                  <h3 className="text-xl font-black">No songs selected yet</h3>
                  <p className="mt-2 text-sm text-white/50">
                    Drop your Hidden Tunes catalog here and start building your
                    own premium streaming library.
                  </p>
                </div>
              )}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}