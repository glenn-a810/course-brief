#!/usr/bin/env python3
"""공지 아이템 키 정규화 (2026-11-27)

`briefing.notices.items` 중 일부가 표준 `title`/`date` 대신 `text`/`as_of` 키를
쓰고 있어 웹에서 공지가 노출되지 않던 24건(18곳)을 표준 스키마로 맞춘다.

- text  -> title
- as_of -> date
- 비표준 `type` 키는 제거(표준 아이템은 date/title/url 3키)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "data" / "source" / "golf_courses_all_v29.json"


def main() -> int:
    raw = SRC.read_text(encoding="utf-8")
    data = json.loads(raw)
    converted = 0
    courses = set()
    for course in data.get("courses", []):
        notices = (course.get("briefing") or {}).get("notices") or {}
        items = notices.get("items") or []
        for idx, item in enumerate(items):
            if not isinstance(item, dict):
                continue
            if "text" not in item and "as_of" not in item:
                continue
            norm = {}
            date = item.get("date") or item.get("as_of")
            title = item.get("title") or item.get("text")
            if date:
                norm["date"] = date
            if title:
                norm["title"] = title
            if item.get("url"):
                norm["url"] = item["url"]
            items[idx] = norm
            converted += 1
            courses.add(course["course_id"])
    out = json.dumps(data, ensure_ascii=False, indent=1)
    SRC.write_text(out, encoding="utf-8")
    print(f"normalized {converted} notice items across {len(courses)} courses")
    return 0


if __name__ == "__main__":
    sys.exit(main())
