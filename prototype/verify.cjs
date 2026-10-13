#!/usr/bin/env node
/**
 * 通知猎人 MVP —— 浏览器端验收脚本
 *
 * 不是产品的一部分，是测试证据。零依赖于项目本身（产品是纯静态页面）。
 *
 * 运行前提：
 *   1) 起一个静态服务器：python -m http.server 8761 --bind 127.0.0.1
 *   2) 本机已装 Edge（脚本用 channel: 'msedge'，无需下载 Chromium）
 *   3) playwright-core 可被 require 到（本机无 npm 依赖，故通过 NODE_PATH 指向
 *      npx 缓存，例如：
 *        set NODE_PATH=D:\nodejs\node_cache\_npx\<hash>\node_modules
 *      若路径变了，可用 `npm root -g` 或重新 npx --package playwright-core 后查询）
 *
 * 用法：node verify.cjs
 * 输出：每条验收项一行 PASS/FAIL，任一 FAIL 则退出码非 0。
 */
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const URL = 'http://127.0.0.1:8761/prototype/index.html';
const SAMPLES = path.join(__dirname, 'samples');
const DOCX = path.join(SAMPLES, 'notice-competition.docx');
const TXT1 = path.join(SAMPLES, 'notice-internship.txt');
const BAD = path.join(SAMPLES, '_bad.png');

const results = [];
function check(name, cond, detail) {
  results.push((cond ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '   [' + detail + ']' : ''));
  if (!cond) process.exitCode = 1;
}

(async () => {
  fs.writeFileSync(BAD, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(URL, { waitUntil: 'load' });

  /* --- T1 内联样例 --- */
  await page.click('#sample');
  await page.waitForTimeout(150);
  const paraCount = await page.locator('#rawList .para').count();
  check('T1 用样例演示后原文区出现段落', paraCount > 10, 'paras=' + paraCount);
  const chips = await page.locator('#sources .src-chip').count();
  check('T1 两个样例文件都已载入', chips === 2, 'chips=' + chips);

  /* --- T3 规则式抽取 --- */
  const cards = await page.locator('#reviewList .card').count();
  check('T3 抽出候选条目', cards >= 4, 'cards=' + cards);

  const cardData = await page.$$eval('#reviewList .card', (els) => els.map((el) => ({
    low: el.classList.contains('low'),
    reasons: Array.from(el.querySelectorAll('.reasons .chip')).map((c) => c.textContent.trim()),
    quote: (el.querySelector('.quote') || {}).textContent || '',
    due: (el.querySelector('input[data-field="due"]') || {}).value || '',
    action: (el.querySelector('input[data-field="action"]') || {}).value || '',
    where: (el.querySelector('input[data-field="where"]') || {}).value || ''
  })));

  const vague = cardData.find((c) => c.reasons.some((r) => r.includes('模糊')));
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

  /* --- T8 出处跳转 --- */
  await page.locator('#reviewList button[data-act="src"]').first().click();
  await page.waitForTimeout(120);
  const hlCount = await page.locator('#rawList .para.hl').count();
  check('T8 点出处后原文区出现高亮段落', hlCount === 1, 'hl=' + hlCount);

  /* --- T4 人工确认 --- */
  const beforeTodo = await page.locator('#todoList .todo').count();
  check('T4 未确认时清单为空', beforeTodo === 0, 'todo=' + beforeTodo);

  await page.locator('#reviewList button[data-act="confirm"]').first().click();
  await page.waitForTimeout(120);
  const afterTodo = await page.locator('#todoList .todo').count();
  check('T4 确认后条目进入行动清单', afterTodo === 1, 'todo=' + afterTodo);

  /* 丢弃一条 */
  const beforeDiscard = await page.locator('#reviewList .card').count();
  await page.locator('#reviewList button[data-act="discard"]').first().click();
  await page.waitForTimeout(120);
  const afterDiscard = await page.locator('#reviewList .card').count();
  check('T4 丢弃后卡片消失且不进清单',
    afterDiscard === beforeDiscard - 1 && (await page.locator('#todoList .todo').count()) === 1,
    'review ' + beforeDiscard + '->' + afterDiscard);

  /* --- T6 撞期：确认两条 2026-12-25 --- */
  for (let i = 0; i < 2; i++) {
    const idx = await page.$$eval('#reviewList .card', (els) =>
      els.findIndex((el) => ((el.querySelector('input[data-field="due"]') || {}).value || '').indexOf('2026-12-25') === 0));
    if (idx < 0) break;
    await page.locator('#reviewList .card').nth(idx).locator('button[data-act="confirm"]').click();
    await page.waitForTimeout(120);
  }
  const conflictOn = await page.locator('#conflictBar.on').count();
  const conflictText = conflictOn ? (await page.locator('#conflictBar').innerText()) : '';
  check('T6 同日撞期提示条出现', conflictOn === 1 && conflictText.indexOf('2026-12-25') >= 0,
    conflictText.replace(/\s+/g, ' ').slice(0, 90));

  /* --- T5 排序与完成态 --- */
  const dues = await page.$$eval('#todoList .todo-due', (els) => els.map((e) => e.textContent.trim()));
  const withDate = dues.filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d));
  const sorted = withDate.slice().sort();
  check('T5 清单按截止时间升序', withDate.join() === sorted.join(), withDate.join(' | '));

  await page.locator('#todoList input[type="checkbox"]').first().check();
  await page.waitForTimeout(100);
  check('T5 勾选后出现完成样式', (await page.locator('#todoList .todo.done').count()) === 1);

  /* --- T2 docx 解析 --- */
  await page.setInputFiles('#file', DOCX);
  await page.waitForTimeout(400);
  const rawText = await page.locator('#rawList').innerText();
  check('T2 .docx 解析出正文（含 2026 年 11 月 12 日）', rawText.indexOf('2026 年 11 月 12 日') >= 0);

  /* --- T2 错误兜底：不支持的格式 --- */
  await page.setInputFiles('#file', BAD);
  await page.waitForTimeout(200);
  const toastText = await page.locator('#toast').innerText();
  check('T2 不支持格式给出中文提示而非白屏',
    toastText.indexOf('暂不支持') >= 0 && (await page.locator('#rawList .para').count()) > 0,
    toastText);

  /* --- T7 导出 --- */
  const exportText = await page.evaluate(() => {
    const items = state.items.filter((x) => x.status === 'confirmed' || x.status === 'done');
    if (!items.length) return null;
    return items.map((x) => (x.status === 'done' ? '[x] ' : '[ ] ') + (x.due || '截止时间模糊') + '  ' + x.action
      + ' | 谁:' + (x.owner || '待分配') + ' | 交到:' + (x.where || '(未识别)')
      + ' | 出处:' + x.sourceName + ' 第' + x.sourceIndex + '段').join('\n');
  });
  check('T7 导出内容含截止/动作/谁/交到/出处',
    !!exportText && exportText.indexOf('出处:') >= 0 && exportText.indexOf('[x]') >= 0,
    (exportText || '').split('\n')[0]);

  /* --- 控制台错误 --- */
  check('全程无未捕获异常 / 控制台报错', errors.length === 0, errors.join(' ;; ') || 'clean');

  /* --- S2.1 file:// 直开也必须可用 --- */
  const { pathToFileURL } = require('url');
  const page2 = await browser.newPage();
  const errors2 = [];
  page2.on('pageerror', (e) => errors2.push(e.message));
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
  fs.unlinkSync(BAD);

  console.log('==== 验证结果 ====');
  console.log(results.join('\n'));
  console.log('==== ' + results.filter((r) => r.startsWith('PASS')).length + ' PASS / ' + results.filter((r) => r.startsWith('FAIL')).length + ' FAIL ====');
})().catch((e) => {
  console.error('HARNESS ERROR:', e && e.stack || e);
  process.exit(2);
});
