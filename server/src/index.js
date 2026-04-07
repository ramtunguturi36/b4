import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { connectDatabase } from "./db/connect.js";
import { chapterRouter } from "./routes/chapters.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  })
);
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_, res) => {
  res.json({ status: "ok" });
});

app.use("/api/chapters", chapterRouter);

connectDatabase(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/novel_platform").then(() => {
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
});
