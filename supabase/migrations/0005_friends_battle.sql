-- 친구 / 배틀 / 레이팅.
-- 쓰기는 모두 서버(service_role)가 API 에서 검증한 뒤 수행한다. 일반 사용자는 자기 관련 행을 읽기만 한다.

create table friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles(id) on delete cascade,
  addressee_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);
-- 같은 두 사람 사이에는 방향과 상관없이 한 행만
create unique index friendships_pair on friendships (
  least(requester_id, addressee_id), greatest(requester_id, addressee_id)
);
create index on friendships (addressee_id);

alter table friendships enable row level security;
create policy "friendships read own" on friendships for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

create table player_ratings (
  user_id uuid primary key references profiles(id) on delete cascade,
  rating int not null default 1000,
  wins int not null default 0,
  losses int not null default 0,
  updated_at timestamptz not null default now()
);
alter table player_ratings enable row level security;
create policy "ratings read" on player_ratings for select to authenticated using (true);

create table battles (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references profiles(id) on delete cascade,
  opponent_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','active','finished','declined','cancelled')),
  challenger_team uuid[] not null,
  opponent_team uuid[],
  state jsonb,
  version int not null default 0,
  turn_deadline timestamptz,
  winner_id uuid references profiles(id),
  challenger_rating_change int,
  opponent_rating_change int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (challenger_id <> opponent_id)
);
create index on battles (challenger_id, updated_at desc);
create index on battles (opponent_id, updated_at desc);

alter table battles enable row level security;
create policy "battles read own" on battles for select to authenticated
  using (challenger_id = auth.uid() or opponent_id = auth.uid());

-- 이미 쓰러진 상대의 아바타도 보려면 captures 는 이미 전체 공개(0001). 별도 변경 없음.

-- Realtime 구독 (postgres_changes). RLS 가 적용되어 참가자에게만 전달된다.
alter publication supabase_realtime add table battles;
alter publication supabase_realtime add table friendships;
