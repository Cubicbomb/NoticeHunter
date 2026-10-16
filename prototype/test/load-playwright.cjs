/**
 * 统一加载 playwright-core —— 仅供验收 / 截图脚本使用，产品 `prototype/index.html` 不引用本文件。
 *
 * 为什么需要这一层（HANDOFF R-18）：
 *   产品是零依赖单文件，但验收必须真的开浏览器。仓库 `node_modules/` 被 `.gitignore` 排除，
 *   也没有 `package.json`，所以脚本靠 `NODE_PATH` 指向一个 **npx 缓存里带哈希的目录**。
 *   那串哈希只活在写它出来的那一台机器上：换机、或被 npx 清理之后，验收会以
 *   `Cannot find module 'playwright-core'` 裸失败，而仓库里没有任何地方写着怎么复原。
 *   本模块把「找不到怎么办」写进仓库，让「N PASS / 0 FAIL」可被他人复现。
 *
 *   产品本身仍然是零依赖、断网可跑 —— 只有测试脚本需要它。
 */

const HELP = [
  '',
  '✗ 找不到 playwright-core，浏览器验收无法启动。',
  '',
  '  这不是产品故障（产品零依赖），只是缺测试驱动器。任选一种方式恢复：',
  '',
  '  方式一 · 复用机器上已有的拷贝（仓库仍不引入任何依赖）：',
  '     npm root -g                              # 或 npx 缓存目录',
  '     例：D:\\nodejs\\node_cache\\_npx\\<hash>\\node_modules',
  '     PowerShell：$env:NODE_PATH="<上面的路径>"    （cmd：set NODE_PATH=<路径>）',
  '     然后重跑本脚本。',
  '',
  '  方式二 · 装在仓库之外（避免污染零依赖仓库）：',
  '     npm i playwright-core --prefix .nh-test --no-save',
  '     PowerShell：$env:NODE_PATH="$(Resolve-Path .nh-test\\node_modules)"',
  '',
  '  浏览器用的是本机 Edge（脚本内 channel: "msedge"），无需另外下载 Chromium：',
  '     C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '',
  '  静态服务器（先起）：python -m http.server 8761 --bind 127.0.0.1   （仓库根）',
  ''
].join('\n');

module.exports = (function loadPlaywright() {
  try {
    return require('playwright-core');
  } catch (e) {
    console.error(HELP);
    console.error('原始错误：' + e.message);
    process.exit(1);
  }
})();
