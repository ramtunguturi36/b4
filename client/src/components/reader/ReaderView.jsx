import { useEffect, useMemo, useRef, useState } from "react";
import {
  downloadPublishedChaptersEpub,
  downloadPublishedChaptersPdf,
  getPublishedChapter,
  listPublishedChapters,
} from "../../api/chaptersApi";
import { paginateContent } from "../../utils/paginateContent";
import BookView from "./BookView";

function extractChapterNumber(chapter) {
  if (Number.isInteger(chapter?.chapterNumber) && chapter.chapterNumber > 0) {
    return chapter.chapterNumber;
  }

  const match = String(chapter?.title || "").match(/^\s*chapter\s*(\d+)\b/i);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

function sortChapters(a, b) {
  const aNum = extractChapterNumber(a);
  const bNum = extractChapterNumber(b);

  if (Number.isFinite(aNum) && Number.isFinite(bNum) && aNum !== bNum) {
    return aNum - bNum;
  }

  return new Date(a.createdAt || a.updatedAt || 0) - new Date(b.createdAt || b.updatedAt || 0);
}

export default function ReaderView({ selectedBook, bookTitle, theme, onToggleTheme, onImmersiveChange }) {
  const [chapters, setChapters] = useState([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [bookResetToken, setBookResetToken] = useState(0);
  const [pageJumpInput, setPageJumpInput] = useState("");
  const [chapterJumpInput, setChapterJumpInput] = useState("");
  const [exportFromChapter, setExportFromChapter] = useState("");
  const [exportToChapter, setExportToChapter] = useState("");
  const [loading, setLoading] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingEpub, setDownloadingEpub] = useState(false);
  const [error, setError] = useState("");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 900);
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));
  const [isBookOpen, setIsBookOpen] = useState(false);
  const [coverImage, setCoverImage] = useState("");
  const coverInputRef = useRef(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const coverKey = `readerCoverImage:${selectedBook}`;
    setCoverImage(localStorage.getItem(coverKey) || "");
  }, [selectedBook]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement);
      setIsFullscreen(active);
      onImmersiveChange?.(active);
      document.body.style.overflow = active ? "hidden" : "";
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.body.style.overflow = "";
    };
  }, [onImmersiveChange]);

  useEffect(() => {
    async function loadChapters() {
      setLoading(true);
      setError("");

      try {
        const list = await listPublishedChapters(selectedBook);
        const sorted = [...list].sort(sortChapters);

        const details = await Promise.all(
          sorted.map(async (item) => {
            const chapter = await getPublishedChapter(item._id, selectedBook);
            return {
              ...item,
              ...chapter,
            };
          })
        );

        setChapters(details);
        setPageIndex(0);
        setIsBookOpen(false);
      } catch (err) {
        setError(err.message || "Failed to load chapters.");
      } finally {
        setLoading(false);
      }
    }

    loadChapters();
  }, [selectedBook]);

  const bookData = useMemo(() => {
    const pages = [];
    const pageMeta = [];
    const startPageByChapterId = {};

    chapters.forEach((chapter) => {
      const chapterPages = paginateContent(chapter.content || [], isMobile);
      startPageByChapterId[chapter._id] = pages.length;

      chapterPages.forEach((blocks, index) => {
        pages.push(blocks);
        pageMeta.push({
          chapterId: chapter._id,
          chapterTitle: chapter.title,
          chapterPage: index + 1,
          chapterPageCount: chapterPages.length,
        });
      });
    });

    return {
      pages,
      pageMeta,
      startPageByChapterId,
    };
  }, [chapters, isMobile]);

  const activePageMeta = bookData.pageMeta[pageIndex] || null;
  const progress = bookData.pages.length > 0 ? ((pageIndex + 1) / bookData.pages.length) * 100 : 0;
  const chapterSignature = useMemo(() => chapters.map((item) => item._id).join("-"), [chapters]);

  const hasStrictContiguousChapterNumbers = useMemo(() => {
    if (chapters.length === 0) return false;

    const chapterNumbers = chapters
      .map((item) => extractChapterNumber(item))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b);

    if (chapterNumbers.length !== chapters.length) {
      return false;
    }

    for (let index = 0; index < chapterNumbers.length; index += 1) {
      if (chapterNumbers[index] !== index + 1) {
        return false;
      }
    }

    return true;
  }, [chapters]);

  function parseExportRange() {
    if (!exportFromChapter.trim() && !exportToChapter.trim()) {
      return { fromChapter: undefined, toChapter: undefined };
    }

    const fromChapter = exportFromChapter.trim() ? Number.parseInt(exportFromChapter, 10) : undefined;
    const toChapter = exportToChapter.trim() ? Number.parseInt(exportToChapter, 10) : undefined;

    if ((exportFromChapter.trim() && !Number.isInteger(fromChapter)) || (exportToChapter.trim() && !Number.isInteger(toChapter))) {
      throw new Error("Enter valid chapter numbers for custom export.");
    }

    if (fromChapter !== undefined && fromChapter < 1) {
      throw new Error("From chapter must be 1 or greater.");
    }

    if (toChapter !== undefined && toChapter < 1) {
      throw new Error("To chapter must be 1 or greater.");
    }

    if (fromChapter !== undefined && toChapter !== undefined && fromChapter > toChapter) {
      throw new Error("Invalid export range. Use positive values and keep From <= To.");
    }

    return { fromChapter, toChapter };
  }

  function handlePageChange(nextPage) {
    setPageIndex(nextPage);
  }

  function jumpToPage() {
    const targetPage = Number.parseInt(pageJumpInput, 10);

    if (!Number.isInteger(targetPage)) {
      setError("Enter a valid page number.");
      return;
    }

    if (targetPage < 1 || targetPage > bookData.pages.length) {
      setError(`Page must be between 1 and ${bookData.pages.length}.`);
      return;
    }

    setError("");
    setIsBookOpen(true);
    setPageIndex(targetPage - 1);
    setBookResetToken((value) => value + 1);
  }

  function jumpToChapter() {
    const targetChapterNumber = Number.parseInt(chapterJumpInput, 10);

    if (!Number.isInteger(targetChapterNumber) || targetChapterNumber < 1) {
      setError("Enter a valid chapter number.");
      return;
    }

    let chapter = chapters.find((item) => extractChapterNumber(item) === targetChapterNumber);

    if (!chapter && hasStrictContiguousChapterNumbers && targetChapterNumber <= chapters.length) {
      chapter = chapters[targetChapterNumber - 1];
    }

    if (!chapter) {
      setError(`Chapter ${targetChapterNumber} not found.`);
      return;
    }

    const startPage = bookData.startPageByChapterId[chapter._id];

    if (typeof startPage !== "number") {
      setError("Unable to jump to that chapter right now.");
      return;
    }

    setError("");
    setIsBookOpen(true);
    setPageIndex(startPage);
    setBookResetToken((value) => value + 1);
  }

  function openBookFromStart() {
    setIsBookOpen(true);
    setPageIndex(0);
  }

  function triggerCoverUpload() {
    coverInputRef.current?.click();
  }

  function handleCoverFileChange(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please upload a valid image file for the cover.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setCoverImage(result);
      localStorage.setItem(`readerCoverImage:${selectedBook}`, result);
      setError("");
    };
    reader.readAsDataURL(file);
  }

  async function toggleFullscreen() {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      return;
    }

    if (document.exitFullscreen) {
      await document.exitFullscreen();
    }
  }

  async function handleDownloadKindlePdf() {
    setError("");
    setDownloadingPdf(true);

    try {
      const range = parseExportRange();
      const { blob, fileName } = await downloadPublishedChaptersPdf({
        book: selectedBook,
        bookTitle,
        ...range,
      });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(err.message || "Failed to download Kindle PDF.");
    } finally {
      setDownloadingPdf(false);
    }
  }

  async function handleDownloadEpub() {
    setError("");
    setDownloadingEpub(true);

    try {
      const range = parseExportRange();
      const { blob, fileName } = await downloadPublishedChaptersEpub({
        book: selectedBook,
        bookTitle,
        ...range,
      });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(err.message || "Failed to download EPUB.");
    } finally {
      setDownloadingEpub(false);
    }
  }

  return (
    <section className={`reader-shell ${isFullscreen ? "fullscreen-active" : ""}`}>
      <div className="reader-topbar">
        <div className="progress-track" role="progressbar" aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className={`reader-controls ${isFullscreen ? "hidden-ui" : ""}`}>
          <div className="jump-controls" role="group" aria-label="Jump to chapter or page">
            <input
              className="jump-input"
              type="number"
              min="1"
              inputMode="numeric"
              placeholder="Chapter #"
              value={chapterJumpInput}
              onChange={(e) => setChapterJumpInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  jumpToChapter();
                }
              }}
            />
            <button className="theme-toggle jump-btn" type="button" onClick={jumpToChapter}>
              Go Chapter
            </button>
          </div>
          <div className="jump-controls" role="group" aria-label="Jump to global page">
            <input
              className="jump-input"
              type="number"
              min="1"
              inputMode="numeric"
              placeholder="Page #"
              value={pageJumpInput}
              onChange={(e) => setPageJumpInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  jumpToPage();
                }
              }}
            />
            <button className="theme-toggle jump-btn" type="button" onClick={jumpToPage}>
              Go Page
            </button>
          </div>
          <div className="jump-controls" role="group" aria-label="Export range">
            <input
              className="jump-input"
              type="number"
              min="1"
              inputMode="numeric"
              placeholder="From ch"
              value={exportFromChapter}
              onChange={(event) => setExportFromChapter(event.target.value)}
            />
            <input
              className="jump-input"
              type="number"
              min="1"
              inputMode="numeric"
              placeholder="To ch"
              value={exportToChapter}
              onChange={(event) => setExportToChapter(event.target.value)}
            />
          </div>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            onChange={handleCoverFileChange}
            className="cover-upload-input"
          />
          <button className="theme-toggle" onClick={triggerCoverUpload} type="button">
            Upload Cover
          </button>
          <button className="theme-toggle" onClick={() => setIsBookOpen(false)} type="button">
            Show Cover
          </button>
          <button className="theme-toggle" onClick={onToggleTheme}>
            {theme === "light" ? "Dark Mode" : "Light Mode"}
          </button>
          <button className="theme-toggle" onClick={toggleFullscreen}>
            {isFullscreen ? "Exit Fullscreen" : "Fullscreen Mode"}
          </button>
          <button
            className="theme-toggle"
            onClick={handleDownloadKindlePdf}
            type="button"
            disabled={downloadingPdf || downloadingEpub || loading || chapters.length === 0}
          >
            {downloadingPdf ? "Preparing Kindle PDF..." : "Kindle PDF"}
          </button>
          <button
            className="theme-toggle"
            onClick={handleDownloadEpub}
            type="button"
            disabled={downloadingPdf || downloadingEpub || loading || chapters.length === 0}
          >
            {downloadingEpub ? "Preparing EPUB..." : "Kindle EPUB"}
          </button>
        </div>
      </div>

      {error && <p className="status error">{error}</p>}
      {loading && <p className="status">Loading chapters...</p>}

      {!loading && !error && !isBookOpen && chapters.length > 0 && (
        <div className="book-cover-screen">
          <button className="book-cover" type="button" onClick={openBookFromStart} aria-label="Open book from Chapter 1">
            {coverImage ? (
              <img src={coverImage} alt="Book cover" className="book-cover-image" />
            ) : (
              <div className="book-cover-fallback">
                <span className="book-cover-kicker">{selectedBook.toUpperCase()}</span>
                <strong>{bookTitle || chapters[0]?.title || "Chapter 1"}</strong>
                <span>Click to Open</span>
              </div>
            )}
          </button>
          <p className="chapter-subtle">Click the cover to start from Chapter 1 and read continuously.</p>
        </div>
      )}

      {!loading && isBookOpen && bookData.pages.length > 0 && (
        <>
          <header className="chapter-header">
            <h2>{activePageMeta?.chapterTitle || "Book"}</h2>
            <p>
              Page {pageIndex + 1} / {bookData.pages.length}
            </p>
            {activePageMeta && (
              <p className="chapter-subtle">
                {activePageMeta.chapterTitle} · Chapter Page {activePageMeta.chapterPage} / {activePageMeta.chapterPageCount}
              </p>
            )}
            {!isFullscreen && <p className="chapter-subtle">Use the side arrows or swipe to turn pages.</p>}
          </header>

          <BookView
            pages={bookData.pages}
            chapterId={chapterSignature}
            resetToken={bookResetToken}
            isMobile={isMobile}
            isFullscreen={isFullscreen}
            pageIndex={pageIndex}
            onPageChange={handlePageChange}
            onExitFullscreen={toggleFullscreen}
          />

          {isFullscreen && (
            <div className="fullscreen-page-info">
              {pageIndex + 1} / {bookData.pages.length}
            </div>
          )}
        </>
      )}

      {!loading && chapters.length === 0 && !error && <p className="status">No published chapters in {selectedBook.toUpperCase()}.</p>}
    </section>
  );
}
