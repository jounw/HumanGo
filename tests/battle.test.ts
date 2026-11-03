import test from "node:test";
import assert from "node:assert/strict";
import {
  applyMove,
  initBattle,
  MAX_IDLE_TURNS,
  resign,
  validateMove,
  type FighterInput,
} from "../lib/game/battle";
import { eloResult, expectedScore } from "../lib/game/elo";
import { RARITY_ORDER } from "../lib/game/rarity";
import { statsFor } from "../lib/game/stats";

const fighter = (id: string, atk = 30, hp = 50, spd = 10): FighterInput => ({
  captureId: id,
  name: id,
  rarity: "common",
  stats: { hp, atk, def: 10, spd },
});
const always = (v: number) => () => v;

test("능력치는 같은 id 면 항상 같고, 희귀도가 높을수록 평균이 높다", () => {
  assert.deepEqual(statsFor("abc", "rare"), statsFor("abc", "rare"));
  const avg = (r: (typeof RARITY_ORDER)[number]) => {
    let sum = 0;
    for (let i = 0; i < 200; i++) {
      const s = statsFor(`id-${i}`, r);
      sum += s.hp + s.atk + s.def + s.spd;
    }
    return sum / 200;
  };
  for (let i = 1; i < RARITY_ORDER.length; i++)
    assert.ok(avg(RARITY_ORDER[i]) > avg(RARITY_ORDER[i - 1]));
});

test("속도가 빠른 쪽이 선공한다 (동률이면 도전자)", () => {
  const slow = { userId: "a", team: [fighter("a1", 30, 50, 5)] };
  const fast = { userId: "b", team: [fighter("b1", 30, 50, 20)] };
  assert.equal(initBattle(slow, fast).turn, 1);
  assert.equal(initBattle(slow, { ...slow, userId: "c" }).turn, 0);
});

test("공격하면 피해가 들어가고 턴이 넘어간다", () => {
  const s = initBattle(
    { userId: "a", team: [fighter("a1")] },
    { userId: "b", team: [fighter("b1", 30, 50, 1)] },
  );
  const n = applyMove(s, { type: "attack" }, always(0.5));
  assert.ok(n.sides[1].team[0].hp < 50);
  assert.equal(n.turn, 1);
  assert.equal(s.sides[1].team[0].hp, 50, "원본은 바뀌지 않는다");
});

test("명중 판정 실패 시 피해가 없다", () => {
  const s = initBattle(
    { userId: "a", team: [fighter("a1")] },
    { userId: "b", team: [fighter("b1", 30, 50, 1)] },
  );
  const n = applyMove(s, { type: "heavy" }, always(0.99));
  assert.equal(n.sides[1].team[0].hp, 50);
});

test("방어 중에는 받는 피해가 줄어든다", () => {
  const base = initBattle(
    { userId: "a", team: [fighter("a1", 30, 100, 1)] },
    { userId: "b", team: [fighter("b1", 30, 100, 20)] },
  );
  assert.equal(base.turn, 1);
  const guarded = applyMove(
    applyMove(base, { type: "guard" }, always(0.5)),
    { type: "attack" },
    always(0.5),
  );
  const open = applyMove(
    applyMove(base, { type: "attack" }, always(0.5)),
    { type: "attack" },
    always(0.5),
  );
  assert.ok(guarded.sides[1].team[0].hp > open.sides[1].team[0].hp);
});

test("쓰러지면 다음 캐릭터가 자동으로 나오고, 전멸하면 승패가 난다", () => {
  let s = initBattle(
    { userId: "a", team: [fighter("a1", 999)] },
    { userId: "b", team: [fighter("b1", 1, 10, 1), fighter("b2", 1, 10, 1)] },
  );
  s = applyMove(s, { type: "attack" }, always(0.5));
  assert.equal(s.sides[1].active, 1);
  assert.equal(s.winner, null);
  s = applyMove(s, { type: "attack" }, always(0.5)); // b 의 턴
  s = applyMove(s, { type: "attack" }, always(0.5));
  assert.equal(s.winner, 0);
  assert.equal(validateMove(s, { type: "attack" }), "이미 끝난 배틀이에요.");
});

test("교체 검증", () => {
  const s = initBattle(
    { userId: "a", team: [fighter("a1"), fighter("a2")] },
    { userId: "b", team: [fighter("b1", 30, 50, 1)] },
  );
  assert.ok(validateMove(s, { type: "switch", index: 0 }));
  assert.ok(validateMove(s, { type: "switch", index: 5 }));
  assert.equal(validateMove(s, { type: "switch", index: 1 }), null);
  const n = applyMove(s, { type: "switch", index: 1 }, always(0.5));
  assert.equal(n.sides[0].active, 1);
});

test("연속 시간 초과는 몰수패, 항복은 상대 승리", () => {
  let s = initBattle(
    { userId: "a", team: [fighter("a1", 1, 9999)] },
    { userId: "b", team: [fighter("b1", 1, 9999, 1)] },
  );
  for (let i = 0; i < MAX_IDLE_TURNS * 2 && s.winner === null; i++)
    s = applyMove(s, { type: "attack" }, always(0.5), {
      idle: s.turn === 0,
    });
  assert.equal(s.winner, 1);
  assert.equal(resign(initBattle(
    { userId: "a", team: [fighter("a1")] },
    { userId: "b", team: [fighter("b1")] },
  ), 0).winner, 1);
});

test("ELO: 약자가 이기면 더 많이 오른다, 합은 보존(0 미만 제외)", () => {
  assert.ok(Math.abs(expectedScore(1000, 1000) - 0.5) < 1e-9);
  const upset = eloResult(800, 1200);
  const normal = eloResult(1200, 800);
  assert.ok(upset.delta > normal.delta);
  assert.equal(upset.winner + upset.loser, 2000);
  assert.equal(eloResult(1000, 0).loser, 0);
});
