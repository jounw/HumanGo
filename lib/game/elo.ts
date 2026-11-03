export const ELO_START = 1000;
export const ELO_K = 32;

/** a 가 b 를 이길 기대 확률 */
export function expectedScore(a: number, b: number) {
  return 1 / (1 + 10 ** ((b - a) / 400));
}

/** 승자/패자 레이팅 변화량(양수). 승자는 +delta, 패자는 -delta. 레이팅은 0 미만으로 내려가지 않는다. */
export function eloResult(winner: number, loser: number) {
  const delta = Math.max(1, Math.round(ELO_K * (1 - expectedScore(winner, loser))));
  return {
    winner: winner + delta,
    loser: Math.max(0, loser - delta),
    delta,
    loserDelta: Math.min(delta, loser),
  };
}
