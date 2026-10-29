import Link from "next/link";
import ModelPreloader from "@/components/ModelPreloader";
import { GAME_NAME } from "@/lib/constants";
import { DEMO, DEMO_NICKNAME } from "@/lib/demo/store";

// 시작 화면: 로그인 여부와 관계없이 보이고, "Start" 는 /home 으로 간다.
// (비로그인이면 /home 에서 로그인 화면으로 보내진다)
export default function StartPage() {
  return (
    <main className="relative isolate flex min-h-dvh flex-col items-center justify-between overflow-hidden px-6 pt-[max(3rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))] text-center">
      <ModelPreloader />
      {/* 배경: 은은한 빛 번짐 + 반짝이는 점 */}
      <div aria-hidden className="start-bg absolute inset-0 -z-10" />
      <div aria-hidden className="absolute inset-0 -z-10">
        {STARS.map((s, i) => (
          <span
            key={i}
            className="start-star absolute rounded-full bg-white"
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: s.r,
              height: s.r,
              animationDelay: `${s.d}s`,
            }}
          />
        ))}
      </div>

      <p className="text-xs font-semibold tracking-[0.3em] text-emerald-300/90">
        AR FRIEND CATCHING GAME
      </p>

      <section className="flex flex-col items-center gap-8">
        <div className="start-orb relative grid size-44 place-items-center">
          <span
            aria-hidden
            className="start-ring absolute inset-0 rounded-full"
          />
          <span
            aria-hidden
            className="start-ring start-ring-2 absolute inset-0 rounded-full"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/ball/capture-ball.svg"
            alt="Capture ball"
            className="start-ball size-28 drop-shadow-[0_12px_30px_rgba(94,234,212,0.45)]"
          />
        </div>

        <div className="flex flex-col gap-3">
          <h1 className="text-6xl font-black tracking-tight">{GAME_NAME}</h1>
          <p className="text-xl font-semibold text-white/90">
            Catch your friends.
            <br />
            Keep the memories.
          </p>
          <p className="text-sm text-white/55">The school trip photo game</p>
        </div>
      </section>

      <div className="flex w-full max-w-xs flex-col items-center gap-3">
        <Link
          href="/home"
          className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-emerald-400 text-lg font-black text-black shadow-lg shadow-emerald-400/25 active:scale-[0.98]"
        >
          Start
        </Link>
        {DEMO ? (
          <p className="text-sm text-white/60">
            {DEMO_NICKNAME}님으로 시작해요
          </p>
        ) : (
          <p className="text-sm text-white/45">
            A photo game to play with your friends
          </p>
        )}
      </div>
    </main>
  );
}

// 별 위치는 고정값으로 두어 서버/클라이언트 렌더가 항상 같다
const STARS = [
  { x: 8, y: 12, r: 3, d: 0 },
  { x: 22, y: 30, r: 2, d: 1.1 },
  { x: 85, y: 10, r: 3, d: 0.6 },
  { x: 70, y: 26, r: 2, d: 1.7 },
  { x: 14, y: 62, r: 2, d: 0.3 },
  { x: 90, y: 58, r: 3, d: 1.3 },
  { x: 40, y: 8, r: 2, d: 2.1 },
  { x: 62, y: 72, r: 2, d: 0.9 },
  { x: 30, y: 82, r: 3, d: 1.9 },
  { x: 78, y: 88, r: 2, d: 0.4 },
];
