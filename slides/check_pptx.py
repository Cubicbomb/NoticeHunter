#!/usr/bin/env python3
"""Structural checks for the animated one-slide deck.

This is not a PowerPoint renderer. It verifies what is easy to get wrong when
injecting a p:timing tree with python-pptx:
  * one exact 16:9 slide;
  * every animated target exists and has exactly one build entry;
  * no click-triggered effects (the recording must run hands-free);
  * every row has the five Fade-in parts and ends visible;
  * time-node ids are unique and delays are chronological;
  * key copy and mock-data disclosure are present.
"""
from __future__ import annotations

import sys
import zipfile
from pathlib import Path

from lxml import etree
from pptx import Presentation

ROOT = Path(__file__).resolve().parent
PPTX = ROOT / "NoticeHunter-项目介绍-一页动效.pptx"
NS = {
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
}
FAIL: list[str] = []
PASS = 0


def check(condition: bool, label: str, detail: str = "") -> None:
    global PASS
    if condition:
        PASS += 1
        print(f"PASS  {label}")
    else:
        FAIL.append(label)
        print(f"FAIL  {label}{(' — ' + detail) if detail else ''}")


def local(el) -> str:
    return etree.QName(el).localname


def main() -> int:
    if not PPTX.exists():
        print(f"missing {PPTX}")
        return 2

    prs = Presentation(PPTX)
    check(len(prs.slides) == 1, "exactly one slide")
    check(prs.slide_width == 12192000 and prs.slide_height == 6858000,
          "exact 16:9 canvas (12192000 × 6858000 EMU)",
          f"got {prs.slide_width} × {prs.slide_height}")

    slide = prs.slides[0]
    shape_ids = {shape.shape_id for shape in slide.shapes}
    check(len(shape_ids) == len(slide.shapes), "shape ids are unique")

    texts = " ".join(
        shape.text_frame.text
        for shape in slide.shapes
        if shape.has_text_frame
    )
    check("通知猎人" in texts, "project name present")
    check(all(k in texts for k in ("只给动作", "出处可回查", "人工确认", "撞期预警")),
          "four differentiators present")
    check("第 14 段" in texts, "sample paragraph number is 14")
    check("第 20 段" not in texts, "no stale paragraph number")
    check("界面示意" in texts and "模拟通知" in texts, "mock-interface disclosure present")
    notes = slide.notes_slide.notes_text_frame.text
    check("自动" in notes and "无点击" in notes, "speaker notes explain autoplay")
    check("模拟通知" in notes, "speaker notes carry data disclosure")

    with zipfile.ZipFile(PPTX) as z:
        slide_xml = etree.fromstring(z.read("ppt/slides/slide1.xml"))
        pres_xml = etree.fromstring(z.read("ppt/presentation.xml"))

    check(len(slide_xml.xpath("//p:timing", namespaces=NS)) == 1, "one timing tree")
    check(local(slide_xml[-1]) == "timing", "p:timing is the last slide child")

    timing = slide_xml.find("p:timing", NS)
    check(timing is not None and [local(c) for c in timing] == ["tnLst", "bldLst"],
          "timing children are tnLst then bldLst")

    rows = slide_xml.xpath("//p:cTn[@nodeType='withEffect']", namespaces=NS)
    check(len(rows) == 58, "58 automatic fade effects", f"got {len(rows)}")
    check(len(slide_xml.xpath("//p:cTn[@nodeType='clickEffect']", namespaces=NS)) == 0,
          "no click-triggered effects")
    check(len(slide_xml.xpath("//p:seq", namespaces=NS)) == 1, "one main sequence")

    blds = slide_xml.xpath("//p:bldLst/p:bldP", namespaces=NS)
    bld_ids = [int(b.get("spid")) for b in blds]
    row_ids: list[int] = []
    row_issues: list[str] = []
    for row in rows:
        rid = row.get("id")
        targets = row.xpath(".//p:spTgt", namespaces=NS)
        if len(targets) != 2 or targets[0].get("spid") != targets[1].get("spid"):
            row_issues.append(f"{rid}: target count/mismatch")
            continue
        row_ids.append(int(targets[0].get("spid")))
        if row.get("presetID") != "10" or row.get("presetClass") != "entr":
            row_issues.append(f"{rid}: not Fade entrance")
        if row.get("grpId") != "0":
            row_issues.append(f"{rid}: group id")
        effects = row.xpath(".//p:animEffect", namespaces=NS)
        if len(effects) != 1 or effects[0].get("transition") != "in" or effects[0].get("filter") != "fade":
            row_issues.append(f"{rid}: fade effect")
        sets = row.xpath("./p:childTnLst/p:set", namespaces=NS)
        if len(sets) != 1:
            row_issues.append(f"{rid}: visibility set count")
            continue
        vis = sets[0].xpath(".//p:attrName/text()", namespaces=NS)
        to = sets[0].xpath(".//p:strVal/@val", namespaces=NS)
        if vis != ["style.visibility"] or to != ["visible"]:
            row_issues.append(f"{rid}: visibility value")
    check(not row_issues, "all 58 rows have complete Fade-in structure",
          "; ".join(row_issues[:4]))

    check(len(set(row_ids)) == 58, "58 unique animated shapes")
    check(set(row_ids) <= shape_ids, "all animated shape ids exist")
    check(set(row_ids) == set(bld_ids), "bldLst covers exactly the animated shapes")
    check(len(bld_ids) == len(set(bld_ids)), "bldLst has no duplicate targets")

    group = slide_xml.xpath(
        "//p:seq/p:cTn[@nodeType='mainSeq']/p:childTnLst/p:par/p:cTn", namespaces=NS
    )
    check(len(group) == 1, "one autoplay group")
    wrappers = group[0].xpath("./p:childTnLst/p:par/p:cTn", namespaces=NS) if group else []
    check(len(wrappers) == 58, "58 delay wrappers")
    delays = [int(w.xpath("./p:stCondLst/p:cond/@delay", namespaces=NS)[0]) for w in wrappers]
    check(delays == sorted(delays), "delays are chronological")
    check(delays[0] == 0 and delays[-1] == 4520, "delays span 0–4520 ms")

    all_ctn = slide_xml.xpath("//p:cTn/@id", namespaces=NS)
    check(len(all_ctn) == len(set(all_ctn)), "time-node ids are unique")

    show = pres_xml.find("p:showPr", NS)
    check(show is None or show.get("loop") != "1", "presentation does not force looping")

    print()
    print(f"{PASS} PASS / {len(FAIL)} FAIL")
    if FAIL:
        for item in FAIL:
            print("  -", item)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
