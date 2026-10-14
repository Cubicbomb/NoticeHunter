#!/usr/bin/env node
/**
 * 通知猎人 · LLM 主抽取路径验收（spec noticehunter-llm T2–T6）
 *
 * 前提（两条命令都要起）：
 *   1) 仓库根：python -m http.server 8761 --bind 127.0.0.1
 *   2) prototype：node test/fake-llm-server.js --port=8791
 *   3) NODE_PATH 指向 playwright-core（本机 npx 缓存）
 *
 * 用法：node verify-llm.cjs
 * 断言一律操作真实 DOM / 真实 stub，不在测试里重写产品逻辑。
 */
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const PAGE = 'http://127.0.0.1:8761/prototype/index.html';
const STUB = 'http://127.0.0.1:8791';
const SAMPLES = path.join(__dirname, 'samples');
const SECRET = 'sk-test-SECRET-XYZ-98765';
const NODATE = path.join(__dirname, 'test', '_nodate.txt');
const BIGFILE = path.join(__dirname, 'test', '_big65.txt');

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
  quote: ((el.querySelector('.quote')) || {}).textContent || ''
})));

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
  check('T3 卡片标注来源为 AI', allCards > 0 && aiCards === allCards,
    'aiCards=' + aiCards + '/' + allCards);
  check('T3 sourceIndex=1 正确映射到原文首段',
    allCards > 0 && cards[0].quote.indexOf('关于做好 2026 届毕业实习材料提交工作的通知') === 0,
    cards[0] ? cards[0].quote.slice(0, 60) : 'none');
  check('T3 徽章保持 AI 抽取（未回退）',
    (await badge(page)) === 'AI 抽取', await badge(page));

  /* ===== T3 · http-500 回退 ===== */
  await ctl({ mode: 'http-500' });
  await page.click('#llmRetry');
  await page.waitForTimeout(1200);
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

  /* T7：故障回退后必须仍能走通「确认 → 清单 → 导出」 */
  await page.locator('#reviewList button[data-act="confirm"]').first().click();
  await page.waitForTimeout(300);
  const faultExport = await page.evaluate(
    () => (typeof buildExport === 'function' ? buildExport() : null));
  const dlFaultP = page.waitForEvent('download');
  await page.click('#export');
  const dlFault = await dlFaultP;
  check('T7 故障回退后仍可确认并导出（含出处）',
    !!faultExport && faultExport.indexOf('出处：') >= 0 && /\.txt$/.test(dlFault.suggestedFilename()),
    (faultExport || '(null)').split('\n').slice(0, 3).join(' / '));

  /* ===== T3 · bad-json 回退 ===== */
  await ctl({ mode: 'bad-json' });
  await page.click('#llmRetry');
  await page.waitForTimeout(1200);
  const tBad = await toastOf(page);
  check('T3 非法 JSON 触发含「无法解析为 JSON」的提示',
    /无法解析为 JSON/.test(tBad), tBad);

  /* ===== T3 · timeout 回退（单文件，避免两次 15s 串行等待）===== */
  await page.click('#clear');
  await page.waitForTimeout(150);
  await page.setInputFiles('#file', path.join(SAMPLES, 'notice-internship.txt'));
  await page.waitForTimeout(700);
  await ctl({ mode: 'timeout' });
  await page.click('#llmRetry');
  await page.waitForTimeout(16500);
  const tTo = await toastOf(page);
  check('T3 超时触发含「超时」的中文提示',
    /超时/.test(tTo) && /回退/.test(tTo), tTo);
  check('T3 超时后主流程仍可用（清单与卡片仍在）',
    (await page.locator('#reviewList .card').count()) > 0);

  /* ===== T3 · 恢复 ok 后徽章回正 ===== */
  await ctl({ mode: 'ok' });
  await page.click('#llmRetry');
  await page.waitForTimeout(1200);
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
        due: '2027-07-01', sourceIndex: 9999, confidence: 'high', reasons: [] }
    ]
  });
  await page.click('#llmRetry');
  await page.waitForTimeout(1200);

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

  /* ===== T6 · 卡片与清单的来源标注 ===== */
  await page.locator('#reviewList button[data-act="confirm"]').first().click();
  await page.waitForTimeout(300);
  const listText = await page.locator('#todoList').innerText();
  check('T6 清单条目显示来源标注', /AI|规则式/.test(listText), listText.replace(/\s+/g, ' ').slice(0, 60));
  check('T6 重试按钮在空闲时可用',
    !(await page.locator('#llmRetry').isDisabled()), 'disabled=' + await page.locator('#llmRetry').isDisabled());

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
  const bigItems = await page.evaluate(() => state.items.length);
  check('S2.5 65 条候选分批顺序发送为 2 次请求（而非静默截断）',
    r1 - r0 === 2, 'requests delta=' + (r1 - r0));
  check('S2.5 分批后条目未丢失（stub 每批 1 条 → 共 2 条）',
    bigItems === 2, 'items=' + bigItems);

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

  /* ===== 收尾 ===== */
  check('全程无未捕获异常（pageerror）', errors.length === 0, errors.join(' ;; ') || 'clean');
  /* 浏览器对任何非 2xx 都记一条 "Failed to load resource"，而 http-500 是本测试故意触发的，属预期 */
  const unexpected = consoleErrs.filter((t) => !/Failed to load resource/i.test(t));
  check('控制台无非预期报错（已过滤故意触发的 500）',
    unexpected.length === 0, unexpected.join(' ;; ') || 'clean');
  check('无外部网络请求（只允许 127.0.0.1）', extReqs.length === 0, extReqs.join(' ;; ') || 'clean');

  await browser.close();
  fs.unlinkSync(NODATE);
  if (fs.existsSync(BIGFILE)) fs.unlinkSync(BIGFILE);

  console.log('==== LLM 路径验证结果 ====');
  console.log(results.join('\n'));
  console.log('==== ' + results.filter((r) => r.indexOf('PASS') === 0).length + ' PASS / '
    + results.filter((r) => r.indexOf('FAIL') === 0).length + ' FAIL ====');
})().catch((e) => {
  console.error('HARNESS ERROR:', (e && e.stack) || e);
  process.exit(2);
});
