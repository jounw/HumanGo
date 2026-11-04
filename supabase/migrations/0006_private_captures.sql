-- 캐릭터를 "나만 보기"로 등록할 수 있게 한다. 기본값은 false(전체 공개)라 기존 행은 그대로 공개다.
-- 비공개 캐릭터는 주인만 읽을 수 있다. (이미지 파일도 마찬가지)
alter table captures add column is_private boolean not null default false;

drop policy "captures read" on captures;
create policy "captures read" on captures for select to authenticated
  using (owner_id = auth.uid() or not is_private);

-- 파일 경로 규칙: {owner_id}/{capture_id}/파일명
-- 주인은 항상 읽을 수 있고, 다른 사람은 공개 캐릭터의 파일만 읽을 수 있다.
-- (등록 전에 올린 파일은 captures 행이 아직 없으므로 주인 조건으로만 읽힌다)
drop policy "captures files read" on storage.objects;
create policy "captures files read" on storage.objects for select to authenticated
  using (
    bucket_id = 'captures'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.captures c
        where c.owner_id::text = (storage.foldername(name))[1]
          and c.id::text = (storage.foldername(name))[2]
          and not c.is_private
      )
    )
  );
