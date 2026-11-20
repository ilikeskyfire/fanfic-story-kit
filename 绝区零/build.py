#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Story Kit builder.

Markdown in ./content is the single source of truth.
This script parses it and writes ./data.js, which the offline viewer loads.

Usage:
    python3 build.py
"""

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CONTENT = os.path.join(HERE, "content")


def read(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def parse_meta_and_sections(text):
    """Return (title, meta dict, sections list of (name, body))."""
    lines = text.replace("\r\n", "\n").split("\n")
    title = ""
    meta = {}
    sections = []
    cur_name = None
    cur_body = []
    in_meta = True

    def flush():
        if cur_name is not None:
            sections.append((cur_name, "\n".join(cur_body).strip()))

    for line in lines:
        if in_meta and line.startswith("# "):
            title = line[2:].strip()
            continue
        if in_meta and re.match(r"^-\s+[^:：]+[:：]", line):
            m = re.match(r"^-\s+([^:：]+)[:：]\s*(.*)$", line)
            meta[m.group(1).strip()] = m.group(2).strip()
            continue
        if line.startswith("## "):
            flush()
            in_meta = False
            cur_name = line[3:].strip()
            cur_body = []
            continue
        if in_meta and line.strip() == "":
            continue
        if in_meta:
            # free text before first ## is treated as intro, ignore
            continue
        cur_body.append(line)
    flush()
    return title, meta, sections


def paragraphs(body):
    chunks = re.split(r"\n\s*\n", body.strip())
    return [c.strip().replace("\n", "") for c in chunks if c.strip()]


def list_items(body):
    out = []
    for line in body.split("\n"):
        s = line.strip()
        if not s:
            continue
        if s.startswith("- "):
            out.append(s[2:].strip())
        elif s.startswith("* "):
            out.append(s[2:].strip())
        else:
            out.append(s)
    return out


def split_list(value, seps=",，、"):
    if not value:
        return []
    parts = re.split("[" + re.escape(seps) + "]", value)
    return [p.strip() for p in parts if p.strip()]


def parse_speaker_line(line):
    """Parse '**Name**：text' / 'Name：text' / '【旁白】text'."""
    s = line.strip()
    if s.startswith("> "):
        s = s[2:].strip()
    if s.startswith("【旁白】") or s.startswith("【") and s.endswith("】"):
        return {"type": "narration", "text": s}
    m = re.match(r"^\*\*(.+?)\*\*\s*[:：]\s*(.+)$", s)
    if m:
        return {"type": "line", "speaker": m.group(1).strip(), "text": m.group(2).strip()}
    m = re.match(r"^([^:：]{1,18})\s*[:：]\s*(.+)$", s)
    if m and not re.search(r"https?://", s):
        return {"type": "line", "speaker": m.group(1).strip(), "text": m.group(2).strip()}
    return {"type": "narration", "text": s}


def parse_scenes(body):
    scenes = []
    cur = None
    for line in body.split("\n"):
        if line.startswith("### "):
            if cur:
                scenes.append(cur)
            cur = {"title": line[4:].strip(), "lines": []}
            continue
        if cur is None:
            continue
        if line.strip() == "":
            continue
        cur["lines"].append(parse_speaker_line(line))
    if cur:
        scenes.append(cur)
    return scenes


def parse_quotes(body):
    quotes = []
    for item in list_items(body):
        s = item.strip()
        m = re.match(r"^\*\*(.+?)\*\*\s*[:：]\s*(.+)$", s)
        if m:
            speaker, text = m.group(1).strip(), m.group(2).strip()
        else:
            speaker, text = "", s
        text = text.strip()
        if text.startswith("「") and text.endswith("」"):
            text = text[1:-1]
        quotes.append({"speaker": speaker, "text": text})
    return quotes


def parse_sources(body):
    urls = []
    for item in list_items(body):
        m = re.search(r"\((https?://[^)]+)\)", item)
        if m:
            urls.append(m.group(1))
        elif item.startswith("http"):
            urls.append(item.split()[0])
    return urls


def parse_story(path):
    title, meta, sections = parse_meta_and_sections(read(path))
    sec = {name: body for name, body in sections}
    data = {
        "id": meta.get("ID") or os.path.splitext(os.path.basename(path))[0].split("-", 1)[-1],
        "title": title,
        "season": meta.get("季", ""),
        "order": int(meta.get("排序", "0") or 0),
        "version": meta.get("版本", ""),
        "factions": split_list(meta.get("阵营", "")),
        "oneLiner": meta.get("一句话", ""),
        "summary": paragraphs(sec.get("剧情", "")),
        "scenes": parse_scenes(sec.get("关键场景", "")),
        "quotes": parse_quotes(sec.get("名台词", "")),
        "notes": list_items(sec.get("伏笔", "")),
        "sources": parse_sources(sec.get("来源", "")),
    }
    return data


def parse_character(path):
    title, meta, sections = parse_meta_and_sections(read(path))
    sec = {name: body for name, body in sections}
    rels = []
    for item in list_items(sec.get("关系", "")):
        m = re.match(r"^\*\*(.+?)\*\*\s*[:：]\s*(.+)$", item) or re.match(r"^([^:：]{1,20})\s*[:：]\s*(.+)$", item)
        if m:
            rels.append({"name": m.group(1).strip(), "desc": m.group(2).strip()})
        elif item:
            rels.append({"name": "", "desc": item})
    return {
        "id": meta.get("ID") or os.path.splitext(os.path.basename(path))[0],
        "name": title,
        "en": meta.get("英文", ""),
        "faction": meta.get("阵营", ""),
        "role": meta.get("定位", ""),
        "debut": meta.get("初登场", ""),
        "keywords": split_list(meta.get("关键词", "")),
        "tagline": meta.get("一句话", ""),
        "background": paragraphs(sec.get("背景", "")),
        "relationships": rels,
        "quotes": parse_quotes(sec.get("台词", "")),
    }


def parse_timeline(path):
    title, meta, sections = parse_meta_and_sections(read(path))
    events = []
    for name, body in sections:
        # each section is an event; its body may hold meta-like bullets
        ev_meta = {}
        body_lines = []
        for line in body.split("\n"):
            m = re.match(r"^-\s+([^:：]+)[:：]\s*(.*)$", line)
            if m and m.group(1).strip() in ("时代", "日期", "章节", "次要"):
                ev_meta[m.group(1).strip()] = m.group(2).strip()
            else:
                body_lines.append(line)
        events.append({
            "title": name,
            "era": ev_meta.get("时代", ""),
            "date": ev_meta.get("日期", ""),
            "chapter": ev_meta.get("章节", ""),
            "minor": ev_meta.get("次要", "") in ("true", "是", "1"),
            "body": paragraphs("\n".join(body_lines)),
        })
    return events


def parse_worldview(path):
    title, meta, sections = parse_meta_and_sections(read(path))
    return [{"title": name, "en": "", "body": paragraphs(body)} for name, body in sections]


def glob_md(folder):
    full = os.path.join(CONTENT, folder)
    if not os.path.isdir(full):
        return []
    return [os.path.join(full, f) for f in sorted(os.listdir(full)) if f.endswith(".md")]


def main():
    work_path = os.path.join(HERE, "work.json")
    work = json.loads(read(work_path)) if os.path.exists(work_path) else {}

    story = [parse_story(p) for p in glob_md("10-story")]
    season_rank = {"第一季": 0, "第二季": 1, "第三季": 2}
    story.sort(key=lambda c: (season_rank.get(c["season"], 9), c["order"]))

    characters = [parse_character(p) for p in glob_md("20-characters")]
    timeline = parse_timeline(os.path.join(CONTENT, "01-timeline.md")) if os.path.exists(os.path.join(CONTENT, "01-timeline.md")) else []
    worldview = parse_worldview(os.path.join(CONTENT, "00-worldview.md")) if os.path.exists(os.path.join(CONTENT, "00-worldview.md")) else []

    data = {
        "work": work,
        "story": story,
        "characters": characters,
        "timeline": timeline,
        "worldview": worldview,
    }

    out = "window.WORK_DATA = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n"
    with open(os.path.join(HERE, "data.js"), "w", encoding="utf-8") as f:
        f.write(out)

    print("built: %d chapters, %d characters, %d timeline events, %d worldview entries"
          % (len(story), len(characters), len(timeline), len(worldview)))
    print("dialogue lines:", sum(len(s["lines"]) for c in story for s in c["scenes"]))
    missing = [c["title"] for c in story if not c["summary"]]
    if missing:
        print("WARNING chapters without summary:", ", ".join(missing), file=sys.stderr)


if __name__ == "__main__":
    main()
