// 게임 전역 설정값. 수치는 모두 여기서 조정한다.

export const GAME_NAME = "휴먼GO";
export const BALL_NAME = "캡처볼";

export const BUCKET = "captures";
export const SIGNED_URL_TTL_SEC = 60 * 60;

export const NICKNAME_MAX = 12;
export const CAPTURE_NAME_MAX = 20;

// 사람 분할 / 카메라
export const SEGMENTATION_FPS = 15;
export const MAX_POSES = 3;
export const CAMERA_WIDTH = 1280;
export const CAMERA_HEIGHT = 720;
export const LIVE_INPUT_WIDTH = 384; // 실시간 분할 입력 폭. 작을수록 빠르고 마스크가 거칠어진다

// 볼 던지기
export const THROW_MIN_SPEED = 0.15; // px/ms. 이보다 약하면 툭 떨어짐
export const THROW_SOFT_SPEED = 0.7; // 느려도 위로 던졌다면 최소 이 속도로 날아감(마우스용)
export const THROW_FLIGHT_MS_MIN = 600;
export const THROW_FLIGHT_MS_MAX = 900;
export const THROW_END_SCALE = 0.35; // 도착 시 볼 크기 비율(원근감)
export const HIT_BOX_EXPAND = 0.1; // 바운딩 박스 확장 비율

// 포획 연출
export const CAPTURE_DURATION_MS = 2500;
export const ESCAPE_CHANCE = 0.1; // 0이면 탈출 없음
export const BALL_SHAKE_COUNT = 3;
export const MASK_DILATE_PX = 6; // 컷아웃용
export const INPAINT_DILATE_PX = 14; // 배경 지우기용. 마스크 가장자리 잔상을 덮도록 더 크게
export const MASK_FEATHER_PX = 3;
export const INPAINT_WIDTH = 640;
export const INPAINT_RADIUS = 5;

// 이미지 저장 크기
export const CHARACTER_SIZE = 512;
export const FACE_SIZE = 256;
export const SCENE_MAX_WIDTH = 1280;
export const SCENE_JPEG_QUALITY = 0.85;

// 희귀도 (합이 1)
export const RARITY_WEIGHTS = {
  common: 0.6,
  rare: 0.25,
  epic: 0.12,
  legendary: 0.03,
} as const;

export type Rarity = keyof typeof RARITY_WEIGHTS;
