import { notFound } from "next/navigation";
import PipelineTest from "./PipelineTest";

// 개발 전용: 카메라 없이 정지 사진으로 분할 -> 컷아웃 -> 배경 채우기 파이프라인을 점검한다.
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PipelineTest />;
}
