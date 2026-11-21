#!/usr/bin/env python3
"""Build the one-slide NoticeHunter project intro for the demo video.

Design goals
------------
* One 16:9 slide, readable at 1080p, no slide-to-slide cuts.
* Native PowerPoint entrance animations, auto-started on slide entry.
  No clicks are required during the recording.
* All copy and UI cards remain editable; only the background and the small
  reticle mark are raster assets.

Run:
    python slides/build_ppt.py
"""
from __future__ import annotations

from pathlib import Path

from lxml import etree
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Emu, Inches, Pt

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
OUT = ROOT / "NoticeHunter-项目介绍-一页动效.pptx"

# ---------------------------------------------------------------- palette
INK = "0C1A2B"
INK_SOFT = "24364D"
MUTED = "65758B"
MUTED_LIGHT = "92A4BA"
WHITE = "FFFFFF"
PANEL = "F6F9FE"
PANEL_BAR = "EAF2FB"
PANEL_LINE = "D9E4F2"
BLUE = "3B82F6"
BLUE_DARK = "1D4ED8"
CYAN = "38BDF8"
AMBER = "F4B740"
AMBER_INK = "8A5A08"
AMBER_SOFT = "FFF5DB"
GREEN = "15A36D"
GREEN_SOFT = "E9FBF4"
LINE_DARK = "1C2B40"
TEXT_ON_DARK = "EAF2FC"
TEXT_MUTED_ON_DARK = "8FA3BB"


def rgb(hex_code: str) -> RGBColor:
    return RGBColor.from_string(hex_code)


def I(value: float) -> int:
    return Inches(value)


def no_line(shape) -> None:
    shape.line.fill.background()


def no_fill(shape) -> None:
    shape.fill.background()


def set_text_style(
    run,
    *,
    size: float,
    color: str,
    bold: bool = False,
    font: str = "Microsoft YaHei",
    spacing: int | None = None,
) -> None:
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.name = font
    run.font.color.rgb = rgb(color)
    rpr = run._r.get_or_add_rPr()
    # PowerPoint uses a:ea for Chinese. Keep it identical to a:latin so the
    # renderer does not fall back to a different text face.
    latin = rpr.find(qn("a:latin"))
    ea = rpr.find(qn("a:ea"))
    if ea is None:
        ea = etree.SubElement(rpr, qn("a:ea"))
        if latin is not None:
            latin.addnext(ea)
    ea.set("typeface", font)
    cs = rpr.find(qn("a:cs"))
    if cs is None:
        cs = etree.SubElement(rpr, qn("a:cs"))
        if ea is not None:
            ea.addnext(cs)
    cs.set("typeface", font)
    if spacing is not None:
        rpr.set("spc", str(int(spacing)))


def textbox(
    slide,
    name: str,
    *,
    x: float,
    y: float,
    w: float,
    h: float,
    text: str = "",
    size: float = 12,
    color: str = WHITE,
    bold: bool = False,
    font: str = "Microsoft YaHei",
    align=PP_ALIGN.LEFT,
    anchor=MSO_ANCHOR.TOP,
    spacing: int | None = None,
    line_spacing: float = 1.0,
    wrap: bool = True,
):
    shape = slide.shapes.add_textbox(I(x), I(y), I(w), I(h))
    shape.name = name
    tf = shape.text_frame
    tf.clear()
    tf.word_wrap = wrap
    tf.margin_left = 0
    tf.margin_right = 0
    tf.margin_top = 0
    tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    tf.auto_size = None
    p = tf.paragraphs[0]
    p.alignment = align
    p.space_before = Pt(0)
    p.space_after = Pt(0)
    p.line_spacing = line_spacing
    if text:
        run = p.add_run()
        run.text = text
        set_text_style(
            run, size=size, color=color, bold=bold, font=font, spacing=spacing
        )
    return shape


def rich_textbox(
    slide,
    name: str,
    *,
    x: float,
    y: float,
    w: float,
    h: float,
    runs: list[dict],
    align=PP_ALIGN.LEFT,
    anchor=MSO_ANCHOR.TOP,
    line_spacing: float = 1.0,
    wrap: bool = True,
):
    shape = textbox(
        slide,
        name,
        x=x,
        y=y,
        w=w,
        h=h,
        text="",
        align=align,
        anchor=anchor,
        line_spacing=line_spacing,
        wrap=wrap,
    )
    p = shape.text_frame.paragraphs[0]
    for spec in runs:
        run = p.add_run()
        run.text = spec["text"]
        set_text_style(
            run,
            size=spec.get("size", 12),
            color=spec.get("color", WHITE),
            bold=spec.get("bold", False),
            font=spec.get("font", "Microsoft YaHei"),
            spacing=spec.get("spacing"),
        )
    return shape


def rect(
    slide,
    name: str,
    *,
    x: float,
    y: float,
    w: float,
    h: float,
    fill: str,
    line: str | None = None,
    line_width: float = 1.0,
    radius: float | None = None,
    shadow: bool = False,
    shape_type=None,
):
    st = shape_type
    if st is None:
        st = MSO_SHAPE.ROUNDED_RECTANGLE if radius else MSO_SHAPE.RECTANGLE
    shape = slide.shapes.add_shape(st, I(x), I(y), I(w), I(h))
    shape.name = name
    if radius is not None and st == MSO_SHAPE.ROUNDED_RECTANGLE:
        shape.adjustments[0] = min(0.5, radius / max(0.001, min(w, h)))
    shape.fill.solid()
    shape.fill.fore_color.rgb = rgb(fill)
    if line:
        shape.line.color.rgb = rgb(line)
        shape.line.width = Pt(line_width)
    else:
        no_line(shape)
    shape.shadow.inherit = False
    if shadow:
        add_shadow(shape)
    return shape


def add_shadow(
    shape,
    *,
    blur: float = 0.16,
    dist: float = 0.055,
    direction: int = 5400000,
    alpha: int = 32000,
) -> None:
    sp_pr = shape._element.spPr
    for old in sp_pr.findall(qn("a:effectLst")):
        sp_pr.remove(old)
    effect = etree.SubElement(sp_pr, qn("a:effectLst"))
    outer = etree.SubElement(effect, qn("a:outerShdw"))
    outer.set("blurRad", str(int(blur * 914400)))
    outer.set("dist", str(int(dist * 914400)))
    outer.set("dir", str(direction))
    outer.set("algn", "ctr")
    outer.set("rotWithShape", "0")
    clr = etree.SubElement(outer, qn("a:srgbClr"))
    clr.set("val", "000000")
    alpha_el = etree.SubElement(clr, qn("a:alpha"))
    alpha_el.set("val", str(alpha))


def line(slide, name: str, *, x1: float, y1: float, x2: float, y2: float,
         color: str, width: float = 1.0):
    shape = slide.shapes.add_connector(
        1, I(x1), I(y1), I(x2), I(y2)  # 1 = straight
    )
    shape.name = name
    shape.line.color.rgb = rgb(color)
    shape.line.width = Pt(width)
    return shape


def add_mark(slide) -> None:
    slide.shapes.add_picture(
        str(ASSETS / "mark.png"), I(0.63), I(0.42), width=I(0.34), height=I(0.34)
    )


# ---------------------------------------------------------------- animation
class Anim:
    """Collect PowerPoint entrance animations and emit one p:timing tree."""

    def __init__(self) -> None:
        self.rows: list[tuple[int, int, int]] = []  # shape_id, delay_ms, dur_ms

    def fade(self, shape, delay_ms: int, duration_ms: int = 460) -> None:
        self.rows.append((shape.shape_id, delay_ms, duration_ms))

    def xml(self) -> str:
        # Put the animation-pane rows in chronological order. The delays, not
        # the insertion order, drive playback, but chronological rows make the
        # Animation Pane readable and keep the build list predictable.
        self.rows.sort(key=lambda row: row[1])
        bld = "\n".join(
            f'<p:bldP spid="{sid}" grpId="0"/>' for sid, _, _ in self.rows
        )
        wrappers: list[str] = []
        node = 4
        for sid, delay_ms, dur_ms in self.rows:
            wrapper_id = node
            row_id = node + 1
            set_id = node + 2
            anim_id = node + 3
            node += 4
            wrappers.append(
                f'''<p:par>
  <p:cTn id="{wrapper_id}" fill="hold">
    <p:stCondLst><p:cond delay="{delay_ms}"/></p:stCondLst>
    <p:childTnLst>
      <p:par>
        <p:cTn id="{row_id}" presetID="10" presetClass="entr" presetSubtype="0" fill="hold" grpId="0" nodeType="withEffect">
          <p:stCondLst><p:cond delay="0"/></p:stCondLst>
          <p:childTnLst>
            <p:set>
              <p:cBhvr>
                <p:cTn id="{set_id}" dur="1" fill="hold">
                  <p:stCondLst><p:cond delay="0"/></p:stCondLst>
                </p:cTn>
                <p:tgtEl><p:spTgt spid="{sid}"/></p:tgtEl>
                <p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>
              </p:cBhvr>
              <p:to><p:strVal val="visible"/></p:to>
            </p:set>
            <p:animEffect transition="in" filter="fade">
              <p:cBhvr>
                <p:cTn id="{anim_id}" dur="{dur_ms}"/>
                <p:tgtEl><p:spTgt spid="{sid}"/></p:tgtEl>
              </p:cBhvr>
            </p:animEffect>
          </p:childTnLst>
        </p:cTn>
      </p:par>
    </p:childTnLst>
  </p:cTn>
</p:par>'''
            )
        wrappers_xml = "\n".join(wrappers)
        return f'''<p:timing xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:tnLst>
    <p:par>
      <p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot">
        <p:childTnLst>
          <p:seq concurrent="1" nextAc="seek">
            <p:cTn id="2" dur="indefinite" nodeType="mainSeq">
              <p:childTnLst>
                <p:par>
                  <p:cTn id="3" fill="hold">
                    <p:stCondLst>
                      <p:cond delay="indefinite"/>
                      <p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond>
                    </p:stCondLst>
                    <p:childTnLst>
{wrappers_xml}
                    </p:childTnLst>
                  </p:cTn>
                </p:par>
              </p:childTnLst>
            </p:cTn>
            <p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>
            <p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst>
          </p:seq>
        </p:childTnLst>
      </p:cTn>
    </p:par>
  </p:tnLst>
  <p:bldLst>
{bld}
  </p:bldLst>
</p:timing>'''


# ---------------------------------------------------------------- build
def build() -> None:
    prs = Presentation()
    # Exact 16:9 canvas: 12192000 × 6858000 EMU (13.333 in × 7.5 in).
    prs.slide_width = Emu(12192000)
    prs.slide_height = Emu(6858000)
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    slide.name = "NoticeHunter / video intro"

    # background
    bg = slide.shapes.add_picture(
        str(ASSETS / "bg.png"), 0, 0, width=prs.slide_width, height=prs.slide_height
    )
    bg.name = "background"

    anim = Anim()

    # ---------- top masthead
    add_mark(slide)
    mark_shape = slide.shapes[-1]
    anim.fade(mark_shape, 0, 420)

    wordmark = textbox(
        slide,
        "wordmark",
        x=1.06,
        y=0.43,
        w=2.0,
        h=0.22,
        text="NOTICEHUNTER",
        size=8.2,
        color="7DC9F6",
        bold=True,
        font="Segoe UI",
        spacing=220,
        anchor=MSO_ANCHOR.MIDDLE,
        wrap=False,
    )
    anim.fade(wordmark, 40, 420)

    sep = line(slide, "masthead-sep", x1=2.46, y1=0.47, x2=2.46, y2=0.70, color="2A3B53", width=0.75)
    anim.fade(sep, 90, 400)
    meta = textbox(
        slide,
        "masthead-meta",
        x=2.62,
        y=0.43,
        w=5.2,
        h=0.24,
        text="AIGC 应用创新大赛 · 赛题一",
        size=8.0,
        color=TEXT_MUTED_ON_DARK,
        anchor=MSO_ANCHOR.MIDDLE,
        wrap=False,
    )
    anim.fade(meta, 140, 420)

    top_right = textbox(
        slide,
        "masthead-right",
        x=10.02,
        y=0.43,
        w=2.66,
        h=0.24,
        text="杭州电子科技大学 · 2026",
        size=8.0,
        color="60738A",
        align=PP_ALIGN.RIGHT,
        anchor=MSO_ANCHOR.MIDDLE,
        wrap=False,
    )
    anim.fade(top_right, 180, 420)

    # ---------- title block
    title = textbox(
        slide,
        "title",
        x=0.62,
        y=1.00,
        w=5.45,
        h=0.96,
        text="通知猎人",
        size=55,
        color=WHITE,
        bold=True,
        anchor=MSO_ANCHOR.TOP,
        wrap=False,
    )
    anim.fade(title, 300, 700)

    en = textbox(
        slide,
        "title-en",
        x=0.67,
        y=1.91,
        w=4.8,
        h=0.22,
        text="NOTICE HUNTER",
        size=9.0,
        color="5EA9E6",
        bold=True,
        font="Segoe UI",
        spacing=420,
        anchor=MSO_ANCHOR.MIDDLE,
        wrap=False,
    )
    anim.fade(en, 470, 520)

    tagline = textbox(
        slide,
        "tagline",
        x=0.67,
        y=2.28,
        w=6.1,
        h=0.38,
        text="把散落的通知，变成能直接分工的清单。",
        size=17.2,
        color="C8D7E8",
        anchor=MSO_ANCHOR.MIDDLE,
        wrap=False,
    )
    anim.fade(tagline, 690, 500)

    # thin accent under the title block
    accent = rect(
        slide, "title-accent", x=0.66, y=2.84, w=0.54, h=0.035, fill=CYAN
    )
    anim.fade(accent, 830, 420)

    # ---------- four differentiators
    features = [
        ("01", "只给动作", "谁 · 什么时候前 · 交什么 · 交到哪"),
        ("02", "出处可回查", "出处段落高亮，AI 抽的每条都有据可查"),
        ("03", "人工确认", "低置信度标黄，人拍板后才写进清单"),
        ("04", "撞期预警", "跨通知去重，时间冲突主动提醒"),
    ]
    base_y = 3.10
    row_h = 0.80
    for i, (num, head, sub) in enumerate(features):
        y = base_y + i * row_h
        num_shape = textbox(
            slide,
            f"feature-{i+1}-num",
            x=0.67,
            y=y + 0.02,
            w=0.36,
            h=0.22,
            text=num,
            size=8.2,
            color="5BA7DF",
            bold=True,
            font="Segoe UI",
            spacing=50,
            anchor=MSO_ANCHOR.MIDDLE,
            wrap=False,
        )
        body = textbox(
            slide,
            f"feature-{i+1}",
            x=1.05,
            y=y - 0.01,
            w=5.75,
            h=0.68,
            text="",
            wrap=False,
        )
        tf = body.text_frame
        p1 = tf.paragraphs[0]
        p1.space_before = Pt(0)
        p1.space_after = Pt(2)
        p1.line_spacing = 1.0
        r1 = p1.add_run()
        r1.text = head
        set_text_style(r1, size=16.4, color="F0F6FF", bold=True)
        p2 = tf.add_paragraph()
        p2.space_before = Pt(0)
        p2.space_after = Pt(0)
        p2.line_spacing = 1.0
        r2 = p2.add_run()
        r2.text = sub
        set_text_style(r2, size=9.2, color=TEXT_MUTED_ON_DARK)
        delay = 1550 + i * 680
        anim.fade(num_shape, delay, 420)
        anim.fade(body, delay + 40, 480)
        if i < 3:
            sep = line(
                slide,
                f"feature-sep-{i+1}",
                x1=0.67,
                y1=y + row_h - 0.055,
                x2=6.35,
                y2=y + row_h - 0.055,
                color="203149",
                width=0.7,
            )
            anim.fade(sep, delay + 280, 420)

    # ---------- right: product panel
    panel_shadow = rect(
        slide,
        "panel-shadow",
        x=7.20,
        y=1.29,
        w=5.48,
        h=5.08,
        fill="020711",
        radius=0.18,
        shadow=False,
    )
    panel_shadow.fill.transparency = 0  # fully solid; only used as a 1px offset
    panel = rect(
        slide,
        "panel",
        x=7.15,
        y=1.22,
        w=5.50,
        h=5.08,
        fill=PANEL,
        line="2A4D78",
        line_width=0.9,
        radius=0.18,
        shadow=True,
    )
    anim.fade(panel_shadow, 980, 560)
    anim.fade(panel, 950, 620)

    bar = rect(
        slide,
        "panel-bar",
        x=7.15,
        y=1.22,
        w=5.50,
        h=0.42,
        fill=PANEL_BAR,
        radius=0.11,
        shape_type=MSO_SHAPE.ROUND_2_SAME_RECTANGLE,
    )
    anim.fade(bar, 1120, 450)

    dots = textbox(
        slide,
        "panel-dots",
        x=7.35,
        y=1.29,
        w=0.75,
        h=0.22,
        text="●  ●  ●",
        size=6.2,
        color="B7C9DC",
        font="Segoe UI",
        anchor=MSO_ANCHOR.MIDDLE,
        wrap=False,
    )
    anim.fade(dots, 1180, 400)

    file_pill = rect(
        slide,
        "file-pill",
        x=8.10,
        y=1.31,
        w=1.78,
        h=0.24,
        fill="F7FBFF",
        line="D8E5F3",
        line_width=0.6,
        radius=0.12,
    )
    anim.fade(file_pill, 1220, 400)
    file_text = textbox(
        slide,
        "file-text",
        x=8.20,
        y=1.32,
        w=1.58,
        h=0.21,
        text="notice-exam-week.txt",
        size=7.0,
        color="61738A",
        font="Consolas",
        anchor=MSO_ANCHOR.MIDDLE,
        wrap=False,
    )
    anim.fade(file_text, 1240, 400)

    live = textbox(
        slide,
        "panel-live",
        x=11.62,
        y=1.31,
        w=0.86,
        h=0.22,
        text="本地运行",
        size=7.0,
        color="6C8097",
        align=PP_ALIGN.RIGHT,
        anchor=MSO_ANCHOR.MIDDLE,
        wrap=False,
    )
    anim.fade(live, 1260, 400)

    # source excerpt
    src_label = textbox(
        slide,
        "src-label",
        x=7.42,
        y=1.84,
        w=2.2,
        h=0.20,
        text="02  /  原 文",
        size=7.6,
        color=BLUE,
        bold=True,
        spacing=40,
        anchor=MSO_ANCHOR.MIDDLE,
        wrap=False,
    )
    anim.fade(src_label, 1340, 400)

    src_meta = textbox(
        slide,
        "src-meta",
        x=11.10,
        y=1.84,
        w=1.38,
        h=0.20,
        text="第 14 段 · 模拟样例",
        size=6.8,
        color="8C9DB0",
        align=PP_ALIGN.RIGHT,
        anchor=MSO_ANCHOR.MIDDLE,
        wrap=False,
    )
    anim.fade(src_meta, 1380, 400)

    source = rich_textbox(
        slide,
        "src-text",
        x=7.42,
        y=2.10,
        w=4.94,
        h=0.54,
        runs=[
            {"text": "学生答卷扫描件请于 ", "size": 9.6, "color": INK_SOFT},
            {"text": "2026 年 12 月 25 日", "size": 9.6, "color": AMBER_INK, "bold": True},
            {"text": " ", "size": 9.6, "color": INK_SOFT},
            {"text": "17:00", "size": 9.6, "color": AMBER_INK, "bold": True},
            {"text": " 前，上传至课程平台。", "size": 9.6, "color": INK_SOFT},
        ],
        line_spacing=1.25,
        wrap=True,
    )
    anim.fade(source, 1440, 450)

    # extraction bridge
    bridge_line = line(
        slide,
        "bridge-line",
        x1=7.42,
        y1=2.76,
        x2=12.50,
        y2=2.76,
        color="DDE7F3",
        width=0.75,
    )
    anim.fade(bridge_line, 1820, 400)

    bridge = rect(
        slide,
        "bridge-pill",
        x=7.42,
        y=2.64,
        w=1.62,
        h=0.24,
        fill="EAF3FF",
        line="C8DFF8",
        line_width=0.6,
        radius=0.12,
    )
    anim.fade(bridge, 1860, 400)

    bridge_text = textbox(
        slide,
        "bridge-text",
        x=7.54,
        y=2.66,
        w=1.40,
        h=0.20,
        text="AI 结构化抽取",
        size=7.2,
        color=BLUE_DARK,
        bold=True,
        anchor=MSO_ANCHOR.MIDDLE,
        wrap=False,
    )
    anim.fade(bridge_text, 1880, 400)

    bridge_meta = textbox(
        slide,
        "bridge-meta",
        x=9.18,
        y=2.66,
        w=3.20,
        h=0.20,
        text="本地校验字段 · 出处回填 · 规则补漏",
        size=6.8,
        color="8A9BAF",
        anchor=MSO_ANCHOR.MIDDLE,
        wrap=False,
    )
    anim.fade(bridge_meta, 1920, 400)

    # action card
    card = rect(
        slide,
        "action-card",
        x=7.40,
        y=3.04,
        w=5.04,
        h=2.38,
        fill=WHITE,
        line="D5E2F2",
        line_width=0.7,
        radius=0.10,
        shadow=True,
    )
    anim.fade(card, 2130, 560)

    card_accent = rect(
        slide,
        "action-card-accent",
        x=7.40,
        y=3.16,
        w=0.045,
        h=2.14,
        fill=BLUE,
        radius=0.02,
    )
    anim.fade(card_accent, 2160, 420)

    badge = rect(
        slide,
        "ai-badge",
        x=7.58,
        y=3.19,
        w=1.42,
        h=0.25,
        fill="E8F2FF",
        line="BFDCFB",
        line_width=0.6,
        radius=0.125,
    )
    anim.fade(badge, 2280, 420)
    badge_text = textbox(
        slide,
        "ai-badge-text",
        x=7.70,
        y=3.20,
        w=1.22,
        h=0.22,
        text="AI 抽取 · 高置信度",
        size=7.0,
        color=BLUE_DARK,
        bold=True,
        anchor=MSO_ANCHOR.MIDDLE,
        wrap=False,
    )
    anim.fade(badge_text, 2300, 420)

    confirm_dot = rect(
        slide,
        "confirm-dot",
        x=11.56,
        y=3.27,
        w=0.075,
        h=0.075,
        fill=GREEN,
        radius=0.04,
    )
    anim.fade(confirm_dot, 3020, 420)
    confirm = textbox(
        slide,
        "confirm-text",
        x=11.67,
        y=3.21,
        w=0.68,
        h=0.22,
        text="已确认",
        size=7.0,
        color=GREEN,
        bold=True,
        align=PP_ALIGN.RIGHT,
        anchor=MSO_ANCHOR.MIDDLE,
        wrap=False,
    )
    anim.fade(confirm, 3040, 420)

    action = textbox(
        slide,
        "action-title",
        x=7.58,
        y=3.50,
        w=4.45,
        h=0.34,
        text="上传学生答卷扫描件",
        size=13.8,
        color=INK,
        bold=True,
        anchor=MSO_ANCHOR.MIDDLE,
        wrap=False,
    )
    anim.fade(action, 2440, 500)

    fields = [
        ("谁", "学生", 7.58, 4.02),
        ("截止", "2026-12-25  17:00", 9.95, 4.02),
        ("交什么", "答卷扫描件", 7.58, 4.67),
        ("交到", "课程平台", 9.95, 4.67),
    ]
    for i, (label, value, x, y) in enumerate(fields):
        lab = textbox(
            slide,
            f"field-{i+1}-label",
            x=x,
            y=y,
            w=1.85,
            h=0.18,
            text=label,
            size=6.8,
            color="8A9BAE",
            anchor=MSO_ANCHOR.MIDDLE,
            wrap=False,
        )
        val = textbox(
            slide,
            f"field-{i+1}-value",
            x=x,
            y=y + 0.19,
            w=2.05,
            h=0.26,
            text=value,
            size=9.4,
            color=INK if label != "截止" else BLUE_DARK,
            bold=(label == "截止"),
            anchor=MSO_ANCHOR.MIDDLE,
            wrap=False,
        )
        d = 2630 + i * 105
        anim.fade(lab, d, 360)
        anim.fade(val, d + 30, 380)

    card_foot = textbox(
        slide,
        "action-card-foot",
        x=7.58,
        y=5.12,
        w=4.50,
        h=0.18,
        text="来源：notice-exam-week.txt · 第 14 段",
        size=6.5,
        color="91A2B4",
        anchor=MSO_ANCHOR.MIDDLE,
        wrap=False,
    )
    anim.fade(card_foot, 3100, 380)

    # two secondary status chips
    low_chip = rect(
        slide,
        "low-chip",
        x=7.42,
        y=5.62,
        w=1.70,
        h=0.25,
        fill=AMBER_SOFT,
        line="F0D18C",
        line_width=0.6,
        radius=0.125,
    )
    anim.fade(low_chip, 3300, 420)
    low_text = textbox(
        slide,
        "low-text",
        x=7.54,
        y=5.63,
        w=1.48,
        h=0.22,
        text="低置信度 1 · 待确认",
        size=6.8,
        color=AMBER_INK,
        bold=True,
        anchor=MSO_ANCHOR.MIDDLE,
        wrap=False,
    )
    anim.fade(low_text, 3320, 420)

    conflict_chip = rect(
        slide,
        "conflict-chip",
        x=9.24,
        y=5.62,
        w=1.54,
        h=0.25,
        fill="EFF6FF",
        line="C8DDF7",
        line_width=0.6,
        radius=0.125,
    )
    anim.fade(conflict_chip, 3380, 420)
    conflict_text = textbox(
        slide,
        "conflict-text",
        x=9.36,
        y=5.63,
        w=1.34,
        h=0.22,
        text="撞期 1 组 · 已提示",
        size=6.8,
        color=BLUE_DARK,
        bold=True,
        anchor=MSO_ANCHOR.MIDDLE,
        wrap=False,
    )
    anim.fade(conflict_text, 3400, 420)

    demo_note = textbox(
        slide,
        "demo-note",
        x=7.42,
        y=6.00,
        w=4.98,
        h=0.18,
        text="界面示意 · 模拟通知，不含真实个人信息",
        size=6.4,
        color="99A9BA",
        anchor=MSO_ANCHOR.MIDDLE,
        align=PP_ALIGN.RIGHT,
        wrap=False,
    )
    anim.fade(demo_note, 3480, 380)

    # ---------- closing principle
    divider = line(
        slide,
        "bottom-rule",
        x1=0.67,
        y1=6.56,
        x2=12.66,
        y2=6.56,
        color="1B2A40",
        width=0.7,
    )
    anim.fade(divider, 4300, 420)

    principle = rich_textbox(
        slide,
        "principle",
        x=0.67,
        y=6.70,
        w=7.6,
        h=0.28,
        runs=[
            {"text": "●  ", "size": 7.4, "color": CYAN},
            {"text": "AI 负责理解", "size": 9.8, "color": "D4E1EF"},
            {"text": "     ●  ", "size": 7.4, "color": "7FB3DF"},
            {"text": "规则负责兜底", "size": 9.8, "color": "D4E1EF"},
            {"text": "     ●  ", "size": 7.4, "color": AMBER},
            {"text": "人负责确认", "size": 9.8, "color": "F4D9A6", "bold": True},
        ],
        anchor=MSO_ANCHOR.MIDDLE,
        wrap=False,
    )
    anim.fade(principle, 4380, 560)

    tech = textbox(
        slide,
        "tech-note",
        x=8.90,
        y=6.70,
        w=3.76,
        h=0.28,
        text="零依赖 · 离线可跑 · 单文件",
        size=7.8,
        color="6C8097",
        align=PP_ALIGN.RIGHT,
        anchor=MSO_ANCHOR.MIDDLE,
        wrap=False,
    )
    anim.fade(tech, 4520, 480)

    # ---------- notes
    notes = slide.notes_slide.notes_text_frame
    notes.text = (
        "播放方式：幻灯片放映 → 从本页开始。本页无点击、无切页，进入放映后动画自动播完，"
        "末帧稳定停留，约 8–9 秒；录屏时等末帧停 2 秒再停止即可。\n"
        "内容口径：界面为版式示意，文字取自 prototype/samples/notice-exam-week.txt 的模拟通知；"
        "非真实通知、无真实个人信息。四项特点均对应原型现有能力（结构化字段、原文出处、低置信度人工确认、撞期预警）。\n"
        "设计口径：AI 负责理解，规则负责兜底，人负责确认——对应 D-007 / D-014 的主抽取 + 规则补漏 + 人工确认。"
    )

    # ---------- attach timing
    timing = etree.fromstring(anim.xml())
    slide._element.append(timing)

    prs.core_properties.title = "通知猎人 NoticeHunter · 一页项目介绍"
    prs.core_properties.subject = "AIGC 应用创新大赛 · 赛题一 · 视频内嵌动效"
    prs.core_properties.author = "NoticeHunter"
    prs.core_properties.comments = (
        "单页 16:9。动画自动播放，无需点击；建议在幻灯片放映模式下录屏。"
    )
    prs.save(OUT)
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KiB), {len(anim.rows)} effects")


if __name__ == "__main__":
    build()
