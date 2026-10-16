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
 *      那串哈希因机器而异。**缺依赖时 `test/load-playwright.cjs` 会打印完整复原步骤**，
 *      而不是抛一个裸的 Cannot find module——详见该文件头注释（HANDOFF R-18）。
 *
 * 用法：node verify.cjs
 * 输出：每条验收项一行 PASS/FAIL；任一 FAIL 则退出码非 0。
 *
 * 断言原则：一律调用产品里的真实函数（buildExport / confirmItem）或真实 DOM，
 * 不允许在测试里重写一遍逻辑再断言自己——那样恒为真，测不出回归。
 */
const { chromium } = require('./test/load-playwright.cjs');
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
  /* 无 Key 时不得发起任何外部网络请求（AGENTS.md §7 硬要求） */
  const extReqs = [];
  const trackExt = (pg) => pg.on('request', (r) => {
    const u = r.url();
    if (/^https?:\/\//i.test(u) && u.indexOf('127.0.0.1') < 0 && u.indexOf('localhost') < 0) extReqs.push(u);
  });
  trackExt(page);

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
  const todoBeforeDiscard = await page.locator('#todoList .todo').count();
  await page.locator('#reviewList button[data-act="discard"]').first().click();
  await page.waitForTimeout(120);
  check('T4 丢弃后卡片消失且不进清单',
    (await page.locator('#reviewList .card').count()) === beforeDiscard - 1
      && (await page.locator('#todoList .todo').count()) === todoBeforeDiscard,
    'review ' + beforeDiscard + '->' + (await page.locator('#reviewList .card').count())
      + ' / todo ' + todoBeforeDiscard + '->' + (await page.locator('#todoList .todo').count()));

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
  /* 原文区现在默认折叠（每份只显示前 6 段），docx 正文若落在第 7 段之后就看不到 —— 先展开再断言 */
  if (await page.locator('#rawToggle').isVisible()
      && (await page.locator('#rawToggle').innerText()).indexOf('展开') >= 0) {
    await page.click('#rawToggle');
    await page.waitForTimeout(80);
  }
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

  /* ===================================================================
   * ===== D-008 · 截止日汇总 + 交互优化（spec noticehunter-deadline）=====
   * 插在这里：既有状态最完整（已确认项、待确认项、清单、完成态都已就位），
   * 而 T7 空清单那步会 #clear 掉一切。
   * 断言原则同上：只调产品的真实函数与真实 DOM，不在测试里重写逻辑。
   * 日期相关的一律用**注入的固定日期**或**差值**断言，绝不写死「还有 N 天」。
   * =================================================================== */

  /* --- T1 / T2 · 按截止日汇总 --- */
  const injPast = await page.evaluate(() => {
    const id = 'syn-past-' + Date.now();
    state.items.push({
      id: id, sourceName: 'synthetic.txt', sourceIndex: 1, sourceText: 'x', srcIdx: 0,
      action: '远古到期任务', owner: null, where: null,
      due: '2000-01-01', dueRaw: '2000-01-01',
      confidence: 'high', reasons: [], status: 'confirmed', mergedFrom: 1
    });
    renderAll();
    return id;            /* 返回 id 而非统计文案：后面要用它把该条目标成已完成 */
  });

  const dlGroups = await page.$$eval('#deadlineList .dl-group', (els) => els.map((el) => ({
    date: (el.querySelector('.dl-date') || { textContent: '' }).textContent.trim(),
    cd: (el.querySelector('.dl-cd') || { textContent: '' }).textContent.trim(),
    badge: (el.querySelector('.badge') || { textContent: '' }).textContent.trim(),
    items: el.querySelectorAll('li').length,
    vague: el.classList.contains('vague')
  })));

  check('T1 汇总按截止日分组，且含刚注入的 2000-01-01',
    dlGroups.length > 0 && dlGroups.some((g) => g.date === '2000-01-01'),
    dlGroups.map((g) => g.date).join(' | '));

  const dated = dlGroups.filter((g) => /^\d{4}-\d{2}-\d{2}$/.test(g.date));
  const ascDates = dated.map((g) => g.date).slice().sort();
  check('T1 分组按日期升序（最近截止优先）',
    dated.length > 1 && dated.map((g) => g.date).join() === ascDates.join(),
    dated.map((g) => g.date).join(' → '));

  const vi = dlGroups.findIndex((g) => g.vague);
  check('T1 模糊日期组固定排在所有具体日期之后',
    vi >= 0 && vi === dlGroups.length - 1, 'vague@' + vi + ' / total=' + dlGroups.length);

  check('T1 每组倒计时标签取值合法（不写死具体天数）',
    dlGroups.every((g) => g.vague || /^(已逾期 \d+ 天|就是今天|明天|还有 \d+ 天)$/.test(g.cd)),
    dlGroups.map((g) => g.cd).join(' | '));

  check('T1 每组的条目数徽章与实际条目数一致',
    dlGroups.every((g) => g.items === Number((/\d+/.exec(g.badge) || [])[0])),
    dlGroups.map((g) => g.badge + '/' + g.items).join(' '));

  const stats0 = await page.locator('#deadlineStats').innerText();
  const tot0 = Number((/已确认 (\d+) 项/.exec(stats0) || [])[1]);
  const od0 = Number((/已逾期 (\d+) 项/.exec(stats0) || [])[1]);
  check('T2 统计条同时给出已确认总数与最近截止',
    tot0 > 0 && /最近截止 \d{4}-\d{2}-\d{2}/.test(stats0), stats0.replace(/\s+/g, ' '));
  check('T2 统计条给出未完成逾期数，且注入的远古项算作逾期',
    od0 >= 1, 'overdue=' + od0 + ' :: ' + stats0.replace(/\s+/g, ' '));

  const statsAfterDone = await page.evaluate((id) => {
    const it = state.items.find((x) => x.id === id);
    if (it) { it.status = 'done'; renderAll(); }
    return document.getElementById('deadlineStats').textContent;
  }, injPast);
  const tot1 = Number((/已确认 (\d+) 项/.exec(statsAfterDone) || [])[1]);
  const od1 = Number((/已逾期 (\d+) 项/.exec(statsAfterDone) || [])[1]);
  check('T2 把该逾期项标为完成后：总数不变、逾期数减少 1（逾期排除已完成）',
    tot1 === tot0 && od1 === od0 - 1,
    'total ' + tot0 + '→' + tot1 + ' / overdue ' + od0 + '→' + od1);

  /* --- T4 / T5 / T6 · 待确认计数与筛选（先注入固定一条低 + 一条高，保证不依赖样例分布） --- */
  await page.evaluate(() => {
    const st = Date.now();
    const mk = (n, conf) => ({
      id: 'syn-f-' + n + '-' + st, sourceName: 'synthetic.txt', sourceIndex: n,
      sourceText: 'x', srcIdx: 0, action: '筛选断言任务' + n, owner: null, where: null,
      due: '', dueRaw: '', confidence: conf, reasons: [], status: 'pending', mergedFrom: 1
    });
    state.items.push(mk(1, 'low'), mk(2, 'high'));
    renderAll();
  });

  const cnt0 = (await page.locator('#reviewCount').innerText()).trim();
  const c0 = /^待确认 (\d+) 条 · 低置信度 (\d+) 条$/.exec(cnt0);
  check('T4 计数文案给出待确认总数与低置信度数', !!c0, cnt0);
  const N = c0 ? Number(c0[1]) : -1, M = c0 ? Number(c0[2]) : -1;
  const shownAll = await page.locator('#reviewList .card').count();
  check('T4「全部」筛选下的卡片数等于计数 N', N === shownAll, N + ' vs ' + shownAll);
  const todoBeforeFilter = await page.locator('#todoList .todo').count();

  await page.click('.fbtn[data-filter="low"]');
  await page.waitForTimeout(80);
  const lowShown = await page.locator('#reviewList .card').count();
  const lowOnly = await page.$$eval('#reviewList .card', (els) => els.every((e) => e.classList.contains('low')));
  check('T5 低置信度筛选后只剩低置信度卡片，数量等于计数 M',
    lowShown > 0 && lowOnly && lowShown === M, lowShown + ' / lowOnly=' + lowOnly + ' / M=' + M);
  const cntLow = (await page.locator('#reviewCount').innerText()).trim();
  check('T4 切换筛选不改变计数 N / M', cntLow === cnt0, cntLow + ' vs ' + cnt0);

  await page.click('.fbtn[data-filter="high"]');
  await page.waitForTimeout(80);
  const highShown = await page.locator('#reviewList .card').count();
  const highOnly = await page.$$eval('#reviewList .card', (els) => els.every((e) => !e.classList.contains('low')));
  check('T5 高置信度筛选后只剩高置信度卡片，数量等于 N − M',
    highShown > 0 && highOnly && highShown === N - M, highShown + ' / highOnly=' + highOnly + ' / N−M=' + (N - M));

  const todoAfterFilter = await page.locator('#todoList .todo').count();
  check('T5 筛选不改变行动清单条数', todoBeforeFilter === todoAfterFilter,
    todoBeforeFilter + ' → ' + todoAfterFilter);

  await page.click('.fbtn[data-filter="all"]');
  await page.waitForTimeout(80);
  check('T5 切回「全部」后恢复全量', (await page.locator('#reviewList .card').count()) === N,
    (await page.locator('#reviewList .card').count()) + ' vs N=' + N);

  /* T6 筛选空态：把所有 pending 的低置信度条目置为 discarded，再切到低置信度 */
  await page.evaluate(() => {
    state.items.forEach((x) => { if (x.status === 'pending' && x.confidence === 'low') x.status = 'discarded'; });
    renderAll();
  });
  await page.click('.fbtn[data-filter="low"]');
  await page.waitForTimeout(80);
  const emptyFilter = (await page.locator('#reviewList').innerText()).trim();
  check('T6 筛选无匹配时给出针对性空态，而非通用空态',
    emptyFilter.indexOf('当前筛选下没有条目') >= 0
      && emptyFilter.indexOf('抽取结果会出现在这里') < 0,
    emptyFilter.slice(0, 90));
  await page.click('.fbtn[data-filter="all"]');
  await page.waitForTimeout(80);

  /* --- T7 / T8 · 丢弃可撤销 ---
     先注入两条固定的高置信度待确认项：T6 步骤刚把所有低置信度 pending 清成了 discarded，
     剩余 pending 数量取决于样例分布，不能拿来当撤销测试的前置条件。 */
  await page.evaluate(() => {
    const st = Date.now();
    const mk = (n) => ({
      id: 'syn-u-' + n + '-' + st, sourceName: 'synthetic.txt', sourceIndex: n,
      sourceText: 'x', srcIdx: 0, action: '撤销断言任务' + n, owner: null, where: null,
      due: '', dueRaw: '', confidence: 'high', reasons: [], status: 'pending', mergedFrom: 1
    });
    state.items.push(mk(1), mk(2));
    renderAll();
  });

  /* 此前 T4 已经丢弃过一条，所以这里**不能**断言「禁用」——那会把既有流程当 bug。
     真正要守的不变量是：按钮可用 ⟺ 存在一条 id 等于 lastDiscard 且状态为 discarded 的条目。 */
  const undoState0 = await page.evaluate(() => {
    const can = !!(state.lastDiscard
      && state.items.some((x) => x.id === state.lastDiscard && x.status === 'discarded'));
    return { can: can, disabled: document.getElementById('undoDiscard').disabled };
  });
  check('T7 撤销按钮可用性与「存在可撤销的丢弃」保持一致',
    undoState0.can === !undoState0.disabled, JSON.stringify(undoState0));

  const pendingBeforeDiscard = await page.locator('#reviewList .card').count();
  if (pendingBeforeDiscard < 1) {
    check('T7 丢弃后撤销按钮变为可用', false, '无可丢弃卡片');
    check('T7 撤销后卡片回到待确认、按钮复位、toast 文案正确', false, '前置条件不成立');
    check('T8 连续丢弃两条后只撤销最后一条', false, '前置条件不成立');
  } else {
    await page.locator('#reviewList button[data-act="discard"]').first().click();
    await page.waitForTimeout(120);
    check('T7 丢弃后撤销按钮变为可用',
      (await page.locator('#undoDiscard').isDisabled()) === false
        && (await page.locator('#reviewList .card').count()) === pendingBeforeDiscard - 1,
      'cards ' + pendingBeforeDiscard + ' → ' + (await page.locator('#reviewList .card').count()));

    await page.click('#undoDiscard');
    await page.waitForTimeout(120);
    const toastUndo = await page.locator('#toast').innerText();
    check('T7 撤销后卡片回到待确认、按钮复位、toast 文案正确',
      (await page.locator('#reviewList .card').count()) === pendingBeforeDiscard
        && (await page.locator('#undoDiscard').isDisabled()) === true
        && toastUndo.indexOf('已撤销丢弃') >= 0,
      'cards=' + (await page.locator('#reviewList .card').count()) + ' / toast=' + toastUndo);

    /* T8 连续丢两条，只撤最后一条 */
    if ((await page.locator('#reviewList .card').count()) < 2) {
      check('T8 连续丢弃两条后只撤销最后一条', false,
        '可丢弃卡片不足 2 条：' + (await page.locator('#reviewList .card').count()));
    } else {
      await page.locator('#reviewList button[data-act="discard"]').first().click();
      await page.waitForTimeout(120);
      const firstDiscarded = await page.evaluate(() => state.lastDiscard);
      await page.locator('#reviewList button[data-act="discard"]').first().click();
      await page.waitForTimeout(120);
      const secondDiscarded = await page.evaluate(() => state.lastDiscard);
      await page.click('#undoDiscard');
      await page.waitForTimeout(120);
      const undoScope = await page.evaluate((ids) => {
        const st = (id) => {
          const it = state.items.find((x) => x.id === id);
          return it ? it.status : 'gone';
        };
        return { first: st(ids[0]), second: st(ids[1]), lastDiscard: state.lastDiscard };
      }, [firstDiscarded, secondDiscarded]);
      check('T8 连续丢弃两条后只撤销最后一条',
        undoScope.first === 'discarded' && undoScope.second === 'pending' && undoScope.lastDiscard === null,
        JSON.stringify(undoScope));
    }
  }

  /* --- T9 · 分屏布局（宽屏两列 / 窄屏单列） --- */
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.waitForTimeout(80);
  const wideCols = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.split')).gridTemplateColumns.trim().split(/\s+/).length);
  check('T9 宽屏（≥1080px）待确认与清单分屏为两列', wideCols >= 2, 'cols=' + wideCols);

  await page.setViewportSize({ width: 1000, height: 900 });
  await page.waitForTimeout(80);
  const narrowCols = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.split')).gridTemplateColumns.trim().split(/\s+/).length);
  check('T9 窄屏（<1080px）回到单列纵向排布', narrowCols === 1, 'cols=' + narrowCols);
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.waitForTimeout(80);

  /* --- T10 / T11 · 原文折叠与展开 --- */
  await page.evaluate(() => { state.rawExpanded = false; state.highlight = null; renderAll(); });
  await page.waitForTimeout(60);
  const srcCount = await page.locator('#sources .src-chip').count();
  const perSrc = await page.$$eval('#rawList .para', (els) => {
    const m = {};
    els.forEach((el) => { const s = el.getAttribute('data-s'); m[s] = (m[s] || 0) + 1; });
    return m;
  });
  const collapsedN = await page.locator('#rawList .para').count();
  check('T10 折叠态每份来源只渲染前 6 段',
    Object.keys(perSrc).length > 0 && Object.keys(perSrc).every((k) => perSrc[k] <= 6),
    JSON.stringify(perSrc));
  check('T10 折叠态总段数不超过 6 × 来源份数',
    collapsedN <= 6 * srcCount, collapsedN + ' vs 6×' + srcCount);

  await page.click('#rawToggle');
  await page.waitForTimeout(80);
  const realTotal = await page.evaluate(() => state.sources.reduce((n, s) => n + s.paragraphs.length, 0));
  const expandedN = await page.locator('#rawList .para').count();
  check('T10 展开后显示全部段落', expandedN === realTotal, expandedN + ' vs ' + realTotal);
  check('T10 展开后开关文案切为「收起原文」',
    (await page.locator('#rawToggle').innerText()).indexOf('收起') >= 0,
    await page.locator('#rawToggle').innerText());

  await page.click('#rawToggle');
  await page.waitForTimeout(80);
  check('T10 收起后回到折叠值',
    (await page.locator('#rawList .para').count()) <= 6 * srcCount,
    'now=' + (await page.locator('#rawList .para').count()));

  /* T11：高亮落在折叠预览之外时必须自动展开，否则出处高亮会被静默打断 */
  const hlJump = await page.evaluate(() => {
    state.rawExpanded = false;
    renderAll();
    jumpTo(0, 12);                       /* 第 12 段 > 折叠上限 6 */
    const el = document.querySelector('#rawList .para.hl');
    return { found: !!el, p: el && el.getAttribute('data-p'), expanded: state.rawExpanded };
  });
  check('T11 折叠态跳到第 12 段的出处仍能高亮（自动展开全文）',
    hlJump.found === true && hlJump.p === '12' && hlJump.expanded === true,
    JSON.stringify(hlJump));

  /* ===== T7 空清单：按钮必须可点并给出提示 ===== */
  await page.click('#clear');
  await page.waitForTimeout(150);
  const exportDisabled = await page.locator('#export').isDisabled();
  await page.click('#export');
  await page.waitForTimeout(150);
  const emptyToast = await page.locator('#toast').innerText();
  check('T7 空清单时给出提示而非下载空文件',
    !exportDisabled && emptyToast.indexOf('还没有已确认的行动项') >= 0, emptyToast);

  /* --- T3 · 汇总空态（清空会话后与重新确认一条后） --- */
  const emptyState = {
    groups: await page.locator('#deadlineList .dl-group').count(),
    visible: await page.locator('#deadlineEmpty').isVisible(),
    stats: (await page.locator('#deadlineStats').innerText()).trim()
  };
  check('T3 清空会话后汇总回到空态（无分组、空态可见、统计条清空）',
    emptyState.groups === 0 && emptyState.visible && emptyState.stats === '',
    JSON.stringify(emptyState));

  const afterConfirm = await page.evaluate(() => {
    state.items.push({
      id: 'syn-e-1', sourceName: 'synthetic.txt', sourceIndex: 1, sourceText: 'x', srcIdx: 0,
      action: '空态回填任务', owner: null, where: null,
      due: '2027-03-01', dueRaw: '2027-03-01',
      confidence: 'high', reasons: [], status: 'confirmed', mergedFrom: 1
    });
    renderAll();
    return {
      empty: document.getElementById('deadlineEmpty').style.display,
      groups: document.querySelectorAll('#deadlineList .dl-group').length
    };
  });
  check('T3 确认一条后汇总空态消失并出现对应分组',
    afterConfirm.groups === 1 && afterConfirm.empty === 'none', JSON.stringify(afterConfirm));

  /* ===== 控制台 ===== */
  check('全程无未捕获异常 / 控制台报错', errors.length === 0, errors.join(' ;; ') || 'clean');

  /* ===== S2.1 file:// 直开 ===== */
  const { pathToFileURL } = require('url');
  const page2 = await browser.newPage();
  const errors2 = [];
  page2.on('console', (m) => { if (m.type() === 'error') errors2.push('console: ' + m.text()); });
  page2.on('pageerror', (e) => errors2.push('pageerror: ' + e.message));
  trackExt(page2);
  await page2.goto(pathToFileURL(path.join(__dirname, 'index.html')).href);
  await page2.click('#sample');
  await page2.waitForTimeout(150);
  const fPara = await page2.locator('#rawList .para').count();
  await page2.setInputFiles('#file', DOCX);
  await page2.waitForTimeout(400);
  /* 同上：折叠态下 docx 正文可能在第 7 段之后，先展开再断言 */
  if (await page2.locator('#rawToggle').isVisible()
      && (await page2.locator('#rawToggle').innerText()).indexOf('展开') >= 0) {
    await page2.click('#rawToggle');
    await page2.waitForTimeout(80);
  }
  const fRaw = await page2.locator('#rawList').innerText();
  check('T9 file:// 直开：样例与 .docx 解析均可用且无异常',
    fPara > 10 && fRaw.indexOf('2026 年 11 月 12 日') >= 0 && errors2.length === 0,
    'paras=' + fPara + ' / errors=' + (errors2.join(';') || 'none'));
  await page2.close();

  /* T7：未配置 key 的两种打开方式都不许发出外部请求 */
  check('T7 无 Key 时零外部网络请求（只允许 127.0.0.1）',
    extReqs.length === 0, extReqs.join(' ;; ') || 'clean');

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
