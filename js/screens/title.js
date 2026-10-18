/* ============================================================
   タイトル画面・読込エラー画面（title.js）
   ============================================================ */

/* ---- 「封を解く」：問題データの読込＆出題設定画面へ ---- */
async function handleOpenSeal(){
  SoundEngine.unlock();
  SoundEngine.playTapSfx();

  el.btnOpenSeal.disabled = true;
  el.titleHint.textContent = "問題を召喚中…";

  try{
    QUESTIONS = await loadQuestions();
    el.btnOpenSeal.disabled = false;
    el.titleHint.textContent = "";
    applyQuestionStatsToUI();
    showScreen("mode");
  }catch(err){
    console.error(err);
    el.btnOpenSeal.disabled = false;
    el.titleHint.textContent = "";
    el.errorDetail.textContent = err.message || "問題データを読み込めませんでした。";
    showScreen("error");
  }
}

el.btnOpenSeal.addEventListener("click", handleOpenSeal);
el.btnRetryLoad.addEventListener("click", () => {
  showScreen("title");
});

/* ---- 途中再開の確認ダイアログ ----
   ページを開いた時にクイズの途中経過（js/screens/quiz.js の saveProgress）が残っていれば、タイトル画面の上に表示する。
   「再開する」を押す操作で音声も解禁し、再開直後の怪異演出でも音が鳴るようにする */
const savedProgress = loadProgress();

function closeResumeDialog(){
  el.resumeOverlay.classList.remove("show");
}

if(savedProgress){
  const p = savedProgress;
  const total = p.order.length;
  const DIFFICULTY_LABEL = { easy: "易しい", normal: "普通", hard: "難しい" };
  const settings = [
    p.questionCount === "all" ? "全問：忌" : DIFFICULTY_LABEL[p.difficulty],
    p.mode === "free" ? "入力" : "選択",
    p.kaiiEvent ? "怪異乱入あり" : "怪異乱入なし",
  ].filter(Boolean).join(" ／ ");
  // 解答済みなら次の問題から再開する（最後の問題に解答済みなら、結果画面へ進む）
  const nextNumber = p.current + 1 + (p.answered ? 1 : 0);
  const progress = nextNumber > total ? `全 ${total} 問 解答済み` : `問 ${nextNumber} / ${total}`;
  el.resumeText.innerHTML = `${progress} ・ 正解 ${p.score}<br>${settings}`;
  el.resumeOverlay.classList.add("show");
}

el.btnResume.addEventListener("click", async () => {
  SoundEngine.unlock();
  SoundEngine.playTapSfx();
  el.btnResume.disabled = true;
  el.btnResumeReset.disabled = true;
  try{
    QUESTIONS = await loadQuestions();
    applyQuestionStatsToUI();
    closeResumeDialog();
    // 公開後に問題データが変わっていて復元できない時は、保存を捨ててタイトル画面のままにする
    if(!resumeQuiz(savedProgress)) clearProgress();
  }catch(err){
    console.error(err);
    closeResumeDialog();
    el.errorDetail.textContent = err.message || "問題データを読み込めませんでした。";
    showScreen("error");
  }
});

el.btnResumeReset.addEventListener("click", () => {
  SoundEngine.playTapSfx();
  clearProgress();
  closeResumeDialog();
});

/* ---- タイトル「宵闇漢字解奇譚」の「解」が、不規則に一瞬だけ「怪」に入れ替わる演出 ----
   2〜6秒のランダムな間隔で約0.3秒だけ入れ替え、ときどき2回続けてチラつかせる。
   光への配慮として1秒に3回を超えないようにし、視差効果を減らす設定では行わない。
   タイトル画面を表示している間だけ動かす */
(function titleSubliminal(){
  const span = document.getElementById("title-flicker");
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if(!span || reduceMotion) return;

  const FLASH_MS = 300;
  // 「怪」は普段画面に出ないため、初めてのチラつきで明朝体にならないよう筆文字フォントを先読みしておく
  if(document.fonts && document.fonts.load) document.fonts.load('42px "Yuji Syuku"', "怪").catch(() => {});

  function flash(){
    span.textContent = "怪";
    span.classList.add("is-kai");
    setTimeout(() => {
      span.textContent = "解";
      span.classList.remove("is-kai");
    }, FLASH_MS);
  }

  function schedule(){
    setTimeout(() => {
      if(el.screens.title.classList.contains("active") && !document.hidden){
        flash();
        // 3割の確率でもう一度（1回目が消えた0.3秒後＝開始から0.6秒後。1秒に3回は超えない）
        if(Math.random() < 0.3) setTimeout(flash, 600);
      }
      schedule();
    }, 2000 + Math.random() * 4000);
  }
  schedule();
})();
