// 3D 치비 캐릭터 (three.js).
// 머리: 구 위에 얼굴 사진(투명 배경 PNG)을 둥글게 입힌 조각을 덧씌움 / 몸통: 캡슐, 구 등 기본 도형 조립.
// 툰 셰이딩 + 뒤집힌 껍질 외곽선으로 2D 스티커 캐릭터와 비슷한 느낌을 낸다.
// three 는 용량이 커서 이 모듈이 처음 쓰일 때 동적으로 불러온다.

import type * as THREE from "three";

const LINE = 0x2b2140;
const SKIN = 0xf2c9a0;
const HAIR_FALLBACK = 0x6b4a32;

type Extra = "none" | "tie" | "stripe" | "cape" | "chef" | "pajama";
type Style = {
  torso: number;
  arm: number;
  pant: number;
  shoe: number;
  shorts: boolean; // true 면 다리는 맨살이고 반바지를 입음
  extra: Extra;
};

// public/bodies/*.svg (2D) 와 같은 id / 색
export const STYLES: Record<string, Style> = {
  basic: {
    torso: 0xffd84d,
    arm: 0xffd84d,
    pant: 0x4a6fa5,
    shoe: 0xffffff,
    shorts: true,
    extra: "none",
  },
  suit: {
    torso: 0x27304f,
    arm: 0x27304f,
    pant: 0x27304f,
    shoe: 0x15121f,
    shorts: false,
    extra: "tie",
  },
  sport: {
    torso: 0x3aa6d8,
    arm: 0x3aa6d8,
    pant: 0x3aa6d8,
    shoe: 0xff7a59,
    shorts: false,
    extra: "stripe",
  },
  hero: {
    torso: 0x2f5bd6,
    arm: 0x2f5bd6,
    pant: 0x2f5bd6,
    shoe: 0xe2495b,
    shorts: false,
    extra: "cape",
  },
  chef: {
    torso: 0xffffff,
    arm: 0xffffff,
    pant: 0x5b5b6b,
    shoe: 0x3a3a48,
    shorts: false,
    extra: "chef",
  },
  pajama: {
    torso: 0xb9a7ff,
    arm: 0xb9a7ff,
    pant: 0xb9a7ff,
    shoe: 0xffe9a8,
    shorts: false,
    extra: "pajama",
  },
};

export type Chibi3D = {
  setFace(face: HTMLCanvasElement): void;
  setBody(id: string): void;
  dispose(): void;
};

/** 얼굴 이미지에서 머리카락(위쪽)과 피부(가운데) 평균색을 뽑는다. */
export function sampleColors(face: HTMLCanvasElement): {
  hair: number;
  skin: number;
} {
  const ctx = face.getContext("2d");
  if (!ctx) return { hair: HAIR_FALLBACK, skin: SKIN };
  const w = face.width;
  const h = face.height;
  const avg = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    fallback: number,
  ) => {
    let r = 0,
      g = 0,
      b = 0,
      n = 0;
    try {
      const d = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 200) continue;
        r += d[i];
        g += d[i + 1];
        b += d[i + 2];
        n++;
      }
    } catch {
      return fallback;
    }
    if (n < 20) return fallback;
    return ((r / n) << 16) | ((g / n) << 8) | (b / n);
  };
  // 머리카락은 얼굴 위 12~30% 구간의 가운데, 피부는 중앙 부근. 어둡게 눌러 머리 뒤쪽이 자연스럽게 보이게 한다.
  const hair = avg(
    Math.floor(w * 0.3),
    Math.floor(h * 0.12),
    Math.floor(w * 0.7),
    Math.floor(h * 0.28),
    HAIR_FALLBACK,
  );
  const skin = avg(
    Math.floor(w * 0.4),
    Math.floor(h * 0.5),
    Math.floor(w * 0.6),
    Math.floor(h * 0.62),
    SKIN,
  );
  return { hair, skin };
}

export async function createChibi3D(container: HTMLElement): Promise<Chibi3D> {
  const THREE = await import("three");
  const reduceMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.domElement.style.cssText =
    "width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 60);
  camera.position.set(0, 1.75, 8.1);
  camera.lookAt(0, 1.6, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9b0e0, 1.9));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(3, 5, 6);
  scene.add(sun);

  const disposables: { dispose(): void }[] = [];
  const track = <D extends { dispose(): void }>(d: D) => (
    disposables.push(d),
    d
  );

  // 3단계 툰 셰이딩용 그라데이션
  const gradient = track(
    new THREE.DataTexture(
      new Uint8Array([110, 190, 255]),
      3,
      1,
      THREE.RedFormat,
    ),
  );
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;

  const outlineMat = track(
    new THREE.MeshBasicMaterial({ color: LINE, side: THREE.BackSide }),
  );

  const root = new THREE.Group(); // 좌우 회전(드래그/흔들림)
  const bob = new THREE.Group(); // 위아래 둥실
  root.add(bob);
  scene.add(root);

  // 바닥 그림자
  {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const x = c.getContext("2d")!;
    const g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, "rgba(20,10,40,0.45)");
    g.addColorStop(1, "rgba(20,10,40,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    const tex = track(new THREE.CanvasTexture(c));
    const m = new THREE.Mesh(
      track(new THREE.CircleGeometry(1.25, 32)),
      track(
        new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          depthWrite: false,
        }),
      ),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.002;
    root.add(m); // 몸이 돌아도 그림자는 제자리 (bob 에는 넣지 않음)
  }

  // ---- 머리 ----
  const head = new THREE.Group();
  head.position.y = 2.1;
  head.scale.set(1, 1.03, 0.97);
  bob.add(head);

  // 머리 기본 구: 위/뒤는 머리카락색, 아래/옆은 피부색 (정점 색으로 칠함)
  const hairMat = track(
    new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradient }),
  );
  const headBase = new THREE.Mesh(
    track(new THREE.SphereGeometry(1, 48, 32)),
    hairMat,
  );
  const paintHead = (hair: number, skin: number) => {
    const geo = headBase.geometry;
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const hc = new THREE.Color(hair).multiplyScalar(0.85);
    const sc = new THREE.Color(skin);
    const c = new THREE.Color();
    const smooth = (a: number, b: number, x: number) => {
      const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    for (let i = 0; i < pos.count; i++) {
      const w = Math.max(
        smooth(-0.05, 0.4, pos.getY(i)),
        smooth(0.15, -0.45, pos.getZ(i)),
      );
      c.copy(sc).lerp(hc, w);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  };
  paintHead(HAIR_FALLBACK, SKIN);
  head.add(headBase);
  const headLine = new THREE.Mesh(headBase.geometry, outlineMat);
  headLine.scale.setScalar(1.035);
  head.add(headLine);

  // 얼굴 조각: 구 정면(+z)의 일부. 기본 UV 가 조각 전체에 사진이 펴지도록 매핑되어 사진이 머리에 둥글게 감긴다.
  const FACE_W = 1.8; // 가로 각도(rad)
  const FACE_H = 1.85; // 세로 각도(rad)
  // 사진은 조명을 받지 않게 해서 원래 색 그대로 보이게 한다
  const faceMat = track(
    new THREE.MeshBasicMaterial({ transparent: true, color: 0xffffff }),
  );
  faceMat.visible = false;
  const faceCap = new THREE.Mesh(
    track(
      new THREE.SphereGeometry(
        1.012,
        64,
        48,
        Math.PI / 2 - FACE_W / 2,
        FACE_W,
        Math.PI / 2 - FACE_H / 2,
        FACE_H,
      ),
    ),
    faceMat,
  );
  faceCap.renderOrder = 2;
  head.add(faceCap);

  // ---- 몸통 (템플릿에 따라 다시 만든다) ----
  let bodyGroup: THREE.Group | null = null;
  let bodyDisposables: { dispose(): void }[] = [];

  function buildBody(style: Style) {
    const g = new THREE.Group();
    const owned: { dispose(): void }[] = [];
    const own = <D extends { dispose(): void }>(d: D) => (owned.push(d), d);
    const ownedPart = (
      geo: THREE.BufferGeometry,
      color: number,
      outline = 1.07,
    ) => {
      own(geo);
      const grp = new THREE.Group();
      const m = own(
        new THREE.MeshToonMaterial({ color, gradientMap: gradient }),
      );
      grp.add(new THREE.Mesh(geo, m));
      const o = new THREE.Mesh(geo, outlineMat);
      o.scale.setScalar(outline);
      grp.add(o);
      return grp;
    };

    // 신발 + 다리
    for (const sx of [-1, 1]) {
      const shoe = ownedPart(
        new THREE.SphereGeometry(1, 24, 16),
        style.shoe,
        1.1,
      );
      shoe.scale.set(0.27, 0.16, 0.38);
      shoe.position.set(sx * 0.21, 0.14, 0.09);
      g.add(shoe);

      const leg = ownedPart(
        new THREE.CapsuleGeometry(0.15, 0.2, 6, 12),
        style.shorts ? SKIN : style.pant,
        1.12,
      );
      leg.position.set(sx * 0.21, 0.42, 0);
      g.add(leg);

      if (style.shorts) {
        const sh = ownedPart(
          new THREE.CylinderGeometry(0.19, 0.2, 0.22, 20),
          style.pant,
          1.08,
        );
        sh.position.set(sx * 0.21, 0.58, 0);
        g.add(sh);
      }
    }

    // 몸통
    const torso = ownedPart(
      new THREE.CapsuleGeometry(0.43, 0.22, 8, 16),
      style.torso,
      1.05,
    );
    torso.scale.set(1, 1, 0.82);
    torso.position.y = 0.95;
    g.add(torso);

    // 팔 + 손
    for (const sx of [-1, 1]) {
      const arm = ownedPart(
        new THREE.CapsuleGeometry(0.12, 0.3, 6, 12),
        style.arm,
        1.12,
      );
      arm.position.set(sx * 0.58, 0.95, 0);
      arm.rotation.z = sx * 0.28;
      g.add(arm);
      const hand = ownedPart(
        new THREE.SphereGeometry(0.14, 16, 12),
        SKIN,
        1.14,
      );
      hand.position.set(sx * 0.7, 0.62, 0.02);
      g.add(hand);
    }

    // 의상별 장식
    const flat = (
      geo: THREE.BufferGeometry,
      color: number,
      x: number,
      y: number,
      z: number,
    ) => {
      const m = new THREE.Mesh(
        own(geo),
        own(new THREE.MeshToonMaterial({ color, gradientMap: gradient })),
      );
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };
    const FRONT = 0.37; // 몸통 앞면 z
    switch (style.extra) {
      case "tie": {
        const knot = flat(
          new THREE.BoxGeometry(0.1, 0.1, 0.05),
          0xe2495b,
          0,
          1.28,
          FRONT,
        );
        knot.rotation.z = Math.PI / 4;
        flat(
          new THREE.ConeGeometry(0.1, 0.4, 4),
          0xe2495b,
          0,
          1.0,
          FRONT,
        ).rotation.x = Math.PI;
        flat(
          new THREE.BoxGeometry(0.34, 0.04, 0.03),
          0xffffff,
          0,
          1.36,
          FRONT - 0.02,
        );
        break;
      }
      case "stripe": {
        flat(new THREE.BoxGeometry(0.07, 0.8, 0.03), 0xffffff, 0, 0.95, FRONT);
        flat(
          new THREE.BoxGeometry(0.95, 0.07, 0.03),
          0xffffff,
          0,
          0.7,
          FRONT - 0.04,
        );
        break;
      }
      case "cape": {
        const geo = own(new THREE.PlaneGeometry(1.4, 1.25, 10, 10));
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const v = (p.getY(i) + 0.625) / 1.25; // 0(아래)~1(위)
          p.setX(i, p.getX(i) * (0.75 + (1 - v) * 0.45)); // 아래로 갈수록 퍼짐
          p.setZ(i, -0.34 - (1 - v) * 0.22 + Math.sin(p.getX(i) * 3) * 0.04);
        }
        geo.computeVertexNormals();
        const cape = flat(geo, 0xe2495b, 0, 0.78, 0);
        (cape.material as THREE.MeshToonMaterial).side = THREE.DoubleSide;
        const star = flat(
          new THREE.CircleGeometry(0.13, 5),
          0xffd84d,
          0,
          1.08,
          FRONT + 0.005,
        );
        star.rotation.z = Math.PI / 10;
        flat(
          new THREE.TorusGeometry(0.46, 0.04, 8, 28),
          0xffd84d,
          0,
          0.62,
          0,
        ).rotation.x = Math.PI / 2;
        break;
      }
      case "chef": {
        flat(
          new THREE.TorusGeometry(0.3, 0.07, 10, 24),
          0xe2495b,
          0,
          1.4,
          0.05,
        ).rotation.x = Math.PI / 2.4;
        for (const y of [1.15, 0.9, 0.65]) {
          flat(
            new THREE.SphereGeometry(0.045, 10, 8),
            LINE,
            0.13,
            y,
            FRONT - 0.02,
          );
          flat(
            new THREE.SphereGeometry(0.045, 10, 8),
            LINE,
            -0.13,
            y,
            FRONT - 0.02,
          );
        }
        break;
      }
      case "pajama": {
        for (const y of [0.72, 0.95, 1.18]) {
          const ring = flat(
            new THREE.TorusGeometry(0.435, 0.018, 6, 36),
            0xffffff,
            0,
            y,
            0,
          );
          ring.rotation.x = Math.PI / 2;
          ring.scale.set(1, 0.82, 1);
        }
        flat(
          new THREE.CircleGeometry(0.1, 20),
          0xffe27a,
          0.15,
          1.12,
          FRONT + 0.005,
        );
        break;
      }
      default:
        break;
    }

    return { group: g, owned };
  }

  function setBody(id: string) {
    const style = STYLES[id] ?? STYLES.basic;
    if (bodyGroup) {
      bob.remove(bodyGroup);
      bodyDisposables.forEach((d) => d.dispose());
    }
    const { group, owned } = buildBody(style);
    bodyGroup = group;
    bodyDisposables = owned;
    bob.add(group);
  }

  let faceTex: THREE.CanvasTexture | null = null;
  function setFace(face: HTMLCanvasElement) {
    const { hair, skin } = sampleColors(face);
    paintHead(hair, skin);
    faceTex?.dispose();
    faceTex = new THREE.CanvasTexture(face);
    faceTex.colorSpace = THREE.SRGBColorSpace;
    faceTex.anisotropy = 4;
    faceMat.map = faceTex;
    faceMat.needsUpdate = true;
    faceMat.visible = true;
  }

  setBody("basic");

  // ---- 크기, 입력, 애니메이션 ----
  const resize = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  // 드래그로 좌우 회전, 놓으면 관성. 가만히 두면 살짝 좌우로 흔들며 3D 임을 보여준다.
  let rotY = 0.35;
  let vel = 0;
  let dragging = false;
  let lastX = 0;
  let lastInteract = -1e9;
  const el = renderer.domElement;
  const down = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    vel = 0;
    lastInteract = performance.now();
    el.style.cursor = "grabbing";
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* 무시 */
    }
  };
  const move = (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    rotY += dx * 0.012;
    vel = dx * 0.012;
    lastInteract = performance.now();
  };
  const up = () => {
    dragging = false;
    el.style.cursor = "grab";
  };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);

  const t0 = performance.now();
  renderer.setAnimationLoop((now: number) => {
    const t = (now - t0) / 1000;
    if (!dragging) {
      rotY += vel;
      vel *= 0.94;
      const idle = now - lastInteract > 2500;
      if (idle && !reduceMotion) {
        // 정면(0.35) 부근에서 좌우로 천천히 흔들림
        rotY += (0.35 + Math.sin(t * 0.9) * 0.55 - rotY) * 0.03;
      }
    }
    root.rotation.y = rotY;
    if (!reduceMotion) {
      bob.position.y = Math.sin(t * 2.2) * 0.04;
      head.rotation.z = Math.sin(t * 1.3) * 0.025;
    }
    renderer.render(scene, camera);
  });

  return {
    setFace,
    setBody,
    dispose() {
      renderer.setAnimationLoop(null);
      ro.disconnect();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      bodyDisposables.forEach((d) => d.dispose());
      faceTex?.dispose();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      el.remove();
    },
  };
}
