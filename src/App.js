//書き換えうまくいくかな

import { useState, useCallback, useRef, useEffect } from "react";

// ── Markdown Parser ─────────────────────────────────────────────────────────
function parseMarkdown(md) {
  if (!md) return "";
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = md.split("\n");
  const html = [];
  let i = 0;

  const inlineFormat = (text) => {
    let t = esc(text);
    t = t.replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>");
    t = t.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/__(.*?)__/g, "<strong>$1</strong>");
    t = t.replace(/\*(.*?)\*/g, "<em>$1</em>");
    t = t.replace(/_(.*?)_/g, "<em>$1</em>");
    t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    t = t.replace(/~~(.*?)~~/g, "<del>$1</del>");
    return t;
  };

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      i++;
      const codeLines = [];
      while (i < lines.length && !lines[i].startsWith("```")) { codeLines.push(esc(lines[i])); i++; }
      html.push(`<pre data-lang="${lang || "code"}"><code>${codeLines.join("\n")}</code></pre>`);
      i++; continue;
    }
    const hMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (hMatch) { html.push(`<h${hMatch[1].length}>${inlineFormat(hMatch[2])}</h${hMatch[1].length}>`); i++; continue; }
    if (/^[-*_]{3,}$/.test(line.trim())) { html.push("<hr />"); i++; continue; }
    if (line.startsWith("> ")) {
      const bqLines = [];
      while (i < lines.length && lines[i].startsWith("> ")) { bqLines.push(lines[i].slice(2)); i++; }
      html.push(`<blockquote>${inlineFormat(bqLines.join(" "))}</blockquote>`); continue;
    }
    if (/^[-*+]\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) { items.push(`<li>${inlineFormat(lines[i].slice(2))}</li>`); i++; }
      html.push(`<ul>${items.join("")}</ul>`); continue;
    }
    if (/^\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) { items.push(`<li>${inlineFormat(lines[i].replace(/^\d+\.\s/, ""))}</li>`); i++; }
      html.push(`<ol>${items.join("")}</ol>`); continue;
    }
    if (line.trim() === "") { i++; continue; }
    const paraLines = [];
    while (i < lines.length && lines[i].trim() !== "" && !lines[i].startsWith("#") && !lines[i].startsWith(">") && !/^[-*+]\s/.test(lines[i]) && !/^\d+\.\s/.test(lines[i]) && !lines[i].startsWith("```") && !/^[-*_]{3,}$/.test(lines[i].trim())) {
      paraLines.push(lines[i]); i++;
    }
    if (paraLines.length) html.push(`<p>${inlineFormat(paraLines.join(" "))}</p>`);
  }
  return html.join("\n");
}

// ── JSON Syntax Highlighter ─────────────────────────────────────────────────
function highlightJSON(json) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  try {
    const parsed = JSON.parse(json);
    const pretty = JSON.stringify(parsed, null, 2);
    return esc(pretty)
      .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*")\s*:/g, '<span class="json-key">$1</span>:')
      .replace(/:\s*("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*")/g, ': <span class="json-str">$1</span>')
      .replace(/:\s*(\btrue\b|\bfalse\b)/g, ': <span class="json-bool">$1</span>')
      .replace(/:\s*(\bnull\b)/g, ': <span class="json-null">$1</span>')
      .replace(/:\s*(-?\d+\.?\d*([eE][+-]?\d+)?)/g, ': <span class="json-num">$1</span>');
  } catch {
    return esc(json);
  }
}

function getJSONStats(json) {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) return `配列 · ${parsed.length}件`;
    if (typeof parsed === "object" && parsed !== null) return `オブジェクト · ${Object.keys(parsed).length}キー`;
    return typeof parsed;
  } catch { return "解析エラー"; }
}

// ── Demo ────────────────────────────────────────────────────────────────────
const DEMO_MD = `# MDビューアへようこそ 📖

**.md** と **.json** ファイルをスマートフォンで美しく表示します。

## 使い方

1. 画面下の **「ファイルを開く」** をタップ
2. デバイス内の MD または JSON ファイルを選択
3. きれいにレンダリングされた内容を楽しむ

## 対応フォーマット

- **Markdown**（.md / .markdown / .txt）
- **JSON**（.json） ← 🆕 追加！

> 📝 ファイルはすべてブラウザ内で処理されます。
`;

// ── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [content, setContent] = useState(DEMO_MD);
  const [fileType, setFileType] = useState("md");
  const [fileName, setFileName] = useState("welcome.md");
  const [jsonError, setJsonError] = useState(null);
  const [history, setHistory] = useState([{ name: "welcome.md", content: DEMO_MD, type: "md" }]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef(null);
  const contentRef = useRef(null);

  const handleFile = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const isJSON = file.name.endsWith(".json");
      let error = null;
      if (isJSON) { try { JSON.parse(text); } catch (err) { error = err.message; } }
      setContent(text);
      setFileType(isJSON ? "json" : "md");
      setFileName(file.name);
      setJsonError(error);
      setHistory((h) => [{ name: file.name, content: text, type: isJSON ? "json" : "md" }, ...h.filter((x) => x.name !== file.name)].slice(0, 20));
      contentRef.current?.scrollTo(0, 0);
    };
    reader.readAsText(file);
    e.target.value = "";
  }, []);

  const loadFromHistory = (item) => {
    setContent(item.content);
    setFileType(item.type);
    setFileName(item.name);
    setJsonError(null);
    setHistoryOpen(false);
    contentRef.current?.scrollTo(0, 0);
  };

  const copyJSON = () => {
    try {
      const pretty = JSON.stringify(JSON.parse(content), null, 2);
      navigator.clipboard.writeText(pretty);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollTop > 10);
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const isJSON = fileType === "json";
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const readMin = Math.max(1, Math.round(wordCount / 200));
  const metaText = isJSON ? getJSONStats(content) : `${wordCount.toLocaleString()}語 · 約${readMin}分`;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;700&family=Noto+Sans+JP:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg: #f5f0e8; --surface: #fdfaf4; --border: #e0d8c8;
          --ink: #2c2416; --ink2: #6b5f4a; --ink3: #9e8f78;
          --accent: #c0392b; --accent-json: #1a6b8a;
          --code-bg: #1e1a14; --code-fg: #e8dcc8;
          --shadow: 0 2px 12px rgba(44,36,22,0.10);
        }

        html, body, #root {
          height: 100%; width: 100%; overflow: hidden;
          background: var(--bg); font-family: 'Noto Sans JP', sans-serif;
          color: var(--ink); -webkit-font-smoothing: antialiased;
        }

        .app {
          display: flex; flex-direction: column;
          height: 100%; width: 100%; max-width: 480px;
          margin: 0 auto; background: var(--bg);
        }

        .header {
          flex-shrink: 0; display: flex; align-items: center; gap: 10px;
          padding: 12px 16px 10px; background: var(--surface);
          border-bottom: 1px solid var(--border); transition: box-shadow .2s; z-index: 10;
        }
        .header.scrolled { box-shadow: var(--shadow); }

        .header-icon {
          width: 34px; height: 34px; border-radius: 8px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center; font-size: 16px;
          background: var(--accent); transition: background .3s;
        }
        .header-icon.json { background: var(--accent-json); }

        .header-info { flex: 1; min-width: 0; }
        .header-filename {
          font-family: 'Noto Serif JP', serif; font-size: 14px; font-weight: 700;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .header-meta { font-size: 11px; color: var(--ink3); margin-top: 1px; }

        .header-btn {
          background: none; border: none; cursor: pointer; color: var(--ink2);
          font-size: 20px; width: 36px; height: 36px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 8px; flex-shrink: 0;
        }
        .header-btn:active { background: var(--border); }

        .content {
          flex: 1; overflow-y: auto; overflow-x: hidden;
          padding: 24px 20px 120px; background: var(--surface);
          -webkit-overflow-scrolling: touch;
        }

        /* Markdown */
        .md h1,.md h2,.md h3,.md h4,.md h5,.md h6 {
          font-family: 'Noto Serif JP', serif; line-height: 1.3;
          margin-top: 1.6em; margin-bottom: .5em;
        }
        .md h1 { font-size: 1.75rem; border-bottom: 2px solid var(--accent); padding-bottom: .3em; margin-top: 0; }
        .md h2 { font-size: 1.35rem; border-bottom: 1px solid var(--border); padding-bottom: .2em; }
        .md h3 { font-size: 1.15rem; }
        .md p { font-size: .95rem; line-height: 1.85; margin-bottom: 1em; }
        .md strong { font-weight: 700; }
        .md em { font-style: italic; color: var(--ink2); }
        .md del { text-decoration: line-through; color: var(--ink3); }
        .md a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
        .md code {
          font-family: 'JetBrains Mono', monospace; font-size: .82em;
          background: rgba(192,57,43,.08); color: var(--accent);
          padding: 1px 5px; border-radius: 4px;
        }
        .md pre {
          background: var(--code-bg); border-radius: 10px; padding: 16px;
          overflow-x: auto; margin: 1.2em 0; position: relative; box-shadow: var(--shadow);
        }
        .md pre::before {
          content: attr(data-lang); position: absolute; top: 8px; right: 12px;
          font-family: 'JetBrains Mono', monospace; font-size: .7em;
          color: #6b5f4a; text-transform: uppercase; letter-spacing: .05em;
        }
        .md pre code {
          font-family: 'JetBrains Mono', monospace; font-size: .82rem;
          background: none; color: var(--code-fg); padding: 0; line-height: 1.6;
        }
        .md blockquote {
          border-left: 3px solid var(--accent); margin: 1.2em 0;
          padding: 10px 16px; background: rgba(192,57,43,.05);
          border-radius: 0 8px 8px 0; font-style: italic; color: var(--ink2);
        }
        .md ul,.md ol { padding-left: 1.4em; margin-bottom: 1em; }
        .md li { font-size: .95rem; line-height: 1.8; margin-bottom: .2em; }
        .md ul li::marker { color: var(--accent); }
        .md ol li::marker { color: var(--accent); font-weight: 700; }
        .md hr { border: none; border-top: 1px solid var(--border); margin: 2em 0; }

        /* JSON */
        .json-toolbar {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 10px;
        }
        .json-label {
          font-size: .75rem; color: var(--ink3);
          font-family: 'JetBrains Mono', monospace;
          text-transform: uppercase; letter-spacing: .06em;
        }
        .copy-btn {
          background: var(--surface); border: 1px solid var(--border);
          color: var(--ink2); font-size: .8rem; padding: 5px 12px;
          border-radius: 8px; cursor: pointer;
          font-family: 'Noto Sans JP', sans-serif;
          transition: background .15s;
        }
        .copy-btn:active { background: var(--border); }

        .json-viewer {
          background: var(--code-bg); border-radius: 12px;
          padding: 16px; overflow-x: auto; box-shadow: var(--shadow);
        }
        .json-viewer pre {
          font-family: 'JetBrains Mono', monospace;
          font-size: .78rem; line-height: 1.7;
          color: var(--code-fg); white-space: pre; margin: 0;
        }
        .json-key  { color: #7ec8e3; }
        .json-str  { color: #a8d8a8; }
        .json-num  { color: #f8c97d; }
        .json-bool { color: #f09f7a; }
        .json-null { color: #b0a090; }

        .json-error {
          background: rgba(192,57,43,.08); border: 1px solid rgba(192,57,43,.25);
          border-radius: 10px; padding: 16px; color: var(--accent);
          font-size: .85rem; line-height: 1.7;
        }
        .json-error strong { display: block; margin-bottom: 6px; font-size: .9rem; }

        /* Bottom bar */
        .bottom-bar {
          position: fixed; bottom: 0; left: 50%; transform: translateX(-50%);
          width: 100%; max-width: 480px; padding: 12px 20px 20px;
          background: linear-gradient(to top, var(--bg) 70%, transparent);
          display: flex; gap: 10px; z-index: 20;
        }

        .open-btn {
          flex: 1; border: none; border-radius: 14px; padding: 14px 20px;
          font-family: 'Noto Sans JP', sans-serif; font-size: .95rem; font-weight: 600;
          color: #fff; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          background: var(--accent); box-shadow: 0 4px 20px rgba(192,57,43,.35);
          transition: transform .12s, background .3s, box-shadow .3s;
          -webkit-tap-highlight-color: transparent;
        }
        .open-btn.json {
          background: var(--accent-json);
          box-shadow: 0 4px 20px rgba(26,107,138,.35);
        }
        .open-btn:active { transform: scale(.97); }

        .scroll-top-btn {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 14px; width: 52px; color: var(--ink2); font-size: 18px;
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          transition: transform .12s, opacity .2s;
          opacity: 0; pointer-events: none;
          -webkit-tap-highlight-color: transparent;
        }
        .scroll-top-btn.visible { opacity: 1; pointer-events: auto; }
        .scroll-top-btn:active { transform: scale(.95); }

        /* Drawer */
        .overlay {
          position: fixed; inset: 0; background: rgba(44,36,22,.4);
          z-index: 30; animation: fadeIn .2s;
        }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }

        .drawer {
          position: fixed; bottom: 0; left: 50%; transform: translateX(-50%);
          width: 100%; max-width: 480px; background: var(--surface);
          border-radius: 20px 20px 0 0; padding: 0 0 32px; z-index: 40;
          animation: slideUp .25s cubic-bezier(.32,1,.55,1);
          max-height: 70vh; display: flex; flex-direction: column;
        }
        @keyframes slideUp {
          from { transform: translateX(-50%) translateY(100%); }
          to   { transform: translateX(-50%) translateY(0); }
        }
        .drawer-handle {
          width: 36px; height: 4px; background: var(--border);
          border-radius: 2px; margin: 12px auto 0; flex-shrink: 0;
        }
        .drawer-title {
          font-family: 'Noto Serif JP', serif; font-size: 1.05rem; font-weight: 700;
          padding: 14px 20px 10px; border-bottom: 1px solid var(--border); flex-shrink: 0;
        }
        .drawer-list { flex: 1; overflow-y: auto; }
        .history-item {
          display: flex; align-items: center; gap: 10px;
          padding: 13px 20px; border-bottom: 1px solid var(--border);
          cursor: pointer; -webkit-tap-highlight-color: transparent;
        }
        .history-item:active { background: var(--bg); }
        .history-item-icon { font-size: 20px; flex-shrink: 0; }
        .history-badge {
          font-size: .65rem; font-weight: 700; letter-spacing: .04em;
          padding: 2px 6px; border-radius: 4px; flex-shrink: 0; text-transform: uppercase;
        }
        .history-badge.md   { background: rgba(192,57,43,.1); color: var(--accent); }
        .history-badge.json { background: rgba(26,107,138,.1); color: var(--accent-json); }
        .history-item-name {
          font-size: .9rem; font-weight: 500; flex: 1;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .history-item-active { font-size: .75rem; color: var(--accent); font-weight: 600; flex-shrink: 0; }
        .drawer-empty { padding: 32px 20px; text-align: center; color: var(--ink3); font-size: .9rem; }

        input[type=file] { display: none; }
      `}</style>

      <div className="app">
        <div className={`header ${scrolled ? "scrolled" : ""}`}>
          <div className={`header-icon ${isJSON ? "json" : ""}`}>{isJSON ? "🗃" : "📖"}</div>
          <div className="header-info">
            <div className="header-filename">{fileName}</div>
            <div className="header-meta">{metaText}</div>
          </div>
          <button className="header-btn" onClick={() => setHistoryOpen(true)}>🗂</button>
        </div>

        <div className="content" ref={contentRef}>
          {isJSON ? (
            jsonError ? (
              <div className="json-error">
                <strong>⚠️ JSON 解析エラー</strong>{jsonError}
              </div>
            ) : (
              <>
                <div className="json-toolbar">
                  <span className="json-label">JSON</span>
                  <button className="copy-btn" onClick={copyJSON}>
                    {copied ? "✓ コピー済み" : "📋 コピー"}
                  </button>
                </div>
                <div className="json-viewer">
                  <pre dangerouslySetInnerHTML={{ __html: highlightJSON(content) }} />
                </div>
              </>
            )
          ) : (
            <div className="md" dangerouslySetInnerHTML={{ __html: parseMarkdown(content) }} />
          )}
        </div>

        <div className="bottom-bar">
          <button className={`open-btn ${isJSON ? "json" : ""}`} onClick={() => fileInputRef.current?.click()}>
            <span>📂</span> ファイルを開く
          </button>
          <button
            className={`scroll-top-btn ${scrolled ? "visible" : ""}`}
            onClick={() => contentRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
          >↑</button>
        </div>

        <input ref={fileInputRef} type="file" accept=".md,.markdown,.txt,.json" onChange={handleFile} />

        {historyOpen && (
          <>
            <div className="overlay" onClick={() => setHistoryOpen(false)} />
            <div className="drawer">
              <div className="drawer-handle" />
              <div className="drawer-title">📚 最近開いたファイル</div>
              <div className="drawer-list">
                {history.length === 0 ? (
                  <div className="drawer-empty">まだファイルを開いていません</div>
                ) : history.map((item) => (
                  <div key={item.name} className="history-item" onClick={() => loadFromHistory(item)}>
                    <span className="history-item-icon">{item.type === "json" ? "🗃" : "📄"}</span>
                    <span className={`history-badge ${item.type}`}>{item.type}</span>
                    <span className="history-item-name">{item.name}</span>
                    {item.name === fileName && <span className="history-item-active">表示中</span>}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
