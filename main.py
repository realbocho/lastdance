import os
from typing import List, Dict, Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import requests
from urllib.parse import quote
from dotenv import load_dotenv


load_dotenv()

NAVER_CLIENT_ID = os.getenv("NAVER_CLIENT_ID")
NAVER_CLIENT_SECRET = os.getenv("NAVER_CLIENT_SECRET")

if not NAVER_CLIENT_ID or not NAVER_CLIENT_SECRET:
    # Allow app to start; requests will fail with clear message
    pass


app = FastAPI(title="News Rivalry Visualizer", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.mount("/static", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "..", "static"), html=True), name="static")


def fetch_naver_news(query: str, display: int = 50) -> Dict[str, Any]:
    if not NAVER_CLIENT_ID or not NAVER_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="NAVER_CLIENT_ID or NAVER_CLIENT_SECRET not set in environment")

    url = f"https://openapi.naver.com/v1/search/news.json?query={quote(query)}&display={display}&start=1&sort=sim"
    headers = {
        "X-Naver-Client-Id": NAVER_CLIENT_ID,
        "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
    }
    response = requests.get(url, headers=headers, timeout=10)
    if response.status_code != 200:
        raise HTTPException(status_code=response.status_code, detail=f"Naver API error: {response.text}")
    return response.json()


BLUE_CHIPS: List[str] = [
    # Representative KOSPI blue-chips (normalize to simple keys)
    "삼성전자", "삼성", "SK하이닉스", "엘지", "LG전자", "LG에너지솔루션",
    "현대차", "기아", "현대모비스", "포스코홀딩스", "포스코퓨처엠",
    "셀트리온", "카카오", "네이버", "현대중공업", "두산", "한화",
    "KT", "KT&G", "삼성바이오로직스", "삼성SDI", "카카오뱅크",
]


def normalize_company(name: str) -> str:
    # Coalesce variants (e.g., 엘지/LG)
    if name.upper().startswith("LG") or "엘지" in name:
        return "엘지"
    if name.startswith("삼성전자") or name.startswith("삼성"):
        return "삼성"
    return name


def find_companies_in_text(text: str) -> List[str]:
    found: List[str] = []
    upper = text.upper()
    for comp in BLUE_CHIPS:
        if comp in text or (comp.upper().startswith("LG") and "LG" in upper):
            norm = normalize_company(comp)
            if norm not in found:
                found.append(norm)
    return found


def tag_companies(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    tagged: List[Dict[str, Any]] = []
    for it in items:
        title = it.get("title", "")
        description = it.get("description", "")
        link = it.get("link", "")
        pubDate = it.get("pubDate", "")

        text = f"{title} {description}".replace("<b>", "").replace("</b>", "")
        companies = find_companies_in_text(text)

        tagged.append({
            "title": title,
            "description": description,
            "link": link,
            "pubDate": pubDate,
            "companies": companies,
            "raw": text,
        })
    return tagged


def extract_relations(tagged: List[Dict[str, Any]]) -> Dict[str, Any]:
    # Heuristic extraction of chaser -> target around rivalry verbs
    verbs = ["추격", "맹추격", "쫓", "추월", "따라잡", "바짝", "격차"]
    relations: Dict[str, Dict[str, Any]] = {}

    def ensure_target(target: str):
        t = relations.setdefault(target, {"target": target, "chasers": {}})
        return t

    for art in tagged:
        text = art.get("raw", "")
        comps = art.get("companies", [])
        if len(comps) < 2:
            # If only one company mentioned, treat it as target with weak signal
            if comps:
                t = ensure_target(comps[0])
                ch = t["chasers"].setdefault("기타", {"score": 0, "articles": []})
                ch["score"] += 0.1
                ch["articles"].append(art)
            continue

        has_verb = any(v in text for v in verbs)
        # Simple proximity-based guess: earlier mention tends to be chaser, later is target when verbs like 추격 appear
        if has_verb:
            # Try pairwise mapping
            first, second = comps[0], comps[1]
            # If contains 추월/따라잡 - first chases and overtakes second
            if "추월" in text or "따라잡" in text:
                chaser, target = first, second
            elif "추격" in text or "맹추격" in text or "쫓" in text or "바짝" in text:
                chaser, target = first, second
            elif "격차" in text:
                # Gap mentioned; treat second as leader
                chaser, target = first, second
            else:
                chaser, target = first, second
        else:
            # No explicit verb; treat first as leader, second as chaser weakly
            target, chaser = comps[0], comps[1]

        t = ensure_target(target)
        bucket = t["chasers"].setdefault(chaser, {"score": 0, "articles": []})
        # Score heuristic: more verbs → higher score
        score_add = 1.0 if has_verb else 0.3
        bucket["score"] += score_add
        bucket["articles"].append(art)

    # Also compute positions per company for quick single-track viz fallback
    flat_counts: Dict[str, int] = {}
    for t_name, t_data in relations.items():
        for c_name, c_data in t_data["chasers"].items():
            if c_name == "기타":
                continue
            flat_counts[c_name] = flat_counts.get(c_name, 0) + int(c_data["score"])  # coarse

    # Normalize a simple 0..1 position per company relative to max
    max_cnt = max(flat_counts.values()) if flat_counts else 1
    positions = {k: max(0.6, min(0.98, 0.6 + (v / max_cnt) * 0.35)) for k, v in flat_counts.items()}

    return {"relations": relations, "positions": positions}


@app.get("/api/news")
def get_news(query: str = "게섰거라", display: int = 50):
    data = fetch_naver_news(query=query, display=display)
    items = data.get("items", [])
    tagged = tag_companies(items)
    graph = extract_relations(tagged)

    return {
        "query": query,
        "relations": graph["relations"],
        "positions": graph["positions"],
        "articles": tagged,
    }


@app.get("/")
def root_index():
    # Serve the SPA index
    static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
    index_path = os.path.abspath(os.path.join(static_dir, "index.html"))
    return FileResponse(index_path)


