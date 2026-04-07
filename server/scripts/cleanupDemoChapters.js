import dotenv from "dotenv";
import mongoose from "mongoose";
import { Chapter } from "../src/models/Chapter.js";

dotenv.config({ path: new URL("../.env", import.meta.url).pathname });

const DEMO_TITLES = [
  "Demo Chapter 1: Lanterns Over Old Harbor",
  "Demo Chapter 2: A Window of Winter Light",
  "Demo Chapter 3: Beneath the Banyan Clock",
  "Demo Chapter 4: The Library After Rain",
  "Demo Chapter 5: Tide Road at Dawn",
  "Demo Chapter 6: The Last Library (Multi-Page)",
];

const shouldExecute = process.argv.includes("--execute");

const cleanupFilter = {
  $or: [
    { isDemo: true },
    { title: { $in: DEMO_TITLES } },
  ],
};

async function main() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is missing. Set it in server/.env before running cleanup.");
  }

  await mongoose.connect(uri);

  const matches = await Chapter.find(cleanupFilter, { title: 1, isDemo: 1, isPublished: 1 }).lean();

  if (matches.length === 0) {
    console.log("No demo records found. Nothing to clean.");
    return;
  }

  console.log(`Found ${matches.length} demo record(s):`);
  for (const chapter of matches) {
    console.log(`- ${chapter._id} | ${chapter.title}`);
  }

  if (!shouldExecute) {
    console.log("Dry run only. Re-run with --execute to delete these records.");
    return;
  }

  const result = await Chapter.deleteMany(cleanupFilter);
  console.log(`Deleted ${result.deletedCount} demo record(s).`);
}

main()
  .catch((error) => {
    console.error("Cleanup failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
