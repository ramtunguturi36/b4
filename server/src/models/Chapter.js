import mongoose from "mongoose";

const contentBlockSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["paragraph", "highlight", "divider"],
      required: true,
    },
    text: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const chapterSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    rawText: {
      type: String,
      required: true,
    },
    content: {
      type: [contentBlockSchema],
      default: [],
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export const Chapter = mongoose.model("Chapter", chapterSchema);
