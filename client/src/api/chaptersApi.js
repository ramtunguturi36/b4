const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000/api";

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

export function listPublishedChapters() {
  return apiRequest("/chapters");
}

export function getPublishedChapter(id) {
  return apiRequest(`/chapters/${id}`);
}

export function createDraft(payload) {
  return apiRequest("/chapters", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function styleChapter(payload) {
  return apiRequest("/chapters/style", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateChapter(id, payload) {
  return apiRequest(`/chapters/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function publishChapter(id) {
  return apiRequest(`/chapters/${id}/publish`, {
    method: "POST",
  });
}

export function removeChapterByNumber(chapterNumber) {
  return apiRequest(`/chapters/chapter-number/${chapterNumber}`, {
    method: "DELETE",
  });
}
