#!/usr/bin/env node
/**
 * 本地 stub：OpenAI 兼容 `POST /chat/completions`
 *
 * 仅供测试，产品代码（prototype/index.html）**不得引用本文件**。
 * 只用 Node 标准库 `http`，零 npm 依赖。
 *
 * 用法：
 *   node fake-llm-server.js [--port=8791]
 *
 * 控制接口（测试用）：
 *   POST /__control   body 例：
 *     {"mode":"ok"}              恢复正常返回
 *     {"mode":"http-500"}        返回 500
 *     {"mode":"bad-json"}        200 但 content 不是合法 JSON
 *     {"mode":"timeout"}         挂起不响应（客户端会走超时分支）
 *     {"payload":[...]}          覆盖 ok 模式返回的抽取结果数组
 *     {"reset":true}             全部复位（含请求计数）
 *   GET  /__state     返回 {mode, requests, hasPayload, lastBody}
 *
 * 为什么需要 CORS：页面跑在 127.0.0.1:8761，stub 在 127.0.0.1:8791，
 * 属跨源；带 Authorization 的 POST 会先发 OPTIONS 预检，必须应答。
 */
const http = require('http');

const portArg = process.argv.find((a) => a.indexOf('--port=') === 0);
const PORT = portArg ? parseInt(portArg.split('=')[1], 10) : 8791;

let mode = 'ok';          // ok | http-500 | bad-json | timeout
let payload = null;       // 覆盖 ok 模式返回的 content（对象数组）
let requests = 0;
let lastBody = null;
let timestamps = [];      // 每次请求到达的 Date.now()，用于验证 S2.11 最小间隔

/* 固定 payload：带【STUB】标记，便于断言结果确实来自 stub 而非规则式 */
const DEFAULT_PAYLOAD = [
  {
    action: '【STUB】stub 返回的行动项',
    owner: '测试负责人',
    where: '测试地点',
    dueRaw: '2027 年 3 月 15 日 10:00 前',
    due: '2027-03-15 10:00',
    sourceIndex: 1,
    confidence: 'high',
    reasons: []
  }
];

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function json(res, code, obj) {
  cors(res);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => resolve(data));
  });
}

const server = http.createServer(async (req, res) => {
  const url = String(req.url || '').split('?')[0];

  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && url === '/__state') {
    json(res, 200, { mode: mode, requests: requests, hasPayload: !!payload, lastBody: lastBody, timestamps: timestamps });
    return;
  }

  if (req.method === 'POST' && url === '/__control') {
    const raw = await readBody(req);
    let body;
    try { body = JSON.parse(raw || '{}'); }
    catch (e) { json(res, 400, { error: String(e.message) }); return; }
    if (body.mode) mode = String(body.mode);
    if (Object.prototype.hasOwnProperty.call(body, 'payload')) payload = body.payload;
    if (body.reset) { mode = 'ok'; payload = null; requests = 0; lastBody = null; timestamps = []; }
    json(res, 200, { ok: true, mode: mode, hasPayload: !!payload, requests: requests });
    return;
  }

  if (req.method === 'POST' && url === '/chat/completions') {
    const raw = await readBody(req);
    requests += 1;
    timestamps.push(Date.now());
    lastBody = raw || null;

    if (mode === 'timeout') return;                                  // 挂起：永不响应
    if (mode === 'http-500') { json(res, 500, { error: { message: 'stub 故意返回 500' } }); return; }

    const content = mode === 'bad-json'
      ? '这不是合法 JSON {[[[  intentionally broken'
      : JSON.stringify(payload || DEFAULT_PAYLOAD);

    json(res, 200, {
      id: 'stub-' + requests,
      object: 'chat.completion',
      created: 0,
      model: 'stub-model',
      choices: [{ index: 0, message: { role: 'assistant', content: content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
    });
    return;
  }

  json(res, 404, { error: 'not found: ' + url });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('fake-llm-server listening on http://127.0.0.1:' + PORT);
});
