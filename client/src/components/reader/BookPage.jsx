import { forwardRef } from "react";
import ContentRenderer from "./ContentRenderer";

const BookPage = forwardRef(function BookPage({ blocks, side, pageNumber }, ref) {
  return (
    <article ref={ref} className={`book-page ${side}`}>
      <div className="book-page-inner">
        <ContentRenderer blocks={blocks} />
      </div>
      <span className="book-folio" aria-hidden="true">
        {pageNumber}
      </span>
    </article>
  );
});

export default BookPage;
