import { useState } from "react";
import CreatorView from "./components/creator/CreatorView";
import ReaderView from "./components/reader/ReaderView";

export default function App() {
  const [activeTab, setActiveTab] = useState("reader");
  const [selectedBook, setSelectedBook] = useState("book1");
  const [bookTitles, setBookTitles] = useState(() => ({
    book1: localStorage.getItem("bookTitle:book1") || "Before we met",
    book2: localStorage.getItem("bookTitle:book2") || "Before You Were Mine",
    book3: localStorage.getItem("bookTitle:book3") || "New Book 3",
  }));
  const [theme, setTheme] = useState("light");
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [immersiveMode, setImmersiveMode] = useState(false);

  function handleBookTitleChange(event) {
    const value = event.target.value;

    setBookTitles((current) => {
      const next = { ...current, [selectedBook]: value };
      localStorage.setItem(`bookTitle:${selectedBook}`, value);
      return next;
    });
  }

  function toggleTheme() {
    setTheme((current) => (current === "light" ? "dark" : "light"));
  }

  return (
    <div className={`app-shell theme-${theme} ${immersiveMode ? "app-immersive" : ""}`}>
      <header className={`app-header ${immersiveMode ? "hidden-ui" : ""}`}>
        <h1>UI-Based Novel Reading Platform</h1>
        <div className="tabs">
          <button
            className={activeTab === "reader" ? "active" : ""}
            onClick={() => setActiveTab("reader")}
          >
            Reader
          </button>
          <button
            className={activeTab === "creator" ? "active" : ""}
            onClick={() => setActiveTab("creator")}
          >
            Creator
          </button>
        </div>
        <div className="tabs">
          <button
            className={selectedBook === "book1" ? "active" : ""}
            onClick={() => setSelectedBook("book1")}
          >
            Book1
          </button>
          <button
            className={selectedBook === "book2" ? "active" : ""}
            onClick={() => setSelectedBook("book2")}
          >
            Book2
          </button>
          <button
            className={selectedBook === "book3" ? "active" : ""}
            onClick={() => setSelectedBook("book3")}
          >
            Book3
          </button>
        </div>
        <input
          className="jump-input"
          style={{ maxWidth: 320, marginTop: 8 }}
          type="text"
          value={bookTitles[selectedBook]}
          onChange={handleBookTitleChange}
          placeholder="Book title"
          aria-label="Book title"
        />
      </header>

      <main>
        {activeTab === "reader" ? (
          <ReaderView
            key={`${selectedBook}-${refreshSignal}`}
            selectedBook={selectedBook}
            bookTitle={bookTitles[selectedBook]}
            theme={theme}
            onToggleTheme={toggleTheme}
            onImmersiveChange={setImmersiveMode}
          />
        ) : (
          <CreatorView
            selectedBook={selectedBook}
            onPublished={() => setRefreshSignal((v) => v + 1)}
          />
        )}
      </main>
    </div>
  );
}
