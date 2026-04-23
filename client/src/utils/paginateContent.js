export function paginateContent(content, isMobile) {
  const pages = [];
  // Conservative page limits to ensure no cutoff
  // Desktop: ~660px available height - header/footer - margins
  // Mobile: ~520px available height - header/footer - margins
  const maxUnits = isMobile ? 510 : 665;

  let current = [];
  let units = 0;

  const chunkTextBySize = (text, maxCharsPerChunk) => {
    const words = String(text || "").trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      return [];
    }

    const chunks = [];
    let chunk = "";

    for (const word of words) {
      const next = chunk ? `${chunk} ${word}` : word;

      if (next.length > maxCharsPerChunk && chunk) {
        chunks.push(chunk);
        chunk = word;
      } else {
        chunk = next;
      }
    }

    if (chunk) {
      chunks.push(chunk);
    }

    return chunks;
  };

  const blockCost = (block) => {
    if (block.type === "divider") {
      // Dividers take minimal space (~60px with margins)
      return 64;
    }

    if (block.type === "highlight") {
      // Highlights are centered italic, take more space than regular paragraphs
      // Base 80px for vertical spacing + scaled by text length
      const textLength = block.text?.length || 0;
      const estimatedLines = Math.ceil(textLength / 50);
      return 84 + estimatedLines * 33;
    }

    // Regular paragraphs
    const textLength = block.text?.length || 0;
    // At 44ch width, approximately 50 chars per line with line-height 1.82 (~32px per line)
    const estimatedLines = Math.ceil(textLength / 50);
    return Math.max(54, estimatedLines * 31 + 18);
  };

  const normalizedBlocks = content.flatMap((block) => {
    if (block.type !== "paragraph" && block.type !== "highlight") {
      return [block];
    }

    const cost = blockCost(block);
    if (cost <= maxUnits) {
      return [block];
    }

    // Split very long text blocks so they can span multiple pages safely.
    const maxCharsPerChunk = isMobile ? 420 : 560;
    const chunks = chunkTextBySize(block.text, maxCharsPerChunk);

    if (chunks.length === 0) {
      return [block];
    }

    return chunks.map((text) => ({
      ...block,
      text,
    }));
  });

  for (const block of normalizedBlocks) {
    const cost = blockCost(block);

    // More aggressive pagination: if adding exceeds limit, start new page
    if (units + cost > maxUnits && current.length > 0) {
      pages.push(current);
      current = [];
      units = 0;
    }

    current.push(block);
    units += cost;
  }

  if (current.length > 0) {
    pages.push(current);
  }

  return pages.length > 0 ? pages : [[{ type: "paragraph", text: "No content yet." }]];
}
