// 관리자 페이지 API 확인. 사용: node --env-file=.env.local scripts/e2e-admin.mjs
// 임시 관리자/일반 사용자를 만들어 접근 제어와 지표를 확인한 뒤 삭제한다.
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const APP = process.env.APP_URL ?? "http://localhost:8080";
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const adminEmail = process.env.ADMIN_EMAILS.split(",")[0].trim();
let failed = 0;
const ok = (c, m) => {
  console.log(`${c ? "PASS" : "FAIL"} ${m}`);
  if (!c) failed++;
};

async function user(email, nick) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "Passw0rd!e2e",
    email_confirm: true,
    user_metadata: { nickname: nick },
  });
  if (error) throw error;
  const c = createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data: s } = await c.auth.signInWithPassword({ email, password: "Passw0rd!e2e" });
  const v = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  return { id: data.user.id, cookie: `sb-humango-auth-token=${v}` };
}

const tag = Date.now().toString(36).slice(-6);
// 실제 관리자 계정은 만들거나 지우지 않고, 매직링크 토큰으로 세션만 발급받는다
async function sessionFor(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const c = createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data: s, error: e2 } = await c.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "magiclink",
  });
  if (e2) throw e2;
  const v = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  return { cookie: `sb-humango-auth-token=${v}` };
}
const boss = await sessionFor(adminEmail);
const normal = await user(`normal-${tag}@e2e.test`, `usr${tag}`);

const get = (u, p) =>
  fetch(APP + p, { headers: u ? { cookie: u.cookie } : {}, redirect: "manual" });

let r = await get(null, "/api/admin/stats");
ok(r.status === 404 || r.status === 307, `비로그인 통계 API 차단 (${r.status})`);
r = await get(normal, "/api/admin/stats");
ok(r.status === 404, "일반 사용자는 통계 API 404");
r = await get(normal, "/admin");
ok(r.status === 404, "일반 사용자는 /admin 404");
r = await get(boss, "/admin");
ok(r.status === 200, "관리자는 /admin 접근");
r = await get(boss, "/api/admin/stats");
ok(r.status === 200, "관리자는 통계 API 접근");
const s = await r.json();
console.log(JSON.stringify({ users: s.db.users, captures: s.db.captures, rarity: s.db.byRarity.map((x) => x.count), cpu: s.host.cpuPercent, memFreeGB: (s.host.mem.free / 2 ** 30).toFixed(1), diskFreeGB: s.host.disk && (s.host.disk.free / 2 ** 30).toFixed(0), containers: s.host.containers?.length, traffic5min: s.traffic?.last5min, visitors: s.traffic?.uniqueVisitorsToday }, null, 1));
ok(s.db.users >= 2, "가입자 수 집계");
ok(s.db.userSeries.length === 14 && s.db.userSeries.at(-1).count >= 2, "일별 가입자 시리즈");
ok(s.host.cpuPercent >= 0 && s.host.mem.total > 0, "CPU/메모리");
ok(s.host.containers?.length >= 10, "컨테이너 상태");
ok(s.traffic && s.traffic.total.requests > 0, "게이트웨이 트래픽 집계");

// 트래픽 카운터가 실제로 오르는지
const before = s.traffic.total.requests;
for (let i = 0; i < 5; i++) await fetch(APP + "/login");
const s2 = await (await get(boss, "/api/admin/stats")).json();
ok(s2.traffic.total.requests >= before + 5, "요청 수가 증가");

await admin.auth.admin.deleteUser(normal.id);
console.log(failed ? `\n${failed}개 실패` : "\n모두 통과");
process.exit(failed ? 1 : 0);
