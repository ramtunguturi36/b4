export default function ContentRenderer({ blocks }) {
  return (
    <div className="content-renderer">
      {blocks.map((block, index) => {
        if (block.type === "paragraph") {
          return (
            <p key={`${block.type}-${index}`} className="book-paragraph">
              {block.text}
            </p>
          );
        }

        if (block.type === "highlight") {
          return (
            <blockquote key={`${block.type}-${index}`} className="book-highlight">
              {block.text}
            </blockquote>
          );
        }

        return (
          <div key={`${block.type}-${index}`} className="book-divider" aria-hidden="true">
            — ✦ —
          </div>
        );
      })}
    </div>
  );
}
