// 효과음: 외부 파일 없이 Web Audio 로 합성한다. (저작권 문제 없음, 용량 0)
// 브라우저 정책상 첫 사용자 입력 이후에만 소리가 나므로 pointerdown 에서 unlockAudio() 를 부른다.

const KEY = "humango-muted";

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let muted: boolean | null = null;

export function isMuted(): boolean {
  if (muted === null) {
    try {
      muted = localStorage.getItem(KEY) === "1";
    } catch {
      muted = false;
    }
  }
  return muted;
}

export function setMuted(v: boolean) {
  muted = v;
  try {
    localStorage.setItem(KEY, v ? "1" : "0");
  } catch {
    // 저장 실패는 무시
  }
}

function ac(): AudioContext | null {
  if (isMuted() || typeof window === "undefined") return null;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    ctx ??= new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export const unlockAudio = () => void ac();

function noiseBuffer(c: AudioContext) {
  if (!noise) {
    noise = c.createBuffer(1, Math.floor(c.sampleRate * 0.5), c.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noise;
}

/** 휙: 대역통과 필터를 훑는 노이즈. strength 0~1 이 클수록 크고 높고 빠르다. */
export function whoosh(strength: number) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  const s = Math.min(1, Math.max(0.15, strength));
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(500 + 500 * s, t);
  bp.frequency.exponentialRampToValueAtTime(2200 + 1500 * s, t + 0.28);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35 * s + 0.08, t + 0.07);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  src.connect(bp).connect(g).connect(c.destination);
  src.start(t);
  src.stop(t + 0.45);
}

/** 퉁: 명중 충격음 (낮은 사인 + 짧은 클릭) */
export function thud() {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(170, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.22);
  const g = c.createGain();
  g.gain.setValueAtTime(0.7, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + 0.3);

  const n = c.createBufferSource();
  n.buffer = noiseBuffer(c);
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1400;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.35, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  n.connect(lp).connect(ng).connect(c.destination);
  n.start(t);
  n.stop(t + 0.1);
}

/** 통통: 바닥에 튕기는 소리. volume 0~1 */
export function bounce(volume = 1) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  o.type = "triangle";
  o.frequency.setValueAtTime(260, t);
  o.frequency.exponentialRampToValueAtTime(110, t + 0.09);
  const g = c.createGain();
  g.gain.setValueAtTime(0.3 * volume, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + 0.14);
}

/** 볼을 집을 때/흔들릴 때의 짧은 딸깍 */
export function tick(pitch = 1) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  o.type = "square";
  o.frequency.setValueAtTime(520 * pitch, t);
  const g = c.createGain();
  g.gain.setValueAtTime(0.08, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + 0.06);
}

/** 잡았다! 상승하는 3음 */
export function chime() {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  [523.25, 659.25, 783.99].forEach((f, i) => {
    const o = c.createOscillator();
    o.type = "triangle";
    o.frequency.value = f;
    const g = c.createGain();
    const at = t + i * 0.09;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
    o.connect(g).connect(c.destination);
    o.start(at);
    o.stop(at + 0.45);
  });
}

/** 도망갔다: 내려가는 음 */
export function boing() {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(420, t);
  o.frequency.exponentialRampToValueAtTime(110, t + 0.35);
  const g = c.createGain();
  g.gain.setValueAtTime(0.18, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + 0.4);
}

const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51]; // 펜타토닉 상승

/**
 * 등급 공개음. tier 0~5: 높을수록 음이 많고 높고 크며, 전설 이상은 반짝이는 노이즈가 얹힌다.
 */
export function rarityReveal(tier: number) {
  if (tier <= 0) return;
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  const notes = Math.min(SCALE.length, 1 + tier + (tier >= 4 ? 1 : 0));
  for (let i = 0; i < notes; i++) {
    const at = t + i * (tier >= 4 ? 0.075 : 0.09);
    for (const [mult, vol] of tier >= 3
      ? ([
          [1, 0.2],
          [2, 0.07],
        ] as const)
      : ([[1, 0.2]] as const)) {
      const o = c.createOscillator();
      o.type = "triangle";
      o.frequency.value = SCALE[i] * mult;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol * (0.7 + tier * 0.1), at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
      o.connect(g).connect(c.destination);
      o.start(at);
      o.stop(at + 0.55);
    }
  }
  if (tier >= 4) {
    // 반짝이는 높은 노이즈
    const n = c.createBufferSource();
    n.buffer = noiseBuffer(c);
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 5000;
    const g = c.createGain();
    const at = t + notes * 0.075;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(tier === 5 ? 0.22 : 0.12, at + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.7);
    n.connect(hp).connect(g).connect(c.destination);
    n.start(at);
    n.stop(at + 0.75);
  }
}
