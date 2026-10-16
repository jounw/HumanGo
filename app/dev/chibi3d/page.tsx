import { notFound } from "next/navigation";
import Chibi3DGallery from "./Gallery";

// 개발 전용: 6종 몸통을 3D 로 한눈에 확인한다.
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Chibi3DGallery />;
}
