/* ============================================================
   ホーム画面：更新履歴（notes.js）
   GitHub のリリース（Releases）を読み込み、公開日の年ごとに分けて表示する。
   ・下書き・プレリリースは表示しない（プレリリースにしておけば、GitHub上で見た目を確かめてから公開できる）
   ・本文の Markdown は、見出し・箇条書き・太字・段落だけに対応する
   ※リポジトリ名を変えた時は RELEASES_URL も直すこと
   ============================================================ */
const RELEASES_URL = "https://api.github.com/repos/nagatsuki-so/Yoiyami-Kanji/releases?per_page=100";

const notesOverlay = document.getElementById("notes-overlay");
const notesYear = document.getElementById("notes-year");
const notesStatus = document.getElementById("notes-status");
const notesList = document.getElementById("notes-list");

let releasesByYear = null; // 読み込み済みのリリース（年 → 新しい順の配列）。ページを開いている間は使い回す
let releasesLoading = false; // 読み込み中に開き直しても、二重に読み込まないようにする

function showNotesStatus(text){
  notesStatus.textContent = text;
  notesStatus.hidden = !text;
}

/* ---- 本文の Markdown を、アプリのデザイン用の HTML に変換する ----
   先に文字をすべてエスケープしてから変換するため、本文に HTML が書かれていても実行されない */
function escapeHtml(text){
  return text.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// 行の中の書き方：**太字**
function renderInline(text){
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

// 行ごとの書き方：「## 見出し」「- 箇条書き」（「* 」でも可）、空行で段落を区切る
function renderMarkdown(markdown){
  const lines = (markdown || "").replace(/\r\n?/g, "\n").split("\n");
  let html = "";
  let paragraph = [];
  let inList = false;
  const flushParagraph = () => {
    if(paragraph.length) html += `<p>${paragraph.map(renderInline).join("<br>")}</p>`;
    paragraph = [];
  };
  const closeList = () => {
    if(inList) html += "</ul>";
    inList = false;
  };
  for(const raw of lines){
    const line = raw.trim();
    let m;
    if(!line){
      flushParagraph();
      closeList();
    } else if((m = line.match(/^#{1,6}\s+(.*)$/))){
      flushParagraph();
      closeList();
      html += `<div class="notes-heading">${renderInline(m[1])}</div>`;
    } else if((m = line.match(/^[-*]\s+(.*)$/))){
      flushParagraph();
      if(!inList){ html += "<ul>"; inList = true; }
      html += `<li>${renderInline(m[1])}</li>`;
    } else {
      closeList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  closeList();
  return html;
}

/* ---- 表示 ---- */
function formatReleaseDate(iso){
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

// 選んだ年のリリースを、新しい順に並べる
function renderReleaseYear(year){
  notesList.textContent = "";
  (releasesByYear.get(year) || []).forEach(r => {
    const item = document.createElement("div");
    item.className = "info-item notes-item";

    const title = document.createElement("div");
    title.className = "info-item-title";
    // タイトルがタグ名と同じ（または空）なら、タグ名だけを出す
    title.textContent = r.name && r.name !== r.tag_name ? `${r.tag_name}　${r.name}` : r.tag_name;

    const date = document.createElement("div");
    date.className = "notes-date";
    date.textContent = formatReleaseDate(r.published_at);

    const body = document.createElement("div");
    body.className = "info-item-desc notes-body";
    body.innerHTML = renderMarkdown(r.body);

    item.append(title, date, body);
    notesList.appendChild(item);
  });
}

// GitHub からリリースを読み込み、年ごとに分けてプルダウンを作る
async function loadReleases(){
  if(releasesLoading) return;
  releasesLoading = true;
  showNotesStatus("読み込み中…");
  notesYear.hidden = true;
  try{
    const res = await fetch(RELEASES_URL);
    if(!res.ok) throw new Error(`更新履歴の取得に失敗しました (HTTP ${res.status})`);
    const releases = (await res.json())
      .filter(r => !r.draft && !r.prerelease && r.published_at)
      .sort((a, b) => new Date(b.published_at) - new Date(a.published_at));

    releasesByYear = new Map();
    releases.forEach(r => {
      const year = new Date(r.published_at).getFullYear();
      if(!releasesByYear.has(year)) releasesByYear.set(year, []);
      releasesByYear.get(year).push(r);
    });
    if(releasesByYear.size === 0){
      showNotesStatus("まだ手記はありません。");
      return;
    }

    notesYear.textContent = "";
    releasesByYear.forEach((_, year) => {
      const option = document.createElement("option");
      option.value = year;
      option.textContent = `${year}年`;
      notesYear.appendChild(option);
    });
    notesYear.hidden = false;
    showNotesStatus("");
    renderReleaseYear(releasesByYear.keys().next().value); // 最初は一番新しい年
  }catch(err){
    console.error(err);
    releasesByYear = null; // 次に開いた時に読み込み直す
    showNotesStatus("手記を読み込めませんでした。時間をおいて、もう一度開いてください。");
  }finally{
    releasesLoading = false;
  }
}

/* ---- 開く・閉じる ---- */
document.getElementById("btn-release-notes").addEventListener("click", () => {
  SoundEngine.playTapSfx();
  notesOverlay.classList.add("show");
  if(!releasesByYear) loadReleases();
});
document.getElementById("btn-notes-close").addEventListener("click", () => {
  SoundEngine.playTapSfx();
  notesOverlay.classList.remove("show");
});
notesYear.addEventListener("change", () => {
  renderReleaseYear(Number(notesYear.value));
  notesOverlay.querySelector(".info-sheet").scrollTop = 0;
});
