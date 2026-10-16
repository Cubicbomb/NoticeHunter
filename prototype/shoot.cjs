#!/usr/bin/env node
/* 演示截图脚本（一次性，用完可删）：跑通主流程并截下每一步画面。
   用法：node shoot.cjs   （需本地静态服务器在 8761；缺 playwright-core 时
   test/load-playwright.cjs 会打印复原步骤 —— HANDOFF R-18） */
const { chromium } = require('./test/load-playwright.cjs');
const path = require('path');
const fs = require('fs');

const URL = 'http://127.0.0.1:8761/prototype/index.html';
const OUT = path.join(__dirname, '..', 'output');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1120, height: 980 } });
  const shot = (n) => page.screenshot({ path: path.join(OUT, n) });

  await page.goto(URL, { waitUntil: 'load' });

  /* 1 · 载入样例，看整体结构 */
  await page.click('#sample');
  await page.waitForTimeout(400);
  await shot('1-载入通知-原文解析.png');

  /* 2 · 待确认区：标黄的低置信度卡片与原因标签 */
  await page.locator('#reviewList .card').nth(1).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shot('2-低置信度-人工确认节点.png');

  /* 3 · 确认几条 → 触发同日撞期（传前缀；空串表示「无截止时间」） */
  const confirmByDue = async (prefix) => {
    const idx = await page.$$eval('#reviewList .card', (els, p) =>
      els.findIndex((el) => {
        const v = ((el.querySelector('input[data-field="due"]') || {}).value || '').trim();
        return p === '' ? v === '' : v.indexOf(p) === 0;
      }), prefix);
    if (idx >= 0) {
      await page.locator('#reviewList .card').nth(idx).locator('button[data-act="confirm"]').click();
      await page.waitForTimeout(250);
    }
    return idx;
  };
  await confirmByDue('2026-11-05');
  await confirmByDue('2026-12-25');
  await confirmByDue('2026-12-25');
  await confirmByDue('');
  await page.locator('#conflictBar').scrollIntoViewIfNeeded();
  await page.waitForTimeout(350);
  await shot('3-同日撞期提醒与行动清单.png');

  /* 4 · 点出处 → 原文高亮 */
  const btn = page.locator('#todoList button[data-act="src"]').first();
  if ((await btn.count()) > 0) {
    await btn.click();
    await page.waitForTimeout(600);
    await shot('4-出处跳转-原文高亮.png');
  }

  /* 5 · 导出的文本内容 */
  const text = await page.evaluate(() => buildExport());
  fs.writeFileSync(path.join(OUT, '5-导出清单.txt'), text || '(empty)', 'utf8');

  await browser.close();
  console.log('saved to ' + OUT);
  for (const f of fs.readdirSync(OUT)) console.log('  ' + f);
})().catch((e) => { console.error('ERROR:', (e && e.stack) || e); process.exit(1); });
