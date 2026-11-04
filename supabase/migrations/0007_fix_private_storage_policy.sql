-- 0006 의 Storage 읽기 정책 수정.
-- 서브쿼리 안의 `name` 이 storage.objects.name 이 아니라 captures.name(캐릭터 이름)으로 해석되어,
-- 다른 사람이 공개 캐릭터의 이미지 파일을 읽지 못하는 문제가 있었다. objects.name 으로 명시한다.
drop policy if exists "captures files read" on storage.objects;
create policy "captures files read" on storage.objects for select to authenticated
  using (
    bucket_id = 'captures'
    and (
      (storage.foldername(objects.name))[1] = auth.uid()::text
      or exists (
        select 1 from public.captures c
        where c.owner_id::text = (storage.foldername(objects.name))[1]
          and c.id::text = (storage.foldername(objects.name))[2]
          and not c.is_private
      )
    )
  );
