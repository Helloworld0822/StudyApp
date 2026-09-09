# 오늘의 공부 · StudyApp

수학·영어·국어·이산수학·알고리즘을 공부하는 한국어 웹 앱입니다. 기본 54문항, 모든 문제는 5지선다이며 한 번에 최대 5문제를 풉니다. 채점·해설·학습 기록·오답 복습, 웹 문제 미리보기와 저장, AI 추가 해설과 유사 문제 생성을 지원합니다.

## 실행

Node.js와 npm, Rust stable이 필요합니다. 터미널 두 개에서 실행합니다.

```bash
cd backend
cargo run
```

```bash
cd frontend
npm ci
npm run dev
```

[앱 열기](http://localhost:5173). Vite가 `/api` 요청을 로컬 백엔드(3000번 포트)에 전달합니다. 기본 문제 풀이에는 서버나 로그인이 필요하지 않습니다. 학습 기록과 추가 문제 최대 500개는 현재 브라우저에만 저장됩니다. 브라우저 데이터를 지우면 사라지며 기기 간 동기화되지 않습니다.

## AI 연결

API 키는 **백엔드 환경변수**로만 설정합니다. 프론트엔드 코드나 `VITE_` 변수에 넣지 마세요. `backend/.env.example`에 설정 예시가 있습니다. `.env`는 자동으로 로드하지 않습니다.

```bash
cd backend
read -rsp 'OpenAI API key: ' OPENAI_API_KEY
export OPENAI_API_KEY
export AI_MODEL=gpt-4.1-mini
cargo run
```

기본 제공자는 OpenAI입니다. 선택적으로 `AI_BASE_URL`을 OpenAI 호환 API의 `/v1` 주소로 설정할 수 있습니다. Chat Completions와 strict JSON Schema 응답을 지원하는 모델이 필요합니다. 외부 서버는 HTTPS, 로컬 개발 서버는 loopback HTTP를 허용합니다.

정답 확인 후 **AI 추가 해설** 또는 **5지선다 유사 문제 만들기**를 누릅니다. 현재 문제와 선택한 답이 제공자에게 전송되며 API 요금이 발생할 수 있습니다. 생성 문제는 정답·해설을 확인한 뒤 명시적으로 저장합니다. AI 답변은 정확성을 보장하지 않습니다. 키가 없으면 기본 학습은 정상 작동하고 AI 버튼만 비활성화됩니다.

## 웹 수집 범위와 제한

홈에서 공개 HTTPS 문제 페이지 URL과 과목을 선택합니다. 5개의 서로 다른 선택지와 명시적 정답이 있는 HTML 본문(A~E 또는 ①~⑤) 및 JSON-LD Question/Quiz를 추출합니다. 최대 30문제를 미리 보고 출처와 함께 저장합니다. 출처·과목·내용 기반 ID로 재수집 중복을 방지합니다.

로그인, PDF·이미지 OCR, JavaScript 전용 렌더링, 일반 교재 본문에서 자동 문제 생성은 지원하지 않습니다. 임의의 사이트에서 항상 추출된다는 의미가 아닙니다. robots.txt를 확인하고 사설 IP 접근, 리디렉션 및 응답 크기·시간을 제한합니다. 이용 허락과 저작권은 별도로 확인해야 합니다.

| 요청한 사이트 | 현재 앱에서의 범위 |
| --- | --- |
| [AI Hub](https://www.aihub.or.kr/devsport/apishell/list.do) | 데이터별 신청·승인 및 API 키가 필요한 공식 다운로드 연동은 미구현입니다. |
| [Project Euclid](https://projecteuclid.org) | 공개 HTML 중 지원 형식만 대상입니다. 논문 PDF, 구독·접근 제한 자료는 지원하지 않습니다. |
| [OpenStax](https://openstax.org) | 공개 HTML이라도 명시적 5지선다와 정답이 있어야 추출됩니다. 책별 이용허락을 확인해야 합니다. |
| [Project Gutenberg](https://www.gutenberg.org/policy/robot_access.html) | 일반 웹사이트 자동 수집을 허용하지 않아 직접 수집을 거절합니다. 공식 harvest·미러·카탈로그 연동은 미구현입니다. |

이 네 사이트 전체를 수집하는 전용 커넥터는 아닙니다. 원문 이용 조건을 우회하지 않습니다.

## 검증 및 배포

```bash
cd backend
cargo test
cargo clippy --all-targets -- -D warnings
cd ../frontend
npm run lint
npm run build
# 프론트엔드·백엔드 실행 후 브라우저 회귀 검사
npx playwright install chromium
npx playwright test
```

브라우저 검사는 기본 학습·복습·저장과 모의 응답 기반 수집·AI UI를 확인합니다. 백엔드 AI 검사는 로컬 모의 제공자를 사용하므로 실제 유료 API 호출 검증과는 다릅니다. 정적 배포 파일은 `frontend/dist/`에 생성됩니다. 배포 시 `/api` 역방향 프록시를 구성해야 합니다. 개인 로컬 학습용이며 공개 배포 전에 인증·사용량 제한을 추가하세요.
