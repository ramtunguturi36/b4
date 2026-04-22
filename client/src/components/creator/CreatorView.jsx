import { useEffect, useState } from "react";
import {
  publishManualChapter,
  removeChapterByNumber,
  uploadMarkdownChapters,
} from "../../api/chaptersApi";

export default function CreatorView({ selectedBook, onPublished }) {
  const [chapterNumberInput, setChapterNumberInput] = useState("");
  const [chapterTitleInput, setChapterTitleInput] = useState("");
  const [chapterTextInput, setChapterTextInput] = useState("");
  const [removeChapterNumberInput, setRemoveChapterNumberInput] = useState("");
  const [markdownText, setMarkdownText] = useState("");
  const [markdownFileName, setMarkdownFileName] = useState("");
  const [markdownFiles, setMarkdownFiles] = useState([]);
  const [loadingSinglePublish, setLoadingSinglePublish] = useState(false);
  const [loadingBatchPublish, setLoadingBatchPublish] = useState(false);
  const [loadingDelete, setLoadingDelete] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setStatus("");
    setError("");
    setChapterNumberInput("");
    setChapterTitleInput("");
    setChapterTextInput("");
    setRemoveChapterNumberInput("");
    setMarkdownText("");
    setMarkdownFileName("");
    setMarkdownFiles([]);
  }, [selectedBook]);

  async function handlePublishSingleChapter() {
    setStatus("");
    setError("");

    const chapterNumber = Number.parseInt(chapterNumberInput, 10);

    if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
      setError("Enter a valid chapter number.");
      return;
    }

    if (!chapterTextInput.trim()) {
      setError("Chapter content cannot be empty.");
      return;
    }

    setLoadingSinglePublish(true);

    try {
      const title = selectedBook === "book1"
        ? (chapterTitleInput.trim() || `Chapter ${chapterNumber}`)
        : `Chapter ${chapterNumber}`;

      await publishManualChapter({
        book: selectedBook,
        chapterNumber,
        title,
        rawText: chapterTextInput,
      });

      setStatus(`Published Chapter ${chapterNumber} in ${selectedBook.toUpperCase()}.`);
      setChapterNumberInput("");
      setChapterTitleInput("");
      setChapterTextInput("");
      onPublished();
    } catch (err) {
      setError(err.message || "Failed to publish chapter.");
    } finally {
      setLoadingSinglePublish(false);
    }
  }

  function handleMarkdownFileChange(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const isAllowed = file.name.toLowerCase().endsWith(".md") || file.name.toLowerCase().endsWith(".txt");

    if (!isAllowed) {
      setError("Upload a .md or .txt file for Book1 batch publish.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      setMarkdownText(text);
      setMarkdownFileName(file.name);
      setStatus(`Loaded ${file.name}. Ready to publish.`);
      setError("");
    };
    reader.readAsText(file);
  }

  async function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
      reader.readAsText(file);
    });
  }

  async function handleMarkdownFilesChange(event) {
    const files = Array.from(event.target.files || []);

    if (files.length === 0) {
      return;
    }

    const isAllowed = files.every((file) => file.name.toLowerCase().endsWith(".md") || file.name.toLowerCase().endsWith(".txt"));

    if (!isAllowed) {
      setError("Upload only .md or .txt files for Book1 multi-file batch publish.");
      return;
    }

    setLoadingBatchPublish(true);
    setError("");
    setStatus("");

    try {
      const filePayload = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          markdown: await readFileAsText(file),
        }))
      );

      setMarkdownFiles(filePayload);
      setMarkdownFileName(`${filePayload.length} file(s) loaded`);
      setStatus(`Loaded ${filePayload.length} file(s). Ready to publish.`);
    } catch (err) {
      setError(err.message || "Unable to read selected files.");
    } finally {
      setLoadingBatchPublish(false);
    }
  }

  async function handlePublishMarkdownBatch() {
    setStatus("");
    setError("");

    if (!markdownText.trim()) {
      setError("Upload an MD/TXT file first.");
      return;
    }

    setLoadingBatchPublish(true);

    try {
      const result = await uploadMarkdownChapters({
        book: "book1",
        markdown: markdownText,
      });

      setStatus(`${result.message} Extracted and published successfully.`);
      setMarkdownText("");
      setMarkdownFileName("");
      onPublished();
    } catch (err) {
      setError(err.message || "Batch publish failed.");
    } finally {
      setLoadingBatchPublish(false);
    }
  }

  async function handlePublishMarkdownFilesBatch() {
    setStatus("");
    setError("");

    if (markdownFiles.length === 0) {
      setError("Select one or more MD/TXT files first.");
      return;
    }

    setLoadingBatchPublish(true);

    try {
      const result = await uploadMarkdownChapters({
        book: "book1",
        files: markdownFiles,
      });

      setStatus(`${result.message} Extracted and published successfully.`);
      setMarkdownFiles([]);
      setMarkdownFileName("");
      onPublished();
    } catch (err) {
      setError(err.message || "Multi-file batch publish failed.");
    } finally {
      setLoadingBatchPublish(false);
    }
  }

  async function handleRemoveChapter() {
    setStatus("");
    setError("");

    const chapterNumber = Number.parseInt(removeChapterNumberInput, 10);

    if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
      setError("Enter a valid chapter number to delete.");
      return;
    }

    setLoadingDelete(true);

    try {
      const result = await removeChapterByNumber(chapterNumber, selectedBook);
      setStatus(`${result.message}. Removed ${result.deletedCount ?? 0} item(s).`);
      setRemoveChapterNumberInput("");
      onPublished();
    } catch (err) {
      setError(err.message || "Failed to remove chapter.");
    } finally {
      setLoadingDelete(false);
    }
  }

  return (
    <section className="creator-shell">
      <div className="editor-card">
        <h2>{selectedBook.toUpperCase()} Upload Dashboard</h2>
        <p className="muted">
          {selectedBook === "book1"
            ? "Book1 supports single chapter publish and direct MD batch publish."
            : "Book2 supports one chapter at a time without styling."}
        </p>

        <label htmlFor="chapter-number">Chapter Number</label>
        <input
          id="chapter-number"
          type="number"
          min="1"
          value={chapterNumberInput}
          onChange={(event) => setChapterNumberInput(event.target.value)}
          placeholder="41"
        />

        {selectedBook === "book1" && (
          <>
            <label htmlFor="chapter-title">Chapter Title (optional)</label>
            <input
              id="chapter-title"
              type="text"
              value={chapterTitleInput}
              onChange={(event) => setChapterTitleInput(event.target.value)}
              placeholder="Chapter 41 — Title"
            />
          </>
        )}

        <label htmlFor="chapter-content">Chapter Content</label>
        <textarea
          id="chapter-content"
          rows={12}
          value={chapterTextInput}
          onChange={(event) => setChapterTextInput(event.target.value)}
          placeholder={selectedBook === "book1" ? "Paste one chapter content" : "Paste one chapter content like book2 format"}
        />

        <div className="creator-actions">
          <button
            className="publish"
            type="button"
            onClick={handlePublishSingleChapter}
            disabled={loadingSinglePublish || loadingBatchPublish || loadingDelete}
          >
            {loadingSinglePublish ? "Publishing..." : "Publish Single Chapter"}
          </button>
        </div>

        {selectedBook === "book1" && (
          <>
            <label htmlFor="md-upload">Upload Book1 MD/TXT File (multi chapter)</label>
            <input
              id="md-upload"
              type="file"
              accept=".md,.txt,text/markdown,text/plain"
              onChange={handleMarkdownFileChange}
            />
            {markdownFileName && <p className="muted">Loaded file: {markdownFileName}</p>}
            <div className="creator-actions">
              <button
                className="accent"
                type="button"
                onClick={handlePublishMarkdownBatch}
                disabled={loadingSinglePublish || loadingBatchPublish || loadingDelete || !markdownText.trim()}
              >
                {loadingBatchPublish ? "Publishing Batch..." : "Publish MD Batch Immediately"}
              </button>
            </div>
            <label htmlFor="md-multi-upload">Upload multiple Book1 MD/TXT files</label>
            <input
              id="md-multi-upload"
              type="file"
              accept=".md,.txt,text/markdown,text/plain"
              multiple
              onChange={handleMarkdownFilesChange}
            />
            {markdownFiles.length > 0 && (
              <p className="muted">Selected files: {markdownFiles.map((file) => file.name).join(", ")}</p>
            )}
            <div className="creator-actions">
              <button
                className="accent"
                type="button"
                onClick={handlePublishMarkdownFilesBatch}
                disabled={loadingSinglePublish || loadingBatchPublish || loadingDelete || markdownFiles.length === 0}
              >
                {loadingBatchPublish ? "Publishing Files..." : "Publish Selected MD Files"}
              </button>
            </div>
          </>
        )}

        <div className="creator-actions creator-remove-row">
          <input
            type="number"
            min="1"
            value={removeChapterNumberInput}
            onChange={(event) => setRemoveChapterNumberInput(event.target.value)}
            placeholder="Chapter number"
            aria-label="Chapter number to remove"
          />
          <button
            type="button"
            onClick={handleRemoveChapter}
            disabled={loadingSinglePublish || loadingBatchPublish || loadingDelete || !removeChapterNumberInput.trim()}
          >
            {loadingDelete ? "Removing..." : "Remove by Chapter #"}
          </button>
        </div>

        {status && <p className="status success">{status}</p>}
        {error && <p className="status error">{error}</p>}
      </div>
    </section>
  );
}
