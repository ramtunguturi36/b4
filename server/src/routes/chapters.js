import express from "express";
import { Chapter } from "../models/Chapter.js";
import { styleWithGemini } from "../services/geminiService.js";

export const chapterRouter = express.Router();

chapterRouter.get("/", async (req, res) => {
  try {
    const publishedOnly = req.query.published !== "false";

    const chapters = await Chapter.find(
      publishedOnly ? { isPublished: true } : {},
      { title: 1, isPublished: 1, publishedAt: 1, updatedAt: 1, createdAt: 1 }
    ).sort({ createdAt: -1 });

    res.json(chapters);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

chapterRouter.get("/:id", async (req, res) => {
  try {
    const chapter = await Chapter.findById(req.params.id);

    if (!chapter) {
      return res.status(404).json({ message: "Chapter not found" });
    }

    if (!chapter.isPublished && req.query.includeDraft !== "true") {
      return res.status(403).json({ message: "Draft chapter is not publicly visible" });
    }

    res.json(chapter);
  } catch (error) {
    res.status(400).json({ message: "Invalid chapter id" });
  }
});

chapterRouter.post("/", async (req, res) => {
  try {
    const { title, rawText } = req.body;

    if (!title || !rawText) {
      return res.status(400).json({ message: "title and rawText are required" });
    }

    const chapter = await Chapter.create({
      title: title.trim(),
      rawText,
      content: [],
      isPublished: false,
    });

    res.status(201).json(chapter);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

chapterRouter.post("/style", async (req, res) => {
  try {
    const { title, rawText } = req.body;

    if (!title || !rawText) {
      return res.status(400).json({ message: "title and rawText are required" });
    }

    const styled = await styleWithGemini({
      title: title.trim(),
      rawText,
      apiKey: process.env.GEMINI_API_KEY,
    });

    res.json(styled);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

chapterRouter.put("/:id", async (req, res) => {
  try {
    const { title, rawText, content } = req.body;
    const chapter = await Chapter.findById(req.params.id);

    if (!chapter) {
      return res.status(404).json({ message: "Chapter not found" });
    }

    if (title) chapter.title = title.trim();
    if (rawText) chapter.rawText = rawText;
    if (Array.isArray(content)) chapter.content = content;

    await chapter.save();
    res.json(chapter);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

chapterRouter.post("/:id/publish", async (req, res) => {
  try {
    const chapter = await Chapter.findById(req.params.id);

    if (!chapter) {
      return res.status(404).json({ message: "Chapter not found" });
    }

    if (!Array.isArray(chapter.content) || chapter.content.length === 0) {
      return res.status(400).json({ message: "Style chapter before publishing" });
    }

    chapter.isPublished = true;
    chapter.publishedAt = new Date();

    await chapter.save();
    res.json(chapter);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

chapterRouter.delete("/chapter-number/:chapterNumber", async (req, res) => {
  try {
    const chapterNumber = Number.parseInt(req.params.chapterNumber, 10);

    if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
      return res.status(400).json({ message: "chapterNumber must be a positive integer" });
    }

    const chapterRegex = new RegExp(`^\\s*chapter\\s*${chapterNumber}\\b`, "i");
    const matched = await Chapter.find({ title: chapterRegex }, { _id: 1, title: 1 }).lean();

    if (matched.length === 0) {
      return res.status(404).json({ message: `No chapter found for chapter number ${chapterNumber}` });
    }

    const ids = matched.map((item) => item._id);
    const result = await Chapter.deleteMany({ _id: { $in: ids } });

    return res.json({
      message: `Removed chapter ${chapterNumber}`,
      deletedCount: result.deletedCount,
      deletedTitles: matched.map((item) => item.title),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});
