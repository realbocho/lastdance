## 뉴스 크롤링 · 기업 관계 시각화 (FastAPI + D3)

네이버 뉴스에서 `게섰거라` 검색 결과를 불러와 다수의 우량주(삼성, 엘지, SK하이닉스 등)를 리더(결승선)로 세우고, 기사 문맥의 추격 신호(추격/맹추격/추월/따라잡 등)를 바탕으로 "어떤 기업이 어떤 기업을 추격하는지"를 추출해 수직 트랙(출발선→결승선)으로 시각화합니다. 기업 또는 관계를 클릭하면 근거 기사 링크와 스니펫이 표시됩니다.

### 1) 사전 준비 (.env)

프로젝트 루트(`D:\`)에 `.env` 파일을 직접 만들어 아래 내용을 넣어주세요:

```
NAVER_CLIENT_ID=rBDXNTYJM1R6x7gFJHaj
NAVER_CLIENT_SECRET=kWzeafDcJV
PORT=8000
```

Windows 환경에서 루트의 숨김 파일 생성이 어려우면, PowerShell 관리자 권한 또는 메모장으로 생성해 저장하세요. (파일명 `.env`)

### 2) 의존성 설치

PowerShell에서 프로젝트 루트(`D:\`) 기준:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 3) 서버 실행

```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

브라우저에서 `http://localhost:8000/` 접속.

### 4) 웹사이트 배포 (Docker)

로컬/서버 어디서나 동일하게 실행 가능합니다.

1) `.env`에 키 설정 또는 환경변수로 전달
2) Docker로 실행

```bash
docker build -t news-viz .
docker run --rm -p 8000:8000 \
  -e NAVER_CLIENT_ID=YOUR_ID \
  -e NAVER_CLIENT_SECRET=YOUR_SECRET \
  news-viz
```

Compose 사용 시(권장):

```bash
set NAVER_CLIENT_ID=YOUR_ID
set NAVER_CLIENT_SECRET=YOUR_SECRET
docker compose up --build
```

배포 후 웹사이트 주소: `http://<서버IP>:8000/`

### 기능
- 상단 입력창에서 검색어(기본: 게섰거라)로 네이버 뉴스 검색
- 시각화: 여러 우량주 리더별 수직 트랙 생성, 추격 기업 노드 애니메이션 표시
- 리더명(결승선 영역) 또는 추격 기업 노드를 클릭하면 해당 관계의 근거 기사 리스트 표시

### API
- `GET /api/news?query=게섰거라`
  - `relations`: `{ [target]: { chasers: { [company]: { score, articles[] } } } }`
  - `articles`: 원문 기사 배열(태그된 기업 포함)
  - `positions`: 관계 전반의 단순 요약 포지션(내부 사용)

### 참고
- `.env`가 없으면 API 호출 시 500 에러가 발생합니다.
- 관계 추출은 휴리스틱 기반(키워드, 기업명 근접도)으로 동작합니다. 정확도를 높이려면 기업 사전 확장 및 형태소 분석기 연동을 고려하세요.


