-- 등급 뽑기를 서버가 한다. 서버(service_role)가 rarity_rolls 에 뽑기를 기록하고,
-- captures 에 행을 넣을 때 그 뽑기와 일치하지 않으면 DB 가 거부한다.

create table rarity_rolls (
  id uuid primary key,                       -- 곧 만들어질 captures.id
  user_id uuid not null references profiles(id) on delete cascade,
  rarity text not null check (rarity in ('common','uncommon','rare','epic','legendary','mythic')),
  used boolean not null default false,
  created_at timestamptz not null default now()
);
create index on rarity_rolls (user_id, created_at desc);

-- 정책을 하나도 만들지 않으므로 일반 사용자는 읽기/쓰기 모두 불가. service_role 만 접근한다.
alter table rarity_rolls enable row level security;

create function public.captures_verify_roll() returns trigger
language plpgsql security definer set search_path = public as $$
declare r rarity_rolls;
begin
  -- 서버가 직접 넣는 경우(관리 작업)는 통과
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  select * into r from rarity_rolls
    where id = new.id and user_id = new.owner_id and not used
      and created_at > now() - interval '30 minutes'   -- lib/game/rollPolicy.ts 의 ROLL_TTL_MS 와 같은 값
    for update;
  if not found or r.rarity <> new.rarity then
    raise exception 'invalid rarity roll';
  end if;
  update rarity_rolls set used = true where id = r.id;
  return new;
end;
$$;
create trigger captures_verify_roll
  before insert on captures
  for each row execute function public.captures_verify_roll();

-- 등록한 뒤에도 일반 사용자는 등급을 바꿀 수 없다 (이름 수정 등은 허용)
create function public.captures_lock_rarity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and new.rarity is distinct from old.rarity then
    raise exception 'rarity is read-only';
  end if;
  return new;
end;
$$;
create trigger captures_lock_rarity
  before update on captures
  for each row execute function public.captures_lock_rarity();
