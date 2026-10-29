-- 등급을 6단계로 세분화: common < uncommon < rare < epic < legendary < mythic
-- 기존 행(common/rare/epic/legendary)은 그대로 유효하다.
alter table captures drop constraint if exists captures_rarity_check;
alter table captures
  add constraint captures_rarity_check
  check (rarity in ('common','uncommon','rare','epic','legendary','mythic'));
