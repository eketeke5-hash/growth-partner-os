import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 3000);

const uploadsDir = path.join(__dirname, "uploads");
const exportsDir = path.join(__dirname, "exports");

await fs.mkdir(uploadsDir, { recursive: true });
await fs.mkdir(exportsDir, { recursive: true });

ffmpeg.setFfmpegPath(ffmpegPath);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 150 * 1024 * 1024 }
});

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(uploadsDir));
app.use("/exports", express.static(exportsDir));
app.use(express.static(__dirname));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "growth-partner-os",
    timestamp: new Date().toISOString(),
    message: "Backend is running and ready for upload processing."
  });
});

app.post("/api/upload", upload.single("video"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: "No video file was uploaded." });
  }

  const fileData = {
    ok: true,
    fileName: req.file.originalname,
    storedName: req.file.filename,
    size: req.file.size,
    mimeType: req.file.mimetype,
    url: `/uploads/${req.file.filename}`,
    uploadedAt: new Date().toISOString()
  };

  return res.status(200).json(fileData);
});

app.post("/api/render", upload.single("video"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: "No video file was provided for rendering." });
  }

  const title = String(req.body.title || "Growth Partner OS").trim() || "Growth Partner OS";
  const outputFileName = `${Date.now()}-${path.basename(req.file.filename, path.extname(req.file.filename))}.mp4`;
  const outputPath = path.join(exportsDir, outputFileName);
  const inputPath = req.file.path;
  const safeTitle = title.replace(/'/g, "\\'");

  try {
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .videoFilters([
          `drawtext=text='${safeTitle}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=h*0.8:box=1:boxcolor=black@0.5:boxborderw=20`
        ])
        .outputOptions([
          "-pix_fmt", "yuv420p",
          "-movflags", "+faststart",
          "-t", "5"
        ])
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", (error) => reject(error))
        .run();
    });

    return res.status(200).json({
      ok: true,
      message: "Video rendered successfully.",
      sourceUrl: `/uploads/${req.file.filename}`,
      outputUrl: `/exports/${outputFileName}`,
      title,
      exportedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Render error:", error);
    return res.status(500).json({
      ok: false,
      error: "The render pipeline failed.",
      details: error.message
    });
  }
});

app.get("/*", (req, res, next) => {
  if (req.path.startsWith("/api/") || req.path.startsWith("/uploads/") || req.path.startsWith("/exports/")) {
    return next();
  }

  return res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Growth Partner OS backend is running on http://localhost:${PORT}`);
});
