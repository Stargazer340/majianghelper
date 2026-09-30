/* 杭州麻将规则引擎 (Hangzhou Mahjong Engine)
 * 牌索引 0..33:
 *   0-8   万 m1..m9
 *   9-17  筒 p1..p9
 *   18-26 条 s1..s9
 *   27-33 字牌 东 南 西 北 中 发 白
 * 财神(wildcard)默认=白板(索引33)，可配置。
 */
(function (root) {
  'use strict';

  const SUIT = ['m', 'p', 's']; // 万 筒 条
  const HONOR = ['东', '南', '西', '北', '中', '发', '白'];

  function isSuited(i) { return i < 27; }
  function suitOf(i) { return Math.floor(i / 9); }
  function rankOf(i) { return i % 9; }   // 0..8
  function tileName(i) {
    if (i < 27) return (rankOf(i) + 1) + (i < 9 ? '万' : i < 18 ? '筒' : '条');
    return HONOR[i - 27];
  }
  function tileGlyph(i) {
    // Unicode 麻将牌
    if (i < 9) return String.fromCodePoint(0x1F007 + i);            // 🀇..🀏 万
    if (i < 18) return String.fromCodePoint(0x1F019 + (i - 9));     // 🀙..🀡 筒
    if (i < 27) return String.fromCodePoint(0x1F010 + (i - 18));    // 🀐..🀘 条
    return String.fromCodePoint(0x1F000 + (i - 27));                // 🀀..🀆 字
  }

  // 把字符串手牌解析成 counts(34) + jokers(财神数)
  // 例: "123m 456m 789m 123p 11s" ；财神用 'X' 表示，如 "X"
  function parseHand(str) {
    const counts = new Array(34).fill(0);
    let jokers = 0;
    const tokens = str.trim().split(/\s+/).filter(Boolean);
    for (const tk of tokens) {
      if (tk.toUpperCase() === 'X') { jokers += 1; continue; }
      // 纯字牌 token: 每个字一张 (如 "东东"=两张东, "中"=一张中)
      if (/^[东南西北中发白]+$/.test(tk)) {
        for (const ch of tk) counts[27 + '东南西北中发白'.indexOf(ch)]++;
        continue;
      }
      const suit = tk[tk.length - 1];
      const body = tk.slice(0, -1);
      if (suit === 'X' || suit === 'x') { jokers += parseInt(body, 10) || 1; continue; }
      let base = -1;
      if (suit === 'm') base = 0; else if (suit === 'p') base = 9; else if (suit === 's') base = 18;
      else if ('东南西北中发白'.includes(suit)) base = 27 + '东南西北中发白'.indexOf(suit);
      if (base < 0) continue;
      for (const ch of body) {
        const n = parseInt(ch, 10);
        if (n >= 1 && n <= 9 && base < 27) counts[base + n - 1]++;
      }
    }
    return { counts, jokers };
  }

  function totalTiles(counts, jokers) {
    let s = jokers; for (let i = 0; i < 34; i++) s += counts[i]; return s;
  }

  // ---- 标准型: 4 面子 + 1 将，财神作百搭 ----
  // 先尝试所有可能的将，再判断剩余能否拆成面子
  function formMelds(counts, jokers) {
    let i = -1;
    for (let k = 0; k < 34; k++) { if (counts[k] > 0) { i = k; break; } }
    if (i === -1) return jokers % 3 === 0; // 全消，剩余财神须成三张一组
    // 1) 刻子
    if (counts[i] >= 3) { counts[i] -= 3; const r = formMelds(counts, jokers); counts[i] += 3; if (r) return true; }
    // 2) 顺子
    if (isSuited(i) && rankOf(i) <= 6 && counts[i + 1] > 0 && counts[i + 2] > 0) {
      counts[i]--; counts[i + 1]--; counts[i + 2]--;
      const r = formMelds(counts, jokers); counts[i]++; counts[i + 1]++; counts[i + 2]++;
      if (r) return true;
    }
    // 3) 财神补刻: (i,i,X)
    if (counts[i] >= 2 && jokers >= 1) { counts[i] -= 2; const r = formMelds(counts, jokers - 1); counts[i] += 2; if (r) return true; }
    // 4) 财神补刻: (i,X,X)
    if (counts[i] >= 1 && jokers >= 2) { counts[i] -= 1; const r = formMelds(counts, jokers - 2); counts[i] += 1; if (r) return true; }
    // 5) 顺子带财神
    if (isSuited(i) && rankOf(i) <= 6) {
      if (counts[i + 1] > 0 && jokers >= 1) { counts[i]--; counts[i + 1]--; const r = formMelds(counts, jokers - 1); counts[i]++; counts[i + 1]++; if (r) return true; }
      if (counts[i + 2] > 0 && jokers >= 1) { counts[i]--; counts[i + 2]--; const r = formMelds(counts, jokers - 1); counts[i]++; counts[i + 2]++; if (r) return true; }
      if (counts[i + 1] > 0 && counts[i + 2] > 0 && jokers >= 1) { counts[i + 1]--; counts[i + 2]--; const r = formMelds(counts, jokers - 1); counts[i + 1]++; counts[i + 2]++; if (r) return true; }
    }
    return false;
  }

  function canWinStandard(counts, jokers) {
    const c = counts.slice();
    for (let t = 0; t < 34; t++) {
      for (let jp = 0; jp <= 2; jp++) {
        if (jp > jokers) continue;
        const need = 2 - jp;
        if (need < 0) continue;
        if (c[t] < need) continue;
        const cc = c.slice();
        cc[t] -= need;
        if (formMelds(cc, jokers - jp)) return true;
      }
    }
    return false;
  }

  // ---- 七对型 (含财神百搭) ----
  function canWinSevenPairs(counts, jokers) {
    let S = 0;
    for (let k = 0; k < 34; k++) S += counts[k] % 2;
    return S <= jokers && ((jokers - S) % 2 === 0);
  }

  // 财神数量(用于番判定): 七对中"豪华"=某牌4张
  function sevenPairsInfo(counts, jokers) {
    let S = 0, quads = 0;
    for (let k = 0; k < 34; k++) { S += counts[k] % 2; if (counts[k] === 4) quads++; }
    const ok = S <= jokers && ((jokers - S) % 2 === 0);
    return { ok, quads, hasJoker: jokers > 0 };
  }

  // 主判定: 是否胡牌(标准或七对)
  function isWin(counts, jokers) {
    return canWinStandard(counts, jokers) || canWinSevenPairs(counts, jokers);
  }

  // ---- 向听数 (shanten): 标准型 ----
  // 公式: shanten = 8 - (2*面子 + 搭子 + 将标志)，限制 面子+搭子+将 ≤ 5
  function shantenStandard(counts, jokers) {
    // 价值 = 2*面子 + 搭子 - (无将来源? 1 : 0)；块数(面子+搭子+将) ≤ 5
    // 将来源(pairCapable): 真实对子 / 对子搭子 / 财神成对 / 单张等摸成对
    const memo = new Map();
    function dfs(c, j, blocks, pairCap, score) {
      let i = -1;
      for (let k = 0; k < 34; k++) { if (c[k] > 0) { i = k; break; } }
      if (i === -1) {
        const add = Math.min(Math.floor(j / 3), 5 - blocks); // 余财神成刻
        return score + 2 * add - (pairCap ? 0 : 1);
      }
      const key = c.join(',') + '|' + j + '|' + blocks + '|' + (pairCap ? 1 : 0) + '|' + score;
      if (memo.has(key)) return memo.get(key);
      let best = -Infinity;
      const tryOpt = (fn) => { const v = fn(); if (v > best) best = v; };
      // 刻子
      if (c[i] >= 3 && blocks < 5) { c[i] -= 3; tryOpt(() => dfs(c, j, blocks + 1, pairCap, score + 2)); c[i] += 3; }
      // 顺子(完整面子)
      if (isSuited(i) && rankOf(i) <= 6 && c[i + 1] > 0 && c[i + 2] > 0 && blocks < 5) {
        c[i]--; c[i + 1]--; c[i + 2]--; tryOpt(() => dfs(c, j, blocks + 1, pairCap, score + 2)); c[i]++; c[i + 1]++; c[i + 2]++;
      }
      // 对子(将/对子搭子，均算将来源)
      if (c[i] >= 2 && blocks < 5) { c[i] -= 2; tryOpt(() => dfs(c, j, blocks + 1, true, score + 1)); c[i] += 2; }
      // 顺子搭子 (i,i+1)
      if (isSuited(i) && rankOf(i) <= 7 && c[i + 1] > 0 && blocks < 5) { c[i]--; c[i + 1]--; tryOpt(() => dfs(c, j, blocks + 1, pairCap, score + 1)); c[i]++; c[i + 1]++; }
      // 嵌张搭子 (i,i+2)
      if (isSuited(i) && rankOf(i) <= 6 && c[i + 2] > 0 && blocks < 5) { c[i]--; c[i + 2]--; tryOpt(() => dfs(c, j, blocks + 1, pairCap, score + 1)); c[i]++; c[i + 2]++; }
      // 财神补刻
      if (c[i] >= 2 && j >= 1 && blocks < 5) { c[i] -= 2; tryOpt(() => dfs(c, j - 1, blocks + 1, pairCap, score + 2)); c[i] += 2; }
      if (c[i] >= 1 && j >= 2 && blocks < 5) { c[i] -= 1; tryOpt(() => dfs(c, j - 2, blocks + 1, pairCap, score + 2)); c[i] += 1; }
      // 顺子带财神(成面子, 计+2)
      if (isSuited(i) && rankOf(i) <= 6) {
        if (c[i] >= 1 && c[i + 1] > 0 && j >= 1 && blocks < 5) { c[i]--; c[i + 1]--; tryOpt(() => dfs(c, j - 1, blocks + 1, pairCap, score + 2)); c[i]++; c[i + 1]++; }
        if (c[i] >= 1 && c[i + 2] > 0 && j >= 1 && blocks < 5) { c[i]--; c[i + 2]--; tryOpt(() => dfs(c, j - 1, blocks + 1, pairCap, score + 2)); c[i]++; c[i + 2]++; }
        if (c[i + 1] > 0 && c[i + 2] > 0 && j >= 1 && blocks < 5) { c[i + 1]--; c[i + 2]--; tryOpt(() => dfs(c, j - 1, blocks + 1, pairCap, score + 2)); c[i + 1]++; c[i + 2]++; }
      }
      // 财神搭子 (i,X) 非将
      if (c[i] >= 1 && j >= 1 && blocks < 5) { c[i] -= 1; tryOpt(() => dfs(c, j - 1, blocks + 1, pairCap, score + 1)); c[i] += 1; }
      // 财神成对 (i,X) 作将
      if (c[i] >= 1 && j >= 1 && blocks < 5) { c[i] -= 1; tryOpt(() => dfs(c, j - 1, blocks + 1, true, score + 1)); c[i] += 1; }
      // 双财神搭子 / 成对
      if (j >= 2 && blocks < 5) { tryOpt(() => dfs(c, j - 2, blocks + 1, pairCap, score + 1)); }
      if (j >= 2 && blocks < 5) { tryOpt(() => dfs(c, j - 2, blocks + 1, true, score + 1)); }
      // 单张作等摸对(将来源，不计分)
      if (c[i] === 1 && j === 0 && blocks < 5) { c[i] -= 1; tryOpt(() => dfs(c, j, blocks + 1, true, score)); c[i] += 1; }
      if (c[i] === 1 && j >= 1 && blocks < 5) { c[i] -= 1; tryOpt(() => dfs(c, j - 1, blocks + 1, true, score + 1)); c[i] += 1; }
      // 浮牌: 该张不参与任何块(标准向听允许余牌为浮牌)
      if (c[i] > 0) { c[i] -= 1; tryOpt(() => dfs(c, j, blocks, pairCap, score)); c[i] += 1; }
      if (best === -Infinity) best = -99;
      memo.set(key, best);
      return best;
    }
    const v = dfs(counts.slice(), jokers, 0, false, 0);
    return 8 - v;
  }

  // 七对向听 (财神作百搭)：已成型对子 + 余数单张与财神配对 + 多余财神两两成对
  function shantenSevenPairs(counts, jokers) {
    let p = 0, s = 0; // p=已成型对数, s=余数单张数
    for (let k = 0; k < 34; k++) { p += Math.floor(counts[k] / 2); s += counts[k] % 2; }
    const fromJokers = Math.min(s, jokers) + Math.floor(Math.max(0, jokers - s) / 2);
    const pairsTotal = Math.min(7, p + fromJokers);
    return Math.max(-1, 6 - pairsTotal);
  }

  function shanten(counts, jokers) {
    const total = totalTiles(counts, jokers);
    const s = Math.min(shantenStandard(counts, jokers), shantenSevenPairs(counts, jokers));
    // 13张手牌(听牌姿态)不可能已胡，最低为0；14张已完成手牌允许-1
    return total <= 13 ? Math.max(0, s) : s;
  }

  // 听牌枚举: 13张手牌，返回所有可胡的牌(索引数组)
  // used: 34-length，记录"已现牌"数量(别人打出的 + 碰杠亮出的 + 自己打出的)，用于死听判断
  function waits(counts13, jokers, used) {
    used = used || new Array(34).fill(0);
    const res = [];
    for (let t = 0; t < 34; t++) {
      if (counts13[t] >= 4) continue; // 该牌已4张
      const c = counts13.slice();
      c[t]++;
      if (isWin(c, jokers)) res.push(t);
      c[t]--;
    }
    return res;
  }

  // 听牌枚举(带死活): 返回 [{tile, live}]
  // live=false 表示该听张的所有副本都已现出(含手牌)，自摸已摸不到 -> 死听
  function waitsInfo(counts13, jokers, used) {
    used = used || new Array(34).fill(0);
    const res = [];
    for (let t = 0; t < 34; t++) {
      if (counts13[t] >= 4) continue;
      const c = counts13.slice();
      c[t]++;
      if (isWin(c, jokers)) {
        const avail = 4 - used[t] - counts13[t]; // 还能摸到几张
        res.push({ tile: t, live: avail >= 1 });
      }
      c[t]--;
    }
    return res;
  }

  // 某张牌剩余可摸张数(总4 - 已现 - 手中持有)
  function remainingCopies(tile, counts, used) {
    used = used || new Array(34).fill(0);
    return Math.max(0, 4 - used[tile] - counts[tile]);
  }

  // 出牌建议: 14张手牌(含刚摸的牌)，返回每个可弃牌的评估
  // used: 同 waits，用于计算"有效进张数"(排除已死的进张)
  // 返回 {tile, shanten, accept(有效进张种类), acceptCopies(有效进张张数), acceptList:[{tile,live}]}
  function advise(hand14, jokers, used) {
    used = used || new Array(34).fill(0);
    const results = [];
    for (let t = 0; t < 34; t++) {
      if (hand14[t] <= 0) continue;
      const c = hand14.slice();
      c[t]--;
      const sh = shanten(c, jokers);
      // 接受度: 摸哪些牌能改善(向听下降)
      let accept = 0; let acceptCopies = 0; const acceptList = [];
      for (let x = 0; x < 34; x++) {
        const inHand = c[x];
        if (inHand >= 4) continue;
        c[x]++;
        const sh2 = shanten(c, jokers);
        if (sh2 < sh) {
          accept++;
          const av = Math.max(0, 4 - used[x] - inHand); // 还能摸到几张此进张
          acceptCopies += av;
          acceptList.push({ tile: x, live: av >= 1 });
        }
        c[x]--;
      }
      results.push({ tile: t, shanten: sh, accept, acceptCopies, acceptList });
    }
    // 排序: 向听升序 -> 有效进张张数降序 -> 进张种类降序
    results.sort((a, b) => (a.shanten - b.shanten) || (b.acceptCopies - a.acceptCopies) || (b.accept - a.accept));
    return results;
  }

  // 番数估算 (仅基于牌型，杠/财飘等动作由用户手动勾选)
  function estimateFan(counts, jokers, opts) {
    opts = opts || {};
    let mult = 1; const tags = [];
    // 七对系
    const sp = sevenPairsInfo(counts, jokers);
    if (sp.ok && counts.filter((v, k) => v > 0).length <= 7 + (jokers > 0 ? 1 : 0)) {
      // 判断是否七对形态
      const nonZero = counts.filter(v => v > 0).length;
      const is7 = (jokers === 0 && nonZero <= 7) || (jokers > 0 && sp.ok && nonZero <= 14);
      if (is7) {
        if (sp.quads >= 3) { mult *= 16; tags.push('三豪华七对'); }
        else if (sp.quads === 2) { mult *= 8; tags.push('双豪华七对'); }
        else if (sp.quads === 1) { mult *= 4; tags.push('豪华七对'); }
        else if (jokers === 0) { mult *= 4; tags.push('清七对'); }
        else { mult *= 2; tags.push('七对'); }
      }
    }
    // 清一色
    const suits = new Set();
    for (let i = 0; i < 27; i++) if (counts[i] > 0) suits.add(Math.floor(i / 9));
    if (suits.size === 1 && jokers === 0 && !tags.includes('七对') && !tags.includes('清七对')) { mult *= 4; tags.push('清一色'); }
    // 碰碰胡 (全刻子/杠)
    if (isAllTriplets(counts, jokers) && !tags.length) { mult *= 2; tags.push('碰碰胡'); }
    // 暴头 / 财飘 (财神作将)
    if (jokers === 1 && fourMeldsComplete(counts, jokers)) { mult *= 2; tags.push('暴头'); }
    else if (jokers >= 2 && fourMeldsComplete(counts, jokers)) { mult *= 4; tags.push('财飘'); }
    // 用户勾选的动作番
    if (opts.gangkai) { mult *= 2; tags.push('杠开'); }
    if (opts.qianggang) { mult *= 2; tags.push('抢杠'); }
    if (tags.length === 0) { mult = 1; tags.push('平胡'); }
    return { mult, tags };
  }

  // 4面子是否已成(财神都用在将上)
  function fourMeldsComplete(counts, jokers) {
    const c = counts.slice();
    // 找到一个将(若含财神则财神作将)
    for (let t = 0; t < 34; t++) {
      if (c[t] >= 2) { c[t] -= 2; if (formMelds(c, 0)) { c[t] += 2; return true; } c[t] += 2; }
    }
    if (jokers >= 1) { // 财神作将
      if (formMelds(c, jokers - 1)) return true;
    }
    return false;
  }
  function isAllTriplets(counts, jokers) {
    const c = counts.slice();
    // 尝试所有将，剩余须全为刻子
    for (let t = 0; t < 34; t++) {
      for (let jp = 0; jp <= 2; jp++) {
        if (jp > jokers) continue;
        const need = 2 - jp; if (need < 0 || c[t] < need) continue;
        const cc = c.slice(); cc[t] -= need;
        if (allTripletsOnly(cc, jokers - jp)) return true;
      }
    }
    return false;
  }
  function allTripletsOnly(counts, jokers) {
    for (let k = 0; k < 34; k++) {
      while (counts[k] > 0) {
        if (counts[k] >= 3) { counts[k] -= 3; }
        else if (counts[k] === 2 && jokers >= 1) { counts[k] -= 2; jokers -= 1; }
        else if (counts[k] === 1 && jokers >= 2) { counts[k] -= 1; jokers -= 2; }
        else return false;
      }
    }
    return jokers % 3 === 0;
  }

  const MJ = {
    isSuited, suitOf, rankOf, tileName, tileGlyph,
    parseHand, totalTiles,
    canWinStandard, canWinSevenPairs, isWin,
    shanten, shantenStandard, shantenSevenPairs,
    waits, waitsInfo, advise, estimateFan,
    remainingCopies,
    sevenPairsInfo, fourMeldsComplete, isAllTriplets,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = MJ;
  else root.MJ = MJ;
})(typeof globalThis !== 'undefined' ? globalThis : this);
