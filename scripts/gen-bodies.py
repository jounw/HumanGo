#!/usr/bin/env python3
"""치비 몸통 템플릿 SVG 6종 생성. 512x512, 머리 중심 (256,196) 지름 320 영역은 비워 둔다(얼굴이 위에 얹힘)."""
import json, os

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "bodies")
os.makedirs(OUT, exist_ok=True)
SKIN = "#f2c9a0"
SKIN_SH = "#e3b387"
LINE = "#2b2140"

def svg(inner):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" fill="none" stroke-linejoin="round" stroke-linecap="round">{inner}</svg>\n'

def limbs(arm, pant, shoe, hand=SKIN, leg=None, short=False):
    """팔(소매색 arm), 바지(pant), 신발(shoe). short=True 면 반바지(다리 맨살)."""
    leg_skin = SKIN if short else pant
    return f'''
  <g stroke="{LINE}" stroke-width="5">
    <rect x="222" y="418" width="30" height="56" rx="12" fill="{leg_skin}"/>
    <rect x="260" y="418" width="30" height="56" rx="12" fill="{leg_skin}"/>
    <ellipse cx="233" cy="482" rx="26" ry="14" fill="{shoe}"/>
    <ellipse cx="279" cy="482" rx="26" ry="14" fill="{shoe}"/>
    <rect x="164" y="338" width="36" height="72" rx="18" fill="{arm}" transform="rotate(8 182 338)"/>
    <rect x="312" y="338" width="36" height="72" rx="18" fill="{arm}" transform="rotate(-8 330 338)"/>
    <circle cx="176" cy="414" r="15" fill="{hand}"/>
    <circle cx="336" cy="414" r="15" fill="{hand}"/>
  </g>'''

def torso(fill, extra=""):
    return f'''
  <g stroke="{LINE}" stroke-width="5">
    <rect x="196" y="326" width="120" height="104" rx="30" fill="{fill}"/>
    {extra}
  </g>'''

def shorts(color):
    return f'<rect x="206" y="404" width="100" height="36" rx="14" fill="{color}" stroke="{LINE}" stroke-width="5"/>'

bodies = []

def add(id_, name, inner):
    with open(os.path.join(OUT, f"{id_}.svg"), "w") as f:
        f.write(svg(inner))
    bodies.append({"id": id_, "name": name, "file": f"/bodies/{id_}.svg",
                   "headCenter": {"x": 256, "y": 196}, "headSize": 320})

# 1. 기본: 노란 티셔츠 + 청반바지
add("basic", "기본",
    limbs("#ffd84d", "#4a6fa5", "#ffffff", short=True) +
    torso("#ffd84d", '<path d="M232 332 q24 20 48 0" stroke="#d9a800" stroke-width="5"/>') +
    shorts("#4a6fa5"))

# 2. 정장: 남색 재킷 + 흰 셔츠 + 빨간 넥타이
add("suit", "정장",
    limbs("#27304f", "#27304f", "#15121f") +
    torso("#27304f",
          '<path d="M236 328 L256 380 L276 328 Z" fill="#ffffff"/>'
          '<path d="M256 340 l-8 14 l8 34 l8 -34 z" fill="#e2495b" stroke="#2b2140" stroke-width="4"/>'
          '<path d="M236 328 L222 372 M276 328 L290 372" stroke="#3d4975" stroke-width="5"/>'))

# 3. 운동복: 하늘색 트레이닝 + 흰 줄
add("sport", "운동복",
    limbs("#3aa6d8", "#3aa6d8", "#ff7a59", hand=SKIN) +
    torso("#3aa6d8",
          '<path d="M256 330 V430" stroke="#ffffff" stroke-width="6"/>'
          '<rect x="203" y="380" width="106" height="8" fill="#ffffff" stroke="none"/>') +
    '<path d="M226 440 V474 M286 440 V474" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/>')

# 4. 망토 히어로: 빨간 망토(뒤) + 파란 슈트 + 별 마크
add("hero", "히어로",
    '<path d="M190 336 Q150 440 128 486 Q256 508 384 486 Q362 440 322 336 Z" fill="#e2495b" stroke="#2b2140" stroke-width="5"/>' +
    limbs("#2f5bd6", "#2f5bd6", "#e2495b") +
    torso("#2f5bd6",
          '<path d="M256 352 l7 15 l16 2 l-12 11 l3 16 l-14 -8 l-14 8 l3 -16 l-12 -11 l16 -2 z" fill="#ffd84d" stroke="#2b2140" stroke-width="4"/>'
          '<rect x="196" y="410" width="120" height="14" rx="7" fill="#ffd84d" stroke="#2b2140" stroke-width="4"/>'))

# 5. 요리사: 흰 조리복 + 단추 + 스카프
add("chef", "요리사",
    limbs("#ffffff", "#5b5b6b", "#3a3a48") +
    torso("#ffffff",
          '<path d="M256 332 V428" stroke="#cfd3e6" stroke-width="5"/>'
          '<circle cx="240" cy="364" r="5" fill="#2b2140"/><circle cx="240" cy="392" r="5" fill="#2b2140"/>'
          '<circle cx="272" cy="364" r="5" fill="#2b2140"/><circle cx="272" cy="392" r="5" fill="#2b2140"/>'
          '<path d="M222 330 q34 22 68 0 l-6 16 q-28 14 -56 0 z" fill="#e2495b"/>'))

# 6. 잠옷: 보라 줄무늬 + 달 무늬
add("pajama", "잠옷",
    limbs("#b9a7ff", "#b9a7ff", "#ffe9a8", hand=SKIN) +
    torso("#b9a7ff",
          '<path d="M200 352 H312 M200 380 H312 M200 408 H312" stroke="#ffffff" stroke-width="6" opacity="0.8"/>'
          '<path d="M262 346 a16 16 0 1 0 12 26 a13 13 0 1 1 -12 -26 z" fill="#ffe27a" stroke="#2b2140" stroke-width="4"/>') +
    '<path d="M222 436 V470 M258 436 V470 M294 436 V470" stroke="#ffffff" stroke-width="5" opacity="0.7"/>')

with open(os.path.join(os.path.dirname(__file__), "..", "lib", "game", "bodies.json"), "w") as f:
    json.dump(bodies, f, ensure_ascii=False, indent=2)
    f.write("\n")
print("generated", len(bodies))
