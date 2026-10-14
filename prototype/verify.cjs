#!/usr/bin/env node
/**
 * 通知猎人 MVP —— 浏览器端验收脚本
 *
 * 不是产品的一部分，是测试证据。产品本身是纯静态页面、零依赖。
 *
 * 运行前提：
 *   1) 起静态服务器：python -m http.server 8761 --bind 127.0.0.1   （在 prototype/ 的上一级，即仓库根）
 *   2) 本机已装 Edge（脚本用 channel: 'msedge'，无需下载 Chromium）
 *   3) playwright-core 可被 require 到。本机无项目内 npm 依赖，故通过 NODE_PATH 指向 npx 缓存：
 *        set NODE_PATH=D:\nodejs\node_cache\_npx\<hash>\node_modules
 *
 * 用法：node verify.cjs
 * 输出：每条验收项一行 PASS/FAIL；任一 FAIL 则退出码非 0。
 *
 * 断言原则：一律调用产品里的真实函数（buildExport / confirmItem）或真实 DOM，
 * 不允许在测试里重写一遍逻辑再断言自己——那样恒为真，测不出回归。
 */
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const URL = 'http://127.0.0.1:8761/prototype/index.html';
const SAMPLES = path.join(__dirname, 'samples');
const DOCX = path.join(SAMPLES, 'notice-competition.docx');
const TXT1 = path.join(SAMPLES, 'notice-internship.txt');
const BAD_PNG = path.join(SAMPLES, '_bad.png');
const BAD_DOCX = path.join(SAMPLES, '_bad.docx');

const results = [];
function check(name, cond, detail) {
  results.push((cond ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '   [' + detail + ']' : ''));
  if (!cond) process.exitCode = 1;
}

(async () => {
  fs.writeFileSync(BAD_PNG, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  fs.writeFileSync(BAD_DOCX, Buffer.from('this is not a zip file at all, definitely not a docx', 'utf8'));

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(URL, { waitUntil: 'load' });

  /* ===== T1 内联样例 ===== */
  await page.click('#sample');
  await page.waitForTimeout(150);
  const paraCount = await page.locator('#rawList .para').count();
  check('T1 用样例演示后原文区出现段落', paraCount > 10, 'paras=' + paraCount);
  const chips = await page.locator('#sources .src-chip').count();
  check('T1 两个样例文件都已载入', chips === 2, 'chips=' + chips);

  await page.click('#sample');
  await page.waitForTimeout(120);
  check('T1 重复点击样例不会重复载入',
    (await page.locator('#sources .src-chip').count()) === 2);
  check('T1 同时给出「已全部载入」提示',
    (await page.locator('#toast').innerText()).indexOf('已全部载入') >= 0);

  /* ===== T3 规则式抽取 ===== */
  const cards = await page.locator('#reviewList .card').count();
  check('T3 抽出候选条目', cards >= 6, 'cards=' + cards);

  const cardData = await page.$$eval('#reviewList .card', (els) => els.map((el) => ({
    low: el.classList.contains('low'),
    reasons: Array.from(el.querySelectorAll('.reasons .chip')).map((c) => c.textContent.trim()),
    quote: (el.querySelector('.quote') || {}).textContent || '',
    due: (el.querySelector('input[data-field="due"]') || {}).value || '',
    action: (el.querySelector('input[data-field="action"]') || {}).value || '',
    where: (el.querySelector('input[data-field="where"]') || {}).value || '',
    id: (el.querySelector('input[data-field="action"]') || {}).getAttribute('data-id')
  })));

  const vague = cardData.find((c) => c.reasons.some((r) => r.indexOf('模糊') >= 0));
  check('T3 模糊时间（本周内/下周一之前）标低置信度并给出原因',
    !!vague, vague ? vague.reasons[0] : 'no vague card');

  const exact = cardData.find((c) => !c.low && c.due.indexOf('2026-12-25') === 0);
  check('T3 明确截止判为高置信度', !!exact, exact ? exact.due : 'none');

  const intern = cardData.find((c) => c.where.indexOf('学院学生事务办公室') >= 0);
  check('T3 抽出交件地点「学院学生事务办公室」', !!intern,
    intern ? intern.where : cardData.map((c) => c.where).join(' / '));

  const cleaned = cardData.find((c) => c.action.indexOf('纸质材料') >= 0);
  check('T3 动作字段已清理掉日期、时间与星期表述',
    !!cleaned && cleaned.action.indexOf('（周四）') < 0 && cleaned.action.indexOf('2026') < 0
      && cleaned.action.indexOf('17:00') < 0,
    cleaned ? cleaned.action : 'none');

  /* S2.5 截止标记规则 */
  const noMarker = cardData.find((c) => c.reasons.some((r) => r.indexOf('未明确标注截止') >= 0));
  check('S2.5 无「前/之前/截止」标记的日期被标记低置信度', !!noMarker,
    noMarker ? noMarker.reasons.join(' / ') : 'none');

  /* ===== T8 出处跳转 ===== */
  await page.locator('#reviewList button[data-act="src"]').first().click();
  await page.waitForTimeout(120);
  check('T8 点出处后原文区出现高亮段落',
    (await page.locator('#rawList .para.hl').count()) === 1);

  /* ===== T4 人工确认 ===== */
  check('T4 未确认时清单为空', (await page.locator('#todoList .todo').count()) === 0);

  await page.locator('#reviewList button[data-act="confirm"]').first().click();
  await page.waitForTimeout(120);
  check('T4 确认后条目进入行动清单', (await page.locator('#todoList .todo').count()) === 1);

  /* T4 编辑字段后确认，编辑结果要反映到清单（避开刚被确认的首张卡片） */
  const editTarget = cardData.slice(1).find((c) => c.low && c.due);
  let editedOk = false, editedSeen = '';
  if (editTarget) {
    await page.fill('input[data-id="' + editTarget.id + '"][data-field="action"]', '人工改写后的动作');
    await page.fill('input[data-id="' + editTarget.id + '"][data-field="owner"]', '测试负责人');
    const cardEl = page.locator('#reviewList .card').filter({ has: page.locator('input[data-id="' + editTarget.id + '"]') });
    await cardEl.locator('button[data-act="confirm"]').click();
    await page.waitForTimeout(120);
    editedSeen = await page.locator('#todoList').innerText();
    editedOk = editedSeen.indexOf('人工改写后的动作') >= 0 && editedSeen.indexOf('测试负责人') >= 0;
  }
  check('T4 编辑后的字段在确认后反映到清单', editedOk,
    editTarget ? editedSeen.replace(/\s+/g, ' ').slice(0, 60) : '(no editable low card found)');

  /* T4 丢弃 */
  const beforeDiscard = await page.locator('#reviewList .card').count();
  await page.locator('#reviewList button[data-act="discard"]').first().click();
  await page.waitForTimeout(120);
  check('T4 丢弃后卡片消失且不进清单',
    (await page.locator('#reviewList .card').count()) === beforeDiscard - 1);

  /* ===== T6 撞期 ===== */
  for (let i = 0; i < 2; i++) {
    const idx = await page.$$eval('#reviewList .card', (els) =>
      els.findIndex((el) => ((el.querySelector('input[data-field="due"]') || {}).value || '').indexOf('2026-12-25') === 0));
    if (idx < 0) break;
    await page.locator('#reviewList .card').nth(idx).locator('button[data-act="confirm"]').click();
    await page.waitForTimeout(120);
  }
  const conflictText = (await page.locator('#conflictBar.on').count())
    ? await page.locator('#conflictBar').innerText() : '';
  /* 断言必须是 spec / T6 验收里写死的那句话，不能只 grep 日期 */
  check('T6 撞期提示含规定文案「同一天有 2 个任务：2026-12-25」',
    conflictText.indexOf('同一天有 2 个任务：2026-12-25') >= 0,
    conflictText.replace(/\s+/g, ' ').slice(0, 100));

  /* ===== T5 排序与完成态 ===== */
  /* 先确认一条无日期的（模糊时间）条目，验证它排在最后 */
  const noDueIdx = await page.$$eval('#reviewList .card', (els) =>
    els.findIndex((el) => !((el.querySelector('input[data-field="due"]') || {}).value || '').trim()));
  if (noDueIdx >= 0) {
    await page.locator('#reviewList .card').nth(noDueIdx).locator('button[data-act="confirm"]').click();
    await page.waitForTimeout(120);
  }
  const dues = await page.$$eval('#todoList .todo-due', (els) => els.map((e) => e.textContent.trim()));
  const withDate = dues.filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d));
  check('T5 清单按截止时间升序', withDate.join() === withDate.slice().sort().join(),
    withDate.join(' | '));
  check('T5 无日期条目排在最后', noDueIdx >= 0 && dues.length > 0 && !/^\d{4}-\d{2}-\d{2}/.test(dues[dues.length - 1]),
    dues[dues.length - 1] || 'none');

  await page.locator('#todoList input[type="checkbox"]').first().check();
  await page.waitForTimeout(100);
  check('T5 勾选后出现完成样式', (await page.locator('#todoList .todo.done').count()) === 1);

  /* ===== T6 去重合并（调真实 confirmItem，不是自写逻辑）===== */
  const merged = await page.evaluate(() => {
    const stamp = Date.now();
    const mk = (n) => ({
      id: 'syn-' + n + '-' + stamp, sourceName: 'synthetic.txt', sourceIndex: n,
      sourceText: 'x', srcIdx: 0, action: '同一件事', owner: null, where: null,
      due: '2027-01-01', dueRaw: '2027-01-01', confidence: 'high', reasons: [],
      status: 'pending', mergedFrom: 1
    });
    state.items.push(mk(1), mk(2));
    const ids = state.items.filter((x) => x.id.indexOf('syn-') === 0).map((x) => x.id);
    confirmItem(ids[0]);
    confirmItem(ids[1]);
    const rest = state.items.filter((x) => x.id.indexOf('syn-') === 0);
    return { count: rest.length, statuses: rest.map((x) => x.status), merged: rest.map((x) => x.mergedFrom) };
  });
  check('T6 动作+截止相同的两条被合并为一条并标注来源数',
    merged.count === 2 && merged.statuses.indexOf('discarded') >= 0
      && merged.merged.some((m) => m >= 2),
    JSON.stringify(merged));
  await page.evaluate(() => {
    state.items = state.items.filter((x) => x.id.indexOf('syn-') !== 0);
    renderAll();
  });

  /* ===== T2 docx 解析 ===== */
  await page.setInputFiles('#file', DOCX);
  await page.waitForTimeout(400);
  check('T2 .docx 解析出正文（含 2026 年 11 月 12 日）',
    (await page.locator('#rawList').innerText()).indexOf('2026 年 11 月 12 日') >= 0);

  /* T2 不支持的格式 */
  await page.setInputFiles('#file', BAD_PNG);
  await page.waitForTimeout(200);
  let toastText = await page.locator('#toast').innerText();
  check('T2 不支持格式给出中文提示而非白屏',
    toastText.indexOf('暂不支持') >= 0 && (await page.locator('#rawList .para').count()) > 0, toastText);

  /* T2 损坏的 docx（DataView 越界也必须是中文说明） */
  await page.setInputFiles('#file', BAD_DOCX);
  await page.waitForTimeout(250);
  toastText = await page.locator('#toast').innerText();
  check('T2 损坏 .docx 给出中文说明（不含英文异常）',
    /无法解析/.test(toastText) && !/RangeError|Invalid|undefined/i.test(toastText), toastText);

  /* ===== T8 高亮切换 ===== */
  const srcBtns = page.locator('#todoList button[data-act="src"]');
  if ((await srcBtns.count()) >= 2) {
    await srcBtns.nth(0).click();
    await page.waitForTimeout(100);
    const first = await page.locator('#rawList .para.hl').getAttribute('data-p');
    await srcBtns.nth(1).click();
    await page.waitForTimeout(100);
    const second = await page.locator('#rawList .para.hl').getAttribute('data-p');
    check('T8 切换条目后高亮随之移动',
      (await page.locator('#rawList .para.hl').count()) === 1 && first !== second,
      first + ' -> ' + second);
  } else {
    check('T8 切换条目后高亮随之移动', false, '清单条目不足 2 条');
  }

  /* ===== T7 导出：调真实 buildExport + 真实下载事件 ===== */
  const exportText = await page.evaluate(() => typeof buildExport === 'function' ? buildExport() : null);
  check('T7 buildExport() 产出含截止/动作/谁/交到/出处',
    !!exportText && /\[\s?[x]\]/.test(exportText) && exportText.indexOf('出处：') >= 0
      && exportText.indexOf('谁：') >= 0 && exportText.indexOf('交到：') >= 0,
    (exportText || '').split('\n')[1] || 'null');

  const dlPromise = page.waitForEvent('download');
  await page.click('#export');
  const dl = await dlPromise;
  check('T7 点导出触发真实下载', /\.txt$/.test(dl.suggestedFilename()), dl.suggestedFilename());

  /* ===== T7 空清单：按钮必须可点并给出提示 ===== */
  await page.click('#clear');
  await page.waitForTimeout(150);
  const exportDisabled = await page.locator('#export').isDisabled();
  await page.click('#export');
  await page.waitForTimeout(150);
  const emptyToast = await page.locator('#toast').innerText();
  check('T7 空清单时给出提示而非下载空文件',
    !exportDisabled && emptyToast.indexOf('还没有已确认的行动项') >= 0, emptyToast);

  /* ===== 控制台 ===== */
  check('全程无未捕获异常 / 控制台报错', errors.length === 0, errors.join(' ;; ') || 'clean');

  /* ===== S2.1 file:// 直开 ===== */
  const { pathToFileURL } = require('url');
  const page2 = await browser.newPage();
  const errors2 = [];
  page2.on('console', (m) => { if (m.type() === 'error') errors2.push('console: ' + m.text()); });
  page2.on('pageerror', (e) => errors2.push('pageerror: ' + e.message));
  await page2.goto(pathToFileURL(path.join(__dirname, 'index.html')).href);
  await page2.click('#sample');
  await page2.waitForTimeout(150);
  const fPara = await page2.locator('#rawList .para').count();
  await page2.setInputFiles('#file', DOCX);
  await page2.waitForTimeout(400);
  const fRaw = await page2.locator('#rawList').innerText();
  check('T9 file:// 直开：样例与 .docx 解析均可用且无异常',
    fPara > 10 && fRaw.indexOf('2026 年 11 月 12 日') >= 0 && errors2.length === 0,
    'paras=' + fPara + ' / errors=' + (errors2.join(';') || 'none'));
  await page2.close();

  await browser.close();
  fs.unlinkSync(BAD_PNG);
  fs.unlinkSync(BAD_DOCX);

  console.log('==== 验证结果 ====');
  console.log(results.join('\n'));
  console.log('==== ' + results.filter((r) => r.indexOf('PASS') === 0).length + ' PASS / '
    + results.filter((r) => r.indexOf('FAIL') === 0).length + ' FAIL ====');
})().catch((e) => {
  console.error('HARNESS ERROR:', (e && e.stack) || e);
  process.exit(2);
});
