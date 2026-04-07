import { useState } from "react";
import CreatorView from "./components/creator/CreatorView";
import ReaderView from "./components/reader/ReaderView";

export default function App() {
  const [activeTab, setActiveTab] = useState("reader");
  const [theme, setTheme] = useState("light");
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [immersiveMode, setImmersiveMode] = useState(false);

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
      </header>

      <main>
        {activeTab === "reader" ? (
          <ReaderView
            key={refreshSignal}
            theme={theme}
            onToggleTheme={toggleTheme}
            onImmersiveChange={setImmersiveMode}
          />
        ) : (
          <CreatorView onPublished={() => setRefreshSignal((v) => v + 1)} />
        )}
      </main>
    </div>
  );
}
