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
    book: {
      type: String,
      enum: ["book1", "book2", "book3"],
      default: "book1",
      index: true,
    },
    chapterNumber: {
      type: Number,
      default: null,
      index: true,
    },
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
