// 개발 전용: 카메라 없이 정지 사진을 영상 스트림처럼 돌려준다. (?fake 가 주소에 있을 때만, 프로덕션 빌드에서는 제거됨)
export async function fakeStream(): Promise<MediaStream> {
  const img = new Image();
  img.src = "/dev-test/people.jpg";
  await img.decode();
  const c = document.createElement("canvas");
  c.width = 720;
  c.height = 1280;
  const ctx = c.getContext("2d")!;
  // 세로 영상(폰)처럼 보이도록 가운데 두 사람이 나오는 영역을 잘라서 채운다
  const draw = () => ctx.drawImage(img, 470, 0, 477, 848, 0, 0, 720, 1280);
  draw();
  window.setInterval(draw, 33);
  return c.captureStream(30);
}
