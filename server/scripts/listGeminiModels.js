import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log("Loaded key starts with:", apiKey ? apiKey.substring(0, 15) + "..." : "undefined");

  if (!apiKey) {
    console.error("GEMINI_API_KEY is missing in server/.env");
    process.exit(1);
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url);

  if (!response.ok) {
    const body = await response.text();
    console.error(`Failed to fetch models: ${response.status} ${response.statusText}`);
    console.error(body);
    process.exit(1);
  }

  const data = await response.json();
  const models = Array.isArray(data.models) ? data.models : [];

  if (models.length === 0) {
    console.log("No models returned for this API key.");
    return;
  }

  const usableForGenerateContent = models
    .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
    .map((m) => ({
      name: (m.name || "").replace(/^models\//, ""),
      displayName: m.displayName || "",
      description: m.description || "",
      inputTokenLimit: m.inputTokenLimit ?? "n/a",
      outputTokenLimit: m.outputTokenLimit ?? "n/a",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  console.log("Gemini models available for generateContent:\n");
  for (const model of usableForGenerateContent) {
    console.log(`- ${model.name}`);
    if (model.displayName) console.log(`  display: ${model.displayName}`);
    console.log(`  tokens: input=${model.inputTokenLimit}, output=${model.outputTokenLimit}`);
    if (model.description) console.log(`  note: ${model.description}`);
  }

  if (usableForGenerateContent.length === 0) {
    console.log("No generateContent-capable models found for this API key.");
  }
}

main().catch((error) => {
  console.error("Error while listing Gemini models:", error.message);
  process.exit(1);
});
