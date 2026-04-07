import { useState } from "react";
import {
  createDraft,
  publishChapter,
  removeChapterByNumber,
  styleChapter,
  updateChapter,
} from "../../api/chaptersApi";
import PreviewPanel from "./PreviewPanel";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientError(message) {
  const text = String(message || "").toLowerCase();
  return (
    text.includes("429") ||
    text.includes("503") ||
    text.includes("timeout") ||
    text.includes("temporarily") ||
    text.includes("overloaded") ||
    text.includes("rate")
  );
}

function isQuotaError(message) {
  const text = String(message || "").toLowerCase();
  return text.includes("429") && text.includes("quota");
}

async function runWithRetry(task) {
  try {
    return await task();
  } catch (err) {
    if (!isTransientError(err?.message)) {
      throw err;
    }

    await wait(1200);
    return task();
  }
}

function parseBatchChapters(inputText) {
  const text = String(inputText || "").replace(/\r\n/g, "\n");
  const chapterHeaderRegex = /^##\s*CHAPTER\s+(\d+)\s*[—-]\s*(.+)$/gim;
  const headers = [];
  let match;

  while ((match = chapterHeaderRegex.exec(text)) !== null) {
    headers.push({
      index: match.index,
      fullMatch: match[0],
      chapterNumber: match[1],
      chapterName: match[2].trim(),
    });
  }

  if (headers.length === 0) {
    return [];
  }

  return headers
    .map((header, idx) => {
      const start = header.index + header.fullMatch.length;
      const end = idx + 1 < headers.length ? headers[idx + 1].index : text.length;
      let body = text.slice(start, end);

      // Ignore trailing generator notes and continuations after chapter content.
      body = body.split(/\*End of Chapters/i)[0];
      body = body.split(/\*\*\[Continues/i)[0];
      body = body.replace(/^\s*---+\s*/gm, "").trim();

      return {
        title: `Chapter ${header.chapterNumber} — ${header.chapterName}`,
        rawText: body,
      };
    })
    .filter((item) => item.rawText.length > 0);
}

export default function CreatorView({ onPublished }) {
  const [chapterId, setChapterId] = useState("");
  const [title, setTitle] = useState("");
  const [rawText, setRawText] = useState("");
  const [styledContent, setStyledContent] = useState([]);
  const [removeChapterNumber, setRemoveChapterNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [resumeFromChapterNumber, setResumeFromChapterNumber] = useState(null);

  async function ensureDraft() {
    if (chapterId) return chapterId;

    const draft = await createDraft({ title, rawText });
    setChapterId(draft._id);
    return draft._id;
  }

  async function handleStyleWithAI() {
    setError("");
    setStatus("");

    if (!title.trim() || !rawText.trim()) {
      setError("Please add chapter title and raw text first.");
      return;
    }

    setLoading(true);

    try {
      const id = await ensureDraft();
      const styled = await styleChapter({ title: title.trim(), rawText });
      setStyledContent(styled.content || []);

      await updateChapter(id, {
        title: styled.title || title,
        rawText,
        content: styled.content || [],
      });

      setStatus("Chapter styled successfully. Review preview before publishing.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handlePublish() {
    setError("");
    setStatus("");

    if (!styledContent.length) {
      setError("Style the chapter before publishing.");
      return;
    }

    setLoading(true);

    try {
      const id = await ensureDraft();

      await updateChapter(id, {
        title,
        rawText,
        content: styledContent,
      });

      await publishChapter(id);
      setStatus("Chapter published and visible in reader view.");
      onPublished();

      setChapterId("");
      setTitle("");
      setRawText("");
      setStyledContent([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleBatchStyleAndPublish() {
    setError("");
    setStatus("");

    const parsedChapters = parseBatchChapters(rawText);

    if (parsedChapters.length === 0) {
      setError("No chapters found. Use headings like: ## CHAPTER 31 — Title");
      return;
    }

    setLoading(true);

    let publishedCount = 0;
    const failedChapters = [];
    let quotaHitAt = null;

    try {
      for (let idx = 0; idx < parsedChapters.length; idx++) {
        const chapter = parsedChapters[idx];
        
        try {
          const draft = await runWithRetry(() => createDraft({
            title: chapter.title,
            rawText: chapter.rawText,
          }));

          const styled = await runWithRetry(() => styleChapter({
            title: chapter.title,
            rawText: chapter.rawText,
          }));

          await runWithRetry(() => updateChapter(draft._id, {
            title: styled.title || chapter.title,
            rawText: chapter.rawText,
            content: styled.content || [],
          }));

          await runWithRetry(() => publishChapter(draft._id));

          publishedCount += 1;
          setTitle(styled.title || chapter.title);
          setStyledContent(styled.content || []);
        } catch (chapterError) {
          // Quota error: stop immediately, don't retry or continue.
          if (isQuotaError(chapterError?.message)) {
            quotaHitAt = chapter.title;
            failedChapters.push({
              title: chapter.title,
              message: chapterError.message,
            });
            break;  // STOP here, don't continue to next chapter.
          }

          // Other errors: collect and continue.
          failedChapters.push({
            title: chapter.title,
            message: chapterError.message,
          });
        }

        // Small pacing gap helps avoid provider burst-rate failures in batch mode.
        await wait(250);
      }

      setChapterId("");

      if (publishedCount > 0) {
        onPublished();
      }

      if (quotaHitAt) {
        // Set resume point for next batch attempt.
        const nextChapterNumber = parseInt(quotaHitAt.match(/\d+/)?.[0] || "1", 10);
        setResumeFromChapterNumber(nextChapterNumber);

        setStatus(
          `⚠️ Quota limit hit! Published ${publishedCount}/${parsedChapters.length}. Resume from ${quotaHitAt}`
        );
        setError(
          `Quota exhausted at ${quotaHitAt}. ${quotaHitAt}: ${failedChapters[0]?.message || "Quota exceeded"}. ` +
          `Wait for daily reset, enable billing, or use alternate API key. Then click "Resume" below.`
        );
      } else if (failedChapters.length === 0) {
        setStatus(`✅ Batch complete. Styled and published ${publishedCount} chapter(s).`);
        setResumeFromChapterNumber(null);
      } else {
        const failedTitles = failedChapters.map((item) => item.title).join(", ");
        const failedReasons = failedChapters
          .map((item) => `${item.title}: ${item.message}`)
          .join(" | ");

        setStatus(
          `Batch partially completed. Published ${publishedCount}/${parsedChapters.length}. Failed: ${failedTitles}`
        );
        setError(`Failure reasons: ${failedReasons}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResumeFromChapter() {
    if (!resumeFromChapterNumber) return;

    setError("");
    setStatus("");
    
    const parsedChapters = parseBatchChapters(rawText);
    const resumeIdx = parsedChapters.findIndex((ch) => {
      const num = parseInt(ch.title.match(/\d+/)?.[0] || "0", 10);
      return num >= resumeFromChapterNumber;
    });

    if (resumeIdx === -1) {
      setError("Could not find chapter to resume from. Re-check raw text.");
      return;
    }

    setLoading(true);

    let publishedCount = 0;
    const failedChapters = [];
    let quotaHitAt = null;

    try {
      for (let idx = resumeIdx; idx < parsedChapters.length; idx++) {
        const chapter = parsedChapters[idx];

        try {
          const draft = await runWithRetry(() => createDraft({
            title: chapter.title,
            rawText: chapter.rawText,
          }));

          const styled = await runWithRetry(() => styleChapter({
            title: chapter.title,
            rawText: chapter.rawText,
          }));

          await runWithRetry(() => updateChapter(draft._id, {
            title: styled.title || chapter.title,
            rawText: chapter.rawText,
            content: styled.content || [],
          }));

          await runWithRetry(() => publishChapter(draft._id));

          publishedCount += 1;
          setTitle(styled.title || chapter.title);
          setStyledContent(styled.content || []);
        } catch (chapterError) {
          if (isQuotaError(chapterError?.message)) {
            quotaHitAt = chapter.title;
            failedChapters.push({
              title: chapter.title,
              message: chapterError.message,
            });
            break;  // STOP, don't continue.
          }

          failedChapters.push({
            title: chapter.title,
            message: chapterError.message,
          });
        }

        await wait(250);
      }

      setChapterId("");

      if (publishedCount > 0) {
        onPublished();
      }

      if (quotaHitAt) {
        const nextChapterNumber = parseInt(quotaHitAt.match(/\d+/)?.[0] || "1", 10);
        setResumeFromChapterNumber(nextChapterNumber);

        setStatus(
          `⚠️ Quota hit again! Published ${publishedCount} more. Resume from ${quotaHitAt}`
        );
        setError(
          `Quota exhausted again at ${quotaHitAt}. ` +
          `Once quota is available (wait/billing), click "Resume" to continue.`
        );
      } else if (failedChapters.length === 0) {
        setStatus(`✅ Resume complete. Published ${publishedCount} chapter(s).`);
        setResumeFromChapterNumber(null);
      } else {
        const failedTitles = failedChapters.map((item) => item.title).join(", ");
        setStatus(
          `Resumed and published ${publishedCount} chapter(s). Some failed: ${failedTitles}`
        );
        setResumeFromChapterNumber(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveByChapterNumber() {
    setError("");
    setStatus("");

    const chapterNumber = Number.parseInt(removeChapterNumber, 10);

    if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
      setError("Enter a valid chapter number to remove.");
      return;
    }

    setLoading(true);

    try {
      const response = await removeChapterByNumber(chapterNumber);
      setStatus(`${response.message}. Removed: ${response.deletedCount ?? 0}`);
      setRemoveChapterNumber("");
      onPublished();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="creator-shell">
      <div className="editor-card">
        <h2>Creator Dashboard</h2>
        <p className="muted">Draft chapters, style with Gemini, preview formatting, and publish instantly.</p>

        <label htmlFor="chapter-title">Chapter Title</label>
        <input
          id="chapter-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Chapter 1: The Lantern in Rain"
        />

        <label htmlFor="raw-text">Raw Chapter Text</label>
        <textarea
          id="raw-text"
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="Paste chapter text here OR paste batch with headings like: ## CHAPTER 31 — Title"
          rows={12}
        />
        <p className="muted">
          Batch mode: paste multiple chapters using <strong>## CHAPTER number — title</strong> headings, then click
          &nbsp;<strong>Batch: Style + Publish</strong>.
        </p>

        <div className="creator-actions">
          <button className="accent" onClick={handleStyleWithAI} disabled={loading}>
            {loading ? "Styling..." : "Style with AI"}
          </button>
          <button className="publish" onClick={handlePublish} disabled={loading || !styledContent.length}>
            Publish
          </button>
          <button type="button" onClick={handleBatchStyleAndPublish} disabled={loading || !rawText.trim()}>
            {loading ? "Processing..." : "Batch: Style + Publish"}
          </button>
          {resumeFromChapterNumber && (
            <button
              type="button"
              onClick={handleResumeFromChapter}
              disabled={loading}
              className="accent"
              title={`Resume batch from Chapter ${resumeFromChapterNumber}`}
            >
              {loading ? "Resuming..." : `Resume from Ch. ${resumeFromChapterNumber}`}
            </button>
          )}
        </div>

        <div className="creator-actions creator-remove-row">
          <input
            type="number"
            min="1"
            value={removeChapterNumber}
            onChange={(e) => setRemoveChapterNumber(e.target.value)}
            placeholder="Chapter number"
            aria-label="Chapter number to remove"
          />
          <button type="button" onClick={handleRemoveByChapterNumber} disabled={loading || !removeChapterNumber.trim()}>
            Remove by Chapter #
          </button>
        </div>

        {status && <p className="status success">{status}</p>}
        {error && <p className="status error">{error}</p>}
      </div>

      <PreviewPanel title={title} content={styledContent} />
    </section>
  );
}
