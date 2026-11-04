// 서버가 등급을 뽑아 줄지 판단하는 규칙. 순수 함수라 테스트하기 쉽다.
//
// 서버는 "진짜로 사람을 잡았는지"는 알 수 없다. 그래서 등급을 뽑는 쪽(서버)이 난수를 쥔다.
// 잡는 횟수 제한은 없다. 단, 방금 뽑고 아직 쓰지 않은 뽑기는 새로고침/중복 호출 때 그대로 돌려준다.

export const REUSE_WINDOW_MS = 20_000; // 아직 쓰지 않은 뽑기가 이 시간 안이면 새로 뽑지 않고 그대로 돌려준다
export const ROLL_TTL_MS = 30 * 60_000; // 뽑은 뒤 이 시간 안에 등록해야 한다 (SQL 트리거와 같은 값)

export type RollRow = {
  id: string;
  rarity: string;
  used: boolean;
  created_at: string;
};

export type RollDecision =
  { action: "reuse"; roll: RollRow } | { action: "new" };

/** rolls: 이 사용자의 최근 1시간 뽑기. 최신순이든 아니든 상관없다. */
export function decideRoll(rolls: RollRow[], now: number): RollDecision {
  const latest = [...rolls].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  )[0];
  if (
    latest &&
    !latest.used &&
    now - Date.parse(latest.created_at) < REUSE_WINDOW_MS
  )
    return { action: "reuse", roll: latest };
  return { action: "new" };
}

/** 암호학적으로 안전한 [0,1) 난수 (서버에서 등급을 뽑을 때 Math.random 대신 사용) */
export function secureRng(): () => number {
  return () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
}
