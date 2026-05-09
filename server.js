import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import songsRouter from "./routes/songs.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    name: "Hidden Tunes Backend",
    status: "online",
    version: "1.0.0"
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "hidden-tunes-backend",
    timestamp: new Date().toISOString()
  });
});

app.use("/api/songs", songsRouter);

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Hidden Tunes backend running on port ${PORT}`);
});