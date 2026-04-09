import { useEffect, useRef } from "react";
import HTMLFlipBook from "react-pageflip";
import BookPage from "./BookPage";

export default function BookView({
  pages,
  chapterId,
  isMobile,
  isFullscreen,
  pageIndex,
  onPageChange,
  onExitFullscreen,
}) {
  const flipBookRef = useRef(null);
  const bookFrameRef = useRef(null);
  const fadeTimeoutRef = useRef(null);
  const isFlippingRef = useRef(false);

  useEffect(() => {
    if (!isFullscreen || !bookFrameRef.current) return;

    function showNavButtons() {
      bookFrameRef.current?.classList.remove("nav-faded");
      clearTimeout(fadeTimeoutRef.current);
      fadeTimeoutRef.current = setTimeout(() => {
        bookFrameRef.current?.classList.add("nav-faded");
      }, 2800);
    }

    function handleKeyDown(e) {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        goToNextPage();
        showNavButtons();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goToPreviousPage();
        showNavButtons();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onExitFullscreen();
      }
    }

    window.addEventListener("mousemove", showNavButtons);
    window.addEventListener("touchstart", showNavButtons);
    window.addEventListener("keydown", handleKeyDown);

    showNavButtons();

    return () => {
      window.removeEventListener("mousemove", showNavButtons);
      window.removeEventListener("touchstart", showNavButtons);
      window.removeEventListener("keydown", handleKeyDown);
      clearTimeout(fadeTimeoutRef.current);
    };
  }, [isFullscreen, onExitFullscreen]);

  useEffect(() => {
    const engine = flipBookRef.current?.pageFlip?.();
    if (!engine) return;

    const currentPage = engine.getCurrentPageIndex?.();
    if (currentPage === pageIndex) return;

    if (typeof engine.turnToPage === "function") {
      engine.turnToPage(pageIndex);
      return;
    }

    if (typeof engine.flip === "function") {
      engine.flip(pageIndex);
    }
  }, [pageIndex]);

  function goToNextPage() {
    if (isFlippingRef.current || pageIndex >= pages.length - 1) return;
    isFlippingRef.current = true;
    flipBookRef.current?.pageFlip()?.flipNext();
    setTimeout(() => {
      isFlippingRef.current = false;
    }, 750);
  }

  function goToPreviousPage() {
    if (isFlippingRef.current || pageIndex <= 0) return;
    isFlippingRef.current = true;
    flipBookRef.current?.pageFlip()?.flipPrev();
    setTimeout(() => {
      isFlippingRef.current = false;
    }, 750);
  }

  const touchStartRef = useRef(null);

  function handleClickZone(e) {
    if (e.target?.closest?.(".book-nav") || e.target?.closest?.(".fullscreen-exit")) {
      return;
    }

    // Ignore if user is selecting text
    if (window.getSelection?.()?.toString()) {
      return;
    }

    const frame = bookFrameRef.current;
    if (!frame) return;

    const rect = frame.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    
    // Get click position from mouse event only
    const clickX = e.clientX;

    if (!clickX) return;

    // Left half: previous page
    if (clickX < centerX && pageIndex > 0) {
      goToPreviousPage();
    }
    // Right half: next page
    else if (clickX > centerX && pageIndex < pages.length - 1) {
      goToNextPage();
    }
  }

  function handleTouchStart(e) {
    // Store initial touch position for swipe detection
    touchStartRef.current = {
      x: e.touches?.[0]?.clientX,
      y: e.touches?.[0]?.clientY,
      time: Date.now(),
    };
  }

  function handleTouchEnd(e) {
    if (!touchStartRef.current) return;

    const endX = e.changedTouches?.[0]?.clientX;
    const endY = e.changedTouches?.[0]?.clientY;
    const endTime = Date.now();

    const deltaX = endX - touchStartRef.current.x;
    const deltaY = Math.abs(endY - touchStartRef.current.y);
    const deltaTime = endTime - touchStartRef.current.time;

    // Detect swipe if:
    // - Primarily horizontal (vertical movement < horizontal movement)
    // - Quick swipe (under 600ms)
    // - Sufficient distance (at least 20px)
    if (deltaTime < 600 && Math.abs(deltaX) > 20 && deltaY < Math.abs(deltaX) * 0.5) {
      if (deltaX > 0 && pageIndex > 0) {
        // Swiped right: previous page
        goToPreviousPage();
      } else if (deltaX < 0 && pageIndex < pages.length - 1) {
        // Swiped left: next page
        goToNextPage();
      }
    }

    touchStartRef.current = null;
  }

  return (
    <div className={`book-stage ${isFullscreen ? "immersive" : ""}`}>
      {isFullscreen && (
        <button className="fullscreen-exit" type="button" onClick={onExitFullscreen} aria-label="Exit fullscreen (or press ESC)">
          Exit
        </button>
      )}

      <div className="book-frame" ref={bookFrameRef} onClick={handleClickZone}>
        {/* Touch overlay to capture mobile swipes */}
        <div
          className="touch-overlay"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            pointerEvents: "auto",
          }}
        />
        <HTMLFlipBook
          ref={flipBookRef}
          key={`${chapterId}-${isMobile ? "mobile" : "desktop"}`}
          width={isMobile ? 340 : 560}
          height={isMobile ? 560 : 740}
          minWidth={300}
          maxWidth={620}
          minHeight={460}
          maxHeight={760}
          drawShadow={!isMobile}
          mobileScrollSupport
          showPageCorners={!isFullscreen}
          className="flipbook real-book"
          startPage={0}
          flippingTime={700}
          disableFlipByClick
          usePortrait={isMobile}
          startZIndex={0}
          autoSize
          maxShadowOpacity={isMobile ? 0.15 : 0.45}
          onFlip={(e) => onPageChange(e.data)}
        >
          {pages.map((blocks, index) => (
            <BookPage
              key={`page-${index}`}
              blocks={blocks}
              side={index % 2 === 0 ? "left" : "right"}
              pageNumber={index + 1}
            />
          ))}
        </HTMLFlipBook>

        <button
          className={`book-nav book-nav-left ${isFullscreen ? "minimal" : ""}`}
          type="button"
          onClick={goToPreviousPage}
          disabled={pageIndex === 0}
          aria-label="Previous page"
        >
          {"<"}
        </button>

        <button
          className={`book-nav book-nav-right ${isFullscreen ? "minimal" : ""}`}
          type="button"
          onClick={goToNextPage}
          disabled={pageIndex >= pages.length - 1}
          aria-label="Next page"
        >
          {">"}
        </button>
      </div>
    </div>
  );
}
