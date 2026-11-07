/* ============================================================
   結果画面（result.js）
   ============================================================ */
function showResult(){
  clearProgress(); // 最後まで解き終えたので、途中経過の保存は不要
  showScreen("result");
  const total = state.order.length;
  el.resultScoreNum.textContent = state.score;
  el.resultScoreTotal.textContent = total;
  const rate = state.score / total;
  let rank, glyph, tier;
  if(rate === 1){ rank = "闇を統べる大祓魔師"; glyph = "封"; tier = "seal"; }
  else if(rate >= 0.8){ rank = "一人前の祓魔師"; glyph = "鬼"; tier = "oni"; }
  else if(rate >= 0.5){ rank = "見習い祓魔師"; glyph = "霊"; tier = "rei"; }
  else { rank = "怪異に憑かれし者"; glyph = "呪"; tier = "noroi"; }
  el.resultRank.textContent = rank;
  document.getElementById("result-glyph").textContent = glyph;
  document.getElementById("result-glyph-block").dataset.rank = tier;
  lastRank = rank;
}

/* ---- 結果のシェア ----
   X・LINE は、スマホでは今のタブのまま、PCでは新しいタブで開く（下の openShareUrl を参照）。
   「その他」はスマホ標準の共有画面（Web Share API）を開く。使える端末（スマホ・タブレット）だけ表示する。
   ※Web Share API は HTTPS のページ（または PC 自身の localhost）でしか使えないため、
     スマホから PC の IP アドレス（http://192.168.…）で開いて確認している間は「その他」は出ない */
const SITE_URL = "https://yoiyami-kanji.com/";
const SHARE_HASHTAG = "宵闇漢字解奇譚";
const DIFFICULTY_LABEL = { easy: "易しい", normal: "普通", hard: "難しい" };
let lastRank = ""; // 直前に表示した称号（シェアする文に使う）

// 数を漢数字にする（例：15 → 十五、513 → 五百十三）
function toKanjiNumber(n){
  if(n === 0) return "零";
  const digits = "〇一二三四五六七八九";
  let rest = n, text = "";
  [["千", 1000], ["百", 100], ["十", 10]].forEach(([unit, value]) => {
    const q = Math.floor(rest / value);
    if(q) text += (q === 1 ? "" : digits[q]) + unit;
    rest %= value;
  });
  if(rest) text += digits[rest];
  return text;
}

// シェアする文（ハッシュタグとURLは含めない）
function buildShareText(){
  const count = state.questionCount === "all" ? "全問：忌"
    : state.questionCount === "all-diff" ? "全問：鬼"
    : `${toKanjiNumber(state.questionCount)}問`;
  const settings = [
    state.questionCount === "all" ? null : DIFFICULTY_LABEL[state.difficulty],
    count,
    state.kaiiEvent ? "怪異乱入あり" : "怪異乱入なし",
  ].filter(Boolean).join("・");
  return `宵闇漢字解奇譚にて、\n「${settings}」に挑み、\n${toKanjiNumber(state.score)}問を読み解いた。\n授かりし称号は――『${lastRank}』`;
}

// 指で操作する端末（スマホ・タブレット）か
const isTouchDevice = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);

// スマホで新しいタブを開くと、X・LINE のアプリに切り替わった時に、空のタブが残ってしまう。
// そのためスマホでは今のタブのまま移動する（アプリが入っていればアプリが開き、ゲームの画面はそのまま残る。
// 入っていなければ今のタブが X・LINE のページになり、ブラウザの「戻る」でゲームに戻れる）。
// PC はアプリへの切り替えがないので、新しいタブで開く
function openShareUrl(url){
  SoundEngine.playTapSfx();
  if(isTouchDevice) location.href = url;
  else window.open(url, "_blank", "noopener");
}

document.getElementById("btn-share-x").addEventListener("click", () => {
  const text = `${buildShareText()}\n\n#${SHARE_HASHTAG}\n`;
  openShareUrl(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(SITE_URL)}`);
});

document.getElementById("btn-share-line").addEventListener("click", () => {
  const text = `${buildShareText()}\n\n#${SHARE_HASHTAG}\n${SITE_URL}`;
  openShareUrl(`https://line.me/R/share?text=${encodeURIComponent(text)}`);
});

const shareMoreBtn = document.getElementById("btn-share-more");
const canUseShareSheet = !!navigator.share && isTouchDevice;
shareMoreBtn.hidden = !canUseShareSheet;
shareMoreBtn.addEventListener("click", () => {
  SoundEngine.playTapSfx();
  navigator.share({
    title: "宵闇漢字解奇譚",
    text: `${buildShareText()}\n\n#${SHARE_HASHTAG}`,
    url: SITE_URL,
  }).catch(() => {}); // 共有画面を閉じた時（キャンセル）は何もしない
});

document.getElementById("btn-retry-same").addEventListener("click", () => {
  startQuiz();
});
document.getElementById("btn-retry-mode").addEventListener("click", () => {
  showScreen("mode");
});
document.getElementById("btn-result-home").addEventListener("click", () => {
  SoundEngine.playTapSfx();
  showScreen("title");
});
