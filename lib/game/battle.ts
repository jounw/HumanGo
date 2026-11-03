// 턴제 배틀 엔진. 순수 함수라 서버(API)에서만 호출하고 테스트하기 쉽다.
// rng 는 [0,1) 난수 함수. 서버에서는 secureRng 를 넘긴다.
import type { Rarity } from "@/lib/constants";
import type { Stats } from "./stats";

export const TURN_SECONDS = 45;
export const MAX_IDLE_TURNS = 3; // 연속으로 시간 초과가 이만큼 쌓이면 몰수패
export const MAX_TEAM = 3;
export const LOG_LIMIT = 40;

export type Fighter = {
  captureId: string;
  name: string;
  rarity: Rarity;
  stats: Stats;
  hp: number;
};

export type Side = {
  userId: string;
  team: Fighter[];
  active: number;
  guard: boolean;
  idle: number;
};

export type LogEntry = { actor: 0 | 1; text: string };

export type BattleState = {
  sides: [Side, Side];
  turn: 0 | 1;
  turnNo: number;
  winner: 0 | 1 | null;
  log: LogEntry[];
};

export type Move =
  | { type: "attack" }
  | { type: "heavy" }
  | { type: "guard" }
  | { type: "switch"; index: number };

export const MOVE_INFO = {
  attack: { label: "공격", desc: "명중 95%", acc: 0.95, mult: 1 },
  heavy: { label: "강타", desc: "명중 70% · 1.8배", acc: 0.7, mult: 1.8 },
  guard: { label: "방어", desc: "받는 피해 60% 감소 · 체력 10% 회복", acc: 1, mult: 0 },
} as const;

const CRIT_CHANCE = 0.08;
const CRIT_MULT = 1.5;
const GUARD_REDUCTION = 0.4; // 방어 중 받는 피해 배율
const GUARD_HEAL = 0.1;

export type FighterInput = Omit<Fighter, "hp">;

export function initBattle(
  a: { userId: string; team: FighterInput[] },
  b: { userId: string; team: FighterInput[] },
): BattleState {
  const mk = (s: { userId: string; team: FighterInput[] }): Side => ({
    userId: s.userId,
    team: s.team.map((f) => ({ ...f, hp: f.stats.hp })),
    active: 0,
    guard: false,
    idle: 0,
  });
  const sides: [Side, Side] = [mk(a), mk(b)];
  const spd = (s: Side) => s.team[0].stats.spd;
  return {
    sides,
    turn: spd(sides[1]) > spd(sides[0]) ? 1 : 0,
    turnNo: 1,
    winner: null,
    log: [{ actor: 0, text: "배틀 시작!" }],
  };
}

export function validateMove(state: BattleState, move: Move): string | null {
  if (state.winner !== null) return "이미 끝난 배틀이에요.";
  const side = state.sides[state.turn];
  if (move.type === "switch") {
    const f = side.team[move.index];
    if (!Number.isInteger(move.index) || !f) return "잘못된 교체 대상이에요.";
    if (move.index === side.active) return "이미 싸우고 있는 캐릭터예요.";
    if (f.hp <= 0) return "쓰러진 캐릭터는 내보낼 수 없어요.";
    return null;
  }
  if (move.type === "attack" || move.type === "heavy" || move.type === "guard")
    return null;
  return "알 수 없는 행동이에요.";
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export function damageOf(
  atk: number,
  def: number,
  mult: number,
  variance: number, // 0.9 ~ 1.1
): number {
  return Math.max(1, Math.round(atk * mult * (40 / (40 + def)) * variance));
}

/** 현재 턴 사람이 move 를 실행한 새 상태를 돌려준다. (검증은 validateMove 로 먼저) */
export function applyMove(
  prev: BattleState,
  move: Move,
  rng: () => number,
  opts: { idle?: boolean } = {},
): BattleState {
  const s = clone(prev);
  const actor = s.turn;
  const foe = (1 - actor) as 0 | 1;
  const me = s.sides[actor];
  const other = s.sides[foe];
  const push = (text: string) => s.log.push({ actor, text });

  me.guard = false;
  me.idle = opts.idle ? me.idle + 1 : 0;
  const mine = me.team[me.active];
  const target = other.team[other.active];

  if (move.type === "switch") {
    me.active = move.index;
    push(`${me.team[me.active].name}, 나와라!`);
  } else if (move.type === "guard") {
    me.guard = true;
    const heal = Math.min(
      mine.stats.hp - mine.hp,
      Math.round(mine.stats.hp * GUARD_HEAL),
    );
    mine.hp += heal;
    push(`${mine.name}, 방어 자세!${heal ? ` (+${heal})` : ""}`);
  } else {
    const info = MOVE_INFO[move.type];
    if (rng() >= info.acc) {
      push(`${mine.name}의 ${info.label}! 하지만 빗나갔다.`);
    } else {
      const crit = rng() < CRIT_CHANCE;
      let dmg = damageOf(
        mine.stats.atk,
        target.stats.def,
        info.mult * (crit ? CRIT_MULT : 1),
        0.9 + rng() * 0.2,
      );
      if (other.guard) dmg = Math.max(1, Math.round(dmg * GUARD_REDUCTION));
      target.hp = Math.max(0, target.hp - dmg);
      push(
        `${mine.name}의 ${info.label}! ${target.name}에게 ${dmg} 피해${crit ? " (급소!)" : ""}${other.guard ? " (방어됨)" : ""}`,
      );
      if (target.hp <= 0) {
        push(`${target.name} 쓰러짐!`);
        const next = other.team.findIndex((f) => f.hp > 0);
        if (next === -1) s.winner = actor;
        else {
          other.active = next;
          other.guard = false;
          push(`${other.team[next].name}, 등장!`);
        }
      }
    }
  }

  if (s.winner === null && me.idle >= MAX_IDLE_TURNS) {
    s.winner = foe;
    push(`${MAX_IDLE_TURNS}턴 연속 응답이 없어 몰수패 처리됐다.`);
  }
  if (s.winner === null) {
    s.turn = foe;
    s.turnNo += 1;
  }
  if (s.log.length > LOG_LIMIT) s.log = s.log.slice(-LOG_LIMIT);
  return s;
}

/** 항복. 상대가 승리한다. */
export function resign(prev: BattleState, side: 0 | 1): BattleState {
  const s = clone(prev);
  s.winner = (1 - side) as 0 | 1;
  s.log.push({ actor: side, text: "항복했다." });
  if (s.log.length > LOG_LIMIT) s.log = s.log.slice(-LOG_LIMIT);
  return s;
}
