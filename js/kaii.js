/* ============================================================
   怪異演出（kaii.js）
   段階1：予兆 → 段階2：制限時間つきの継続演出 → 段階3：罰（誤答・時間切れ時のみ）
   途中でホームへ戻った時などは cancel() で token を進め、進行中の非同期処理をすべて打ち切る
   ============================================================ */

// 動作確認用：URLに ?kaii=eye|face|onmyoji|all を付けると、怪異乱入「あり」の時に
// 全問題で怪異演出が発生し、罰演出の種類も固定される（all はランダム）
const KAII_DEBUG = new URLSearchParams(location.search).get("kaii");

// 残り秒数の表示に使う旧字体の漢数字（添字＝秒数）
const KYU_NUMERALS = ["零", "壱", "弐", "参", "肆", "伍", "陸", "漆", "捌", "玖", "拾"];
function toKyuNumeral(n){
  return KYU_NUMERALS[Math.max(0, Math.min(KYU_NUMERALS.length - 1, n))];
}

const Kaii = (() => {
  const OMEN_MS = 2200;          // 段階1の長さ
  const OMEN_FADE_MS = 300;      // 予兆が消えて問題が見えるまで
  const PUNISH_FADE_MS = 360;    // 罰演出が消えて結果シートが見えるまで
  const VARIANTS = ["eye", "face", "onmyoji"];

  const app = document.getElementById("app");
  const omen = document.getElementById("kaii-omen");
  const punish = document.getElementById("kaii-punish");
  const purifyLayer = document.getElementById("kaii-purify");
  const timerBox = document.getElementById("kaii-timer");
  const timerNum = document.getElementById("kaii-timer-num");
  const timerFill = document.getElementById("kaii-timer-fill");
  const onmyojiScene = document.getElementById("kp-onmyoji");
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // 実写素材の動画（assets/kaii/）
  const allVideos = Array.from(document.querySelectorAll("video[data-kaii-video]"));
  const omenStatic = omen.querySelector(".kaii-static");
  const ambientStatic = document.querySelector(".kaii-ambient .kaii-static");
  const eyeVideo = document.getElementById("kp-eye-video");
  const eyeScene = document.getElementById("kp-eye");
  const faceVideo = document.getElementById("kp-face-video");
  const onmyojiVideo = document.getElementById("kp-onmyoji-video");
  const sceneVideos = [eyeVideo, faceVideo, onmyojiVideo];
  let preloaded = false;

  let token = 0;            // cancel() のたびに進める。古い非同期処理は自分の token と比べて打ち切る
  let lastVariant = null;   // 同じ罰演出が2回連続しないようにする
  let pressure = null;      // 段階2の進行状態 { start, totalMs, rafId, beatId }

  const alive = t => t === token;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  /* ---- 実写素材の動画 ---- */
  // 怪異乱入「あり」でクイズを始めた時に一度だけ読み込んでおき、演出の開始時に止まらないようにする
  function preload(){
    if(preloaded) return;
    preloaded = true;
    allVideos.forEach(v => { v.preload = "auto"; v.load(); });
  }

  // 頭から再生する。視差効果を減らす設定では再生せず、stillAt秒の1コマを止めて見せる
  function showVideo(v, stillAt = 0){
    if(reduceMotion){
      v.pause();
      try{ v.currentTime = stillAt; }catch(e){}
      return;
    }
    try{ v.currentTime = 0; }catch(e){}
    const p = v.play();
    if(p && p.catch) p.catch(() => {}); // 再生が拒否されても演出自体は続ける
  }

  // 動画の音声ごと頭から再生する（一つ目・白い女・陰陽師の霊で使用）。ミュート中は音を消して再生する。
  // 音声付きの再生がブラウザに拒否された時（時間切れで始まった時など、直前に操作がない場合に起こりうる）は、
  // 音を消して再生し直す。動画の音が実際に出ているかどうかを返す
  async function playVideoWithSound(v, stillAt){
    if(reduceMotion){
      showVideo(v, stillAt);
      return false;
    }
    v.muted = SoundEngine.muted;
    try{ v.currentTime = 0; }catch(e){}
    try{
      await v.play();
      return !v.muted;
    }catch(e){
      v.muted = true;
      try{ await v.play(); }catch(e2){}
      return false;
    }
  }

  /* ---- 段階1 → 段階2 ---- */
  async function begin({ limitSec, onReveal, onTimeout }){
    const t = token;
    showTimer(limitSec, 1);
    omen.classList.remove("fade-out");
    omen.classList.add("show");
    showVideo(omenStatic);
    showVideo(ambientStatic);
    // 段階2の赤い背景も予兆の裏で先に出しておき、予兆が消えた時に赤いまま問題が見えるようにする
    app.classList.add("kaii-active");
    SoundEngine.playOmenSfx(OMEN_MS / 1000);
    await wait(OMEN_MS);
    if(!alive(t)) return;

    // 赤い画面のまま問題を表示し、予兆のレイヤーを消していく
    onReveal();
    omen.classList.add("fade-out");
    await wait(OMEN_FADE_MS);
    if(!alive(t)) return;
    omen.classList.remove("show", "fade-out");
    omenStatic.pause();
    startPressure(t, limitSec, onTimeout);
  }

  function showTimer(sec, ratio){
    timerNum.textContent = toKyuNumeral(sec);
    timerFill.style.width = (ratio * 100) + "%";
    timerBox.classList.toggle("danger", sec <= 3);
  }

  function startPressure(t, limitSec, onTimeout){
    const totalMs = limitSec * 1000;
    const start = performance.now();
    let shownSec = null;
    pressure = { start, totalMs, rafId: 0, beatId: 0 };

    const tick = now => {
      if(!pressure || !alive(t)) return;
      const remain = Math.max(0, totalMs - (now - start));
      const sec = Math.ceil(remain / 1000);
      if(sec !== shownSec){
        shownSec = sec;
        showTimer(sec, remain / totalMs);
      } else {
        timerFill.style.width = (remain / totalMs * 100) + "%";
      }
      if(remain <= 0){
        onTimeout();
        return;
      }
      pressure.rafId = requestAnimationFrame(tick);
    };
    pressure.rafId = requestAnimationFrame(tick);

    // 心音：残り時間が減るほど間隔が短くなる（約1.1秒 → 0.38秒）
    const beat = () => {
      if(!pressure || !alive(t)) return;
      SoundEngine.playHeartbeatSfx();
      const ratio = Math.max(0, 1 - (performance.now() - start) / totalMs);
      pressure.beatId = setTimeout(beat, 380 + 720 * ratio);
    };
    beat();
  }

  // 段階2を止め、残り時間（ミリ秒）を返す
  function stopPressure(){
    if(!pressure) return 0;
    cancelAnimationFrame(pressure.rafId);
    clearTimeout(pressure.beatId);
    const remain = Math.max(0, pressure.totalMs - (performance.now() - pressure.start));
    pressure = null;
    return remain;
  }

  function isPressuring(){
    return pressure !== null;
  }

  /* ---- 時間内に正解：光が流れて赤い闇が晴れる ---- */
  function purify(){
    app.classList.remove("kaii-active");
    purifyLayer.classList.remove("run");
    void purifyLayer.offsetWidth; // アニメーションを最初から再生し直すためのリフロー
    purifyLayer.classList.add("run");
  }

  /* ---- 段階3：罰演出 ---- */
  function pickVariant(){
    if(VARIANTS.includes(KAII_DEBUG)) return KAII_DEBUG;
    const candidates = VARIANTS.filter(v => v !== lastVariant);
    const v = candidates[Math.floor(Math.random() * candidates.length)];
    lastVariant = v;
    return v;
  }

  // onEnd：罰演出が消え始めるタイミングで呼ばれる（結果シートを出す）
  async function runPunish(onEnd){
    const t = token;
    app.classList.remove("kaii-active");
    resetScenes();
    punish.dataset.variant = pickVariant();
    punish.classList.remove("fade-out");
    punish.classList.add("show");

    await SCENES[punish.dataset.variant](t);
    if(!alive(t)) return;

    app.classList.add("kaii-residue");
    SoundEngine.setBgmSilenced(false);
    onEnd();
    punish.classList.add("fade-out");
    await wait(PUNISH_FADE_MS);
    if(!alive(t)) return;
    punish.classList.remove("show", "fade-out");
    delete punish.dataset.variant;
    resetScenes();
  }

  function resetScenes(){
    eyeScene.dataset.phase = "video";
    sceneVideos.forEach(v => v.pause());
    onmyojiScene.dataset.phase = "video";
  }

  const SCENES = {
    // 1. 一つ目：黒画面・無音（2秒）→ Runwayで生成した動画（約8.1秒）を音声ごと流す → 黒画面・無音（2秒）。
    //   しめ縄の向こうの一つ目の怪物が近づく（0〜4.5秒）→ 目の大写し（5〜6秒）→ 飛びかかってくる（6.3秒〜）→ 目が迫って暗転
    //   BGMは止める。動画の音が出せなかった時だけ、飛びかかってくる6.3秒目に合成の衝撃音「ズン」を鳴らす
    async eye(t){
      SoundEngine.setBgmSilenced(true);
      eyeScene.dataset.phase = "black";
      await wait(2000);
      if(!alive(t)) return;

      eyeScene.dataset.phase = "video";
      const hasSound = await playVideoWithSound(eyeVideo, 5.5);
      if(!alive(t)) return;
      if(!hasSound && !SoundEngine.muted){
        await wait(6300);
        if(!alive(t)) return;
        SoundEngine.playBoomSfx("zun");
        await wait(1800);
      } else {
        await wait(8100);
      }
      if(!alive(t)) return;

      eyeScene.dataset.phase = "black";
      eyeVideo.pause();
      await wait(2000);
    },

    // 2. 白い女：Runwayで生成した動画（約6.3秒）を音声ごと流す。
    //   障子越しのシルエット（0〜2.5秒）→ 暗転・姿が消える（3〜3.5秒）→ 白い顔が飛び出す（4秒）→ 暗転（約1.3秒）
    //   BGMは止める。動画の音が出せなかった時だけ、顔が飛び出す4秒目に合成の金切り声を鳴らす
    async face(t){
      SoundEngine.setBgmSilenced(true);
      const hasSound = await playVideoWithSound(faceVideo, 4.2);
      if(!alive(t)) return;
      if(!hasSound && !SoundEngine.muted){
        await wait(4000);
        if(!alive(t)) return;
        SoundEngine.playShriekSfx();
        await wait(2300);
      } else {
        await wait(6300);
      }
    },

    // 3. 陰陽師の霊：Runwayで生成した動画（約7.1秒）を音声ごと流し、そのあと黒画面・無音（2秒）。
    //   参道に立つ陰陽師（0〜3.5秒）→ 青白い文字が埋め尽くす（3.5〜5.5秒）→ 白い光（5.5秒）→ 青い亀裂（6秒〜）
    //   BGMは止める。動画の音が出せなかった時だけ、亀裂が走る6秒目に合成の衝撃音を鳴らす
    async onmyoji(t){
      SoundEngine.setBgmSilenced(true);
      const hasSound = await playVideoWithSound(onmyojiVideo, 2);
      if(!alive(t)) return;
      if(!hasSound && !SoundEngine.muted){
        await wait(6000);
        if(!alive(t)) return;
        SoundEngine.playBoomSfx();
        await wait(1100);
      } else {
        await wait(7100);
      }
      if(!alive(t)) return;

      onmyojiScene.dataset.phase = "black";
      onmyojiVideo.pause();
      await wait(2000);
    },
  };

  // 結果シートを閉じた時：罰演出の余韻を消す
  function clearResidue(){
    app.classList.remove("kaii-residue", "kaii-active");
    ambientStatic.pause();
    SoundEngine.setBgmSilenced(false);
  }

  // 途中で抜けた時：進行中の演出・タイマー・音をすべて止める
  function cancel(){
    token++;
    stopPressure();
    allVideos.forEach(v => v.pause());
    omen.classList.remove("show", "fade-out");
    punish.classList.remove("show", "fade-out");
    delete punish.dataset.variant;
    resetScenes();
    app.classList.remove("kaii-active", "kaii-residue");
    SoundEngine.setBgmSilenced(false);
  }

  return { preload, begin, stopPressure, isPressuring, purify, runPunish, clearResidue, cancel };
})();
