#!/usr/bin/env python3
"""生成 .docx 测试夹具（仅用标准库，无第三方依赖）。

用途：验证原型在不依赖任何外部库的前提下，能否用浏览器
DecompressionStream('deflate-raw') 解出 word/document.xml。

生成的内容为完全虚构的模拟通知，不含任何真实单位、真实个人。
如需重新生成：  python make_docx_fixture.py
"""
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "notice-competition.docx"

PARAGRAPHS = [
    "关于举办第 X 届示例创新大赛报名工作的通知（模拟数据 · 非真实通知）",
    "发布单位：示例大学 创新创业学院",
    "发布日期：2026 年 10 月 13 日",
    "",
    "各学院：",
    "为激发学生创新意识，现启动第 X 届示例创新大赛报名工作，具体事项通知如下。",
    "",
    "一、报名对象",
    "全校在籍本科生，每支队伍 4 至 6 人，鼓励跨专业组队。",
    "",
    "二、报名方式与时间",
    "请各参赛队伍于 2026 年 11 月 12 日 23:59 前，登录示例系统提交报名表，逾期系统自动关闭。",
    "",
    "三、材料要求",
    "1. 队伍信息表一份，PDF 格式，命名规则为「学院-队伍名称」；",
    "2. 项目简介一页以内，不超过 800 字；",
    "3. 指导教师确认意见，需签字后扫描上传。",
    "",
    "四、联系方式",
    "示例老师（模拟数据），联系电话 0000-00000000。",
    "",
    "创新创业学院",
    "2026 年 10 月 13 日",
]

CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>
"""

RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
"""


def esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def main() -> None:
    body = "\n".join(
        f'    <w:p><w:r><w:t xml:space="preserve">{esc(t)}</w:t></w:r></w:p>'
        for t in PARAGRAPHS
    )
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">\n'
        f"  <w:body>\n{body}\n  </w:body>\n"
        "</w:document>\n"
    )

    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", RELS)
        z.writestr("word/document.xml", document)

    # 自检：确保结构可被浏览器侧逻辑读取
    with zipfile.ZipFile(OUT) as z:
        names = z.namelist()
        assert "word/document.xml" in names, names
        xml = z.read("word/document.xml").decode("utf-8")
        assert "2026 年 11 月 12 日 23:59" in xml

    print(f"OK -> {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
