/* 杭州麻将辅助 — 摄像头牌面识别（最佳努力 / 仅供参考）
 *
 * 重要说明：
 *  - 纯靠单摄像头 + 通用 CV 在真实场景下识别麻将牌并不可靠（角度、光照、遮挡、整桌不可见）。
 *  - 本模块是「可插拔」识别接口：若有训练好的浏览器端模型（如 ONNX/TFJS）注入到
 *    window.MJModel.detect(imageData, w, h) -> Promise<{tiles, confidence}>，
 *    这里会自动调用并预填结果；否则返回「未加载模型」，由用户手动点选。
 *  - 无论识别结果如何，前端都会弹出「请逐张核实」提示，识别结果仅供参考。
 */
(function () {
  'use strict';

  // 牌索引映射：'m1'..'m9','p1'..'p9','s1'..'s9','z1'..'z7'(东南西北中发白), 'X'=财神
  function tokenToIndex(tok) {
    if (tok === 'X' || tok === 'joker') return 'X';
    const suit = tok[0];
    const n = parseInt(tok.slice(1), 10);
    if (suit === 'm' && n >= 1 && n <= 9) return (n - 1);
    if (suit === 'p' && n >= 1 && n <= 9) return 9 + (n - 1);
    if (suit === 's' && n >= 1 && n <= 9) return 18 + (n - 1);
    if (suit === 'z' && n >= 1 && n <= 7) return 27 + (n - 1);
    return -1;
  }

  async function recognize(imageData, w, h) {
    if (typeof window.MJModel !== 'undefined' && typeof window.MJModel.detect === 'function') {
      try {
        const out = await window.MJModel.detect(imageData, w, h);
        const tiles = (out.tiles || []).map(tokenToIndex).filter((x) => x !== -1);
        return { tiles, confidence: out.confidence || 0, note: '模型识别，请逐张核实' };
      } catch (e) {
        return { tiles: [], confidence: 0, note: '模型识别异常：' + (e && e.message ? e.message : e) };
      }
    }
    // 无模型：诚实返回空，引导手动输入
    return {
      tiles: [],
      confidence: 0,
      note: '未加载识别模型。本方案为最佳努力，请手动点选输入。',
    };
  }

  window.MJRecognize = { recognize, tokenToIndex };
})();
