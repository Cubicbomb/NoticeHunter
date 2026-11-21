# 视频内嵌 · 一页项目介绍

成品：[`NoticeHunter-项目介绍-一页动效.pptx`](NoticeHunter-项目介绍-一页动效.pptx)

- **1 页，16:9（13.333 × 7.5 in）**，用于项目演示视频的开场介绍段。
- **进入放映即自动播放，不需要点击，也不切页**。动画从 0 ms 开始，最后一项在 4520 ms 进入；末帧停留，整段约 **8–9 秒**。
- 58 个元素全部使用 PowerPoint 原生 **Fade** 入场，按绝对延迟错峰；不是视频、不是 GIF，文字与卡片仍可编辑。
- 右上角界面为**版式示意**，内容取自 `prototype/samples/notice-exam-week.txt` 的模拟通知（第 14 段），不含真实通知或个人信息。

## 播放与录屏

1. 用 PowerPoint 打开，进入 **幻灯片放映 → 从当前幻灯片开始**。
2. 不要停在编辑视图等动画——编辑视图不播放入场动画。
3. 建议录 1080p 或 4K；片头留 1–2 秒静止，动画结束后再停 2 秒，方便剪辑。
4. 本页没有设置自动切页或循环。若用于展台循环，可在「设置幻灯片放映」里手动勾选「循环放映」。

> 本机没有安装 Microsoft PowerPoint，**自动播放尚未在 PowerPoint 真机放映中验证**；已用 LibreOffice 渲染核对版式，并对 `p:timing` 做结构检查（27 PASS / 0 FAIL）。正式录制前请在目标机器上先试放一遍。

## 文件

| 文件 | 用途 |
| --- | --- |
| `NoticeHunter-项目介绍-一页动效.pptx` | 交付成品 |
| `preview-final.png` | 末帧 1920×1080 预览 |
| `build_ppt.py` | 版式、文案、动画延迟的生成脚本 |
| `make_background.py` | 深色网格背景 |
| `make_mark.py` | 左上角准星标识 |
| `check_pptx.py` | 结构验收：页数、16:9、58 条动画、无点击触发、时间轴、数据披露 |

## 修改方式

```powershell
$py = 'C:\Users\ASUS\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe'
& $py slides\make_background.py
& $py slides\build_ppt.py
& $py slides\check_pptx.py
```

动画延迟写在 `build_ppt.py` 的 `anim.fade(shape, delay_ms, duration_ms)` 调用里。如果要整体放慢，按同一比例放大所有 `delay_ms` 与 `duration_ms`；末项当前为 `4520 ms`，改完同步更新 `check_pptx.py` 的 `delays[-1]` 断言。

## 内容口径

四个特点是原型现有能力，不是概念口号：

1. **只给动作**：结构化字段「谁 / 什么时候前 / 交什么 / 交到哪」；
2. **出处可回查**：每条可定位回原文段落并高亮；
3. **人工确认**：低置信度标黄，确认后才进入行动清单；
4. **撞期预警**：跨通知去重与时间冲突提示。

底部的「AI 负责理解 · 规则负责兜底 · 人负责确认」对应 `HANDOFF.md` 的 D-007（LLM 主抽取 + 规则兜底）与 D-014（规则条目级补漏）。
