# HumanGo

카메라로 친구를 비추고 캡처볼을 던져 잡는 AR 웹게임. 잡힌 친구는 얼굴만 따서 치비 캐릭터로 도감에 등록된다.
설계 문서: `PLAN.md` (Downloads). 게임 이름/볼 이름/수치는 `lib/constants.ts` 에서 바꾼다.

## 노트북 데모 (Supabase 불필요)

```bash
npm install
npm run demo      # http://localhost:3000
```

웹캠을 허용하고 "잡으러 가기" → 화면 아래 볼을 마우스로 잡고 사람 쪽으로 위로 휙 끌었다 놓으면 던져진다.
등록한 캐릭터는 이 브라우저(IndexedDB)에만 저장된다. 카메라 없이 보려면 `/capture?fake` (`public/dev-test/people.jpg` 필요).

## 시작하기

```bash
npm install          # postinstall 이 MediaPipe wasm, OpenCV.js 를 public/ 으로 복사한다
cp .env.local.example .env.local   # Supabase 값을 채운다
npm run dev
```

폰으로 로컬 테스트할 때 카메라는 https 에서만 동작하므로 `npx next dev --experimental-https` 를 쓰거나 Vercel 프리뷰로 확인한다.

## Supabase 설정 (로그인/도감 저장)

로그인(이메일+비밀번호, 닉네임 가입)은 Supabase Auth 로 이미 구현돼 있다. 아래만 설정하면 동작한다.

1. https://supabase.com 에서 프로젝트를 만든다.
2. `Project Settings > API` 에서 아래 값을 `.env.local` 에 넣는다.
   - `NEXT_PUBLIC_SUPABASE_URL` — Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon(public) key
   - `SUPABASE_SERVICE_ROLE_KEY` — service_role key (등급 뽑기 서버용, **절대 공개 금지**)
3. SQL Editor 에서 `supabase/migrations/` 의 파일을 번호 순서대로 실행한다. (`0001` → `0002` → `0004`)
4. `Authentication > Providers > Email` 에서 **Confirm email 을 끈다.** (켜져 있으면 가입 직후 로그인이 되지 않는다)
5. (선택) 외부인 가입 차단: `SIGNUP_CODE` 를 넣으면 가입 시 코드를 입력해야 한다. 서버에서만 검증된다.
6. `npm run dev` → `/signup` 에서 가입하면 바로 `/home` 으로 들어간다.

## Vercel 배포

1. 코드를 GitHub 에 올린다. (`.env.local` 은 `.gitignore` 에 있어 올라가지 않는다)
2. https://vercel.com → `Add New > Project` → 저장소 선택. 프레임워크는 Next.js 로 자동 인식된다.
3. `Environment Variables` 에 넣는다:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `OPENAI_API_KEY`(전설/신화 AI 변신, 선택), `SIGNUP_CODE`(선택)
4. Deploy. 배포 주소(`https://xxx.vercel.app`)는 https 라서 폰 카메라가 바로 동작한다.
5. Supabase `Authentication > URL Configuration` 의 Site URL 을 배포 주소로 바꾼다.

이후 `main` 에 push 하면 자동으로 다시 배포된다. CLI 로 하려면 `npx vercel` (프리뷰) / `npx vercel --prod`.
실기기에서 FPS/감지 인원을 보려면 캡처 화면 주소 뒤에 `?debug` 를 붙인다. (`/capture?debug`)

## 개발 전용 도구

프로덕션 빌드에서는 모두 동작하지 않는다.

| 도구 | 용도 |
| --- | --- |
| `DEV_BYPASS_AUTH=1 npm run dev` | Supabase 없이 로그인 검사를 건너뛰고 화면/카메라 흐름만 점검 |
| `/capture?fake` | 카메라 대신 `public/dev-test/people.jpg` 를 영상으로 사용 (사진은 직접 넣는다. git 에 올리지 않음) |
| `/dev/pipeline` | 정지 사진으로 분할, 컷아웃, 배경 채우기, 얼굴, 치비 합성을 단계별 시간과 함께 점검 |
| `?cpu` (pipeline 페이지) | GPU 대신 CPU 델리게이트 강제 |

## 테스트

```bash
npm test      # 던지기 물리/명중 판정, 마스크 처리, 희귀도 분포
npm run lint
```

## 구조 메모

- `proxy.ts` — Next 16 에서 middleware 의 새 이름. 비로그인 사용자를 `/login` 으로 보낸다.
- `lib/vision/` — 분할(segmenter), 정지 프레임 처리(capture), 배경 채우기(inpaint), 얼굴(face)
- `lib/game/` — 던지기(throw), 포획 연출(captureAnimation), 치비 합성(chibi), 등록(upload)
- `scripts/gen-bodies.py` — 몸통 SVG 6종과 `lib/game/bodies.json` 을 생성한다

## 셀프호스팅 서버 / 자동 배포

이 저장소는 Windows PC 한 대에서 Supabase(WSL2 + Docker)와 앱을 함께 돌리는 구성도 지원한다.

- `scripts/start-server.ps1` — 로그온 시 Supabase, 앱, 게이트웨이, Cloudflare Tunnel, 자동 배포 루프를 시작한다.
- `scripts/gateway.mjs` — 공개 포트 하나(`/` 앱, `/sb` Supabase)와 트래픽 집계. 집계는 `127.0.0.1:8081/stats` 로만 노출된다.
- `NEXT_PUBLIC_SUPABASE_PROXY_PATH=/sb` 를 `.env.local` 에 두면 브라우저는 현재 접속 주소 + `/sb` 로 Supabase 에 접속한다.
- `ADMIN_EMAILS=a@x.com,b@x.com` 에 적힌 계정만 `/admin`(가입자/포획 수, 트래픽, 서버 부하)에 들어갈 수 있다.

### 자동 배포

`scripts/auto-deploy-loop.ps1` 이 1분마다 `scripts/deploy-once.ps1` 을 실행한다. 설정 파일 `C:\Users\Owner\humango-deploy.json` 의 `branch` 에 새 커밋이 생기면:

1. DB 를 `D:\backups\db` 에 백업한다 (최근 14개 보관). 코드 배포는 DB 와 업로드 파일을 건드리지 않는다.
2. 코드를 받고 `package-lock.json` 이 바뀐 경우에만 `npm ci` 를 한다.
3. 빌드한다. 실패하면 이전 커밋으로 되돌린다.
4. `supabase/migrations/*.sql` 중 아직 적용되지 않은 파일을 순서대로 적용한다 (`public._app_migrations` 에 기록). 실패하면 이전 커밋으로 되돌린다.
5. 앱을 재시작하고 `/login` 이 200 을 주는지 확인한다. 실패하면 이전 커밋으로 되돌린다.

로그는 `C:\Users\Owner\humango-logs\deploy.log`. 서버 PC 의 작업 폴더에 커밋하지 않은 변경이 있으면 배포하지 않고 건너뛴다.
