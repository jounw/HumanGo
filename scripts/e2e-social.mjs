// 친구/배틀 API 종단 테스트. 로컬 Supabase + `npm start` 가 떠 있어야 한다.
// 사용: node --env-file=.env.local scripts/e2e-social.mjs
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = process.env.APP_URL ?? "http://localhost:3000";
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const tag = Date.now().toString(36);

let failed = 0;
const ok = (c, m) => {
  console.log(`${c ? "PASS" : "FAIL"} ${m}`);
  if (!c) failed++;
};

async function makeUser(name) {
  const email = `${name}-${tag}@e2e.test`;
  const password = "Passw0rd!e2e";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nickname: `${name}${tag}`.slice(0, 12) },
  });
  if (error) throw error;
  const c = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data: s, error: e2 } = await c.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  const value =
    "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  return {
    id: data.user.id,
    client: c,
    cookie: `sb-humango-auth-token=${value}`,
  };
}

const api = (u, path, body) =>
  fetch(APP + path, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: u.cookie },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));

async function giveCaptures(u, n, rarity) {
  const ids = [];
  for (let i = 0; i < n; i++) {
    const id = crypto.randomUUID();
    const { error } = await admin.from("captures").insert({
      id,
      owner_id: u.id,
      name: `c${i}`,
      character_path: `${u.id}/${id}/c.png`,
      face_path: `${u.id}/${id}/f.png`,
      body_template: "basic",
      rarity,
    });
    if (error) throw error;
    ids.push(id);
  }
  return ids;
}

const a = await makeUser("alice");
const b = await makeUser("bob");
const outsider = await makeUser("carol");
ok(true, "사용자 3명 생성/로그인");

// ---- 친구
let r = await api(a, "/api/friends", { action: "request", userId: a.id });
ok(r.status === 400, "자기 자신에게 요청 불가");
r = await api(a, "/api/battle", { friendId: b.id, team: [] });
ok(r.status === 403, "친구 아니면 배틀 신청 불가");
r = await api(a, "/api/friends", { action: "request", userId: b.id });
ok(r.status === 200, "친구 요청");
r = await api(a, "/api/friends", { action: "request", userId: b.id });
ok(r.status === 409, "중복 요청 거절");
const { data: rows } = await b.client.from("friendships").select("*");
ok(rows?.length === 1 && rows[0].status === "pending", "받는 쪽이 RLS 로 요청을 조회");
const { data: none } = await outsider.client.from("friendships").select("*");
ok(none?.length === 0, "제3자는 친구 요청 조회 불가");
r = await api(a, "/api/friends", { action: "accept", id: rows[0].id });
ok(r.status === 400, "요청 보낸 사람은 수락 불가");
r = await api(b, "/api/friends", { action: "accept", id: rows[0].id });
ok(r.status === 200, "수락");

// ---- 배틀
const ta = await giveCaptures(a, 3, "epic");
const tb = await giveCaptures(b, 2, "common");
r = await api(a, "/api/battle", { friendId: b.id, team: [tb[0]] });
ok(r.status === 400, "남의 캐릭터로 팀 구성 불가");
r = await api(a, "/api/battle", { friendId: b.id, team: ta });
ok(r.status === 200 && r.json.id, "배틀 신청");
const bid = r.json.id;
r = await api(a, "/api/battle", { friendId: b.id, team: ta });
ok(r.status === 409, "동시에 두 배틀 불가");
r = await api(a, `/api/battle/${bid}`, { action: "accept", team: ta });
ok(r.status === 400, "신청자 본인은 수락 불가");
r = await api(outsider, `/api/battle/${bid}`, { action: "cancel" });
ok(r.status === 404, "제3자는 배틀 접근 불가");
r = await api(b, `/api/battle/${bid}`, { action: "accept", team: tb });
ok(r.status === 200, "상대 수락 → 배틀 시작");

let { data: battle } = await admin.from("battles").select("*").eq("id", bid).single();
ok(battle.status === "active" && battle.state?.sides?.length === 2, "상태 생성");
const users = { [a.id]: a, [b.id]: b };
r = await api(users[battle.state.sides[1 - battle.state.turn].userId], `/api/battle/${bid}`, {
  action: "move",
  move: { type: "attack" },
});
ok(r.status === 400, "내 차례가 아니면 행동 불가");
r = await api(a, `/api/battle/${bid}`, { action: "timeout" });
ok(r.status === 400, "시간이 남았으면 timeout 불가");

for (let i = 0; i < 200; i++) {
  ({ data: battle } = await admin.from("battles").select("*").eq("id", bid).single());
  if (battle.status === "finished") break;
  const u = users[battle.state.sides[battle.state.turn].userId];
  r = await api(u, `/api/battle/${bid}`, { action: "move", move: { type: "attack" } });
  if (r.status !== 200) {
    console.log("move failed", r);
    break;
  }
}
ok(battle.status === "finished" && battle.winner_id, "배틀 종료");
const loser = battle.winner_id === a.id ? b : a;
const { data: ratings } = await admin
  .from("player_ratings")
  .select("*")
  .in("user_id", [a.id, b.id]);
const w = ratings.find((x) => x.user_id === battle.winner_id);
const l = ratings.find((x) => x.user_id === loser.id);
ok(w?.rating > 1000 && l?.rating < 1000, `ELO 정산 (승 ${w?.rating} / 패 ${l?.rating})`);
ok(w?.wins === 1 && l?.losses === 1, "전적 기록");
ok(
  battle.challenger_rating_change != null && battle.opponent_rating_change != null,
  "배틀에 레이팅 변화 기록",
);
r = await api(a, `/api/battle/${bid}`, { action: "move", move: { type: "attack" } });
ok(r.status === 400, "끝난 배틀에는 행동 불가");

// Realtime: 구독 후 업데이트가 전달되는지
const got = await new Promise((resolve) => {
  const ch = b.client
    .channel("t")
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "battles" }, (p) => {
      resolve(p.new.id);
    })
    .subscribe(async (st) => {
      if (st === "SUBSCRIBED") {
        await new Promise((x) => setTimeout(x, 800));
        await admin.from("battles").update({ updated_at: new Date().toISOString() }).eq("id", bid);
      }
    });
  setTimeout(() => resolve(null), 8000);
});
ok(got === bid, "Realtime 이 참가자에게 변경을 전달");

// 정리
for (const u of [a, b, outsider]) await admin.auth.admin.deleteUser(u.id);
console.log(failed ? `\n${failed}개 실패` : "\n모두 통과");
process.exit(failed ? 1 : 0);
