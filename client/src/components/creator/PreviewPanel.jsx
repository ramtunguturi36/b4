import ContentRenderer from "../reader/ContentRenderer";

export default function PreviewPanel({ title, content }) {
  return (
    <section className="preview-card">
      <h3>Preview Mode</h3>
      <h4>{title || "Untitled Chapter"}</h4>
      <ContentRenderer blocks={content?.length ? content : [{ type: "paragraph", text: "Styled output will appear here." }]} />
    </section>
  );
}
