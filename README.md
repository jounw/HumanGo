# 휴먼GO

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

## Supabase 설정

1. 프로젝트를 만들고 `Project Settings > API` 의 URL 과 anon key 를 `.env.local` 에 넣는다.
2. SQL Editor 에서 `supabase/migrations/0001_init.sql` 을 실행한다. (테이블, RLS, 가입 시 프로필 자동 생성 트리거, `captures` 비공개 버킷과 정책)
3. `Authentication > Providers > Email` 에서 **Confirm email 을 끈다.** (켜져 있으면 가입 직후 로그인이 되지 않는다)
4. (선택) 외부인 가입 차단: `.env.local` / Vercel 환경변수에 `SIGNUP_CODE` 를 넣으면 가입 시 코드를 입력해야 한다. 서버에서만 검증되며 클라이언트에 노출되지 않는다.

## Vercel 배포

환경변수 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SIGNUP_CODE`(선택)를 넣고 배포한다.
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
