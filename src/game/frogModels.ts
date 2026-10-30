import * as THREE from "three";
import { FROG_PALETTE, FrogBuffStack, PowerUpType } from "./rules";

let sharedSpottedTexture: THREE.CanvasTexture | null = null;
let sharedBarkTexture: THREE.CanvasTexture | null = null;

function getSpottedFrogTexture(): THREE.CanvasTexture {
  if (sharedSpottedTexture) return sharedSpottedTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 128, 128);

  ctx.fillStyle = "rgba(18, 45, 24, 0.24)";
  const spots = [
    [28, 32, 10],
    [95, 36, 11],
    [64, 52, 13],
    [34, 82, 9],
    [92, 86, 10],
    [64, 102, 11],
  ];
  for (const [x, y, r] of spots) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  sharedSpottedTexture = tex;
  return tex;
}

function getWoodBarkTexture(): THREE.CanvasTexture {
  if (sharedBarkTexture) return sharedBarkTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#5c3a21";
  ctx.fillRect(0, 0, 128, 128);

  // Vertical bark grooves and moss patches
  ctx.fillStyle = "#3e2412";
  for (let i = 0; i < 16; i++) {
    const x = i * 8 + (i % 2) * 3;
    ctx.fillRect(x, 0, 3, 128);
  }
  ctx.fillStyle = "#4d7c2b";
  ctx.beginPath();
  ctx.arc(32, 26, 14, 0, Math.PI * 2);
  ctx.arc(96, 90, 16, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  sharedBarkTexture = tex;
  return tex;
}

export interface FrogVisualRig {
  root: THREE.Group;
  visualRoot: THREE.Group;
  skinMaterial: THREE.MeshStandardMaterial;
  barkArmorGroup: THREE.Group; // Полая кора дерева (надевается на лягушку при баффе BARK_ARMOR)
  dustCloudGroup: THREE.Group; // Облачко пыли при смене модели на кору дерева
  groundShadow: THREE.Mesh;
  trajectoryGroup: THREE.Group;
  trajectoryMat: THREE.MeshBasicMaterial;
  labelSprite: THREE.Sprite;
  labelCanvas: HTMLCanvasElement;
  labelTexture: THREE.CanvasTexture;
  lastLabelKey: string;
}

export function resolveFrogBaseColor(colorIndex: number, teamId: number): THREE.Color {
  let idx = ((colorIndex % FROG_PALETTE.length) + FROG_PALETTE.length) % FROG_PALETTE.length;
  if (teamId === 0) idx = 1; // Blue team
  else if (teamId === 1) idx = 2; // Red team
  const p = FROG_PALETTE[idx];
  return new THREE.Color(p.r, p.g, p.b);
}

/**
 * Создает 3D-модель лягушки (3 варианта) + надеваемую полую древесную кору (Bark Armor)
 * + облачко пыли для бесшовной смены модели + 2D круговые индикаторы баффов над головой.
 */
export function createFrogVisualRig(
  variantIndex: number,
  colorIndex: number,
  teamId: number
): FrogVisualRig {
  const root = new THREE.Group();
  const visualRoot = new THREE.Group();
  root.add(visualRoot);

  const safeVariant = ((variantIndex % 3) + 3) % 3;
  const baseColor = resolveFrogBaseColor(colorIndex, teamId);

  const skinMaterial = new THREE.MeshStandardMaterial({
    color: baseColor,
    roughness: safeVariant === 1 ? 0.38 : 0.52,
    metalness: 0.08,
    map: safeVariant === 1 ? getSpottedFrogTexture() : null,
  });

  const bellyMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.94, 0.96, 0.82),
    roughness: 0.72,
    metalness: 0.02,
  });

  const irisMaterial = new THREE.MeshStandardMaterial({
    color:
      safeVariant === 2
        ? new THREE.Color(0.98, 0.76, 0.14)
        : new THREE.Color(0.96, 0.88, 0.25),
    roughness: 0.25,
    metalness: 0.25,
  });

  const pupilMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.06, 0.06, 0.08),
    roughness: 0.15,
    metalness: 0.1,
  });

  const mouthMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.95, 0.26, 0.21),
    roughness: 0.5,
    metalness: 0.05,
  });

  const bodyGroup = new THREE.Group();
  visualRoot.add(bodyGroup);

  if (safeVariant === 0) {
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.52, 0.84), skinMaterial);
    torso.position.set(0, 0.34, 0);
    bodyGroup.add(torso);

    const belly = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.28, 0.72), bellyMaterial);
    belly.position.set(0, 0.22, -0.08);
    bodyGroup.add(belly);

    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.26, 0.32), skinMaterial);
    snout.position.set(0, 0.36, -0.44);
    bodyGroup.add(snout);

    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.09, 0.16), mouthMaterial);
    mouth.position.set(0, 0.26, -0.54);
    bodyGroup.add(mouth);

    for (const side of [-1, 1]) {
      const eyeSocket = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.22), skinMaterial);
      eyeSocket.position.set(side * 0.23, 0.66, -0.22);
      bodyGroup.add(eyeSocket);

      const iris = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), irisMaterial);
      iris.position.set(side * 0.23, 0.67, -0.28);
      bodyGroup.add(iris);

      const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.1), pupilMaterial);
      pupil.position.set(side * 0.23, 0.67, -0.34);
      bodyGroup.add(pupil);

      const hindLeg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.34, 0.44), skinMaterial);
      hindLeg.position.set(side * 0.42, 0.2, 0.18);
      bodyGroup.add(hindLeg);

      const frontLeg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.28, 0.18), skinMaterial);
      frontLeg.position.set(side * 0.32, 0.14, -0.3);
      bodyGroup.add(frontLeg);
    }
  } else if (safeVariant === 1) {
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.46, 18, 14), skinMaterial);
    torso.scale.set(1.02, 0.78, 1.16);
    torso.position.set(0, 0.36, 0.02);
    bodyGroup.add(torso);

    const vocalSac = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 12), bellyMaterial);
    vocalSac.scale.set(0.95, 0.72, 0.9);
    vocalSac.position.set(0, 0.25, -0.28);
    bodyGroup.add(vocalSac);

    const smileLip = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.06, 0.14), mouthMaterial);
    smileLip.position.set(0, 0.32, -0.49);
    bodyGroup.add(smileLip);

    for (const side of [-1, 1]) {
      const eyeDome = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), skinMaterial);
      eyeDome.position.set(side * 0.22, 0.64, -0.2);
      bodyGroup.add(eyeDome);

      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), irisMaterial);
      iris.position.set(side * 0.22, 0.65, -0.27);
      bodyGroup.add(iris);

      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), pupilMaterial);
      pupil.position.set(side * 0.22, 0.65, -0.34);
      bodyGroup.add(pupil);

      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.24, 4, 8), skinMaterial);
      thigh.rotation.x = Math.PI * 0.35;
      thigh.position.set(side * 0.42, 0.22, 0.16);
      bodyGroup.add(thigh);

      const webbedFoot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.38), skinMaterial);
      webbedFoot.position.set(side * 0.44, 0.05, 0.14);
      bodyGroup.add(webbedFoot);
    }
  } else {
    const torso = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.68, 8), skinMaterial);
    torso.rotation.x = -Math.PI * 0.18;
    torso.position.set(0, 0.36, 0.04);
    bodyGroup.add(torso);

    const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.36, 0), skinMaterial);
    head.scale.set(1.1, 0.78, 1.15);
    head.position.set(0, 0.44, -0.24);
    bodyGroup.add(head);

    const crownCrest = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.26, 5), irisMaterial);
    crownCrest.position.set(0, 0.74, -0.06);
    bodyGroup.add(crownCrest);

    const tongueTip = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.22), mouthMaterial);
    tongueTip.position.set(0, 0.28, -0.58);
    bodyGroup.add(tongueTip);

    for (const side of [-1, 1]) {
      const iris = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 1), irisMaterial);
      iris.position.set(side * 0.24, 0.64, -0.28);
      bodyGroup.add(iris);

      const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.08), pupilMaterial);
      pupil.position.set(side * 0.25, 0.64, -0.37);
      bodyGroup.add(pupil);

      const hindLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.36, 0.42), skinMaterial);
      hindLeg.rotation.z = side * -0.18;
      hindLeg.position.set(side * 0.42, 0.2, 0.18);
      bodyGroup.add(hindLeg);
    }
  }

  // Древесная Броня (Полая кора дерева — Bark Armor Shell)
  const barkArmorGroup = new THREE.Group();
  barkArmorGroup.visible = false;
  visualRoot.add(barkArmorGroup);

  const barkMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xffffff),
    map: getWoodBarkTexture(),
    roughness: 0.88,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });
  const mossMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.32, 0.62, 0.22),
    roughness: 0.78,
  });

  // Полый цилиндр коры с прорезью для глаз спереди
  const outerBarkShell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.56, 0.6, 0.62, 12, 1, true, Math.PI * 0.22, Math.PI * 1.56),
    barkMat
  );
  outerBarkShell.position.set(0, 0.4, 0.02);
  barkArmorGroup.add(outerBarkShell);

  // Верхний древесный козырек и сучок с мхом
  const topBarkCap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.56, 0.14, 10, 1, false),
    barkMat
  );
  topBarkCap.position.set(0, 0.72, 0.04);
  barkArmorGroup.add(topBarkCap);

  const knotBranch = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.32, 7), barkMat);
  knotBranch.rotation.z = -0.55;
  knotBranch.position.set(0.48, 0.56, 0.08);
  barkArmorGroup.add(knotBranch);

  const mossLeaf = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), mossMat);
  mossLeaf.scale.set(1.4, 0.5, 1.1);
  mossLeaf.position.set(-0.34, 0.74, 0.1);
  barkArmorGroup.add(mossLeaf);

  // Облачко пыли (Dust Cloud) при надевании полой коры дерева
  const dustCloudGroup = new THREE.Group();
  dustCloudGroup.visible = false;
  const dustMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.88, 0.84, 0.74),
    roughness: 0.9,
    transparent: true,
    opacity: 0.88,
  });
  const puffOffsets = [
    [0, 0.45, 0, 0.58],
    [-0.36, 0.42, -0.22, 0.42],
    [0.36, 0.44, -0.2, 0.42],
    [0, 0.68, 0.15, 0.44],
    [-0.28, 0.35, 0.32, 0.38],
    [0.28, 0.35, 0.32, 0.38],
  ];
  for (const [px, py, pz, pr] of puffOffsets) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(pr, 10, 8), dustMat);
    puff.position.set(px, py, pz);
    dustCloudGroup.add(puff);
  }
  visualRoot.add(dustCloudGroup);

  // Ground Shadow Disc
  const shadowGeo = new THREE.CircleGeometry(0.56, 20);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  const groundShadow = new THREE.Mesh(shadowGeo, shadowMat);
  groundShadow.position.set(0, 0.02, 0);
  groundShadow.renderOrder = 1;
  root.add(groundShadow);

  // Ground Trajectory Arrow
  const trajectoryGroup = new THREE.Group();
  trajectoryGroup.visible = false;
  const trajectoryMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.0, 0.95, 0.35),
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const shaftGeo = new THREE.BoxGeometry(0.2, 0.04, 1.2);
  const shaftMesh = new THREE.Mesh(shaftGeo, trajectoryMat);
  shaftMesh.position.set(0, 0.06, -0.8);
  trajectoryGroup.add(shaftMesh);

  const headGeo = new THREE.ConeGeometry(0.26, 0.44, 3);
  headGeo.rotateX(-Math.PI / 2);
  const headMesh = new THREE.Mesh(headGeo, trajectoryMat);
  headMesh.position.set(0, 0.06, -1.55);
  trajectoryGroup.add(headMesh);
  root.add(trajectoryGroup);

  // Overhead 3D Billboard Sprite: Name + HP + Circular 2D Buff Badges with Cooldown/Stack
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 360;
  labelCanvas.height = 156;
  const labelTexture = new THREE.CanvasTexture(labelCanvas);
  labelTexture.colorSpace = THREE.SRGBColorSpace;
  const spriteMat = new THREE.SpriteMaterial({
    map: labelTexture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const labelSprite = new THREE.Sprite(spriteMat);
  labelSprite.position.set(0, 1.82, 0);
  labelSprite.scale.set(3.3, 1.42, 1);
  labelSprite.renderOrder = 10;
  root.add(labelSprite);

  return {
    root,
    visualRoot,
    skinMaterial,
    barkArmorGroup,
    dustCloudGroup,
    groundShadow,
    trajectoryGroup,
    trajectoryMat,
    labelSprite,
    labelCanvas,
    labelTexture,
    lastLabelKey: "",
  };
}

/**
 * Рисует над лягушкой:
 * 1) Круглые 2D-иконки активных баффов с названием, числом зарядов (x1..x3) и радиальным кольцом КД/заряда.
 * 2) Плашку имени и здоровья лягушки.
 */
export function updateFrogOverheadLabel(
  rig: FrogVisualRig,
  nickname: string,
  hp: number,
  maxHp: number,
  teamId: number,
  buffStacks: FrogBuffStack[],
  isLocalPlayer = false
): void {
  const stackSig = buffStacks
    .map((b) => `${b.type}:${b.charges}:${b.cooldownProgress.toFixed(1)}`)
    .join(",");
  const key = `${nickname}|${hp}|${maxHp}|${teamId}|${stackSig}|${isLocalPlayer}`;
  if (rig.lastLabelKey === key) return;
  rig.lastLabelKey = key;

  const ctx = rig.labelCanvas.getContext("2d")!;
  const w = rig.labelCanvas.width;
  const h = rig.labelCanvas.height;
  ctx.clearRect(0, 0, w, h);

  // 1. Круглые 2D-индикаторы баффов над лягушкой (с иконкой, названием, зарядами x1..x3 и дугой КД)
  if (buffStacks.length > 0) {
    const circleR = 24;
    const spacing = 86;
    const startX = w / 2 - ((buffStacks.length - 1) * spacing) / 2;
    const centerY = 30;

    buffStacks.forEach((buff, i) => {
      const cx = startX + i * spacing;

      // Темный круговой фон
      ctx.fillStyle = "rgba(10, 24, 16, 0.92)";
      ctx.beginPath();
      ctx.arc(cx, centerY, circleR, 0, Math.PI * 2);
      ctx.fill();

      // Радиальная дуга заряда / КД
      ctx.strokeStyle = buff.colorHex;
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      const ratio = Math.max(0.15, buff.charges / buff.maxCharges);
      ctx.arc(
        cx,
        centerY,
        circleR - 2,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * ratio
      );
      ctx.stroke();

      // Иконка/текст внутри круга
      ctx.font = "bold 12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff";
      const iconSymbol =
        buff.type === PowerUpType.BARK_ARMOR
          ? "КОРА"
          : buff.type === PowerUpType.DOUBLE_JUMP
          ? "КРЫЛЬЯ"
          : "ПРУЖ";
      ctx.fillText(iconSymbol, cx, centerY - 1);

      // Стек зарядов (x1, x2, x3)
      ctx.font = "bold 13px system-ui, sans-serif";
      ctx.fillStyle = "#fde047";
      ctx.fillText(`x${buff.charges}`, cx, centerY + 14);
    });
  }

  // 2. Основная плашка имени и полоса здоровья
  const cardTop = 66;
  const teamPrefix = teamId === 0 ? "[СИНИЕ] " : teamId === 1 ? "[КРАСНЫЕ] " : "";
  const fullTitle = `${teamPrefix}${nickname}`;

  ctx.fillStyle = "rgba(8, 22, 15, 0.85)";
  ctx.strokeStyle = isLocalPlayer
    ? "#a3e635"
    : teamId === 0
    ? "#38bdf8"
    : teamId === 1
    ? "#f87171"
    : "rgba(255,255,255,0.28)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(30, cardTop, w - 60, 74, 14);
  ctx.fill();
  ctx.stroke();

  ctx.font = "bold 20px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = isLocalPlayer ? "#ecfccb" : "#ffffff";
  ctx.fillText(fullTitle, w / 2, cardTop + 26);

  const barW = w - 96;
  const barH = 16;
  const barX = 48;
  const barY = cardTop + 38;
  ctx.fillStyle = "rgba(0, 0, 0, 0.68)";
  ctx.fillRect(barX, barY, barW, barH);

  const hpRatio = Math.max(0, Math.min(1, hp / Math.max(1, maxHp)));
  ctx.fillStyle =
    hpRatio > 0.5 ? "#4ade80" : hpRatio > 0.25 ? "#facc15" : "#f87171";
  ctx.fillRect(barX + 2, barY + 2, Math.max(0, (barW - 4) * hpRatio), barH - 4);

  ctx.font = "bold 12px system-ui, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(`${Math.round(hp)} / ${Math.round(maxHp)} HP`, w / 2, barY + 12);

  rig.labelTexture.needsUpdate = true;
}

export interface ParsedObjSubMesh {
  materialName: string;
  geometry: THREE.BufferGeometry;
}

export interface LoadedFrogTemplates {
  variants: Record<number, ParsedObjSubMesh[]>;
  frogTexture: THREE.Texture | null;
}

let cachedTemplatesPromise: Promise<LoadedFrogTemplates | null> | null = null;
let cachedTemplatesSync: LoadedFrogTemplates | null = null;

/**
 * Парсер Wavefront .OBJ файлов с поддержкой нескольких материалов (usemtl),
 * нормализацией масштаба и центрированием по нижней точке (y = 0).
 */
function parseWavefrontObj(
  objText: string,
  targetHeight: number,
  rotYRad: number
): ParsedObjSubMesh[] {
  const positions: [number, number, number][] = [];
  const uvs: [number, number][] = [];
  const normals: [number, number, number][] = [];

  interface MatBucket {
    pos: number[];
    uv: number[];
    norm: number[];
  }
  const buckets = new Map<string, MatBucket>();
  let currentMat = "default";

  const getBucket = (name: string): MatBucket => {
    let b = buckets.get(name);
    if (!b) {
      b = { pos: [], uv: [], norm: [] };
      buckets.set(name, b);
    }
    return b;
  };

  const lines = objText.split(/\r?\n/);
  for (let l = 0; l < lines.length; l++) {
    const line = lines[l].trim();
    if (!line || line.startsWith("#")) continue;

    if (line.startsWith("v ")) {
      const parts = line.split(/\s+/);
      if (parts.length >= 4) {
        positions.push([
          parseFloat(parts[1]) || 0,
          parseFloat(parts[2]) || 0,
          parseFloat(parts[3]) || 0,
        ]);
      }
    } else if (line.startsWith("vt ")) {
      const parts = line.split(/\s+/);
      if (parts.length >= 3) {
        uvs.push([parseFloat(parts[1]) || 0, parseFloat(parts[2]) || 0]);
      }
    } else if (line.startsWith("vn ")) {
      const parts = line.split(/\s+/);
      if (parts.length >= 4) {
        normals.push([
          parseFloat(parts[1]) || 0,
          parseFloat(parts[2]) || 0,
          parseFloat(parts[3]) || 0,
        ]);
      }
    } else if (line.startsWith("usemtl ")) {
      currentMat = line.slice(7).trim() || "default";
    } else if (line.startsWith("f ")) {
      const tokens = line.split(/\s+/).slice(1);
      if (tokens.length < 3) continue;
      const bucket = getBucket(currentMat);

      for (let i = 1; i < tokens.length - 1; i++) {
        const tri = [tokens[0], tokens[i], tokens[i + 1]];
        for (const tok of tri) {
          const sub = tok.split("/");
          const vIdx = parseInt(sub[0], 10);
          const resolvedV =
            vIdx < 0 ? positions.length + vIdx : vIdx - 1;
          const p = positions[resolvedV] || [0, 0, 0];
          bucket.pos.push(p[0], p[1], p[2]);

          if (sub.length >= 2 && sub[1]) {
            const uvIdx = parseInt(sub[1], 10);
            const resolvedUv = uvIdx < 0 ? uvs.length + uvIdx : uvIdx - 1;
            const u = uvs[resolvedUv] || [0, 0];
            bucket.uv.push(u[0], u[1]);
          } else {
            bucket.uv.push(0, 0);
          }

          if (sub.length >= 3 && sub[2]) {
            const nIdx = parseInt(sub[2], 10);
            const resolvedN =
              nIdx < 0 ? normals.length + nIdx : nIdx - 1;
            const n = normals[resolvedN] || [0, 1, 0];
            bucket.norm.push(n[0], n[1], n[2]);
          }
        }
      }
    }
  }

  // Находим общий габаритный бокс всех саб-мешей, чтобы аккуратно отмасштабировать и поставить лапами на y=0
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

  const cosY = Math.cos(rotYRad);
  const sinY = Math.sin(rotYRad);

  for (const b of buckets.values()) {
    for (let i = 0; i < b.pos.length; i += 3) {
      const ox = b.pos[i];
      const oy = b.pos[i + 1];
      const oz = b.pos[i + 2];
      const rx = ox * cosY + oz * sinY;
      const rz = -ox * sinY + oz * cosY;
      b.pos[i] = rx;
      b.pos[i + 2] = rz;

      if (rx < minX) minX = rx;
      if (rx > maxX) maxX = rx;
      if (oy < minY) minY = oy;
      if (oy > maxY) maxY = oy;
      if (rz < minZ) minZ = rz;
      if (rz > maxZ) maxZ = rz;
    }
  }

  const spanY = Math.max(0.001, maxY - minY);
  const spanXZ = Math.max(0.001, maxX - minX, maxZ - minZ);
  const scale = targetHeight / Math.max(spanY, spanXZ * 0.85);
  const centerX = (minX + maxX) * 0.5;
  const centerZ = (minZ + maxZ) * 0.5;

  const result: ParsedObjSubMesh[] = [];
  for (const [matName, b] of buckets.entries()) {
    if (b.pos.length === 0) continue;
    for (let i = 0; i < b.pos.length; i += 3) {
      b.pos[i] = (b.pos[i] - centerX) * scale;
      b.pos[i + 1] = (b.pos[i + 1] - minY) * scale;
      b.pos[i + 2] = (b.pos[i + 2] - centerZ) * scale;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
    if (b.uv.length > 0) {
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
    }
    if (b.norm.length === b.pos.length) {
      // Повернем нормали так же вокруг Y
      for (let i = 0; i < b.norm.length; i += 3) {
        const nx = b.norm[i];
        const nz = b.norm[i + 2];
        b.norm[i] = nx * cosY + nz * sinY;
        b.norm[i + 2] = -nx * sinY + nz * cosY;
      }
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(b.norm, 3));
    } else {
      geo.computeVertexNormals();
    }
    geo.computeBoundingSphere();
    result.push({ materialName: matName, geometry: geo });
  }

  return result;
}

export async function loadFrogTemplates(): Promise<LoadedFrogTemplates | null> {
  if (cachedTemplatesSync) return cachedTemplatesSync;
  if (cachedTemplatesPromise) return cachedTemplatesPromise;

  cachedTemplatesPromise = (async () => {
    try {
      const [obj0Res, obj1Res, obj2Res, frogTex] = await Promise.all([
        fetch("/assets/models/Frog_01.obj").then((r) => (r.ok ? r.text() : "")),
        fetch("/assets/models/Mesh_Frog.obj").then((r) => (r.ok ? r.text() : "")),
        fetch("/assets/models/Frog.obj").then((r) => (r.ok ? r.text() : "")),
        new Promise<THREE.Texture | null>((resolve) => {
          const loader = new THREE.TextureLoader();
          loader.load(
            "/assets/models/Tex_Frog.png",
            (tex) => {
              tex.colorSpace = THREE.SRGBColorSpace;
              tex.needsUpdate = true;
              resolve(tex);
            },
            undefined,
            () => resolve(null)
          );
        }),
      ]);

      const variants: Record<number, ParsedObjSubMesh[]> = {};
      if (obj0Res) {
        // Frog_01.obj: воксельная/блочная жаба (4 материала: 4CAF50, 1A1A1A, FF9800, F44336)
        variants[0] = parseWavefrontObj(obj0Res, 0.92, Math.PI / 2);
      }
      if (obj1Res) {
        // Mesh_Frog.obj: классическая 3D-лягушка с UV под Tex_Frog.png
        variants[1] = parseWavefrontObj(obj1Res, 0.94, Math.PI);
      }
      if (obj2Res) {
        // Frog.obj: золотоглазая лягушка (Mat.7, Mat.1, Gold)
        variants[2] = parseWavefrontObj(obj2Res, 0.9, Math.PI / 2);
      }

      const loaded: LoadedFrogTemplates = { variants, frogTexture: frogTex };
      cachedTemplatesSync = loaded;
      return loaded;
    } catch {
      return null;
    }
  })();

  return cachedTemplatesPromise;
}

export function createFrogMeshBundle(
  colorHex: string,
  templates?: LoadedFrogTemplates | null,
  modelVariant = 0
): FrogVisualRig {
  const paletteIdx = FROG_PALETTE.findIndex(
    (p) => p.hex.toLowerCase() === colorHex.toLowerCase()
  );
  const resolvedIdx = paletteIdx >= 0 ? paletteIdx : 0;
  const safeVariant = ((modelVariant % 3) + 3) % 3;
  const rig = createFrogVisualRig(safeVariant, resolvedIdx, -1);

  const chosenColor = new THREE.Color(colorHex);
  rig.skinMaterial.color.copy(chosenColor);

  const activeTemplates = templates ?? cachedTemplatesSync;
  const subMeshes = activeTemplates?.variants?.[safeVariant];

  if (subMeshes && subMeshes.length > 0) {
    // Заменяем процедурную заготовку на настоящую 3D-модель из .OBJ библиотеки!
    const bodyGroup = rig.visualRoot.children[0] as THREE.Group | undefined;
    if (bodyGroup) {
      bodyGroup.clear();

      const pupilMat = new THREE.MeshStandardMaterial({
        color: 0x111113,
        roughness: 0.2,
        metalness: 0.15,
        side: THREE.DoubleSide,
      });
      const goldEyeMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0x78350f,
        emissiveIntensity: 0.2,
        roughness: 0.28,
        metalness: 0.35,
        side: THREE.DoubleSide,
      });
      const mouthMat = new THREE.MeshStandardMaterial({
        color: 0xef4444,
        roughness: 0.48,
        side: THREE.DoubleSide,
      });

      if (safeVariant === 1 && activeTemplates?.frogTexture) {
        rig.skinMaterial.map = activeTemplates.frogTexture;
        rig.skinMaterial.color.copy(
          new THREE.Color(0xffffff).lerp(chosenColor, 0.52)
        );
        rig.skinMaterial.roughness = 0.46;
        rig.skinMaterial.side = THREE.DoubleSide;
        rig.skinMaterial.needsUpdate = true;
      } else {
        rig.skinMaterial.map = safeVariant === 1 ? getSpottedFrogTexture() : null;
        rig.skinMaterial.color.copy(chosenColor);
        rig.skinMaterial.roughness = 0.5;
        rig.skinMaterial.side = THREE.DoubleSide;
        rig.skinMaterial.needsUpdate = true;
      }

      for (const sm of subMeshes) {
        const matKey = sm.materialName.toUpperCase();
        let mat: THREE.Material = rig.skinMaterial;
        if (matKey.includes("1A1A1A") || matKey.includes("MAT.1")) {
          mat = pupilMat;
        } else if (matKey.includes("FF9800") || matKey.includes("GOLD")) {
          mat = goldEyeMat;
        } else if (matKey.includes("F44336")) {
          mat = mouthMat;
        }
        const mesh = new THREE.Mesh(sm.geometry, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        bodyGroup.add(mesh);
      }
    }
  }

  return rig;
}

export function setFrogSquashedVisual(rig: FrogVisualRig, squashed: boolean): void {
  if (squashed) {
    rig.visualRoot.scale.set(1.48, 0.16, 1.48);
  } else {
    rig.visualRoot.scale.set(1, 1, 1);
  }
}

export function triggerFrogStompStretch(rig: FrogVisualRig): void {
  rig.visualRoot.scale.set(0.76, 1.38, 0.76);
}

export function updateFrogAnimation(
  rig: FrogVisualRig,
  dt: number,
  onGround: boolean,
  velY: number,
  _speedH: number,
  aimPower = 0,
  dustCloudProgress = 0
): void {
  // Плавная анимация облачка пыли при надевании или расколе полой коры дерева
  if (dustCloudProgress > 0 && dustCloudProgress < 1) {
    rig.dustCloudGroup.visible = true;
    const pulse = Math.sin(dustCloudProgress * Math.PI);
    rig.dustCloudGroup.scale.setScalar(0.55 + pulse * 0.95);
    rig.dustCloudGroup.rotation.y += dt * 4.5;
  } else {
    rig.dustCloudGroup.visible = false;
  }

  let targetScaleX = 1.0;
  let targetScaleY = 1.0;
  let targetScaleZ = 1.0;

  if (!onGround) {
    const stretch = Math.min(0.32, Math.abs(velY) * 0.022);
    targetScaleX = 1.0 - stretch * 0.45;
    targetScaleY = 1.0 + stretch;
    targetScaleZ = 1.0 - stretch * 0.45;
  } else if (aimPower > 0.02) {
    const crouch = aimPower * 0.34;
    targetScaleX = 1.0 + crouch * 0.48;
    targetScaleY = 1.0 - crouch;
    targetScaleZ = 1.0 + crouch * 0.48;
  }

  const lerpFactor = Math.min(1.0, dt * 14.0);
  rig.visualRoot.scale.x += (targetScaleX - rig.visualRoot.scale.x) * lerpFactor;
  rig.visualRoot.scale.y += (targetScaleY - rig.visualRoot.scale.y) * lerpFactor;
  rig.visualRoot.scale.z += (targetScaleZ - rig.visualRoot.scale.z) * lerpFactor;
}


