import { GoogleGenerativeAI } from "@google/generative-ai";

const PROMPT_TEMPLATE = `You are a professional novel formatting engine.

Your task is to convert raw novel chapter text into a structured JSON format for a digital book reading UI.

--------------------------------------------------
STRICT RULES (VERY IMPORTANT)
--------------------------------------------------

1. DO NOT rewrite, summarize, or modify the text.
2. Preserve original wording exactly.
3. Only structure and classify content.

--------------------------------------------------
OUTPUT FORMAT (STRICT JSON ONLY)
--------------------------------------------------

Return ONLY valid JSON. No explanation.

{
  "title": "Chapter title if present, else empty string",
  "content": [
    { "type": "paragraph", "text": "..." },
    { "type": "highlight", "text": "..." },
    { "type": "divider" }
  ]
}

--------------------------------------------------
FORMATTING RULES
--------------------------------------------------

1. Paragraphs:
- Split text into clean paragraphs
- Avoid very long blocks
- Keep natural reading flow

2. Highlights (VERY IMPORTANT):
- Select ONLY the most emotionally impactful lines
- Maximum: 3 highlights per chapter
- A highlight should:
  - be meaningful alone
  - feel cinematic or reflective
  - NOT be generic

Examples of good highlights:
- "He was very wrong about that."
- "In that quiet, Kiran could exist without performing."

Examples to AVOID:
- descriptive filler lines
- long paragraphs

3. Dividers:
- Insert ONLY when there is a clear shift in:
  - scene
  - time
  - emotional tone

- Maximum: 3 dividers
- Never place dividers too close together

--------------------------------------------------
PRIORITY LOGIC
--------------------------------------------------

Follow this order:

1. Preserve readability
2. Maintain emotional rhythm
3. Avoid over-formatting

--------------------------------------------------
COMMON MISTAKES TO AVOID
--------------------------------------------------

- Too many highlights
- Random dividers
- Changing wording
- Returning invalid JSON

--------------------------------------------------
QUALITY CHECK BEFORE OUTPUT
--------------------------------------------------

Ensure:
- JSON is valid
- content array is clean
- highlights <= 3
- dividers <= 3

--------------------------------------------------
INPUT TEXT
--------------------------------------------------

Chapter title: {{TITLE}}

{{CHAPTER_TEXT}}`;

function sanitizeAndValidate(payload, fallbackTitle) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Gemini returned empty content");
  }

  const normalizedTitle = typeof payload.title === "string" && payload.title.trim()
    ? payload.title.trim()
    : fallbackTitle;

  if (!Array.isArray(payload.content)) {
    throw new Error("Gemini JSON missing content array");
  }

  let highlightCount = 0;
  let dividerCount = 0;

  const normalizedContent = payload.content
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      if (item.type === "divider") {
        dividerCount += 1;
        if (dividerCount > 3) {
          return null;
        }
        return { type: "divider" };
      }

      if ((item.type === "paragraph" || item.type === "highlight") && typeof item.text === "string") {
        if (item.type === "highlight") {
          highlightCount += 1;
          if (highlightCount > 3) {
            return null;
          }
        }
        return {
          type: item.type,
          text: item.text.trim(),
        };
      }

      return null;
    })
    .filter(Boolean)
    .filter((item) => item.type === "divider" || item.text.length > 0);

  if (normalizedContent.length === 0) {
    throw new Error("Gemini JSON had no usable content blocks");
  }

  return {
    title: normalizedTitle,
    content: normalizedContent,
  };
}

function extractJson(text) {
  // Gemini may wrap JSON in markdown fences; this strips wrappers safely.
  const cleaned = text.replace(/```json|```/gi, "").trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Model response did not contain JSON");
  }

  return cleaned.slice(firstBrace, lastBrace + 1);
}

export async function styleWithGemini({ title, rawText, apiKey }) {
  const finalApiKey = apiKey || process.env.GEMINI_API_KEY || "";

  if (!finalApiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const genAI = new GoogleGenerativeAI(finalApiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = PROMPT_TEMPLATE
    .replace("{{TITLE}}", title)
    .replace("{{CHAPTER_TEXT}}", rawText);

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
    },
  });
  const text = result.response.text();
  // Parse only the JSON body to avoid accidental prose around the payload.
  const jsonPayload = JSON.parse(extractJson(text));

  return sanitizeAndValidate(jsonPayload, title);
}
