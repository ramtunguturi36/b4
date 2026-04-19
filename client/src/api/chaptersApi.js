const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000/api";

function toQueryString(params) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    searchParams.set(key, String(value));
  });

  const output = searchParams.toString();
  return output ? `?${output}` : "";
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }

  return data;
}

export function listPublishedChapters(book = "book1") {
  return apiRequest(`/chapters${toQueryString({ book })}`);
}

export function getPublishedChapter(id, book = "book1") {
  return apiRequest(`/chapters/${id}${toQueryString({ book })}`);
}

export function publishManualChapter(payload) {
  return apiRequest("/chapters/manual-publish", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function uploadMarkdownChapters(payload) {
  return apiRequest("/chapters/upload-md", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function removeChapterByNumber(chapterNumber, book = "book1") {
  return apiRequest(`/chapters/chapter-number/${chapterNumber}${toQueryString({ book })}`, {
    method: "DELETE",
  });
}

export async function downloadPublishedChaptersPdf(options = {}) {
  const {
    book = "book1",
    fromChapter,
    toChapter,
  } = options;

  const query = toQueryString({
    book,
    mode: "kindle",
    fromChapter,
    toChapter,
  });

  const response = await fetch(`${API_BASE}/chapters/export/pdf${query}`);

  if (!response.ok) {
    let message = "Unable to generate PDF.";

    try {
      const data = await response.json();
      message = data.message || message;
    } catch {
      // Keep default error message when response is not JSON.
    }

    throw new Error(message);
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get("content-disposition") || "";
  const fileNameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  const fileName = fileNameMatch?.[1] || "novel-chapters.pdf";

  return { blob, fileName };
}

export async function downloadPublishedChaptersEpub(options = {}) {
  const {
    book = "book1",
    fromChapter,
    toChapter,
  } = options;

  const query = toQueryString({
    book,
    fromChapter,
    toChapter,
  });

  const response = await fetch(`${API_BASE}/chapters/export/epub${query}`);

  if (!response.ok) {
    let message = "Unable to generate EPUB.";

    try {
      const data = await response.json();
      message = data.message || message;
    } catch {
      // Keep default error message when response is not JSON.
    }

    throw new Error(message);
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get("content-disposition") || "";
  const fileNameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  const fileName = fileNameMatch?.[1] || "novel-kindle.epub";

  return { blob, fileName };
}
