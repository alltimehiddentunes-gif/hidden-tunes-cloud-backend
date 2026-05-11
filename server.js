import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import songsRouter from "./routes/songs.js";
import artistsRouter from "./routes/artists.js";
import adminUploadRouter from "./routes/adminUpload.js";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Hidden Tunes backend is running",
  });
});

app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "ok",
  });
});

app.use("/api/songs", songsRouter);
app.use("/api/artists", artistsRouter);
app.use("/api/admin", adminUploadRouter);

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
  });
});

app.listen(PORT, () => {
  console.log(`Hidden Tunes backend running on port ${PORT}`);
});