import express from "express";
import { randomUUID } from "crypto";
import { createRequire } from "module";
import os from "os";
import path from "path";
import { unlink } from "fs/promises";
import PDFDocument from "pdfkit";
import { Chapter } from "../models/Chapter.js";
import { styleWithGemini } from "../services/geminiService.js";

export const chapterRouter = express.Router();
const require = createRequire(import.meta.url);
const Epub = require("epub-gen");

class UserInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "UserInputError";
  }
}

function normalizeBook(value) {
  return value === "book2" ? "book2" : "book1";
}

function sanitizeFileNamePart(value) {
  return String(value || "")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim() || "novel";
}

function extractChapterNumber(title) {
  const match = String(title || "").match(/^\s*chapter\s*(\d+)\b/i);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

function resolveChapterNumber(title, chapterNumber) {
  if (Number.isInteger(chapterNumber) && chapterNumber > 0) {
    return chapterNumber;
  }

  const parsed = extractChapterNumber(title);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractChapterNumberFromText(text) {
  const match = String(text || "").match(/^\s*chapter\s*(\d+)\b/im);
  return match ? Number.parseInt(match[1], 10) : null;
}

function extractChapterTitleFromText(text) {
  const match = String(text || "").match(/^\s*chapter\s*\d+\s*[—\-:]+\s*(.+)$/im);
  return match ? match[1].trim() : "";
}

function stripLeadingChapterHeader(text) {
  return String(text || "")
    .replace(/^\s*chapter\s*\d+\s*[—\-:]\s*.*(?:\r?\n)?/i, "")
    .trim();
}

function getBookQuery(book, includeLegacyBook1 = true) {
  if (book === "book2") {
    return { book: "book2" };
  }

  if (includeLegacyBook1) {
    return {
      $or: [{ book: "book1" }, { book: { $exists: false } }],
    };
  }

  return { book: "book1" };
}

function sortChapters(a, b) {
  const aNum = Number.isInteger(a.chapterNumber) && a.chapterNumber > 0
    ? a.chapterNumber
    : extractChapterNumber(a.title);
  const bNum = Number.isInteger(b.chapterNumber) && b.chapterNumber > 0
    ? b.chapterNumber
    : extractChapterNumber(b.title);

  if (Number.isFinite(aNum) && Number.isFinite(bNum) && aNum !== bNum) {
    return aNum - bNum;
  }

  return new Date(a.createdAt || a.updatedAt || 0) - new Date(b.createdAt || b.updatedAt || 0);
}

function textToContentBlocks(rawText) {
  const normalized = String(rawText || "").replace(/\r\n/g, "\n").trim();

  if (!normalized) {
    return [{ type: "paragraph", text: "No content yet." }];
  }

  return normalized
    .split(/\n\s*\n/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      if (/^(\*\s*){3,}$/.test(chunk) || /^(-\s*){3,}$/.test(chunk)) {
        return { type: "divider", text: "" };
      }

      return {
        type: "paragraph",
        text: chunk,
      };
    });
}

function parseMarkdownChapters(markdownText) {
  const text = String(markdownText || "").replace(/\r\n/g, "\n");
  const chapterHeaderRegex = /^##\s*CHAPTER\s+(\d+)\s*[—\-:]\s*(.+)$/gim;
  const headers = [];
  let match;

  while ((match = chapterHeaderRegex.exec(text)) !== null) {
    headers.push({
      index: match.index,
      fullMatch: match[0],
      chapterNumber: Number.parseInt(match[1], 10),
      chapterTitle: match[2].trim(),
    });
  }

  if (headers.length === 0) {
    return [];
  }

  return headers.map((header, idx) => {
    const start = header.index + header.fullMatch.length;
    const end = idx + 1 < headers.length ? headers[idx + 1].index : text.length;
    let body = text.slice(start, end).trim();

    body = body.split(/\*End of Chapters/i)[0].trim();

    return {
      chapterNumber: header.chapterNumber,
      title: `Chapter ${header.chapterNumber} — ${header.chapterTitle}`,
      rawText: body,
    };
  }).filter((chapter) => chapter.rawText.length > 0);
}

function parseMarkdownFileAsSingleChapter(file) {
  const markdown = String(file?.markdown || file?.content || file?.text || "");
  const parsedChapters = parseMarkdownChapters(markdown);

  if (parsedChapters.length > 0) {
    return parsedChapters;
  }

  const chapterNumber = extractChapterNumberFromText(markdown)
    ?? extractChapterNumberFromText(file?.name);

  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
    throw new UserInputError(`Could not determine chapter number for ${file?.name || "one of the uploaded files"}.`);
  }

  const titleFromText = extractChapterTitleFromText(markdown);
  const titleFromName = String(file?.name || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim();

  const rawText = markdown
    .replace(/^\s*##?\s*CHAPTER\s*\d+\s*[—\-:]\s*.*(?:\r?\n)?/im, "")
    .trim();

  return [{
    chapterNumber,
    title: `Chapter ${chapterNumber} — ${titleFromText || titleFromName || `Chapter ${chapterNumber}`}`,
    rawText: stripLeadingChapterHeader(rawText) || rawText,
  }];
}

function resolveRequestedRange(chapters, fromChapter, toChapter) {
  if (chapters.length === 0) {
    return { fromChapter: undefined, toChapter: undefined };
  }

  const chapterNumbers = chapters
    .map((chapter) => Number.isInteger(chapter.chapterNumber) && chapter.chapterNumber > 0
      ? chapter.chapterNumber
      : extractChapterNumber(chapter.title))
    .filter((value) => Number.isFinite(value));

  const minChapter = Math.min(...chapterNumbers);
  const maxChapter = Math.max(...chapterNumbers);

  const resolvedFrom = Number.isInteger(fromChapter) ? fromChapter : minChapter;
  const resolvedTo = Number.isInteger(toChapter) ? toChapter : maxChapter;

  if (resolvedFrom < 1 || resolvedTo < 1 || resolvedFrom > resolvedTo) {
    throw new Error("Invalid chapter range. Use positive values with fromChapter <= toChapter.");
  }

  return {
    fromChapter: resolvedFrom,
    toChapter: resolvedTo,
  };
}

function applyRangeFilter(chapters, fromChapter, toChapter) {
  const range = resolveRequestedRange(chapters, fromChapter, toChapter);

  const chapterMap = new Map();
  chapters.forEach((chapter) => {
    const num = Number.isInteger(chapter.chapterNumber) && chapter.chapterNumber > 0
      ? chapter.chapterNumber
      : extractChapterNumber(chapter.title);

    if (Number.isFinite(num) && !chapterMap.has(num)) {
      chapterMap.set(num, chapter);
    }
  });

  const missing = [];
  const selected = [];

  for (let number = range.fromChapter; number <= range.toChapter; number += 1) {
    const chapter = chapterMap.get(number);

    if (!chapter) {
      missing.push(number);
      continue;
    }

    selected.push(chapter);
  }

  if (missing.length > 0) {
    throw new Error(`Missing chapter(s) in requested range: ${missing.join(", ")}`);
  }

  return selected;
}

function createPdfFileName(chapters, suffix = "") {
  const chapterNumbers = chapters
    .map((chapter) => Number.isInteger(chapter.chapterNumber) ? chapter.chapterNumber : extractChapterNumber(chapter.title))
    .filter((value) => Number.isFinite(value));

  const minChapter = chapterNumbers.length > 0 ? Math.min(...chapterNumbers) : 1;
  const maxChapter = chapterNumbers.length > 0 ? Math.max(...chapterNumbers) : chapters.length;
  const tail = suffix ? `.${suffix}` : "";
  return { minChapter, maxChapter, tail };
}

function createEpubFileName(chapters) {
  const chapterNumbers = chapters
    .map((chapter) => Number.isInteger(chapter.chapterNumber) ? chapter.chapterNumber : extractChapterNumber(chapter.title))
    .filter((value) => Number.isFinite(value));

  const minChapter = chapterNumbers.length > 0 ? Math.min(...chapterNumbers) : 1;
  const maxChapter = chapterNumbers.length > 0 ? Math.max(...chapterNumbers) : chapters.length;
  return { minChapter, maxChapter };
}

function formatExportFileName(bookTitle, fromChapter, toChapter, extension) {
  const safeTitle = sanitizeFileNamePart(bookTitle);
  return `${safeTitle}(${fromChapter}-${toChapter}).${extension}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toChapterHtml(chapter) {
  const blocks = Array.isArray(chapter.content) && chapter.content.length > 0
    ? chapter.content
    : [{ type: "paragraph", text: "No content yet." }];

  const body = blocks
    .map((block) => {
      if (block.type === "divider") {
        return "<p class=\"divider\">* * *</p>";
      }

      const text = escapeHtml(String(block.text || "").trim());

      if (!text) {
        return "";
      }

      return `<p class=\"body\">${text}</p>`;
    })
    .filter(Boolean)
    .join("\n");

  return `\n    <h1 class=\"chapter-title\">${escapeHtml(chapter.title || "Untitled Chapter")}</h1>\n    ${body}\n  `;
}

function writeCoverPage(doc, chapters, label) {
  doc.font("Times-Bold").fontSize(24).text(label, { align: "center" });
  doc.moveDown(0.8);
  doc.font("Times-Roman").fontSize(11).text(`Generated: ${new Date().toLocaleString()}`, { align: "center" });
  doc.moveDown(0.4);
  doc.text(`Total chapters: ${chapters.length}`, { align: "center" });
}

function writeKindleChapter(doc, chapter) {
  doc.addPage();
  doc.font("Times-Bold").fontSize(16).text(chapter.title || "Untitled Chapter", { align: "center" });
  doc.moveDown(1.4);

  const blocks = Array.isArray(chapter.content) && chapter.content.length > 0
    ? chapter.content
    : [{ type: "paragraph", text: "No content yet." }];

  blocks.forEach((block) => {
    if (block.type === "divider") {
      doc.moveDown(0.9);
      doc.font("Times-Roman").fontSize(11).text("* * *", { align: "center" });
      doc.moveDown(0.9);
      return;
    }

    const text = String(block.text || "").trim();
    if (!text) {
      return;
    }

    doc.font("Times-Roman").fontSize(11.5).text(text, {
      align: "justify",
      lineGap: 2,
      indent: 18,
      paragraphGap: 10,
    });
  });
}

chapterRouter.get("/", async (req, res) => {
  try {
    const book = normalizeBook(req.query.book);
    const publishedOnly = req.query.published !== "false";
    const bookQuery = getBookQuery(book);

    const chapters = await Chapter.find(
      publishedOnly ? { ...bookQuery, isPublished: true } : bookQuery,
      { book: 1, chapterNumber: 1, title: 1, isPublished: 1, publishedAt: 1, updatedAt: 1, createdAt: 1 }
    ).sort({ createdAt: -1 });

    res.json(chapters);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

chapterRouter.post("/manual-publish", async (req, res) => {
  try {
    const book = normalizeBook(req.body.book);
    const chapterNumber = Number.parseInt(req.body.chapterNumber, 10);
    const rawText = String(req.body.rawText || "").trim();
    const customTitle = String(req.body.title || "").trim();

    if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
      return res.status(400).json({ message: "chapterNumber must be a positive integer." });
    }

    if (!rawText) {
      return res.status(400).json({ message: "rawText is required." });
    }

    const existing = await Chapter.findOne({
      ...getBookQuery(book, false),
      chapterNumber,
    }).lean();

    if (existing) {
      return res.status(409).json({ message: `Chapter ${chapterNumber} already exists in ${book}.` });
    }

    const title = customTitle || `Chapter ${chapterNumber}`;
    const cleanedRawText = stripLeadingChapterHeader(rawText) || rawText;

    const chapter = await Chapter.create({
      book,
      chapterNumber,
      title,
      rawText: cleanedRawText,
      content: textToContentBlocks(cleanedRawText),
      isPublished: true,
      publishedAt: new Date(),
    });

    return res.status(201).json(chapter);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

chapterRouter.post("/upload-md", async (req, res) => {
  try {
    const book = normalizeBook(req.body.book || "book1");
    const markdown = String(req.body.markdown || "");
    const files = Array.isArray(req.body.files) ? req.body.files : [];

    if (book !== "book1") {
      return res.status(400).json({ message: "Markdown batch upload is supported only for book1." });
    }

    let parsed = [];

    if (files.length > 0) {
      parsed = files.flatMap(parseMarkdownFileAsSingleChapter);
    } else {
      parsed = parseMarkdownChapters(markdown);
    }

    if (parsed.length === 0) {
      return res.status(400).json({ message: "No chapters found. Use headers like: ## CHAPTER 41 — Title" });
    }

    const sortedParsed = [...parsed].sort((a, b) => a.chapterNumber - b.chapterNumber);

    for (let index = 1; index < sortedParsed.length; index += 1) {
      const previous = sortedParsed[index - 1].chapterNumber;
      const current = sortedParsed[index].chapterNumber;

      if (current === previous) {
        return res.status(400).json({ message: `Duplicate chapter number ${current} in upload.` });
      }

      if (current !== previous + 1) {
        return res.status(400).json({ message: `Missing chapter number ${previous + 1} in uploaded batch.` });
      }
    }

    const duplicateInPayload = parsed
      .map((item) => item.chapterNumber)
      .filter((value, index, array) => array.indexOf(value) !== index);

    if (duplicateInPayload.length > 0) {
      return res.status(400).json({ message: `Duplicate chapters in upload: ${[...new Set(duplicateInPayload)].join(", ")}` });
    }

    const existing = await Chapter.find(
      {
        ...getBookQuery(book),
        chapterNumber: { $in: sortedParsed.map((item) => item.chapterNumber) },
      },
      { chapterNumber: 1 }
    ).lean();

    if (existing.length > 0) {
      return res.status(409).json({
        message: `Chapter(s) already exist in ${book}: ${existing.map((item) => item.chapterNumber).join(", ")}`,
      });
    }

    const docs = sortedParsed.map((item) => ({
      book,
      chapterNumber: item.chapterNumber,
      title: item.title,
      rawText: item.rawText,
      content: textToContentBlocks(item.rawText),
      isPublished: true,
      publishedAt: new Date(),
    }));

    const inserted = await Chapter.insertMany(docs, { ordered: true });

    return res.status(201).json({
      message: `Published ${inserted.length} chapter(s) to ${book}.`,
      publishedCount: inserted.length,
      chapters: inserted.map((item) => ({
        id: item._id,
        chapterNumber: item.chapterNumber,
        title: item.title,
      })),
    });
  } catch (error) {
    if (error instanceof UserInputError) {
      return res.status(400).json({ message: error.message });
    }

    return res.status(500).json({ message: error.message });
  }
});

chapterRouter.get("/export/pdf", async (req, res) => {
  try {
    const book = normalizeBook(req.query.book);
    const mode = req.query.mode === "kindle" ? "kindle" : "styled";
    const fromChapter = req.query.fromChapter ? Number.parseInt(req.query.fromChapter, 10) : null;
    const toChapter = req.query.toChapter ? Number.parseInt(req.query.toChapter, 10) : null;
    const bookTitle = String(req.query.bookTitle || req.query.title || req.query.bookName || book).trim();

    const chapters = await Chapter.find(
      { ...getBookQuery(book), isPublished: true },
      { book: 1, chapterNumber: 1, title: 1, content: 1, isPublished: 1, createdAt: 1, updatedAt: 1 }
    ).lean();

    if (chapters.length === 0) {
      return res.status(404).json({ message: `No chapters available for export in ${book}.` });
    }

    const sortedChapters = [...chapters].sort(sortChapters);
    let selectedChapters;

    try {
      selectedChapters = applyRangeFilter(sortedChapters, fromChapter, toChapter);
    } catch (rangeError) {
      return res.status(400).json({ message: rangeError.message });
    }

    const resolvedRange = resolveRequestedRange(selectedChapters, fromChapter, toChapter);
    const fileName = formatExportFileName(bookTitle, resolvedRange.fromChapter, resolvedRange.toChapter, mode === "kindle" ? "pdf" : "pdf");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    const doc = new PDFDocument({
      size: mode === "kindle" ? [432, 648] : "A4",
      margin: mode === "kindle" ? 52 : 56,
      info: {
        Title: mode === "kindle" ? `${bookTitle} (${resolvedRange.fromChapter}-${resolvedRange.toChapter})` : `${bookTitle} (${resolvedRange.fromChapter}-${resolvedRange.toChapter})`,
        Author: "Novel Reading Platform",
      },
    });

    doc.pipe(res);

    writeCoverPage(doc, selectedChapters, mode === "kindle" ? `${sanitizeFileNamePart(bookTitle)} Kindle Export` : `${sanitizeFileNamePart(bookTitle)} Export`);

    selectedChapters.forEach((chapter) => {
      writeKindleChapter(doc, chapter);
    });

    doc.end();
  } catch (error) {
    if (!res.headersSent) {
      return res.status(500).json({ message: error.message });
    }

    return res.end();
  }
});

chapterRouter.get("/export/epub", async (req, res) => {
  let outputPath = "";

  try {
    const book = normalizeBook(req.query.book);
    const fromChapter = req.query.fromChapter ? Number.parseInt(req.query.fromChapter, 10) : null;
    const toChapter = req.query.toChapter ? Number.parseInt(req.query.toChapter, 10) : null;
    const bookTitle = String(req.query.bookTitle || req.query.title || req.query.bookName || book).trim();

    const chapters = await Chapter.find(
      { ...getBookQuery(book), isPublished: true },
      { book: 1, chapterNumber: 1, title: 1, content: 1, isPublished: 1, createdAt: 1, updatedAt: 1 }
    ).lean();

    if (chapters.length === 0) {
      return res.status(404).json({ message: `No chapters available for export in ${book}.` });
    }

    const sortedChapters = [...chapters].sort(sortChapters);
    let selectedChapters;

    try {
      selectedChapters = applyRangeFilter(sortedChapters, fromChapter, toChapter);
    } catch (rangeError) {
      return res.status(400).json({ message: rangeError.message });
    }

    const resolvedRange = resolveRequestedRange(selectedChapters, fromChapter, toChapter);
    const fileName = formatExportFileName(bookTitle, resolvedRange.fromChapter, resolvedRange.toChapter, "epub");
    outputPath = path.join(os.tmpdir(), `${randomUUID()}.epub`);

    const content = selectedChapters.map((chapter) => ({
      title: chapter.title || "Untitled Chapter",
      data: toChapterHtml(chapter),
      author: "Novel Reading Platform",
    }));

    const uniformCss = `
      body {
        font-family: Georgia, "Times New Roman", serif;
        font-size: 1em;
        line-height: 1.55;
        text-align: justify;
        margin: 0;
        padding: 0;
      }
      .chapter-title {
        text-align: center;
        font-size: 1.35em;
        margin: 0 0 1.4em 0;
      }
      .body {
        text-indent: 1.35em;
        margin: 0 0 0.9em 0;
      }
      .divider {
        text-align: center;
        margin: 1.2em 0;
        text-indent: 0;
      }
    `;

    await new Epub({
      title: `${bookTitle} (${resolvedRange.fromChapter}-${resolvedRange.toChapter})`,
      author: "Novel Reading Platform",
      publisher: "Novel Reading Platform",
      output: outputPath,
      content,
      css: uniformCss,
      appendChapterTitles: false,
      verbose: false,
    }).promise;

    res.setHeader("Content-Type", "application/epub+zip");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    return res.download(outputPath, fileName, async () => {
      if (outputPath) {
        await unlink(outputPath).catch(() => {});
      }
    });
  } catch (error) {
    if (outputPath) {
      await unlink(outputPath).catch(() => {});
    }

    if (!res.headersSent) {
      return res.status(500).json({ message: error.message });
    }

    return res.end();
  }
});

chapterRouter.get("/:id", async (req, res) => {
  try {
    const book = normalizeBook(req.query.book);
    const chapter = await Chapter.findById(req.params.id);

    if (!chapter) {
      return res.status(404).json({ message: "Chapter not found" });
    }

    const belongsToBook = book === "book2"
      ? chapter.book === "book2"
      : chapter.book === "book1" || typeof chapter.book === "undefined";

    if (!belongsToBook) {
      return res.status(404).json({ message: "Chapter not found" });
    }

    if (!chapter.isPublished && req.query.includeDraft !== "true") {
      return res.status(403).json({ message: "Draft chapter is not publicly visible" });
    }

    return res.json(chapter);
  } catch (error) {
    return res.status(400).json({ message: "Invalid chapter id" });
  }
});

chapterRouter.post("/", async (req, res) => {
  try {
    const book = normalizeBook(req.body.book);
    const { title, rawText } = req.body;

    if (!title || !rawText) {
      return res.status(400).json({ message: "title and rawText are required" });
    }

    const chapter = await Chapter.create({
      book,
      chapterNumber: resolveChapterNumber(title, null),
      title: title.trim(),
      rawText,
      content: textToContentBlocks(rawText),
      isPublished: false,
    });

    return res.status(201).json(chapter);
  } catch (error) {
    return res.status(500).json({ message: error.message });
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

    return res.json(styled);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

chapterRouter.put("/:id", async (req, res) => {
  try {
    const { title, rawText, content, chapterNumber } = req.body;
    const chapter = await Chapter.findById(req.params.id);

    if (!chapter) {
      return res.status(404).json({ message: "Chapter not found" });
    }

    if (title) chapter.title = title.trim();
    if (rawText) chapter.rawText = rawText;
    if (Array.isArray(content)) chapter.content = content;
    if (Number.isInteger(chapterNumber) && chapterNumber > 0) {
      chapter.chapterNumber = chapterNumber;
    } else {
      chapter.chapterNumber = resolveChapterNumber(chapter.title, chapter.chapterNumber);
    }

    await chapter.save();
    return res.json(chapter);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

chapterRouter.post("/:id/publish", async (req, res) => {
  try {
    const chapter = await Chapter.findById(req.params.id);

    if (!chapter) {
      return res.status(404).json({ message: "Chapter not found" });
    }

    if (!Array.isArray(chapter.content) || chapter.content.length === 0) {
      chapter.content = textToContentBlocks(chapter.rawText);
    }

    chapter.chapterNumber = resolveChapterNumber(chapter.title, chapter.chapterNumber);
    chapter.isPublished = true;
    chapter.publishedAt = new Date();

    await chapter.save();
    return res.json(chapter);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

chapterRouter.delete("/chapter-number/:chapterNumber", async (req, res) => {
  try {
    const book = normalizeBook(req.query.book);
    const chapterNumber = Number.parseInt(req.params.chapterNumber, 10);

    if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
      return res.status(400).json({ message: "chapterNumber must be a positive integer" });
    }

    const chapterRegex = new RegExp(`^\\s*chapter\\s*${chapterNumber}\\b`, "i");
    const matched = await Chapter.find(
      {
        ...getBookQuery(book),
        $or: [
          { chapterNumber },
          { title: chapterRegex },
        ],
      },
      { _id: 1, title: 1 }
    ).lean();

    if (matched.length === 0) {
      return res.status(404).json({ message: `No chapter found for chapter number ${chapterNumber} in ${book}` });
    }

    const ids = matched.map((item) => item._id);
    const result = await Chapter.deleteMany({ _id: { $in: ids } });

    return res.json({
      message: `Removed chapter ${chapterNumber} from ${book}`,
      deletedCount: result.deletedCount,
      deletedTitles: matched.map((item) => item.title),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});
