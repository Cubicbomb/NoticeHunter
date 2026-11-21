#!/usr/bin/env node
/**
 * 通知猎人 · LLM 主抽取路径验收（spec noticehunter-llm T2–T6）
 *
 * 前提（两条命令都要起）：
 *   1) 仓库根：python -m http.server 8761 --bind 127.0.0.1
 *   2) prototype：node test/fake-llm-server.js --port=8791
 *   3) NODE_PATH 指向 playwright-core（本机 npx 缓存）。缺依赖时
 *      `test/load-playwright.cjs` 会打印完整复原步骤（HANDOFF R-18）。
 *
 * 用法：node verify-llm.cjs
 * 断言一律操作真实 DOM / 真实 stub，不在测试里重写产品逻辑。
 */
const { chromium } = require('./test/load-playwright.cjs');
const path = require('path');
const fs = require('fs');

const PAGE = 'http://127.0.0.1:8761/prototype/index.html';
const STUB = 'http://127.0.0.1:8791';
const SAMPLES = path.join(__dirname, 'samples');
const SECRET = 'sk-test-SECRET-XYZ-98765';
const NODATE = path.join(__dirname, 'test', '_nodate.txt');
const BIGFILE = path.join(__dirname, 'test', '_big65.txt');
/* S2.11 测试素材 */
const SINGLEFILE = path.join(__dirname, 'test', '_single.txt');   // 1 条候选
const LONGFILE = path.join(__dirname, 'test', '_long.txt');       // 单段落超 2000 字
const MANYFILE = path.join(__dirname, 'test', '_many250.txt');    // 250 条候选（触发确认）
/* 2026-11-21 新增用例素材 */
const ONEFILE = path.join(__dirname, 'test', '_one.txt');         // 1 段、含明确日期
const INTERN = path.join(SAMPLES, 'notice-internship.txt');
const SUPPFILE = path.join(__dirname, 'test', '_supp.txt');       // 2 段都可被规则抽出，用于补漏

const results = [];
function check(name, cond, detail) {
  results.push((cond ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '   [' + detail + ']' : ''));
  if (!cond) process.exitCode = 1;
}

const ctl = async (body) => fetch(STUB + '/__control', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
});
const stubState = async () => (await fetch(STUB + '/__state')).json();

async function openSettings(page) {
  const open = await page.locator('#llmSettings').getAttribute('open');
  if (open === null) { await page.click('#llmSettings summary'); await page.waitForTimeout(120); }
}

async function configure(page, base, key, model) {
  await openSettings(page);
  await page.fill('#llmBase', base);
  await page.fill('#llmKey', key);
  await page.fill('#llmModel', model);
  await page.click('#llmSave');
  await page.waitForTimeout(200);
}
const badge = async (page) => (await page.locator('#modeBadge').innerText()).trim();
const hint = async (page) => (await page.locator('#llmHint').innerText()).trim();
const toastOf = async (page) => (await page.locator('#toast').innerText()).trim();
/* 注意：动作/截止等字段在 input.value 里，innerText 读不到，必须取 value */
const readCards = (page) => page.$$eval('#reviewList .card', (els) => els.map((el) => ({
  action: ((el.querySelector('input[data-field="action"]')) || {}).value || '',
  badges: Array.from(el.querySelectorAll('.badge')).map((b) => b.textContent.trim()).join('|'),
  srcIdx: Number(el.getAttribute('data-src-idx')),
  para: Number(el.getAttribute('data-para'))
})));

/* T7：每种故障回退后都要完整走通「确认 → 清单 → 导出」（spec 三种故障各跑一遍） */
async function walkConfirmExport(page, label) {
  const btns = page.locator('#reviewList button[data-act="confirm"]');
  if ((await btns.count()) === 0) {
    check('T7 [' + label + '] 回退后仍可确认 → 清单 → 导出', false, '无可确认条目');
    return;
  }
  await btns.first().click();
  await page.waitForTimeout(300);
  const txt = await page.evaluate(
    () => (typeof buildExport === 'function' ? buildExport() : null));
  const p = page.waitForEvent('download');
  await page.click('#export');
  const dl = await p;
  check('T7 [' + label + '] 回退后仍可确认 → 清单 → 导出',
    !!txt && txt.indexOf('出处：') >= 0 && /\.txt$/.test(dl.suggestedFilename()),
    (txt || '(null)').split('\n').slice(0, 2).join(' / '));
}

(async () => {
  fs.mkdirSync(path.join(__dirname, 'test'), { recursive: true });
  fs.writeFileSync(NODATE, '这是一段完全没有时间信息的文字。\n这里也没有任何日期或截止要求。\n仅用于验证无候选段落时不发请求。\n', 'utf8');

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1120, height: 980 } });
  const errors = [];          // pageerror = 未捕获异常（硬失败）
  const consoleErrs = [];     // console error，需过滤我们故意触发的 500
  page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const extReqs = [];
  page.on('request', (r) => {
    const u = r.url();
    if (/^https?:\/\//i.test(u) && u.indexOf('127.0.0.1') < 0 && u.indexOf('localhost') < 0) extReqs.push(u);
  });

  await page.goto(PAGE, { waitUntil: 'load' });
  await ctl({ reset: true });

  /* ===== T2 · 未配置时的提示与徽章 ===== */
  check('T2 未配置时徽章为「规则式抽取（兜底）」',
    (await badge(page)) === '规则式抽取（兜底）', await badge(page));
  /* details 收起时子元素不可见，innerText 为空 —— 先展开再读提示 */
  await openSettings(page);
  check('T2 未配置时提示「尚未配置，当前使用规则式抽取」',
    (await hint(page)) === '尚未配置，当前使用规则式抽取', JSON.stringify(await hint(page)));

  /* 缺项：只填 base */
  await openSettings(page);
  await page.fill('#llmBase', STUB);
  await page.click('#llmSave');
  await page.waitForTimeout(150);
  check('T2 缺项时不生效，提示仍为未配置',
    (await hint(page)) === '尚未配置，当前使用规则式抽取', await hint(page));
  check('T2 缺项时徽章仍为规则式',
    (await badge(page)) === '规则式抽取（兜底）', await badge(page));

  /* ===== T2 · 完整配置 + 密钥不落盘 ===== */
  await configure(page, STUB, SECRET, 'stub-model');
  check('T2 配置后徽章变为 AI 抽取',
    (await badge(page)).indexOf('AI 抽取') === 0, await badge(page));
  check('T2 配置后提示变为已配置',
    (await hint(page)) === '已配置，抽取优先调用 AI', await hint(page));

  const html = await page.evaluate(() => document.documentElement.outerHTML);
  const ls = await page.evaluate(() => JSON.stringify({
    local: Object.assign({}, localStorage),
    session: Object.assign({}, sessionStorage)
  }));
  check('T2 密钥不出现在 outerHTML', html.indexOf(SECRET) < 0,
    html.indexOf(SECRET) >= 0 ? 'LEAKED' : 'clean');
  check('T2 密钥不出现在 localStorage / sessionStorage', ls.indexOf(SECRET) < 0,
    ls.indexOf(SECRET) >= 0 ? 'LEAKED' : 'clean');

  /* ===== T3 · ok 模式走 AI ===== */
  await ctl({ reset: true, mode: 'ok' });
  await page.click('#sample');
  await page.waitForTimeout(900);

  const stub1 = await stubState();
  check('T3 ok 模式确实发起了请求', stub1.requests >= 2, 'requests=' + stub1.requests);

  const cards = await readCards(page);
  const allCards = cards.length;
  check('T3 条目来自 stub 内容（含【STUB】标记）',
    cards.some((c) => c.action.indexOf('【STUB】') >= 0),
    allCards + ' cards | ' + cards.map((c) => c.action).join(' || ').slice(0, 220));
  const aiCards = cards.filter((c) => c.badges.indexOf('AI') >= 0).length;
  const supCards = cards.filter((c) => c.badges.indexOf('规则补充') >= 0).length;
  check('T3 卡片来源为 AI 或规则补充（不再把规则结果藏起来）',
    allCards > 0 && aiCards > 0 && aiCards + supCards === allCards,
    'ai=' + aiCards + ' sup=' + supCards + '/' + allCards);
  const firstRaw = await page.locator('#rawList .para[data-s="0"][data-p="1"]').count()
    ? await page.locator('#rawList .para[data-s="0"][data-p="1"]').innerText() : '';
  check('T3 sourceIndex=1 正确映射到原文首段',
    allCards > 0 && cards[0].srcIdx === 0 && cards[0].para === 1
      && firstRaw.indexOf('关于做好 2026 届毕业实习材料提交工作的通知') >= 0,
    cards[0] ? ('srcIdx=' + cards[0].srcIdx + ' para=' + cards[0].para + ' raw=' + firstRaw.slice(0, 40)) : 'none');
  check('T3 徽章保持 AI 抽取（未回退）',
    (await badge(page)) === 'AI 抽取', await badge(page));

  /* ===== T3 · http-500 回退 ===== */
  await ctl({ mode: 'http-500' });
  await page.click('#llmRetry');
  /* 节流生效后，两个源的重试需约 2×800ms；必须等整批跑完再断言终值 */
  await page.waitForTimeout(4500);
  const t500 = await toastOf(page);
  check('T3 HTTP 500 触发含状态码的中文提示',
    /HTTP 500/.test(t500) && /回退/.test(t500), t500);
  check('T3 回退后徽章显示已回退',
    (await badge(page)) === 'AI 抽取 · 已回退', await badge(page));
  /* 回退后条目数会变多（规则式比 stub 的单条产出更多），需重新计数再比 */
  const cardsAfterFallback = await page.locator('#reviewList .card').count();
  const ruleBadges = await page.locator('#reviewList .card', { hasText: '规则式' }).count();
  check('T3 回退后全部卡片来源变为规则式',
    cardsAfterFallback > 0 && ruleBadges === cardsAfterFallback,
    'rule=' + ruleBadges + '/' + cardsAfterFallback);

  /* T7：故障回退后必须仍能走通「确认 → 清单 → 导出」——三种故障各一遍 */
  await walkConfirmExport(page, 'http-500');

  /* ===== T3 · bad-json 回退 ===== */
  await ctl({ mode: 'bad-json' });
  await page.click('#llmRetry');
  await page.waitForTimeout(4500);
  const tBad = await toastOf(page);
  check('T3 非法 JSON 触发含「无法解析为 JSON」的提示',
    /无法解析为 JSON/.test(tBad), tBad);
  await walkConfirmExport(page, 'bad-json');

  /* ===== T3 · timeout 回退（单文件，避免两次 30s 串行等待）=====
     2026-11-21：LLM_TIMEOUT_MS 由 15s 提到 30s（60 段 + 结构化 JSON 的请求经常 15s 不够），
     本项等待时间随之由 16.5s 提到 31.5s。 */
  await page.click('#clear');
  await page.waitForTimeout(150);
  await page.setInputFiles('#file', path.join(SAMPLES, 'notice-internship.txt'));
  await page.waitForTimeout(700);
  await ctl({ mode: 'timeout' });
  await page.click('#llmRetry');
  await page.waitForTimeout(31500);
  const tTo = await toastOf(page);
  check('T3 超时触发含「超时」的中文提示',
    /超时/.test(tTo) && /回退/.test(tTo), tTo);
  check('T3 超时后主流程仍可用（清单与卡片仍在）',
    (await page.locator('#reviewList .card').count()) > 0);
  await walkConfirmExport(page, 'timeout');

  /* ===== T3 · 恢复 ok 后徽章回正 ===== */
  await ctl({ mode: 'ok' });
  await page.click('#llmRetry');
  await page.waitForTimeout(2500);          /* 含 800ms 节流，留足余量 */
  check('T3 恢复 ok 后徽章回到 AI 抽取',
    (await badge(page)) === 'AI 抽取', await badge(page));

  /* ===== T5 · 字段校验与剔除 ===== */
  await ctl({
    mode: 'ok',
    payload: [
      { action: '合法条目', owner: '执行人甲', where: '地点甲', dueRaw: '2027 年 6 月 1 日 09:00 前',
        due: '2027-06-01 09:00', sourceIndex: 1, confidence: 'high', reasons: [] },
      { action: '截止格式非法的条目', owner: null, where: '地点乙', dueRaw: '2027 年 6 月 2 日之前',
        due: '乱七八糟不是日期', sourceIndex: 2, confidence: 'high', reasons: [] },
      { action: '来源越界的条目', owner: null, where: null, dueRaw: '2027 年 7 月 1 日',
        due: '2027-07-01', sourceIndex: 9999, confidence: 'high', reasons: [] },
      { action: '置信度非法的条目', owner: null, where: null, dueRaw: '2027 年 8 月 1 日',
        due: '2027-08-01', sourceIndex: 3, confidence: '超高', reasons: [] }
    ]
  });
  await page.click('#llmRetry');
  await page.waitForTimeout(2500);          /* 含 800ms 节流，留足余量 */

  const tDrop = await toastOf(page);
  check('T5 越界 sourceIndex 的条目被剔除并提示条数',
    /1 条已剔除/.test(tDrop), tDrop);

  const reviewData = await readCards(page);
  const reviewActions = reviewData.map((c) => c.action);
  check('T5 合法条目进入待确认区且标注 AI',
    reviewData.some((c) => c.action === '合法条目' && c.badges.indexOf('AI') >= 0),
    JSON.stringify(reviewData.map((c) => ({ a: c.action, b: c.badges }))));
  check('T5 越界 sourceIndex 的条目未进入界面',
    reviewActions.indexOf('来源越界的条目') < 0, reviewActions.join(' | '));
  const fixed = await page.evaluate(() => {
    const i = state.items.find((x) => x.action === '截止格式非法的条目');
    return i ? { due: i.due, confidence: i.confidence, reasons: i.reasons } : null;
  });
  check('T5 非法 due 已由规则层从 dueRaw 修正为 2027-06-02 并记录原因',
    !!fixed && fixed.due === '2027-06-02'
      && fixed.reasons.join('').indexOf('格式非法') >= 0,
    JSON.stringify(fixed));

  const confFix = await page.evaluate(() => {
    const i = state.items.find((x) => x.action === '置信度非法的条目');
    return i ? { c: i.confidence, r: i.reasons } : null;
  });
  check('T5 非法 confidence 回落为 low 并写入原因（S2.4）',
    !!confFix && confFix.c === 'low' && confFix.r.join('').indexOf('置信度非法') >= 0,
    JSON.stringify(confFix));

  /* ===== T6 · 卡片与清单的来源标注 ===== */
  await page.locator('#reviewList button[data-act="confirm"]').first().click();
  await page.waitForTimeout(300);
  const listText = await page.locator('#todoList').innerText();
  check('T6 清单条目显示来源标注', /AI|规则式|规则补充/.test(listText), listText.replace(/\s+/g, ' ').slice(0, 60));
  /* T6 重试按钮在空闲时可用 */
  check('T6 重试按钮在空闲时可用',
    !(await page.locator('#llmRetry').isDisabled()), 'disabled=' + await page.locator('#llmRetry').isDisabled());

  /* ==================== 2026-11-21 · 解析容错与字段补正（T14–T22） ==================== */
  const Y = new Date().getFullYear();
  const setRaw = (s) => ctl({ mode: 'ok', payload: null, raw: s });
  const lastItems = (page) => page.evaluate(() => state.items.map((x) => ({
    action: x.action, due: x.due, idx: x.sourceIndex, confidence: x.confidence,
    mergedFrom: x.mergedFrom, reasons: x.reasons, extractor: x.extractor,
    supplement: !!x.supplement
  })));
  const loadFresh = async (page, file, wait) => {
    await page.click('#clear');
    await page.waitForTimeout(200);
    await page.setInputFiles('#file', file);
    await page.waitForTimeout(wait || 1800);
  };
  fs.writeFileSync(ONEFILE, '请于 2027 年 10 月 1 日前将材料交至测试地点。\n', 'utf8');
  fs.writeFileSync(SUPPFILE,
    '请于 2026 年 11 月 5 日 17:00 前，将《鉴定表》交至学院办公室。\n'
    + '请于 2026 年 11 月 6 日 17:00 前，将《实习日志》交至教务办。\n'
    + '2026 年 10 月 13 日\n', 'utf8');

  /* T14：前言 + markdown 围栏 —— 真实模型最常见的两种「不听话」 */
  await setRaw('好的，以下是抽取结果：\n```json\n[{"action":"带前言的条目","owner":null,"where":null,'
    + '"dueRaw":"2026 年 11 月 5 日","due":"2026-11-05","sourceIndex":14,'
    + '"confidence":"high","reasons":[]}]\n```\n共 1 条。');
  await loadFresh(page, INTERN);
  /* S2.13 起补漏会追加规则条目，这些「解析是否成功」类断言只看 AI 条目 */
  const t14 = (await lastItems(page)).filter((x) => x.extractor === 'ai');
  check('T14 模型带前言/围栏时仍能解析出条目',
    t14.length === 1 && t14[0].action === '带前言的条目', JSON.stringify(t14.map((x) => x.action)));
  check('T14 未因内容解析失败而回退',
    (await badge(page)) === 'AI 抽取', await badge(page));

  /* T15：单个对象而不是数组 */
  await setRaw('{"action":"单对象条目","owner":"甲","where":"乙","dueRaw":"2026 年 11 月 5 日",'
    + '"due":"2026-11-05","sourceIndex":14,"confidence":"high","reasons":[]}');
  await page.click('#llmRetry');
  await page.waitForTimeout(2500);
  const t15 = (await lastItems(page)).filter((x) => x.extractor === 'ai');
  check('T15 模型返回单个对象时自动包装为数组',
    t15.length === 1 && t15[0].action === '单对象条目', JSON.stringify(t15.map((x) => x.action)));

  /* T16：输出被截断（max_tokens）——抢救已完整的对象，而不是整文件回退 */
  await setRaw('[{"action":"截断保留 A","owner":null,"where":null,"dueRaw":"2026 年 11 月 5 日",'
    + '"due":"2026-11-05","sourceIndex":14,"confidence":"high","reasons":[]},'
    + '{"action":"截断保留 B","owner":null,"where":null,"dueRaw":"2026 年 11 月 5 日",'
    + '"due":"2026-11-05","sourceIndex":14,"confidence":"high","reasons":[]},'
    + '{"action":"被截断的一');
  await page.click('#llmRetry');
  await page.waitForTimeout(2500);
  const t16 = (await lastItems(page)).filter((x) => x.extractor === 'ai');
  check('T16 输出被截断时抢救出已完整的条目（未整文件回退）',
    t16.length === 2 && t16.some((x) => x.action === '截断保留 A')
      && t16.some((x) => x.action === '截断保留 B'),
    JSON.stringify(t16.map((x) => x.action)) + ' | ' + await badge(page));

  /* T17：空数组是有效结果 —— 该文件用规则式会产出 1 条，正好用来区分「AI 空结果」与「回退」 */
  await setRaw('[]');
  await loadFresh(page, ONEFILE);
  const t17 = await lastItems(page);
  const statusT17 = (await page.locator('#aiStatus').innerText()).trim();
  check('T17 AI 返回空数组时不回退规则式（条目为 0，而非规则式的 1 条）',
    t17.length === 0, 'items=' + t17.length + ' | ' + JSON.stringify(t17.map((x) => x.extractor)));
  check('T17 状态栏说明 AI 未发现可执行事项',
    /没有发现可执行事项/.test(statusT17), statusT17);

  /* T18 + T19：年份校正 + 出处校正（模型看不到「今天」，会给出过期年份；也会把动作段当出处） */
  await loadFresh(page, INTERN);
  const duePara = await page.evaluate(() => {
    const p = state.sources[0].paragraphs;
    const i = p.findIndex((t) => t.indexOf('2026 年 11 月 5 日') >= 0);
    return i + 1;
  });
  await setRaw('[{"action":"年份校正条目","owner":null,"where":null,"dueRaw":"11 月 5 日",'
    + '"due":"2024-11-05","sourceIndex":' + duePara + ',"confidence":"high","reasons":[]},'
    + '{"action":"出处校正条目","owner":null,"where":null,"dueRaw":"2026 年 11 月 5 日",'
    + '"due":"2026-11-05 17:00","sourceIndex":1,"confidence":"high","reasons":[]}]');
  await page.click('#llmRetry');
  await page.waitForTimeout(2500);
  const t18 = await lastItems(page);
  const yearItem = t18.find((x) => x.action === '年份校正条目');
  check('T18 原文没写年份时，把模型给的过期年份校正到当前年',
    !!yearItem && String(yearItem.due).indexOf(Y + '-11-05') === 0
      && yearItem.reasons.join('').indexOf('不一致') >= 0,
    JSON.stringify(yearItem));
  const locItem = t18.find((x) => x.action === '出处校正条目');
  check('T19 出处段号按原文实际位置校正（不再指向模型声称的第 1 段）',
    !!locItem && locItem.idx === duePara
      && locItem.reasons.join('').indexOf('校正为第 ' + duePara + ' 段') >= 0,
    JSON.stringify(locItem) + ' | 应在第 ' + duePara + ' 段');
  /* 只看 AI 条目：补漏卡片会落在其它段落，与本断言无关 */
  const cardAtDue = await page.locator('#reviewList .card[data-para="' + duePara + '"]', { hasText: 'AI' }).count();
  const aiAtDue = t18.filter((x) => x.extractor === 'ai').length;
  check('T19 校正后的卡片都指向原文里真正含截止时间的那一段',
    cardAtDue === aiAtDue, 'cards@' + duePara + '=' + cardAtDue + ' aiItems=' + aiAtDue
      + ' all=' + t18.length);

  /* T20：同文件内重复条目只保留一条 */
  await setRaw('[{"action":"重复条目","owner":"甲","where":"乙","dueRaw":"2026 年 11 月 5 日",'
    + '"due":"2026-11-05","sourceIndex":' + duePara + ',"confidence":"high","reasons":[]},'
    + '{"action":"重复条目","owner":"甲","where":"乙","dueRaw":"2026 年 11 月 5 日",'
    + '"due":"2026-11-05","sourceIndex":' + duePara + ',"confidence":"high","reasons":[]}]');
  await page.click('#llmRetry');
  await page.waitForTimeout(2500);
  const t20 = await lastItems(page);
  const dupItems = t20.filter((x) => x.action === '重复条目');
  check('T20 同文件内重复条目合并为 1 条',
    dupItems.length === 1 && dupItems[0].mergedFrom === 2,
    JSON.stringify(t20.map((x) => ({ a: x.action, m: x.mergedFrom }))));

  /* T21：取消 —— 请求挂起时必须能中断，且不回退规则式 */
  await ctl({ mode: 'ok' });
  await loadFresh(page, INTERN);
  await ctl({ mode: 'timeout' });
  await page.click('#llmRetry');
  await page.waitForTimeout(1200);
  const cancelBtn = page.locator('#aiStatus button[data-act="cancelAi"]');
  const hasCancel = await cancelBtn.count();
  if (hasCancel) await cancelBtn.click();
  await page.waitForTimeout(900);
  const t21 = await lastItems(page);
  check('T21 抽取在途时状态栏出现「取消」按钮', hasCancel === 1, 'count=' + hasCancel);
  check('T21 取消后不产生条目、也不回退规则式',
    t21.length === 0 && (await badge(page)) === 'AI 抽取',
    'items=' + t21.length + ' badge=' + await badge(page));
  check('T21 toast 说明已取消', /已取消/.test(await toastOf(page)), await toastOf(page));

  /* T22：连接测试 —— 把「Key/模型/CORS 配错」和「抽取结果差」区分开 */
  await ctl({ mode: 'ok' });
  await openSettings(page);
  await page.click('#llmTest');
  await page.waitForTimeout(1500);
  const testOk = (await page.locator('#llmTestResult').innerText()).trim();
  check('T22 连接测试成功时给出耗时与返回片段', /连接成功/.test(testOk), testOk);
  await ctl({ mode: 'http-500' });
  await page.click('#llmTest');
  await page.waitForTimeout(1800);
  const testBad = (await page.locator('#llmTestResult').innerText()).trim();
  check('T22 连接失败时给出具体状态码（HTTP 500）',
    /连接失败/.test(testBad) && /HTTP 500/.test(testBad), testBad);
  await ctl({ mode: 'ok' });

  /* ==================== 2026-11-21 · AI + 规则条目级补漏（T23–T25） ==================== */
  /* T23：AI 只覆盖第 1 段，第 2 段由规则补；第 3 段（落款日期，无交件动词/地点/责任人）
     也必须补——用户实测反馈「末尾的 2026 年 10 月 13 日没有被抽出」（2026-11-21） */
  await setRaw('[{"action":"提交《鉴定表》","owner":null,"where":"学院办公室",'
    + '"dueRaw":"2026 年 11 月 5 日 17:00 前","due":"2026-11-05 17:00","sourceIndex":1,'
    + '"confidence":"high","reasons":[]}]');
  await loadFresh(page, SUPPFILE);
  const t23 = await lastItems(page);
  const ai23 = t23.find((x) => x.extractor === 'ai');
  const sup23 = t23.find((x) => x.supplement && x.idx === 2);
  check('T23 AI 漏掉的第 2 段由规则补漏（共 3 条）',
    t23.length === 3 && !!ai23 && !!sup23 && sup23.idx === 2,
    JSON.stringify(t23.map((x) => ({ e: x.extractor, s: x.supplement, i: x.idx }))));
  check('T23 补漏条目强制 low 并写明「规则补充」原因',
    !!sup23 && sup23.confidence === 'low'
      && sup23.reasons.join('').indexOf('规则补充') >= 0,
    JSON.stringify(sup23 && { c: sup23.confidence, r: sup23.reasons }));
  check('T23 AI 条目未被补漏改写（仍是 high + 原 action）',
    !!ai23 && ai23.confidence === 'high' && ai23.action === '提交《鉴定表》',
    JSON.stringify(ai23 && { a: ai23.action, c: ai23.confidence }));
  const supCardText = await page.locator('#reviewList .card[data-para="2"]').innerText();
  check('T23 补漏卡片标注「规则补充」', supCardText.indexOf('规则补充') >= 0,
    supCardText.replace(/\s+/g, ' ').slice(0, 120));
  const sum23 = (await page.locator('#aiStatus').innerText()).trim();
  check('T23 状态栏摘要说明规则补漏条数', /规则补漏 2 条/.test(sum23), sum23);

  /* T27：只有日期、没有交件动词/地点/责任人的落款段也必须补，不许静默丢召回 */
  const closing23 = t23.find((x) => x.supplement && x.idx === 3);
  check('T27 末尾落款日期段也被规则补漏（不再被噪声过滤静默跳过）',
    !!closing23 && closing23.confidence === 'low'
      && closing23.reasons.join('').indexOf('规则补充') >= 0,
    JSON.stringify(t23.map((x) => ({ e: x.extractor, s: x.supplement, i: x.idx }))));

  /* T26：规则补充卡片必须与 AI 卡片有视觉分层（灰调），不能只靠一枚徽章 */
  const supCard = page.locator('#reviewList .card[data-para="2"]');
  const supVisual = await supCard.evaluate((el) => ({
    cls: el.className,
    bg: getComputedStyle(el).backgroundColor,
    border: getComputedStyle(el).borderLeftColor
  }));
  check('T26 规则补充卡片带 supplement 类且背景为灰调（非白底）',
    /\bsupplement\b/.test(supVisual.cls) && supVisual.bg !== 'rgb(255, 255, 255)',
    JSON.stringify(supVisual));

  /* T24：AI 已覆盖两段时不得重复补漏 */
  await setRaw('[{"action":"提交《鉴定表》","owner":null,"where":"学院办公室",'
    + '"dueRaw":"2026 年 11 月 5 日 17:00 前","due":"2026-11-05 17:00","sourceIndex":1,'
    + '"confidence":"high","reasons":[]},'
    + '{"action":"提交《实习日志》","owner":null,"where":"教务办",'
    + '"dueRaw":"2026 年 11 月 6 日 17:00 前","due":"2026-11-06 17:00","sourceIndex":2,'
    + '"confidence":"high","reasons":[]}]');
  await page.click('#llmRetry');
  await page.waitForTimeout(2500);
  const t24 = await lastItems(page);
  check('T24 AI 已覆盖的段落不被重复补漏（只剩第 3 段落款补 1 条）',
    t24.filter((x) => x.extractor === 'ai' && !x.supplement).length === 2
      && t24.filter((x) => x.supplement).length === 1
      && t24.filter((x) => x.supplement).every((x) => x.idx === 3),
    JSON.stringify(t24.map((x) => ({ e: x.extractor, s: x.supplement, i: x.idx }))));

  /* T25：AI 返回 [] 时仍然不补漏（保持 S2.12 / T17 的「空结果是有效判断」） */
  await setRaw('[]');
  await loadFresh(page, SUPPFILE);
  const t25 = await lastItems(page);
  check('T25 AI 返回空结果时不补漏（规则式本可产出 3 条）',
    t25.length === 0, 'items=' + t25.length + ' | ' + JSON.stringify(t25.map((x) => x.extractor)));

  /* ===== T4 · 无候选段落不发请求（验收措辞已于 spec 中修订为可证伪四条）===== */
  await ctl({ reset: true, mode: 'ok' });
  const before = (await stubState()).requests;
  const chipsBefore = await page.locator('#sources .src-chip').count();
  const itemsBefore = await page.evaluate(() => state.items.length);
  await page.setInputFiles('#file', NODATE);
  await page.waitForTimeout(900);
  const after = (await stubState()).requests;
  const chipsAfter = await page.locator('#sources .src-chip').count();
  const itemsAfter = await page.evaluate(() => state.items.length);
  const nodateItems = await page.evaluate(() =>
    state.items.filter((x) => String(x.sourceName).indexOf('_nodate') >= 0).length);

  check('T4 无日期文件已载入且 stub 请求计数不变',
    chipsAfter > chipsBefore && after === before,
    'chips ' + chipsBefore + '→' + chipsAfter + ' / requests ' + before + '→' + after);
  check('T4 该文件产生 0 条候选条目',
    nodateItems === 0, 'items=' + nodateItems);
  check('T4 其余文件条目不受影响（总数不变）',
    itemsAfter === itemsBefore, itemsBefore + '→' + itemsAfter);

  /* 阶段二：spec T4 验收明确要求「载入并点『重新尝试 AI 抽取』后」——
     清空会话、只载入该文件，再点重试，此时同样不得发出任何请求 */
  await page.click('#clear');
  await page.waitForTimeout(200);
  await page.setInputFiles('#file', NODATE);
  await page.waitForTimeout(700);
  const rr0 = (await stubState()).requests;
  await page.click('#llmRetry');
  await page.waitForTimeout(900);
  const rr1 = (await stubState()).requests;
  const nodateAfterRetry = await page.evaluate(() =>
    state.items.filter((x) => String(x.sourceName).indexOf('_nodate') >= 0).length);
  check('T4 点「重新尝试 AI 抽取」后请求计数仍不变（0 次新增）',
    rr1 === rr0, 'requests ' + rr0 + '→' + rr1);
  check('T4 重试后该文件仍产生 0 条候选条目',
    nodateAfterRetry === 0, 'items=' + nodateAfterRetry);

  /* ===== S2.5 · 分批顺序发送（65 条候选 > 上限 60 → 必须 2 次请求，不是截断成 1 次）===== */
  const bigLines = [];
  for (let i = 1; i <= 65; i++) {
    bigLines.push('请于 2027 年 3 月 ' + ((i % 28) + 1) + ' 日前将第 ' + i + ' 号材料交至测试地点。');
  }
  fs.writeFileSync(BIGFILE, bigLines.join('\n'), 'utf8');
  await page.click('#clear');
  await page.waitForTimeout(200);
  await ctl({ reset: true, mode: 'ok' });
  const r0 = (await stubState()).requests;
  await page.setInputFiles('#file', BIGFILE);
  await page.waitForTimeout(3000);
  const r1 = (await stubState()).requests;
  /* 2026-11-21：新增同文件去重后，stub 两批返回的是同一条内容（同 action/due/owner），
     会被合并成 1 条且 mergedFrom=2。这仍然能证伪「截断成 1 批」：若只收到第二批，
     mergedFrom 只会是 1。 */
  const bigInfo = await page.evaluate(() => state.items.map((x) => ({
    m: x.mergedFrom, i: x.sourceIndex, e: x.extractor, s: !!x.supplement
  })));
  const bigAI = bigInfo.filter((x) => x.e === 'ai');
  check('S2.5 65 条候选分批顺序发送为 2 次请求（而非静默截断）',
    r1 - r0 === 2, 'requests delta=' + (r1 - r0));
  check('S2.5 两批结果都被接收（AI 条目由 2 次返回合并，未丢批次）',
    bigAI.length === 1 && bigAI[0].m === 2,
    JSON.stringify(bigInfo.filter((x) => x.e === 'ai')) + ' | supplements=' + bigInfo.filter((x) => x.s).length);

  /* ==================== S2.11 硬安全上限 ==================== */
  const counterEl = page.locator('#llmCounter');

  /* --- T9：max_tokens 与单段落截断 --- */
  fs.writeFileSync(LONGFILE,
    '请于 2027 年 9 月 1 日前将材料交至测试地点。' + '冗'.repeat(2700) + 'TAILMARKER_XXX\n', 'utf8');
  await page.click('#clear');
  await page.waitForTimeout(250);
  await ctl({ reset: true, mode: 'ok' });
  await page.setInputFiles('#file', LONGFILE);
  await page.waitForTimeout(1800);
  const lastBodyT9 = (await stubState()).lastBody || '';
  check('T9 请求体含 max_tokens:2048', lastBodyT9.indexOf('"max_tokens":2048') >= 0,
    lastBodyT9.slice(0, 150));
  check('T9 超长段落送模型的副本已截断（尾部标记未送出）',
    lastBodyT9.indexOf('TAILMARKER_XXX') < 0, 'bodyLen=' + lastBodyT9.length);
  check('T9 原文区仍保留完整段落（尾部标记还在）',
    (await page.locator('#rawList').innerText()).indexOf('TAILMARKER_XXX') >= 0, '');
  const reasonsT9 = await page.evaluate(() =>
    state.items.reduce((acc, x) => acc.concat(x.reasons || []), []).join(' | '));
  check('T9 对应卡片标注「原文段落超长」', reasonsT9.indexOf('原文段落超长') >= 0,
    reasonsT9.slice(0, 160));

  /* --- T8：请求计数可见性 --- */
  const c0 = (await counterEl.textContent()).trim();
  check('T8 计数显示为「本会话已发 N / 60 次请求」',
    /本会话已发 \d+ \/ 60 次请求/.test(c0), c0);
  const n0 = parseInt((c0.match(/已发 (\d+)/) || [])[1] || '-1', 10);
  await page.click('#llmRetry');
  await page.waitForTimeout(1800);
  const c1 = (await counterEl.textContent()).trim();
  const n1 = parseInt((c1.match(/已发 (\d+)/) || [])[1] || '-1', 10);
  check('T8 每次实际请求后计数递增', n1 === n0 + 1, n0 + ' → ' + n1 + ' [' + c1 + ']');

  /* --- T11：最小请求间隔 --- */
  await page.click('#clear');
  await page.waitForTimeout(250);
  await ctl({ reset: true, mode: 'ok' });
  await page.setInputFiles('#file', BIGFILE);          // 65 条候选 → 2 次分批请求
  await page.waitForTimeout(4500);
  const tsT11 = (await stubState()).timestamps || [];
  /* 逐对取最小间隔，而不是只看首尾——后者只在恰好 2 次请求时等价 */
  const adjGapsT11 = tsT11.slice(1).map((t, i) => t - tsT11[i]);
  const minGapT11 = adjGapsT11.length ? Math.min.apply(null, adjGapsT11) : -1;
  check('T11 任意相邻两次请求间隔 ≥ 700ms（实测常量 800ms）',
    adjGapsT11.length >= 1 && minGapT11 >= 700,
    'n=' + tsT11.length + ' minAdjacent=' + minGapT11 + 'ms');

  /* --- T12：大操作确认 --- */
  const manyLines = [];
  for (let i = 1; i <= 250; i++) {
    manyLines.push('请于 2027 年 4 月 ' + ((i % 28) + 1) + ' 日前将第 ' + i + ' 号材料交至测试地点。');
  }
  fs.writeFileSync(MANYFILE, manyLines.join('\n'), 'utf8');
  await page.click('#clear');
  await page.waitForTimeout(250);
  await ctl({ reset: true, mode: 'ok' });
  let dialogAsked = null;
  const onCancel = (d) => { dialogAsked = d.message(); d.dismiss(); };
  page.on('dialog', onCancel);
  const bT12 = (await stubState()).requests;
  await page.setInputFiles('#file', MANYFILE);
  await page.waitForTimeout(2500);
  const aT12 = (await stubState()).requests;
  check('T12 候选 >200 时弹出确认且含段数',
    !!dialogAsked && /250 段候选/.test(dialogAsked), dialogAsked || 'no dialog');
  check('T12 选择取消后不发任何请求', aT12 === bT12, bT12 + ' → ' + aT12);
  const cardsT12 = await page.locator('#reviewList .card').count();
  const ruleT12 = await page.locator('#reviewList .card', { hasText: '规则式' }).count();
  check('T12 取消后该文件按规则式产出',
    cardsT12 > 0 && ruleT12 === cardsT12, 'rule=' + ruleT12 + '/' + cardsT12);
  page.off('dialog', onCancel);
  const onAccept = (d) => d.accept();
  page.on('dialog', onAccept);
  const bT12b = (await stubState()).requests;
  await page.click('#llmRetry');
  await page.waitForTimeout(7000);
  const aT12b = (await stubState()).requests;
  check('T12 选择接受后正常发出分批请求', aT12b > bT12b, bT12b + ' → ' + aT12b);
  page.off('dialog', onAccept);

  /* --- T10：会话请求预算触顶（60 次 × 800ms 间隔，本项约需 50 秒）--- */
  fs.writeFileSync(SINGLEFILE, '请于 2027 年 10 月 1 日前将材料交至测试地点。\n', 'utf8');
  await page.click('#clear');
  await page.waitForTimeout(250);
  await ctl({ reset: true, mode: 'ok' });
  await page.setInputFiles('#file', SINGLEFILE);
  await page.waitForTimeout(1800);
  let guard = 0;
  while (guard < 80) {
    const cur = await page.evaluate(() => state.llmRequests);
    if (cur >= 60) break;
    /* 只在真正触顶时退出——「抽取中」也会让按钮禁用，不能据此提前中断 */
    const btnLabel = (await page.locator('#llmRetry').textContent()).trim();
    if (btnLabel === '预算已用尽') break;
    await page.click('#llmRetry');
    await page.waitForTimeout(1100);
    guard++;
  }
  const llmAtCap = await page.evaluate(() => state.llmRequests);
  const reqAtCap = (await stubState()).requests;
  const badgeCap = await badge(page);
  const disabledCap = await page.locator('#llmRetry').isDisabled();
  check('T10 请求累计达到 60 次上限', llmAtCap >= 60, 'llmRequests=' + llmAtCap + ' retries=' + guard);
  check('T10 触顶后徽章显示「AI 抽取 · 预算已用尽」',
    badgeCap === 'AI 抽取 · 预算已用尽', badgeCap);
  check('T10 触顶后重试按钮被禁用', disabledCap === true, 'disabled=' + disabledCap);

  /* 触顶后再调用真实 retryAI：必须一条请求都不发 */
  await page.evaluate(() => retryAI());
  await page.waitForTimeout(1200);
  const reqAfterCap = (await stubState()).requests;
  const toastCap = await toastOf(page);
  check('T10 触顶后再重试不发出任何请求', reqAfterCap === reqAtCap,
    reqAtCap + ' → ' + reqAfterCap);
  check('T10 toast 说明预算上限', /已达上限 60 次/.test(toastCap), toastCap);

  /* ===== R-17：刷新不得清零会话预算（此前 F5 是唯一能绕开 60 次总量闸门的路径）===== */
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(300);
  const cAfterReload = (await counterEl.textContent()).trim();
  check('R-17 刷新后预算计数保留（不因刷新归零）',
    cAfterReload.indexOf(llmAtCap + ' / 60') >= 0,
    '期望 ' + llmAtCap + ' / 60，实得 ' + cAfterReload);
  const persistedDump = await page.evaluate(() => {
    const out = {};
    try {
      let i;
      for (i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i); out['session:' + k] = sessionStorage.getItem(k);
      }
      for (i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i); out['local:' + k] = localStorage.getItem(k);
      }
    } catch (e) { out.error = String(e); }
    return out;
  });
  const dumpStr = JSON.stringify(persistedDump);
  check('R-17 持久化里不含密钥（只存计数）', dumpStr.indexOf(SECRET) < 0, dumpStr);
  check('R-17 持久化里确实写了预算计数',
    dumpStr.indexOf('"session:nh.llmRequests":"' + llmAtCap + '"') >= 0, dumpStr);

  /* 刷新后配置本就被清空；重新配置后封顶必须仍然生效，否则刷新等于重置了预算 */
  await configure(page, STUB, SECRET, 'stub-model');
  const badgeR17 = await badge(page);
  check('R-17 重新配置后徽章仍为「AI 抽取 · 预算已用尽」',
    badgeR17 === 'AI 抽取 · 预算已用尽', badgeR17);
  const disabledR17 = await page.locator('#llmRetry').isDisabled();
  check('R-17 重新配置后重试按钮仍被禁用', disabledR17 === true, 'disabled=' + disabledR17);

  /* 最终判据：真的不花钱 —— 触顶后载入文件必须走规则式，stub 一条请求都收不到 */
  const reqBeforeCapReload = (await stubState()).requests;
  await page.setInputFiles('#file', SINGLEFILE);
  await page.waitForTimeout(1500);
  const reqAfterCapReload = (await stubState()).requests;
  check('R-17 刷新并重新配置后，触顶依然拦截请求（stub 零新增）',
    reqAfterCapReload === reqBeforeCapReload,
    reqBeforeCapReload + ' → ' + reqAfterCapReload);

  await page.click('#clear');
  await page.waitForTimeout(350);
  const cClear = (await counterEl.textContent()).trim();
  check('T10 清空会话后预算归零', cClear.indexOf('0 / 60') >= 0, cClear);
  check('T10 清空后重试按钮恢复可用',
    !(await page.locator('#llmRetry').isDisabled()),
    'disabled=' + await page.locator('#llmRetry').isDisabled());

  /* ===== T2 · 刷新后配置清空 ===== */
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(300);
  const vals = await page.evaluate(() => ({
    b: document.getElementById('llmBase').value,
    k: document.getElementById('llmKey').value,
    m: document.getElementById('llmModel').value
  }));
  check('T2 刷新后三个配置框全部清空',
    vals.b === '' && vals.k === '' && vals.m === '', JSON.stringify(vals));
  check('T2 刷新后徽章回到规则式',
    (await badge(page)) === '规则式抽取（兜底）', await badge(page));
  await openSettings(page);
  check('T2 刷新后提示回到未配置',
    (await hint(page)) === '尚未配置，当前使用规则式抽取', JSON.stringify(await hint(page)));
  check('T2 刷新后计数保持清空后的 0 / 60（刷新不清零由 R-17 断言单独覆盖）',
    (await counterEl.textContent()).trim().indexOf('0 / 60') >= 0,
    (await counterEl.textContent()).trim());

  /* ===== 收尾 ===== */
  /* T1：测试桩仅供测试，产品单文件不得引用它（四模式行为由 T3 经真实调用链路间接覆盖） */
  const productSrc = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  check('T1 产品代码不引用测试 stub（零依赖/单一事实源）',
    productSrc.indexOf('fake-llm') < 0 && productSrc.indexOf('test/') < 0,
    productSrc.indexOf('fake-llm') >= 0 ? 'LEAKED' : 'clean');

  check('全程无未捕获异常（pageerror）', errors.length === 0, errors.join(' ;; ') || 'clean');
  /* 浏览器对任何非 2xx 都记一条 "Failed to load resource"，而 http-500 是本测试故意触发的，属预期 */
  const unexpected = consoleErrs.filter((t) => !/Failed to load resource/i.test(t));
  check('控制台无非预期报错（已过滤故意触发的 500）',
    unexpected.length === 0, unexpected.join(' ;; ') || 'clean');
  check('无外部网络请求（只允许 127.0.0.1）', extReqs.length === 0, extReqs.join(' ;; ') || 'clean');

  await browser.close();
  fs.unlinkSync(NODATE);
  for (const f of [BIGFILE, SINGLEFILE, LONGFILE, MANYFILE, ONEFILE, SUPPFILE]) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  console.log('==== LLM 路径验证结果 ====');
  console.log(results.join('\n'));
  console.log('==== ' + results.filter((r) => r.indexOf('PASS') === 0).length + ' PASS / '
    + results.filter((r) => r.indexOf('FAIL') === 0).length + ' FAIL ====');
})().catch((e) => {
  console.error('HARNESS ERROR:', (e && e.stack) || e);
  process.exit(2);
});
