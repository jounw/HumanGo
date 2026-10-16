-- 프로필
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null unique check (char_length(nickname) between 1 and 12),
  created_at timestamptz not null default now()
);

-- 포획 기록
create table captures (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 20),
  character_path text not null,
  face_path text not null,
  scene_path text,
  cutout_path text,
  body_template text not null,
  rarity text not null default 'common' check (rarity in ('common','rare','epic','legendary')),
  captured_at timestamptz not null default now()
);
create index on captures (owner_id, captured_at desc);

alter table profiles enable row level security;
alter table captures enable row level security;

create policy "profiles read" on profiles for select to authenticated using (true);
create policy "profiles insert own" on profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles update own" on profiles for update to authenticated using (id = auth.uid());

create policy "captures read" on captures for select to authenticated using (true);
create policy "captures insert own" on captures for insert to authenticated with check (owner_id = auth.uid());
create policy "captures update own" on captures for update to authenticated using (owner_id = auth.uid());
create policy "captures delete own" on captures for delete to authenticated using (owner_id = auth.uid());

-- 가입 시 닉네임(user_metadata.nickname)으로 프로필 자동 생성
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nickname)
  values (new.id, trim(new.raw_user_meta_data ->> 'nickname'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Storage: private 버킷. 경로 규칙 {owner_id}/{capture_id}/파일명
insert into storage.buckets (id, name, public) values ('captures', 'captures', false)
on conflict (id) do nothing;

create policy "captures files read" on storage.objects for select to authenticated
  using (bucket_id = 'captures');
create policy "captures files insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'captures' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "captures files update own" on storage.objects for update to authenticated
  using (bucket_id = 'captures' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "captures files delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'captures' and (storage.foldername(name))[1] = auth.uid()::text);
