/* 杭州麻将辅助 — PWA 前端逻辑 */
(function () {
  'use strict';
  const MJ = window.MJ;

  // 牌序: 0-8 万, 9-17 筒, 18-26 条, 27-33 字(东南西北中发白)
  const SUIT_NAMES = ['万', '筒', '条'];
  const HONOR_NAMES = ['东', '南', '西', '北', '中', '发', '白'];

  const state = {
    counts: new Array(34).fill(0),
    jokers: 0,
    used: new Array(34).fill(0), // 牌河: 已现牌计数(别人打出+碰杠+自己打出)
    history: [], // 撤销栈: {counts, jokers, used}
    selectedDiscard: -1,
    riverMode: 'add', // 牌河记录模式: 'add' 记一张 / 'sub' 减一张
  };

  const $ = (id) => document.getElementById(id);

  function tileGlyph(i) { return MJ.tileGlyph(i); }
  function tileName(i) {
    if (i < 27) return (MJ.rankOf(i) + 1) + SUIT_NAMES[MJ.suitOf(i)];
    return HONOR_NAMES[i - 27];
  }
  function totalTiles() {
    let s = state.jokers;
    for (let i = 0; i < 34; i++) s += state.counts[i];
    return s;
  }

  /* ---------- 渲染：点牌面板 ---------- */
  function buildPalette() {
    const pal = $('palette');
    pal.innerHTML = '';
    // 万 筒 条
    for (let s = 0; s < 3; s++) {
      const row = document.createElement('div');
      row.className = 'pal-row';
      const lab = document.createElement('div');
      lab.className = 'row-label';
      lab.textContent = SUIT_NAMES[s];
      row.appendChild(lab);
      for (let r = 0; r < 9; r++) {
        const idx = s * 9 + r;
        row.appendChild(makePalTile(idx, false));
      }
      pal.appendChild(row);
    }
    // 字牌
    const hrow = document.createElement('div');
    hrow.className = 'pal-row';
    const hlab = document.createElement('div');
    hlab.className = 'row-label';
    hlab.textContent = '字';
    hrow.appendChild(hlab);
    for (let h = 0; h < 7; h++) hrow.appendChild(makePalTile(27 + h, true));
    pal.appendChild(hrow);
    // 财神
    const jrow = document.createElement('div');
    jrow.className = 'pal-row';
    const jlab = document.createElement('div');
    jlab.className = 'row-label';
    jlab.textContent = '百';
    jrow.appendChild(jlab);
    const jt = document.createElement('div');
    jt.className = 'pal-tile joker';
    jt.textContent = '财';
    jt.onclick = () => addJoker();
    jrow.appendChild(jt);
    pal.appendChild(jrow);
  }
  function makePalTile(idx, honor) {
    const t = document.createElement('div');
    t.className = 'pal-tile' + (honor ? ' honor' : '');
    t.textContent = tileGlyph(idx);
    t.title = tileName(idx);
    t.onclick = () => addTile(idx);
    return t;
  }

  /* ---------- 渲染：牌河（已现牌）面板 ---------- */
  // 牌河只记录真实牌(0-32)，不含白板(索引33=财神)
  function buildRiverPalette() {
    const pal = $('riverPalette');
    pal.innerHTML = '';
    for (let s = 0; s < 3; s++) {
      const row = document.createElement('div');
      row.className = 'pal-row';
      const lab = document.createElement('div');
      lab.className = 'row-label';
      lab.textContent = SUIT_NAMES[s];
      row.appendChild(lab);
      for (let r = 0; r < 9; r++) row.appendChild(makeRiverTile(s * 9 + r, false));
      pal.appendChild(row);
    }
    const hrow = document.createElement('div');
    hrow.className = 'pal-row';
    const hlab = document.createElement('div');
    hlab.className = 'row-label';
    hlab.textContent = '字';
    hrow.appendChild(hlab);
    for (let h = 0; h < 6; h++) hrow.appendChild(makeRiverTile(27 + h, true)); // 东南西北中发(不含白)
    pal.appendChild(hrow);
  }
  function makeRiverTile(idx, honor) {
    const t = document.createElement('div');
    t.className = 'river-tile' + (honor ? ' honor' : '');
    t.dataset.idx = idx;
    t.innerHTML = `<span class="rg">${tileGlyph(idx)}</span><span class="rcnt">${state.used[idx]}</span>`;
    t.title = tileName(idx);
    t.onclick = () => riverTap(idx);
    return t;
  }
  function riverTap(idx) {
    snapshot();
    if (state.riverMode === 'add') state.used[idx] = Math.min(4, state.used[idx] + 1);
    else state.used[idx] = Math.max(0, state.used[idx] - 1);
    render();
  }
  function clearRiver() {
    snapshot();
    state.used = new Array(34).fill(0);
    render();
  }
  function toggleRiverMode() {
    state.riverMode = state.riverMode === 'add' ? 'sub' : 'add';
    const btn = $('riverModeBtn');
    btn.textContent = state.riverMode === 'add' ? '模式：记录 +1' : '模式：撤销 −1';
    btn.classList.toggle('active', state.riverMode === 'sub');
  }

  /* ---------- 操作 ---------- */
  function snapshot() {
    state.history.push({ counts: state.counts.slice(), jokers: state.jokers, used: state.used.slice() });
    if (state.history.length > 50) state.history.shift();
  }
  function addTile(idx) {
    if (state.counts[idx] >= 4) return;
    snapshot();
    state.counts[idx]++;
    state.selectedDiscard = -1;
    render();
  }
  function removeTile(idx) {
    if (state.counts[idx] <= 0) return;
    snapshot();
    state.counts[idx]--;
    state.selectedDiscard = -1;
    render();
  }
  function addJoker() {
    if (totalTiles() >= 14) return;
    snapshot();
    state.jokers++;
    state.selectedDiscard = -1;
    render();
  }
  function removeJoker() {
    if (state.jokers <= 0) return;
    snapshot();
    state.jokers--;
    state.selectedDiscard = -1;
    render();
  }
  function undo() {
    const last = state.history.pop();
    if (!last) return;
    state.counts = last.counts;
    state.jokers = last.jokers;
    state.used = last.used;
    state.selectedDiscard = -1;
    render();
  }
  function clearAll() {
    snapshot();
    state.counts = new Array(34).fill(0);
    state.jokers = 0;
    state.used = new Array(34).fill(0);
    state.selectedDiscard = -1;
    render();
  }

  /* ---------- 渲染：手牌 ---------- */
  function renderHand() {
    const view = $('handView');
    view.innerHTML = '';
    const tiles = [];
    for (let i = 0; i < 34; i++) if (state.counts[i] > 0) tiles.push(i);
    if (tiles.length === 0 && state.jokers === 0) {
      const e = document.createElement('div');
      e.className = 'hand-empty';
      e.textContent = '还没有牌，点下面的牌加入手牌';
      view.appendChild(e);
    } else {
      for (const i of tiles) {
        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.innerHTML = `<span>${tileGlyph(i)}</span><span class="nm">${tileName(i)}</span><span class="cnt">${state.counts[i]}</span>`;
        chip.onclick = () => removeTile(i);
        view.appendChild(chip);
      }
      if (state.jokers > 0) {
        const jc = document.createElement('div');
        jc.className = 'chip';
        jc.style.background = '#fef9c3';
        jc.style.borderColor = '#fde047';
        jc.innerHTML = `<span>财</span><span class="nm">百搭</span><span class="cnt">${state.jokers}</span>`;
        jc.onclick = () => removeJoker();
        view.appendChild(jc);
      }
    }
    $('handCount').textContent = totalTiles();
    $('jokerCount').textContent = state.jokers;
  }

  // 刷新牌河计数显示
  function refreshRiver() {
    let sum = 0;
    const tiles = document.querySelectorAll('#riverPalette .river-tile');
    tiles.forEach(el => {
      const idx = +el.dataset.idx;
      const c = state.used[idx];
      sum += c;
      const rc = el.querySelector('.rcnt');
      if (rc) rc.textContent = c;
      el.classList.toggle('has', c > 0);
    });
    const rcBadge = $('riverCount');
    if (rcBadge) rcBadge.textContent = sum;
  }

  /* ---------- 分析 ---------- */
  function fanOf(counts14, jokers) {
    const opts = {
      gangkai: $('optGangkai').checked,
      qianggang: $('optQianggang').checked,
    };
    return MJ.estimateFan(counts14, jokers, opts);
  }

  // 给定一手 13 张听牌手与听牌对象数组 [{tile,live}]，列出每个听牌的番数
  function renderFanForWaits(base13, jokers, waitsArr) {
    const fanView = $('fanView');
    fanView.innerHTML = '';
    if (waitsArr.length === 0) {
      fanView.innerHTML = '<div class="muted small">尚未听牌，成胡后番数取决于具体摸到的牌。</div>';
      return;
    }
    let maxMult = 0, maxInfo = null;
    for (const w of waitsArr) {
      const c = base13.slice(); c[w.tile]++;
      const f = fanOf(c, jokers);
      const line = document.createElement('div');
      line.className = 'fan-line';
      line.innerHTML = `<span class="tile${w.live ? '' : ' dead'}" style="min-width:34px;height:42px;font-size:20px">${tileGlyph(w.tile)}</span>` +
        `<span class="fan-mult">${f.mult}倍</span><span class="fan-tags">${f.tags.join(' / ') || '平胡'}</span>` +
        (w.live ? '' : '<span class="dead-tag">死</span>');
      fanView.appendChild(line);
      if (f.mult > maxMult) { maxMult = f.mult; maxInfo = f; }
    }
    const m = document.createElement('div');
    m.className = 'fan-max';
    m.textContent = `最高约 ${maxMult} 倍（${maxInfo ? maxInfo.tags.join(' / ') : '平胡'}）`;
    fanView.appendChild(m);
  }

  function render() {
    renderHand();
    refreshRiver();
    const n = totalTiles();
    const shNum = $('shantenNum');
    const shLab = $('shantenLabel');
    const statusLine = $('statusLine');

    if (n === 0) {
      shNum.textContent = '–'; shNum.className = 'shanten-num';
      shLab.textContent = '请先输入手牌';
      statusLine.textContent = '';
      $('waitsBlock').hidden = true; $('adviseBlock').hidden = true; $('fanBlock').hidden = true;
      return;
    }

    const sh = MJ.shanten(state.counts, state.jokers);
    const tenpai = MJ.waits(state.counts, state.jokers).length > 0;
    const isWin = (n === 14) && MJ.isWin(state.counts, state.jokers);

    shNum.className = 'shanten-num' + (isWin ? ' win' : (sh >= 4 ? ' bad' : ''));
    if (isWin) { shNum.textContent = '胡'; shLab.textContent = '已可胡牌'; }
    else { shNum.textContent = sh; shLab.textContent = sh === 0 ? '听牌' : `向听 ${sh}`; }

    // 状态行
    if (isWin) statusLine.textContent = '🎉 当前 14 张已成型，可直接胡（自摸）。';
    else if (tenpai) statusLine.textContent = `听牌中 — 摸到指定牌即胡。`;
    else statusLine.textContent = n < 13 ? `还差 ${13 - n} 张凑满手牌。` : `还需 ${sh} 张调整。`;

    // 听牌（13 张听牌手）
    const waitsBlock = $('waitsBlock');
    const waitsView = $('waitsView');
    if (n === 13 && tenpai) {
      waitsBlock.hidden = false;
      const ws = MJ.waitsInfo(state.counts, state.jokers, state.used);
      waitsView.innerHTML = '';
      let liveCnt = 0;
      for (const w of ws) {
        if (w.live) liveCnt++;
        const el = document.createElement('div');
        el.className = 'tile' + (w.live ? '' : ' dead');
        el.innerHTML = `${tileGlyph(w.tile)}<span class="nm">${tileName(w.tile)}</span>` +
          (w.live ? '' : '<span class="dead-tag">死</span>');
        waitsView.appendChild(el);
      }
      if (ws.length > 0 && liveCnt === 0) {
        const warn = document.createElement('div');
        warn.className = 'dead-warn';
        warn.textContent = '⚠️ 听牌但全部已死（现牌已出满），实际摸不到，建议换听。';
        waitsView.appendChild(warn);
      }
    } else waitsBlock.hidden = true;

    // 出牌建议（14 张）
    const adviseBlock = $('adviseBlock');
    const adviseView = $('adviseView');
    if (n === 14) {
      adviseBlock.hidden = false;
      const adv = MJ.advise(state.counts, state.jokers, state.used);
      adviseView.innerHTML = '';
      adv.slice(0, 8).forEach((a, k) => {
        const item = document.createElement('div');
        item.className = 'advise-item' + (k === 0 ? ' best' : '') + (state.selectedDiscard === a.tile ? ' sel' : '');
        // 进张列表: 死张标红
        const acceptHtml = a.acceptList.slice(0, 10).map(x =>
          `<span class="acc${x.live ? '' : ' dead'}">${tileGlyph(x.tile)}</span>`).join('');
        const deadN = a.acceptList.filter(x => !x.live).length;
        item.innerHTML =
          `<span class="advise-glyph">${tileGlyph(a.tile)}</span>` +
          `<div class="advise-info"><b>打 ${tileName(a.tile)}</b> · 向听 ${a.shanten}` +
          `<div class="muted small">有效进张 <b>${a.acceptCopies}</b> 张${deadN ? `（<span class="dead">${deadN} 死</span>）` : ''}</div>` +
          `<div class="acc-row">${acceptHtml}</div></div>` +
          `<span class="advise-sh">${a.shanten === 0 ? '听' : a.shanten}</span>`;
        item.onclick = () => { state.selectedDiscard = a.tile; render(); };
        adviseView.appendChild(item);
      });

      // 选中的弃牌 -> 听牌 + 番数
      const base13 = state.counts.slice();
      const disc = state.selectedDiscard >= 0 ? state.selectedDiscard : adv[0].tile;
      base13[disc]--;
      const w2 = MJ.waitsInfo(base13, state.jokers, state.used);
      const fanBlock = $('fanBlock');
      fanBlock.hidden = false;
      renderFanForWaits(base13, state.jokers, w2);
    } else if (n === 13 && tenpai) {
      // 13 张听牌也展示番数
      adviseBlock.hidden = true;
      const fanBlock = $('fanBlock');
      fanBlock.hidden = false;
      renderFanForWaits(state.counts, state.jokers, MJ.waitsInfo(state.counts, state.jokers, state.used));
    } else {
      adviseBlock.hidden = true;
      $('fanBlock').hidden = true;
    }
  }

  /* ---------- 事件绑定 ---------- */
  function bind() {
    $('jokerPlus').onclick = addJoker;
    $('jokerMinus').onclick = removeJoker;
    $('undoBtn').onclick = undo;
    $('clearBtn').onclick = clearAll;
    $('optGangkai').onchange = render;
    $('optQianggang').onchange = render;
    $('riverModeBtn').onclick = toggleRiverMode;
    $('riverClearBtn').onclick = clearRiver;
    bindCamera();
    bindInstall();
  }

  /* ---------- 摄像头（最佳努力） ---------- */
  let stream = null, facing = 'environment';
  function bindCamera() {
    const wrap = $('camWrap'), video = $('cam'), shot = $('shot');
    const btnToggle = $('camToggle'), btnSnap = $('camSnap'), btnSwitch = $('camSwitch'), btnRec = $('camRecognize');

    async function startCam() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false
        });
        video.srcObject = stream;
        wrap.hidden = false;
        btnToggle.textContent = '关闭摄像头';
        btnSnap.hidden = false; btnSwitch.hidden = false; btnRec.hidden = false;
      } catch (e) {
        alert('无法访问摄像头：' + (e && e.message ? e.message : e) + '\n请在手机浏览器中授权，并使用 https 或 localhost 打开。');
      }
    }
    function stopCam() {
      if (stream) stream.getTracks().forEach(t => t.stop());
      stream = null; wrap.hidden = true;
      btnToggle.textContent = '开启摄像头';
      btnSnap.hidden = true; btnSwitch.hidden = true; btnRec.hidden = true;
    }
    btnToggle.onclick = () => { stream ? stopCam() : startCam(); };
    btnSwitch.onclick = () => {
      facing = facing === 'environment' ? 'user' : 'environment';
      stopCam(); startCam();
    };
    btnSnap.onclick = () => {
      shot.width = video.videoWidth || 640;
      shot.height = video.videoHeight || 480;
      shot.getContext('2d').drawImage(video, 0, 0, shot.width, shot.height);
      shot.hidden = false;
    };
    btnRec.onclick = async () => {
      if (shot.hidden) btnSnap.onclick();
      const data = shot.getContext('2d').getImageData(0, 0, shot.width, shot.height);
      btnRec.textContent = '识别中…';
      try {
        const res = await (window.MJRecognize ? MJRecognize.recognize(data, shot.width, shot.height) : { tiles: [], confidence: 0, note: '未加载识别模型' });
        applyRecognition(res);
      } catch (e) {
        alert('识别失败：' + (e && e.message ? e.message : e));
      } finally {
        btnRec.textContent = '识别并填入(待核实)';
      }
    };
  }

  // 识别结果预填 + 让用户核实
  function applyRecognition(res) {
    if (!res || !res.tiles || res.tiles.length === 0) {
      alert('未能自动识别到牌。请手动点选输入（本方案为最佳努力，识别仅供参考）。');
      return;
    }
    snapshot();
    state.counts = new Array(34).fill(0);
    state.jokers = 0;
    for (const t of res.tiles) {
      if (t === 'X' || t === 'joker') state.jokers++;
      else if (typeof t === 'number' && t >= 0 && t < 34) {
        if (state.counts[t] < 4) state.counts[t]++;
      }
    }
    state.selectedDiscard = -1;
    render();
    const note = res.note ? '（' + res.note + '）' : '';
    alert(`已按识别结果预填 ${totalTiles()} 张，置信度约 ${Math.round((res.confidence || 0) * 100)}%。\n请务必逐张核实后再使用！${note}`);
  }

  /* ---------- PWA 安装 ---------- */
  let deferredPrompt = null;
  function bindInstall() {
    const btn = $('installBtn');
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault(); deferredPrompt = e; btn.hidden = false;
    });
    btn.onclick = async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null; btn.hidden = true;
    };
    window.addEventListener('appinstalled', () => { btn.hidden = true; });
  }

  /* ---------- 启动 ---------- */
  buildPalette();
  buildRiverPalette();
  bind();
  render();
})();
