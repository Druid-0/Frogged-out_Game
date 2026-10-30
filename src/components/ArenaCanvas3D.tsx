import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  ARENA_CONSTANTS,
  AimIndicatorStyle,
  ControlMode,
  DEFAULT_FROG_CONFIG,
  DEFAULT_HOST_SETTINGS,
  FROG_PALETTE,
  FrogBuffStack,
  HostMatchSettings,
  MatchMode,
  PowerUpType,
  SwampMapVariant,
  Vec2,
  Vec3,
  addBuffChargeToStacks,
  botJumpPowerForDistance,
  calculateJumpVelocity,
  calculateStompDamage,
  clamp,
  computeFloodZoneState,
  computeSlingshotPower,
  computeSlingshotWorldDirection,
  consumeSingleBuffCharge,
  doesFrogTouchCameraTrigger,
  doesMapHaveInitialWater,
  evaluateVictoryConditions,
  getSwampTerrainHeight,
  isPointInSwampWater,
  resolveCircularTreeBoundaryCollision,
  shouldLilyPadSinkFromOccupants,
} from "../game/rules";
import {
  createFrogMeshBundle,
  loadFrogTemplates,
  setFrogSquashedVisual,
  triggerFrogStompStretch,
  updateFrogAnimation,
  updateFrogOverheadLabel,
} from "../game/frogModels";
import { soundEngine } from "../game/sound";

export interface ParticipantSetup {
  peerId: number;
  nickname: string;
  colorIndex: number;
  modelVariant?: number;
  teamId: number;
  isBot: boolean;
}

export interface HudFrogSnapshot {
  peerId: number;
  nickname: string;
  hp: number;
  maxHp: number;
  isAlive: boolean;
  isBot: boolean;
  teamId: number;
  colorHex: string;
  modelVariant: number;
  buffStacks: FrogBuffStack[];
  inWater: boolean;
}

export interface ArenaHudState {
  localHp: number;
  localMaxHp: number;
  localBuffStacks: FrogBuffStack[];
  localInWater: boolean;
  aliveCount: number;
  totalCount: number;
  zoneShrinking: boolean;
  zoneRadius: number;
  floodRaining?: boolean;
  floodWaterLevel?: number;
  floodCountdownSec?: number;
  hasInitialWater?: boolean;
  matchElapsedSec: number;
  frogs: HudFrogSnapshot[];
  statusBanner: string | null;
  winnerBanner: string | null;
  aimingPower: number;
}

interface FrogRuntime {
  peerId: number;
  nickname: string;
  colorIndex: number;
  modelVariant: number;
  teamId: number;
  isBot: boolean;
  hp: number;
  maxHp: number;
  isAlive: boolean;
  isSquashed: boolean;
  squashTimer: number;
  pos: Vec3;
  vel: Vec3;
  yaw: number;
  onGround: boolean;
  standingOnLilyPadIndex: number;
  inWater: boolean;
  waterDamageAccumSec: number;
  invulnTimer: number;
  zoneDamageAccumSec: number;
  botJumpTimer: number;
  buffStacks: FrogBuffStack[];
  airJumpsUsedSinceGround: number;
  dustCloudTimer: number;
  cameraLaughTriggeredThisJump: boolean;
  bundle: ReturnType<typeof createFrogMeshBundle>;
}

interface LilyPadRuntime {
  index: number;
  basePos: Vec3;
  state: "idle" | "overloaded_warning" | "sunk";
  timer: number;
  occupantsCount: number;
  group: THREE.Group;
  padMesh: THREE.Mesh;
  padMat: THREE.MeshStandardMaterial;
  ringMat: THREE.MeshBasicMaterial;
}

interface PowerUpPickupRuntime {
  index: number;
  pos: Vec3;
  type: PowerUpType;
  active: boolean;
  respawnTimer: number;
  bobPhase: number;
  group: THREE.Group;
}

interface ArenaCanvas3DProps {
  participants: ParticipantSetup[];
  localPeerId: number;
  matchMode: MatchMode;
  controlMode: ControlMode;
  aimIndicatorStyle?: AimIndicatorStyle;
  hostSettings?: HostMatchSettings;
  soundMuted: boolean;
  onHudUpdate: (hud: ArenaHudState) => void;
  onMatchFinished?: (winnerText: string) => void;
  onLocalJump?: (dir: Vec3, power: number, pos: Vec3) => void;
  remoteJumpQueueRef?: React.MutableRefObject<
    Array<{ peerId: number; dir: Vec3; power: number; pos?: Vec3 }>
  >;
  matchSeed?: number;
}

/**
 * Создает процедурную 3D-модель высокого дряхлого болотного дерева:
 * искривленный узловатый ствол, мощные корни-подпорки уходящие в трясину,
 * сухие корявые ветви, свисающий болотный мох (тина) и светящиеся трутовики.
 */
function createDecrepitSwampTree(
  seedAngle: number,
  heightScale: number,
  leanTowardOutside = true
): THREE.Group {
  const treeGroup = new THREE.Group();

  const barkColor = new THREE.Color().setHSL(
    0.07 + Math.sin(seedAngle * 3.1) * 0.015,
    0.26,
    0.16 + Math.cos(seedAngle * 5.7) * 0.03
  );
  const darkRotBarkMat = new THREE.MeshStandardMaterial({
    color: barkColor,
    roughness: 0.96,
    metalness: 0.03,
  });

  const hollowWoodMat = new THREE.MeshStandardMaterial({
    color: 0x160f0a,
    roughness: 0.99,
  });

  const mossMat = new THREE.MeshStandardMaterial({
    color: 0x3b6e38,
    roughness: 0.92,
  });

  const hangingMossMat = new THREE.MeshStandardMaterial({
    color: 0x4d7c3f,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });

  const trunkHeight = 6.2 * heightScale;
  const baseRadius = 0.56 * Math.sqrt(heightScale);
  const topRadius = 0.19 * Math.sqrt(heightScale);

  // Нижняя часть ствола (узловатая и наклоненная)
  const lowerTrunkGeo = new THREE.CylinderGeometry(
    baseRadius * 0.72,
    baseRadius,
    trunkHeight * 0.52,
    7
  );
  const lowerTrunk = new THREE.Mesh(lowerTrunkGeo, darkRotBarkMat);
  lowerTrunk.position.y = trunkHeight * 0.25;
  const leanSign = leanTowardOutside ? 1 : -1;
  lowerTrunk.rotation.z = leanSign * (0.06 + Math.sin(seedAngle * 2.3) * 0.05);
  lowerTrunk.rotation.x = Math.cos(seedAngle * 1.9) * 0.06;
  lowerTrunk.castShadow = true;
  lowerTrunk.receiveShadow = true;
  treeGroup.add(lowerTrunk);

  // Верхняя искривленная часть ствола
  const upperTrunkGeo = new THREE.CylinderGeometry(
    topRadius,
    baseRadius * 0.72,
    trunkHeight * 0.55,
    7
  );
  const upperTrunk = new THREE.Mesh(upperTrunkGeo, darkRotBarkMat);
  upperTrunk.position.set(
    Math.sin(seedAngle) * 0.18,
    trunkHeight * 0.72,
    Math.cos(seedAngle) * 0.14
  );
  upperTrunk.rotation.z = -lowerTrunk.rotation.z * 1.35 + 0.08;
  upperTrunk.rotation.x = -lowerTrunk.rotation.x * 1.2;
  upperTrunk.castShadow = true;
  treeGroup.add(upperTrunk);

  // Темное дупло в старом стволе
  const hollowMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(baseRadius * 0.34, baseRadius * 0.38, 0.22, 8),
    hollowWoodMat
  );
  hollowMesh.rotation.x = Math.PI / 2;
  hollowMesh.position.set(0, trunkHeight * 0.32, -baseRadius * 0.65);
  treeGroup.add(hollowMesh);

  // Корни-подпорки, впивающиеся в болотную грязь
  const rootCount = 4;
  for (let r = 0; r < rootCount; r++) {
    const rAng = (r / rootCount) * Math.PI * 2 + (seedAngle % 0.7);
    const rootLen = 1.35 + (r % 2) * 0.45;
    const rootMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.24, rootLen, 6),
      darkRotBarkMat
    );
    rootMesh.position.set(
      Math.cos(rAng) * (baseRadius * 0.85),
      0.38,
      Math.sin(rAng) * (baseRadius * 0.85)
    );
    rootMesh.rotation.z = -Math.cos(rAng) * 0.68;
    rootMesh.rotation.x = Math.sin(rAng) * 0.68;
    rootMesh.castShadow = true;
    treeGroup.add(rootMesh);
  }

  // Мшистая шапка у корней
  const rootMoss = new THREE.Mesh(
    new THREE.DodecahedronGeometry(baseRadius * 1.15, 0),
    mossMat
  );
  rootMoss.scale.set(1.2, 0.36, 1.2);
  rootMoss.position.set(0, 0.14, 0);
  treeGroup.add(rootMoss);

  // Сухие корявые сучья и ветви со свисающей болотной тиной
  const branchCount = 4;
  for (let b = 0; b < branchCount; b++) {
    const bAngle = seedAngle * 1.7 + (b * Math.PI * 2) / branchCount;
    const branchY = trunkHeight * (0.48 + b * 0.13);
    const branchLen = (1.4 + (b % 2) * 0.65) * Math.sqrt(heightScale);

    const branchPivot = new THREE.Group();
    branchPivot.position.set(0, branchY, 0);
    branchPivot.rotation.y = bAngle;

    const branchMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.14, branchLen, 5),
      darkRotBarkMat
    );
    branchMesh.position.set(branchLen * 0.42, 0.22, 0);
    branchMesh.rotation.z = -1.08;
    branchMesh.castShadow = true;
    branchPivot.add(branchMesh);

    // Свисающие пряди болотного мха с корявых ветвей
    const mossStrand = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 1.15 * Math.sqrt(heightScale), 5),
      hangingMossMat
    );
    mossStrand.position.set(branchLen * 0.72, -0.35, 0);
    mossStrand.rotation.x = Math.PI; // острием вниз
    branchPivot.add(mossStrand);

    // Редкая болотная хвоя/листва на верхушке старого дерева
    if (b >= 1) {
      const canopyTuft = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.68 * Math.sqrt(heightScale), 0),
        mossMat
      );
      canopyTuft.scale.set(1.35, 0.55, 1.15);
      canopyTuft.position.set(branchLen * 0.78, 0.38, 0);
      branchPivot.add(canopyTuft);
    }

    treeGroup.add(branchPivot);
  }

  // Болотные грибы-трутовики на коре
  const fungusMat = new THREE.MeshStandardMaterial({
    color: 0x65a30d,
    emissive: 0x365314,
    emissiveIntensity: 0.45,
    roughness: 0.6,
  });
  for (let f = 0; f < 2; f++) {
    const fMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.08, 0.07, 7),
      fungusMat
    );
    fMesh.position.set(
      Math.cos(seedAngle + f * 1.8) * (baseRadius * 0.75),
      1.1 + f * 0.85,
      Math.sin(seedAngle + f * 1.8) * (baseRadius * 0.75)
    );
    treeGroup.add(fMesh);
  }

  return treeGroup;
}

export const ArenaCanvas3D: React.FC<ArenaCanvas3DProps> = ({
  participants,
  localPeerId,
  matchMode,
  controlMode,
  aimIndicatorStyle = AimIndicatorStyle.ARROW,
  hostSettings = DEFAULT_HOST_SETTINGS,
  soundMuted,
  onHudUpdate,
  onMatchFinished,
  onLocalJump,
  remoteJumpQueueRef,
  matchSeed = 1,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [webGlError, setWebGlError] = useState<string | null>(null);

  const controlModeRef = useRef<ControlMode>(controlMode);
  controlModeRef.current = controlMode;

  const aimIndicatorStyleRef = useRef<AimIndicatorStyle>(aimIndicatorStyle);
  aimIndicatorStyleRef.current = aimIndicatorStyle;

  const hostSettingsRef = useRef<HostMatchSettings>(hostSettings);
  hostSettingsRef.current = hostSettings;

  const onLocalJumpRef = useRef(onLocalJump);
  onLocalJumpRef.current = onLocalJump;

  useEffect(() => {
    soundEngine.setMuted(soundMuted);
  }, [soundMuted]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch (err) {
      setWebGlError(err instanceof Error ? err.message : "WebGL недоступен");
      return;
    }

    const gl = renderer.getContext();
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    const rendererStr = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : "";
    const isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software/i.test(rendererStr);

    const initWidth = container.clientWidth || window.innerWidth;
    const initHeight = container.clientHeight || window.innerHeight;
    renderer.setSize(initWidth, initHeight);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const activeHost = hostSettingsRef.current;
    const mapVariant = activeHost.mapVariant;

    const bgColorHex =
      mapVariant === SwampMapVariant.DEEP_MIRE
        ? 0x0b1917
        : mapVariant === SwampMapVariant.ROTTEN_STUMPS
        ? 0x1a150e
        : mapVariant === SwampMapVariant.FIREFLY_GROVE
        ? 0x0d1f16
        : 0x112217;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(bgColorHex);
    scene.fog = new THREE.FogExp2(bgColorHex, 0.016);

    // 2.5D изометрическая камера над круглой болотной ареной
    const camera = new THREE.PerspectiveCamera(38, initWidth / initHeight, 0.1, 160);
    const baseCamPos = new THREE.Vector3(0, 21.5, 22.0);
    const baseCamTarget = new THREE.Vector3(0, -0.3, 0.3);
    camera.position.copy(baseCamPos);
    camera.lookAt(baseCamTarget);

    // Атмосферное болотное освещение
    const hemiLight = new THREE.HemisphereLight(0xa3e635, 0x1a2e1a, 0.88);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfef08a, 1.35);
    sunLight.position.set(13, 25, 15);
    sunLight.castShadow = !isSoftwareGl;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 2;
    sunLight.shadow.camera.far = 65;
    const d = 16;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    const swampFillLight = new THREE.DirectionalLight(0x2dd4bf, 0.45);
    swampFillLight.position.set(-14, 11, -12);
    scene.add(swampFillLight);

    // ==================== КРУГЛАЯ БОЛОТНАЯ КАРТА («БОЛОТО») ====================
    const arenaGroup = new THREE.Group();
    scene.add(arenaGroup);

    const arenaR = ARENA_CONSTANTS.arenaRadius; // 10.6m

    // 1. Внешняя бескрайняя трясина вокруг круглой арены
    const outerMireGeo = new THREE.RingGeometry(arenaR + 0.2, 34, 64);
    outerMireGeo.rotateX(-Math.PI / 2);
    const outerMireMat = new THREE.MeshStandardMaterial({
      color: 0x0b1610,
      roughness: 0.92,
      metalness: 0.08,
    });
    const outerMireMesh = new THREE.Mesh(outerMireGeo, outerMireMat);
    outerMireMesh.position.y = ARENA_CONSTANTS.waterLevelY - 0.12;
    arenaGroup.add(outerMireMesh);

    // 2. Неровный круглый болотный рельеф (Radial Disc Mesh с вершинными цветами)
    const radialSegments = isSoftwareGl ? 48 : 72;
    const ringSegments = isSoftwareGl ? 28 : 38;
    const discRadius = arenaR + 1.15;
    const terrainGeo = new THREE.PlaneGeometry(
      discRadius * 2,
      discRadius * 2,
      radialSegments,
      ringSegments
    );
    terrainGeo.rotateX(-Math.PI / 2);

    const posAttr = terrainGeo.attributes.position;
    const colors: number[] = [];
    const cDeepMud = new THREE.Color(0x1f2419);
    const cWetPeat = new THREE.Color(
      mapVariant === SwampMapVariant.ROTTEN_STUMPS ? 0x4a3419 : 0x3a3220
    );
    const cSwampMoss = new THREE.Color(
      mapVariant === SwampMapVariant.FIREFLY_GROVE ? 0x297045 : 0x36652c
    );
    const cLushHummock = new THREE.Color(
      mapVariant === SwampMapVariant.ROTTEN_STUMPS ? 0x657c2c : 0x4f8737
    );

    for (let i = 0; i < posAttr.count; i++) {
      let vx = posAttr.getX(i);
      let vz = posAttr.getZ(i);
      const r = Math.hypot(vx, vz);

      // Скругляем сетку в круглый болотный остров радиуса discRadius
      if (r > discRadius) {
        const scale = discRadius / r;
        vx *= scale;
        vz *= scale;
        posAttr.setX(i, vx);
        posAttr.setZ(i, vz);
      }

      const clampedR = Math.hypot(vx, vz);
      let vy = getSwampTerrainHeight(vx, vz, mapVariant);

      // Мягкий береговой обрыв за кольцом дряхлых деревьев
      if (clampedR > arenaR + 0.35) {
        const edgeDrop = (clampedR - (arenaR + 0.35)) * 0.65;
        vy -= edgeDrop;
      }
      posAttr.setY(i, vy);

      const vertexColor = new THREE.Color();
      if (vy < ARENA_CONSTANTS.waterLevelY - 0.04) {
        vertexColor.copy(cDeepMud);
      } else if (vy < 0.03) {
        vertexColor.copy(cWetPeat).lerp(cSwampMoss, (vy + 0.14) / 0.17);
      } else {
        vertexColor.copy(cSwampMoss).lerp(cLushHummock, clamp(vy / 0.58, 0, 1));
      }
      colors.push(vertexColor.r, vertexColor.g, vertexColor.b);
    }
    terrainGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    terrainGeo.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.04,
    });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    arenaGroup.add(terrainMesh);

    const mapHasInitialWater = doesMapHaveInitialWater(mapVariant);

    // 3. Полупрозрачная круглая болотная вода / уровень потопа (при нахождении в ней снимается HP)
    const waterGeo = new THREE.CircleGeometry(discRadius + 1.5, 64);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshStandardMaterial({
      color:
        mapVariant === SwampMapVariant.DEEP_MIRE
          ? 0x0f766e
          : mapVariant === SwampMapVariant.FIREFLY_GROVE
          ? 0x115e59
          : 0x1e4e3a,
      emissive: 0x07261d,
      emissiveIntensity: 0.35,
      roughness: 0.18,
      metalness: 0.15,
      transparent: true,
      opacity: 0.78,
    });
    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.position.y = mapHasInitialWater ? ARENA_CONSTANTS.waterLevelY : -0.65;
    waterMesh.visible = mapHasInitialWater;
    waterMesh.receiveShadow = true;
    arenaGroup.add(waterMesh);

    // 3b. Уникальные элементы карт: «Гнилые Пни» и «Роща Светлячков»
    if (mapVariant === SwampMapVariant.ROTTEN_STUMPS) {
      const stumpBarkMat = new THREE.MeshStandardMaterial({
        color: 0x452813,
        roughness: 0.95,
      });
      const stumpTopMat = new THREE.MeshStandardMaterial({
        color: 0x714722,
        roughness: 0.88,
      });
      const stumpCenters = [
        { x: -3.2, z: 0 },
        { x: 3.2, z: 0 },
        { x: 0, z: -3.2 },
        { x: 0, z: 3.2 },
      ];
      for (const sc of stumpCenters) {
        const sy = getSwampTerrainHeight(sc.x, sc.z, mapVariant);
        const stumpRing = new THREE.Mesh(
          new THREE.CylinderGeometry(1.15, 1.38, 0.38, 12),
          stumpBarkMat
        );
        stumpRing.position.set(sc.x, sy - 0.12, sc.z);
        stumpRing.castShadow = true;
        stumpRing.receiveShadow = true;
        arenaGroup.add(stumpRing);

        const stumpCore = new THREE.Mesh(
          new THREE.CylinderGeometry(0.95, 0.95, 0.4, 12),
          stumpTopMat
        );
        stumpCore.position.set(sc.x, sy - 0.1, sc.z);
        arenaGroup.add(stumpCore);
      }
    } else if (mapVariant === SwampMapVariant.FIREFLY_GROVE) {
      const glowOrbMat = new THREE.MeshBasicMaterial({
        color: 0xbef264,
      });
      for (let i = 0; i < 14; i++) {
        const angle = (i / 14) * Math.PI * 2;
        const rad = 3.5 + (i % 3) * 2.2;
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), glowOrbMat);
        orb.position.set(
          Math.cos(angle) * rad,
          0.9 + (i % 4) * 0.45,
          Math.sin(angle) * rad
        );
        arenaGroup.add(orb);
      }
    }

    // 4. ВЫСОКИЕ ДРЯХЛЫЕ ДЕРЕВЬЯ В СТИЛИСТИКЕ БОЛОТА ПО ПЕРИМЕТРУ КРУГЛОЙ КАРТЫ (ВМЕСТО СТЕН)
    const treeCount = ARENA_CONSTANTS.decrepitTreeCount; // 28 деревьев по кругу
    const treeRingR = ARENA_CONSTANTS.decrepitTreeRingRadius; // 10.95m
    const rootBarrierMat = new THREE.MeshStandardMaterial({
      color: 0x3b2818,
      roughness: 0.95,
    });
    const rootMossMat = new THREE.MeshStandardMaterial({
      color: 0x3f6e33,
      roughness: 0.9,
    });

    for (let i = 0; i < treeCount; i++) {
      const angle = (i / treeCount) * Math.PI * 2;
      const radialJitter = Math.sin(i * 3.7) * 0.25;
      const tx = Math.cos(angle) * (treeRingR + radialJitter);
      const tz = Math.sin(angle) * (treeRingR + radialJitter);
      const ty = getSwampTerrainHeight(tx, tz, mapVariant);

      // На южной дуге перед камерой (z > 7.8 и |x| < 5.8) деревья чуть ниже и сильнее наклонены наружу,
      // чтобы не перекрывать обзор игроку, но сохранять полное кольцо дряхлых деревьев
      const isFrontCameraArc = tz > 7.8 && Math.abs(tx) < 5.8;
      const heightScale = isFrontCameraArc
        ? 0.58 + (i % 2) * 0.12
        : 0.95 + (Math.sin(i * 2.1) * 0.5 + 0.5) * 0.55;

      const decrepitTree = createDecrepitSwampTree(angle, heightScale, true);
      decrepitTree.position.set(tx, ty - 0.15, tz);
      // Поворачиваем так, чтобы наклон дерева шел наружу от центра круга
      decrepitTree.rotation.y = -angle;
      arenaGroup.add(decrepitTree);

      // Между соседними дряхлыми деревьями плетутся толстые узловатые корни и поваленные гнилые стволы,
      // образующие непрерывную круглую границу болота
      const nextAngle = ((i + 1) / treeCount) * Math.PI * 2;
      const midAngle = (angle + nextAngle) * 0.5;
      const rootArcRadius = arenaR + 0.18;
      const rx = Math.cos(midAngle) * rootArcRadius;
      const rz = Math.sin(midAngle) * rootArcRadius;
      const ry = getSwampTerrainHeight(rx, rz, mapVariant);

      const chordLen = (2 * Math.PI * rootArcRadius) / treeCount;
      const tangledRoot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.32, chordLen * 1.15, 6),
        rootBarrierMat
      );
      tangledRoot.position.set(rx, ry + 0.18, rz);
      tangledRoot.rotation.z = Math.PI / 2;
      tangledRoot.rotation.y = -midAngle;
      tangledRoot.castShadow = true;
      tangledRoot.receiveShadow = true;
      arenaGroup.add(tangledRoot);

      // Мшистый нарост на корневище
      const mossCap = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 7, 6),
        rootMossMat
      );
      mossCap.scale.set(1.4, 0.5, 1.0);
      mossCap.position.set(rx, ry + 0.34, rz);
      arenaGroup.add(mossCap);
    }

    // 5. Внутренняя болотная растительность: камыши (рогоз), коряги, камни во мху и светящиеся грибы
    const vegDensity = clamp(activeHost.vegetationDensityMultiplier, 0.5, 2.5);
    const reedCount = Math.round(28 * vegDensity);
    const reedStemMat = new THREE.MeshStandardMaterial({ color: 0x3f6b29, roughness: 0.85 });
    const cattailHeadMat = new THREE.MeshStandardMaterial({ color: 0x4a2c18, roughness: 0.92 });

    for (let i = 0; i < reedCount; i++) {
      const angle = (i / reedCount) * Math.PI * 2 + (i % 3) * 0.21;
      const radius = 3.0 + ((i * 1.618) % 1) * (arenaR - 3.6);
      const rx = Math.cos(angle) * radius;
      const rz = Math.sin(angle) * radius;
      if (Math.hypot(rx, rz) < 2.2) continue;

      const ry = getSwampTerrainHeight(rx, rz, mapVariant);
      const reedCluster = new THREE.Group();
      reedCluster.position.set(rx, ry - 0.08, rz);

      const stalks = 2 + (i % 3);
      for (let s = 0; s < stalks; s++) {
        const h = 0.85 + ((i + s) % 3) * 0.28;
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, h, 5), reedStemMat);
        stalk.position.set((s - 1) * 0.14, h * 0.5, ((s * 2) % 3 - 1) * 0.12);
        stalk.rotation.z = (s - 1) * 0.09;
        reedCluster.add(stalk);

        if (s % 2 === 0) {
          const head = new THREE.Mesh(
            new THREE.CylinderGeometry(0.065, 0.065, 0.26, 6),
            cattailHeadMat
          );
          head.position.set(stalk.position.x, h - 0.14, stalk.position.z);
          head.rotation.z = stalk.rotation.z;
          reedCluster.add(head);
        }
      }
      arenaGroup.add(reedCluster);
    }

    // Болотные мшистые валуны и светящиеся поганки внутри круглой арены
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x4b5548, roughness: 0.92 });
    const shroomCapMat = new THREE.MeshStandardMaterial({
      color: 0x4ade80,
      emissive: 0x22c55e,
      emissiveIntensity: 0.55,
      roughness: 0.4,
    });
    const shroomStemMat = new THREE.MeshStandardMaterial({ color: 0xd9f99d, roughness: 0.7 });

    const propAngles = [0.4, 1.25, 2.1, 2.95, 3.8, 4.7, 5.55];
    for (let i = 0; i < propAngles.length; i++) {
      const a = propAngles[i];
      const rad = 6.2 + (i % 2) * 1.9;
      const px = Math.cos(a) * rad;
      const pz = Math.sin(a) * rad;
      const py = getSwampTerrainHeight(px, pz, mapVariant);

      const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(0.46, 0), rockMat);
      boulder.scale.set(1.25, 0.68, 1.1);
      boulder.position.set(px, py + 0.12, pz);
      boulder.castShadow = true;
      boulder.receiveShadow = true;
      arenaGroup.add(boulder);

      const shroom = new THREE.Group();
      shroom.position.set(px + 0.36, py + 0.05, pz + 0.22);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.24, 6), shroomStemMat);
      stem.position.y = 0.12;
      const cap = new THREE.Mesh(
        new THREE.ConeGeometry(0.17, 0.15, 8),
        shroomCapMat
      );
      cap.position.y = 0.26;
      shroom.add(stem, cap);
      arenaGroup.add(shroom);
    }

    // 6. Центральный болотный гейзер-кочка (батут из упругого мха и гриба)
    const centerGroup = new THREE.Group();
    const centerGroundY = getSwampTerrainHeight(0, 0, mapVariant);
    centerGroup.position.set(0, centerGroundY, 0);
    arenaGroup.add(centerGroup);

    const baseRingMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(
        ARENA_CONSTANTS.centerBounceRadius * 1.15,
        ARENA_CONSTANTS.centerBounceRadius * 1.32,
        0.22,
        24
      ),
      new THREE.MeshStandardMaterial({ color: 0x3f2e1e, roughness: 0.85 })
    );
    baseRingMesh.position.y = 0.08;
    centerGroup.add(baseRingMesh);

    const centerPadMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(
        ARENA_CONSTANTS.centerBounceRadius * 0.92,
        ARENA_CONSTANTS.centerBounceRadius * 1.02,
        0.26,
        24
      ),
      new THREE.MeshStandardMaterial({
        color: 0x84cc16,
        emissive: 0x3f6212,
        emissiveIntensity: 0.45,
        roughness: 0.35,
      })
    );
    centerPadMesh.position.y = 0.2;
    centerGroup.add(centerPadMesh);

    // 7. Кувшинки на воде (на картах с изначальной водой)
    const lilyPads: LilyPadRuntime[] = ARENA_CONSTANTS.lilyPadPositions.map((pos, index) => {
      const group = new THREE.Group();
      const padY = ARENA_CONSTANTS.waterLevelY + 0.05;
      group.position.set(pos.x, padY, pos.z);
      group.visible = mapHasInitialWater;
      arenaGroup.add(group);

      const padMat = new THREE.MeshStandardMaterial({
        color: 0x2fa84f,
        roughness: 0.72,
      });
      const padMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(
          ARENA_CONSTANTS.lilyPadRadius,
          ARENA_CONSTANTS.lilyPadRadius * 0.95,
          0.11,
          22
        ),
        padMat
      );
      padMesh.castShadow = true;
      padMesh.receiveShadow = true;
      group.add(padMesh);

      // Вырез листа кувшинки + кувшинковый цветок сбоку
      const flowerMat = new THREE.MeshStandardMaterial({
        color: 0xfde047,
        emissive: 0xca8a04,
        emissiveIntensity: 0.25,
      });
      const flower = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.16, 6), flowerMat);
      flower.position.set(ARENA_CONSTANTS.lilyPadRadius * 0.62, 0.1, 0.2);
      padMesh.add(flower);

      const ringGeo = new THREE.RingGeometry(
        ARENA_CONSTANTS.lilyPadRadius * 0.86,
        ARENA_CONSTANTS.lilyPadRadius * 1.03,
        24
      );
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x86efac,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.45,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.y = 0.065;
      padMesh.add(ringMesh);

      return {
        index,
        basePos: { x: pos.x, y: padY, z: pos.z },
        state: "idle",
        timer: 0,
        occupantsCount: 0,
        group,
        padMesh,
        padMat,
        ringMat,
      };
    });

    // 8. Одноразовые стакающиеся баффы (Древесная броня — полая кора, Крылья стрекозы, Турбо-пружина)
    const pickups: PowerUpPickupRuntime[] = [0, 1, 2].map((idx) => {
      const candidate = ARENA_CONSTANTS.pickupSpawnCandidates[idx];
      const groundY = Math.max(
        ARENA_CONSTANTS.waterLevelY + 0.15,
        getSwampTerrainHeight(candidate.x, candidate.z, mapVariant)
      );
      const group = new THREE.Group();
      group.position.set(candidate.x, groundY + 0.68, candidate.z);
      arenaGroup.add(group);

      const type = (idx % 3) as PowerUpType;

      if (type === PowerUpType.BARK_ARMOR) {
        // Модель полой коры дерева
        const barkPickupMat = new THREE.MeshStandardMaterial({
          color: 0x78350f,
          emissive: 0x451a03,
          emissiveIntensity: 0.35,
          roughness: 0.9,
          side: THREE.DoubleSide,
        });
        const barkShell = new THREE.Mesh(
          new THREE.CylinderGeometry(0.36, 0.42, 0.56, 10, 1, true, 0, Math.PI * 1.45),
          barkPickupMat
        );
        barkShell.rotation.z = 0.35;
        group.add(barkShell);

        const mossPatch = new THREE.Mesh(
          new THREE.BoxGeometry(0.28, 0.12, 0.24),
          new THREE.MeshStandardMaterial({ color: 0x4d7c0f, roughness: 0.85 })
        );
        mossPatch.position.set(0, 0.22, 0.28);
        group.add(mossPatch);
      } else if (type === PowerUpType.DOUBLE_JUMP) {
        // Крылья стрекозы
        const wingMat = new THREE.MeshStandardMaterial({
          color: 0xfacc15,
          emissive: 0xca8a04,
          emissiveIntensity: 0.45,
          roughness: 0.25,
        });
        const leftWing = new THREE.Mesh(new THREE.OctahedronGeometry(0.38, 0), wingMat);
        leftWing.scale.set(1.4, 0.35, 0.6);
        leftWing.position.x = -0.22;
        leftWing.rotation.z = 0.3;
        const rightWing = leftWing.clone();
        rightWing.position.x = 0.22;
        rightWing.rotation.z = -0.3;
        group.add(leftWing, rightWing);
      } else {
        // Турбо-пружина
        const springMat = new THREE.MeshStandardMaterial({
          color: 0xf97316,
          emissive: 0x9a3412,
          emissiveIntensity: 0.45,
          roughness: 0.3,
        });
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.11, 10, 20), springMat);
        coil.rotation.x = Math.PI / 2;
        group.add(coil);
      }

      const haloGeo = new THREE.RingGeometry(0.45, 0.6, 20);
      haloGeo.rotateX(-Math.PI / 2);
      const haloColor =
        type === PowerUpType.BARK_ARMOR
          ? 0xd97706
          : type === PowerUpType.DOUBLE_JUMP
          ? 0xfacc15
          : 0xf97316;
      const haloMesh = new THREE.Mesh(
        haloGeo,
        new THREE.MeshBasicMaterial({
          color: haloColor,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.65,
        })
      );
      haloMesh.position.y = -0.46;
      group.add(haloMesh);

      return {
        index: idx,
        pos: { x: candidate.x, y: groundY, z: candidate.z },
        type,
        active: true,
        respawnTimer: 0,
        bobPhase: idx * 1.9,
        group,
      };
    });

    // 9. Эффекты Потопа (приливные круги из водоёмов + 3D-ливень на картах без воды)
    const tideWaveRings: THREE.Mesh[] = ARENA_CONSTANTS.lilyPadPositions.map((pos) => {
      const rGeo = new THREE.RingGeometry(1.1, 1.32, 32);
      rGeo.rotateX(-Math.PI / 2);
      const rMat = new THREE.MeshBasicMaterial({
        color: 0x5eead4,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.0,
      });
      const rMesh = new THREE.Mesh(rGeo, rMat);
      rMesh.position.set(pos.x, ARENA_CONSTANTS.waterLevelY + 0.03, pos.z);
      rMesh.visible = false;
      arenaGroup.add(rMesh);
      return rMesh;
    });

    // 3D-ливень для карт без начальной воды (начинается дождь и потоп)
    const rainDropCount = isSoftwareGl ? 90 : 180;
    const rainPositions = new Float32Array(rainDropCount * 6);
    const rainDropsData: Array<{ x: number; y: number; z: number; speed: number }> = [];
    for (let i = 0; i < rainDropCount; i++) {
      const rx = (Math.random() - 0.5) * 22;
      const ry = Math.random() * 14 + 1;
      const rz = (Math.random() - 0.5) * 22;
      const speed = 15 + Math.random() * 6;
      rainDropsData.push({ x: rx, y: ry, z: rz, speed });
      const idx6 = i * 6;
      rainPositions[idx6] = rx;
      rainPositions[idx6 + 1] = ry;
      rainPositions[idx6 + 2] = rz;
      rainPositions[idx6 + 3] = rx - 0.12;
      rainPositions[idx6 + 4] = ry - 0.75;
      rainPositions[idx6 + 5] = rz + 0.08;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPositions, 3));
    const rainMat = new THREE.LineBasicMaterial({
      color: 0x99f6e4,
      transparent: true,
      opacity: 0.62,
    });
    const rainLinesMesh = new THREE.LineSegments(rainGeo, rainMat);
    rainLinesMesh.visible = false;
    scene.add(rainLinesMesh);

    // 10. Прицеливание: классическая 3D-стрелка (по умолчанию) + точки луча траектории
    const trajectoryDots: THREE.Mesh[] = [];
    const dotGeo = new THREE.SphereGeometry(0.13, 10, 10);
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.9,
    });
    for (let i = 0; i < 16; i++) {
      const dot = new THREE.Mesh(dotGeo, dotMat.clone());
      dot.visible = false;
      scene.add(dot);
      trajectoryDots.push(dot);
    }

    // Классическая 3D-стрелка направления и силы натяжения прыжка (как было раньше, по умолчанию)
    const aimArrowGroup = new THREE.Group();
    aimArrowGroup.visible = false;
    scene.add(aimArrowGroup);

    const arrowMat = new THREE.MeshBasicMaterial({
      color: 0x84cc16,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
    });
    const arrowBorderMat = new THREE.MeshBasicMaterial({
      color: 0x1e1005,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });

    const arrowScaleNode = new THREE.Group();
    aimArrowGroup.add(arrowScaleNode);

    const shaftGeo = new THREE.BoxGeometry(0.24, 0.06, 1.0);
    shaftGeo.translate(0, 0, 0.5);
    const arrowShaft = new THREE.Mesh(shaftGeo, arrowMat);
    arrowScaleNode.add(arrowShaft);

    const shaftOutlineGeo = new THREE.BoxGeometry(0.32, 0.04, 1.04);
    shaftOutlineGeo.translate(0, -0.01, 0.5);
    const arrowShaftOutline = new THREE.Mesh(shaftOutlineGeo, arrowBorderMat);
    arrowScaleNode.add(arrowShaftOutline);

    const headGeo = new THREE.ConeGeometry(0.34, 0.56, 4);
    headGeo.rotateY(Math.PI / 4);
    headGeo.rotateX(Math.PI / 2);
    const arrowHead = new THREE.Mesh(headGeo, arrowMat);
    arrowHead.scale.set(1, 0.25, 1);
    arrowHead.position.set(0, 0, 1.18);
    arrowScaleNode.add(arrowHead);

    const baseRingGeo = new THREE.RingGeometry(0.38, 0.5, 24);
    baseRingGeo.rotateX(-Math.PI / 2);
    const arrowBaseRing = new THREE.Mesh(baseRingGeo, arrowMat);
    aimArrowGroup.add(arrowBaseRing);

    // Невидимый триггер возле камеры для срабатывания звука при прыжке в сторону камеры
    const cameraTriggerGeo = new THREE.BoxGeometry(11.6, 16.0, 7.0);
    const cameraTriggerMat = new THREE.MeshBasicMaterial({
      visible: false,
      transparent: true,
      opacity: 0,
    });
    const cameraTriggerMesh = new THREE.Mesh(cameraTriggerGeo, cameraTriggerMat);
    cameraTriggerMesh.position.set(0, 8.2, 8.0);
    scene.add(cameraTriggerMesh);

    // ==================== CREATE FROGS ====================
    const frogs: FrogRuntime[] = participants.map((p, idx) => {
      const slot = ARENA_CONSTANTS.spawnSlots[idx % ARENA_CONSTANTS.spawnSlots.length];
      const spawnY = Math.max(0, getSwampTerrainHeight(slot.x, slot.z, mapVariant));
      const palette = FROG_PALETTE[p.colorIndex % FROG_PALETTE.length];
      const chosenVariant = p.modelVariant ?? (idx % 3);
      const bundle = createFrogMeshBundle(palette.hex, null, chosenVariant);
      bundle.root.position.set(slot.x, spawnY, slot.z);

      const initialYaw = Math.atan2(-slot.x, -slot.z);
      bundle.root.rotation.y = initialYaw;
      scene.add(bundle.root);

      const hpMult = p.isBot
        ? clamp(activeHost.botHpMultiplier, 0.25, 5.0)
        : clamp(activeHost.playerHpMultiplier, 0.25, 5.0);
      const scaledMaxHp = Math.max(10, Math.round(DEFAULT_FROG_CONFIG.maxHealth * hpMult));

      updateFrogOverheadLabel(bundle, p.nickname, scaledMaxHp, scaledMaxHp, p.teamId, []);

      return {
        peerId: p.peerId,
        nickname: p.nickname,
        colorIndex: p.colorIndex,
        modelVariant: chosenVariant,
        teamId: p.teamId,
        isBot: p.isBot,
        hp: scaledMaxHp,
        maxHp: scaledMaxHp,
        isAlive: true,
        isSquashed: false,
        squashTimer: 0,
        pos: { x: slot.x, y: spawnY, z: slot.z },
        vel: { x: 0, y: 0, z: 0 },
        yaw: initialYaw,
        onGround: true,
        standingOnLilyPadIndex: -1,
        inWater: false,
        waterDamageAccumSec: 0,
        invulnTimer: 0,
        zoneDamageAccumSec: 0,
        botJumpTimer: 0.65 + idx * 0.22,
        buffStacks: [],
        airJumpsUsedSinceGround: 0,
        dustCloudTimer: 0,
        cameraLaughTriggeredThisJump: false,
        bundle,
      };
    });

    let disposed = false;
    loadFrogTemplates().then((templates) => {
      if (disposed || !templates) return;
      for (const f of frogs) {
        const palette = FROG_PALETTE[f.colorIndex % FROG_PALETTE.length];
        scene.remove(f.bundle.root);
        const upgraded = createFrogMeshBundle(palette.hex, templates, f.modelVariant);
        upgraded.root.position.set(f.pos.x, f.pos.y, f.pos.z);
        upgraded.root.rotation.y = f.yaw;
        const hasBark = f.buffStacks.some(
          (s) => s.type === PowerUpType.BARK_ARMOR && s.charges > 0
        );
        upgraded.barkArmorGroup.visible = hasBark;
        updateFrogOverheadLabel(
          upgraded,
          f.nickname,
          f.hp,
          f.maxHp,
          f.teamId,
          f.buffStacks
        );
        scene.add(upgraded.root);
        f.bundle = upgraded;
      }
    });

    // ==================== INPUT / AIMING ====================
    let isPointerDown = false;
    let pointerStart: Vec2 = { x: 0, y: 0 };
    let pointerCurrent: Vec2 = { x: 0, y: 0 };
    let chargeElapsedSec = 0;
    let currentAimPower = 0;
    let currentAimDir: Vec3 = { x: 0, y: 0, z: -1 };
    const pressedKeys = new Set<string>();

    const getLocalFrog = (): FrogRuntime | undefined =>
      frogs.find((f) => f.peerId === localPeerId);

    const canFrogJumpNow = (frog: FrogRuntime): boolean => {
      if (!frog.isAlive || frog.isSquashed) return false;
      if (frog.onGround) return true;
      const wingStack = frog.buffStacks.find((s) => s.type === PowerUpType.DOUBLE_JUMP);
      return Boolean(wingStack && wingStack.charges > 0 && frog.airJumpsUsedSinceGround < 1);
    };

    const executeFrogJump = (frog: FrogRuntime, worldDir: Vec3, powerRatio: number) => {
      const clampedPower = clamp(powerRatio, DEFAULT_FROG_CONFIG.minJumpPowerRatio, 1.0);
      const wasAirJump = !frog.onGround;

      // Если прыжок совершается в воздухе, расходуем 1 одноразовый заряд «Крыльев стрекозы»
      if (wasAirJump) {
        const consumedWing = consumeSingleBuffCharge(frog.buffStacks, PowerUpType.DOUBLE_JUMP);
        if (consumedWing.consumed) {
          frog.buffStacks = consumedWing.stacks;
          frog.airJumpsUsedSinceGround += 1;
        }
      }

      // Если есть заряд «Турбо-пружины», усиливаем прыжок на +35% и расходуем 1 заряд
      let jumpMult = 1.0;
      const springStack = frog.buffStacks.find(
        (s) => s.type === PowerUpType.SUPER_SPRING && s.charges > 0
      );
      if (springStack) {
        jumpMult = springStack.jumpForceMultiplier;
        const consumedSpring = consumeSingleBuffCharge(
          frog.buffStacks,
          PowerUpType.SUPER_SPRING
        );
        frog.buffStacks = consumedSpring.stacks;
      }

      const vel = calculateJumpVelocity(worldDir, clampedPower, jumpMult);
      frog.vel.x = vel.x;
      frog.vel.y = vel.y;
      frog.vel.z = vel.z;
      frog.onGround = false;
      frog.standingOnLilyPadIndex = -1;
      frog.cameraLaughTriggeredThisJump = false;
      frog.yaw = Math.atan2(worldDir.x, worldDir.z);

      updateFrogOverheadLabel(
        frog.bundle,
        frog.nickname,
        frog.hp,
        frog.maxHp,
        frog.teamId,
        frog.buffStacks
      );

      const isPlayerFrog = frog.peerId === localPeerId || !frog.isBot;
      soundEngine.playJump(clampedPower, wasAirJump, isPlayerFrog);

      if (frog.peerId === localPeerId && onLocalJumpRef.current) {
        onLocalJumpRef.current(worldDir, clampedPower, { ...frog.pos });
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      soundEngine.unlock();
      const localFrog = getLocalFrog();
      if (!localFrog || !canFrogJumpNow(localFrog)) return;

      isPointerDown = true;
      pointerStart = { x: e.clientX, y: e.clientY };
      pointerCurrent = { x: e.clientX, y: e.clientY };
      chargeElapsedSec = 0;
      currentAimPower = 0;
    };

    const onPointerMove = (e: PointerEvent) => {
      pointerCurrent = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = () => {
      if (!isPointerDown) return;
      isPointerDown = false;
      trajectoryDots.forEach((d) => (d.visible = false));
      aimArrowGroup.visible = false;

      const localFrog = getLocalFrog();
      if (!localFrog || !canFrogJumpNow(localFrog)) {
        currentAimPower = 0;
        return;
      }

      if (currentAimPower >= DEFAULT_FROG_CONFIG.minJumpPowerRatio) {
        executeFrogJump(localFrog, currentAimDir, currentAimPower);
      }
      currentAimPower = 0;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      pressedKeys.add(e.code);

      if (e.code === "Space" || e.code === "Enter") {
        soundEngine.unlock();
        const localFrog = getLocalFrog();
        if (!localFrog || !canFrogJumpNow(localFrog)) return;

        let dx = 0;
        let dz = 0;
        if (pressedKeys.has("KeyW") || pressedKeys.has("ArrowUp")) dz -= 1;
        if (pressedKeys.has("KeyS") || pressedKeys.has("ArrowDown")) dz += 1;
        if (pressedKeys.has("KeyA") || pressedKeys.has("ArrowLeft")) dx -= 1;
        if (pressedKeys.has("KeyD") || pressedKeys.has("ArrowRight")) dx += 1;

        let dir: Vec3;
        if (Math.hypot(dx, dz) > 0.01) {
          const len = Math.hypot(dx, dz);
          dir = { x: dx / len, y: 0, z: dz / len };
        } else {
          dir = { x: Math.sin(localFrog.yaw), y: 0, z: Math.cos(localFrog.yaw) };
        }
        executeFrogJump(localFrog, dir, 0.78);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      pressedKeys.delete(e.code);
    };

    const domElem = renderer.domElement;
    domElem.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    // ==================== GAME LOOP ====================
    let matchElapsedSec = 0;
    let floodAnnounced = false;
    let statusBanner: string | null = mapHasInitialWater
      ? "Болото с водоёмами: скоро начнётся прилив из воды!"
      : "Сухое болото: скоро начнётся ливень и потоп!";
    let statusBannerTimer = 4.2;
    let winnerBanner: string | null = null;
    let matchEnded = false;
    let shakeIntensity = 0;
    let hudSyncAccum = 0;

    const triggerBanner = (msg: string, duration = 2.8) => {
      statusBanner = msg;
      statusBannerTimer = duration;
    };

    const applyDamageToFrog = (
      victim: FrogRuntime,
      damage: number,
      attacker: FrogRuntime | null
    ) => {
      if (!victim.isAlive || victim.invulnTimer > 0) return;

      // Одноразовая Древесная Броня (полая кора дерева) блокирует удар сверху и тратит 1 заряд
      const barkStack = victim.buffStacks.find(
        (s) => s.type === PowerUpType.BARK_ARMOR && s.charges > 0
      );
      if (barkStack && attacker !== null) {
        const res = consumeSingleBuffCharge(victim.buffStacks, PowerUpType.BARK_ARMOR);
        victim.buffStacks = res.stacks;
        const stillHasBark = victim.buffStacks.some(
          (s) => s.type === PowerUpType.BARK_ARMOR && s.charges > 0
        );
        victim.bundle.barkArmorGroup.visible = stillHasBark;
        victim.dustCloudTimer = 0.35; // Щепки и пыль при расколе коры
        victim.invulnTimer = DEFAULT_FROG_CONFIG.hitInvulnerabilitySec;
        soundEngine.playBarkArmorBlock();
        triggerBanner(`Древесная кора защитила ${victim.nickname}!`, 2.0);
        updateFrogOverheadLabel(
          victim.bundle,
          victim.nickname,
          victim.hp,
          victim.maxHp,
          victim.teamId,
          victim.buffStacks
        );
        return;
      }

      victim.hp = Math.max(0, victim.hp - damage);
      victim.invulnTimer = DEFAULT_FROG_CONFIG.hitInvulnerabilitySec;
      updateFrogOverheadLabel(
        victim.bundle,
        victim.nickname,
        victim.hp,
        victim.maxHp,
        victim.teamId,
        victim.buffStacks
      );

      if (victim.hp <= 0) {
        victim.isAlive = false;
        victim.isSquashed = true;
        victim.squashTimer = DEFAULT_FROG_CONFIG.squashDisappearDelay;
        victim.bundle.barkArmorGroup.visible = false;
        setFrogSquashedVisual(victim.bundle, true);
        soundEngine.playEliminated();
        if (attacker) {
          triggerBanner(`${attacker.nickname} раздавил ${victim.nickname}!`, 2.8);
        } else if (victim.inWater) {
          triggerBanner(`${victim.nickname} утонул в болотной трясине!`, 2.8);
        } else {
          triggerBanner(`${victim.nickname} погиб за пределами зоны!`, 2.8);
        }
      }
    };

    let lastTime = performance.now();
    let timerId = 0;

    const afterDraw = (cb: () => void) => {
      if (typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext) {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) return;
          if (!sync) {
            timerId = window.setTimeout(cb, 0);
            return;
          }
          const status = gl.clientWaitSync(sync, 0, 0);
          if (
            status === gl.ALREADY_SIGNALED ||
            status === gl.CONDITION_SATISFIED ||
            status === gl.WAIT_FAILED
          ) {
            gl.deleteSync(sync);
            timerId = window.setTimeout(cb, 0);
          } else {
            timerId = window.setTimeout(poll, 4);
          }
        };
        timerId = window.setTimeout(poll, 4);
      } else {
        requestAnimationFrame(() => {
          timerId = window.setTimeout(cb, 0);
        });
      }
    };

    const stepSimulation = (dt: number) => {
      const settings = hostSettingsRef.current;
      matchElapsedSec += dt;

      if (statusBannerTimer > 0) {
        statusBannerTimer -= dt;
        if (statusBannerTimer <= 0) statusBanner = null;
      }

      // 1. Зона ограничения «Потоп» (прилив из водоёмов ИЛИ дождь и потоп на сухих картах)
      const floodState = computeFloodZoneState(
        matchElapsedSec,
        settings.mapVariant,
        settings.floodEnabled,
        settings.floodStartDelaySec,
        settings.floodRiseRatePerSec
      );

      if (floodState.isFlooding && !floodAnnounced) {
        floodAnnounced = true;
        soundEngine.playWaterSplash();
        if (floodState.hasInitialWater) {
          triggerBanner(
            "🌊 НАЧАЛСЯ ПРИЛИВ! Вода прибывает из водоёмов и не остановится!",
            3.8
          );
        } else {
          triggerBanner(
            "🌧️ НАЧАЛСЯ ДОЖДЬ И ПОТОП! Ливень затапливает болото без остановки!",
            3.8
          );
        }
      }

      waterMesh.visible = floodState.hasInitialWater || floodState.isFlooding;
      waterMesh.position.y =
        floodState.waterLevelY +
        (floodState.isFlooding ? Math.sin(matchElapsedSec * 3.6) * 0.015 : 0);

      // Волны прилива из водоёмов
      for (let i = 0; i < tideWaveRings.length; i++) {
        const ring = tideWaveRings[i];
        if (floodState.isFlooding && floodState.hasInitialWater) {
          ring.visible = true;
          const waveCycle = (matchElapsedSec * 0.75 + i * 0.22) % 1.0;
          ring.position.y = waterMesh.position.y + 0.02;
          ring.scale.setScalar(1.0 + waveCycle * 3.4);
          (ring.material as THREE.MeshBasicMaterial).opacity = (1.0 - waveCycle) * 0.45;
        } else {
          ring.visible = false;
        }
      }

      // 3D-дождь на картах без начальной воды
      rainLinesMesh.visible = floodState.isRaining;
      if (floodState.isRaining) {
        const posArr = (rainGeo.attributes.position as THREE.BufferAttribute)
          .array as Float32Array;
        for (let i = 0; i < rainDropsData.length; i++) {
          const drop = rainDropsData[i];
          drop.y -= drop.speed * dt;
          if (drop.y < floodState.waterLevelY) {
            drop.y = 14 + Math.random() * 3;
            drop.x = (Math.random() - 0.5) * 22;
            drop.z = (Math.random() - 0.5) * 22;
          }
          const idx6 = i * 6;
          posArr[idx6] = drop.x;
          posArr[idx6 + 1] = drop.y;
          posArr[idx6 + 2] = drop.z;
          posArr[idx6 + 3] = drop.x - 0.12;
          posArr[idx6 + 4] = drop.y - 0.75;
          posArr[idx6 + 5] = drop.z + 0.08;
        }
        rainGeo.attributes.position.needsUpdate = true;
      }

      // 2. Считаем сколько лягушек сейчас стоит на каждой кувшинке
      for (const pad of lilyPads) {
        pad.occupantsCount = 0;
      }
      for (const f of frogs) {
        if (f.isAlive && f.onGround && f.standingOnLilyPadIndex >= 0) {
          const pad = lilyPads[f.standingOnLilyPadIndex];
          if (pad && pad.state !== "sunk") {
            pad.occupantsCount += 1;
          }
        }
      }

      // Обновляем состояние кувшинок:
      // Кувшинки всплывают вместе с приливом до +0.22м, а при сильном потопе (> +0.28м) уходят под воду!
      const padFloatY = clamp(
        floodState.waterLevelY + 0.05,
        ARENA_CONSTANTS.waterLevelY + 0.05,
        0.22
      );
      const padSubmergedByFlood = floodState.waterLevelY > 0.28;

      for (const pad of lilyPads) {
        if (!floodState.hasInitialWater || padSubmergedByFlood) {
          pad.group.visible = false;
          continue;
        }
        pad.basePos.y = padFloatY;
        pad.group.position.y = padFloatY;

        if (pad.state === "idle") {
          pad.group.visible = true;
          pad.padMesh.position.y = Math.sin(matchElapsedSec * 2.2 + pad.index) * 0.025;
          if (
            shouldLilyPadSinkFromOccupants(
              pad.occupantsCount,
              settings.lilyPadMaxFrogsBeforeSink
            )
          ) {
            pad.state = "overloaded_warning";
            pad.timer = ARENA_CONSTANTS.lilyPadOverloadSinkDelaySec;
            pad.padMat.color.setHex(0xef4444);
            pad.ringMat.color.setHex(0xfca5a5);
            triggerBanner("Перегруз кувшинки (2+ лягушки) — она уходит под воду!", 2.0);
          } else if (pad.occupantsCount === 1) {
            pad.padMat.color.setHex(0x34d399);
            pad.ringMat.color.setHex(0xa7f3d0);
          } else {
            pad.padMat.color.setHex(0x2fa84f);
            pad.ringMat.color.setHex(0x86efac);
          }
        } else if (pad.state === "overloaded_warning") {
          pad.timer -= dt;
          pad.padMesh.position.x = Math.sin(matchElapsedSec * 48) * 0.08;
          pad.padMesh.position.y -= dt * 0.9;
          if (pad.timer <= 0) {
            pad.state = "sunk";
            pad.timer = ARENA_CONSTANTS.lilyPadRespawnDelaySec;
            pad.group.visible = false;
            pad.padMesh.position.set(0, 0, 0);
            soundEngine.playWaterSplash();
            for (const f of frogs) {
              if (f.standingOnLilyPadIndex === pad.index) {
                f.standingOnLilyPadIndex = -1;
                f.onGround = false;
              }
            }
          }
        } else if (pad.state === "sunk") {
          pad.timer -= dt;
          if (pad.timer <= 0) {
            pad.state = "idle";
            pad.padMat.color.setHex(0x2fa84f);
            pad.ringMat.color.setHex(0x86efac);
            pad.group.visible = true;
          }
        }
      }

      // 3. Обновляем баффы на карте (с учетом множителя частоты появления объектов)
      const spawnFreqMult = clamp(settings.objectSpawnFrequencyMultiplier, 0.25, 4.0);
      for (const p of pickups) {
        if (p.active) {
          p.bobPhase += dt * 2.8;
          p.group.position.y = p.pos.y + 0.68 + Math.sin(p.bobPhase) * 0.14;
          p.group.rotation.y += dt * 1.9;
        } else {
          p.respawnTimer -= dt;
          if (p.respawnTimer <= 0) {
            const nextCand =
              ARENA_CONSTANTS.pickupSpawnCandidates[
                Math.floor(Math.random() * ARENA_CONSTANTS.pickupSpawnCandidates.length)
              ];
            const nextY = Math.max(
              ARENA_CONSTANTS.waterLevelY + 0.15,
              getSwampTerrainHeight(nextCand.x, nextCand.z, settings.mapVariant)
            );
            p.pos = { x: nextCand.x, y: nextY, z: nextCand.z };
            p.group.position.set(nextCand.x, nextY + 0.68, nextCand.z);
            p.active = true;
            p.group.visible = true;
          }
        }
      }

      // 3b. Обработка сетевых прыжков других игроков с других устройств / вкладок
      if (remoteJumpQueueRef?.current && remoteJumpQueueRef.current.length > 0) {
        const events = remoteJumpQueueRef.current.splice(0, remoteJumpQueueRef.current.length);
        for (const evt of events) {
          const remoteFrog = frogs.find((f) => f.peerId === evt.peerId);
          if (remoteFrog && remoteFrog.isAlive && remoteFrog.peerId !== localPeerId) {
            if (evt.pos) {
              remoteFrog.pos.x = evt.pos.x;
              remoteFrog.pos.y = evt.pos.y;
              remoteFrog.pos.z = evt.pos.z;
            }
            executeFrogJump(remoteFrog, evt.dir, evt.power);
          }
        }
      }

      // 4. Прицеливание игрока: Стрелка (по умолчанию) или Луч траектории
      const localFrog = getLocalFrog();
      if (isPointerDown && localFrog && canFrogJumpNow(localFrog)) {
        if (controlModeRef.current === ControlMode.SLINGSHOT_DRAG) {
          currentAimPower = computeSlingshotPower(pointerStart, pointerCurrent);
          currentAimDir = computeSlingshotWorldDirection(pointerStart, pointerCurrent, 0);
        } else {
          chargeElapsedSec += dt;
          currentAimPower = clamp(
            chargeElapsedSec / DEFAULT_FROG_CONFIG.maxChargeTimeSec,
            0.15,
            1.0
          );
          const rect = domElem.getBoundingClientRect();
          const centerScreen = {
            x: rect.left + rect.width * 0.5,
            y: rect.top + rect.height * 0.55,
          };
          currentAimDir = computeSlingshotWorldDirection(pointerCurrent, centerScreen, 0);
        }

        if (currentAimPower >= DEFAULT_FROG_CONFIG.minJumpPowerRatio) {
          localFrog.yaw = Math.atan2(currentAimDir.x, currentAimDir.z);

          if (aimIndicatorStyleRef.current === AimIndicatorStyle.ARROW) {
            // Режим «Стрелка» (по умолчанию)
            trajectoryDots.forEach((d) => (d.visible = false));
            aimArrowGroup.visible = true;
            aimArrowGroup.position.set(
              localFrog.pos.x,
              localFrog.pos.y + 0.14,
              localFrog.pos.z
            );
            aimArrowGroup.rotation.y = localFrog.yaw;
            const lenScale = 0.75 + currentAimPower * 2.45;
            arrowScaleNode.scale.set(1, 1, lenScale);

            if (currentAimPower < 0.48) {
              arrowMat.color.setHex(0x84cc16); // Лаймово-зеленый
            } else if (currentAimPower < 0.8) {
              arrowMat.color.setHex(0xfacc15); // Янтарно-желтый
            } else {
              arrowMat.color.setHex(0xef4444); // Ярко-красный максимальный заряд
            }
          } else {
            // Режим «Луч траектории» (точки параболы)
            aimArrowGroup.visible = false;
            const springStack = localFrog.buffStacks.find(
              (s) => s.type === PowerUpType.SUPER_SPRING && s.charges > 0
            );
            const jumpMult = springStack ? springStack.jumpForceMultiplier : 1.0;
            const previewVel = calculateJumpVelocity(currentAimDir, currentAimPower, jumpMult);
            const gAsc =
              DEFAULT_FROG_CONFIG.baseGravity * DEFAULT_FROG_CONFIG.gravityAscendMultiplier;

            for (let i = 0; i < trajectoryDots.length; i++) {
              const t = (i + 1) * 0.068;
              const px = localFrog.pos.x + previewVel.x * t;
              const pz = localFrog.pos.z + previewVel.z * t;
              const py =
                localFrog.pos.y + 0.35 + previewVel.y * t - 0.5 * gAsc * t * t;
              const dot = trajectoryDots[i];
              const groundH = getSwampTerrainHeight(px, pz, settings.mapVariant);
              if (py < groundH - 0.1) {
                dot.visible = false;
              } else {
                dot.visible = true;
                dot.position.set(px, py, pz);
              }
            }
          }
        } else {
          trajectoryDots.forEach((d) => (d.visible = false));
          aimArrowGroup.visible = false;
        }
      } else {
        trajectoryDots.forEach((d) => (d.visible = false));
        aimArrowGroup.visible = false;
      }

      // 5. Физика лягушек, ИИ ботов, вода, кувшинки и круглая граница из высоких дряхлых деревьев
      for (const f of frogs) {
        if (!f.isAlive) {
          if (f.isSquashed && f.squashTimer > 0) {
            f.squashTimer -= dt;
            if (f.squashTimer <= 0) {
              f.bundle.root.visible = false;
            }
          }
          continue;
        }

        if (f.invulnTimer > 0) {
          f.invulnTimer = Math.max(0, f.invulnTimer - dt);
        }

        if (f.dustCloudTimer > 0) {
          f.dustCloudTimer = Math.max(0, f.dustCloudTimer - dt);
        }

        // ИИ ботов с учетом параметров хоста (botJumpIntervalSec и botAggression)
        if (f.isBot && f.onGround) {
          f.botJumpTimer -= dt;
          if (f.botJumpTimer <= 0) {
            const baseInterval = clamp(settings.botJumpIntervalSec, 0.4, 5.0);
            f.botJumpTimer = baseInterval * (0.75 + Math.random() * 0.5);

            // Если бот в воде — старается выпрыгнуть на сушу или свободную кувшинку
            let bestTarget: FrogRuntime | null = null;
            let bestDist = 999;
            for (const other of frogs) {
              if (!other.isAlive || other.peerId === f.peerId) continue;
              if (
                matchMode === MatchMode.TEAMS &&
                f.teamId >= 0 &&
                other.teamId === f.teamId
              ) {
                continue;
              }
              const d = Math.hypot(other.pos.x - f.pos.x, other.pos.z - f.pos.z);
              if (d < bestDist) {
                bestDist = d;
                bestTarget = other;
              }
            }

            const distFromCenter = Math.hypot(f.pos.x, f.pos.z);
            if (f.inWater && distFromCenter > 1.8) {
              const toCenterLen = Math.max(0.01, distFromCenter);
              const dir = {
                x: -f.pos.x / toCenterLen + (Math.random() - 0.5) * 0.3,
                y: 0,
                z: -f.pos.z / toCenterLen + (Math.random() - 0.5) * 0.3,
              };
              executeFrogJump(f, dir, 0.76);
            } else if (bestTarget) {
              const aggression = clamp(settings.botAggression, 0.2, 1.0);
              const spread = (1.0 - aggression) * 0.65;
              const dx = bestTarget.pos.x - f.pos.x + (Math.random() - 0.5) * spread * 4;
              const dz = bestTarget.pos.z - f.pos.z + (Math.random() - 0.5) * spread * 4;
              const dist = Math.hypot(dx, dz);
              const dir = { x: dx / Math.max(0.01, dist), y: 0, z: dz / Math.max(0.01, dist) };
              const power = botJumpPowerForDistance(dist);
              executeFrogJump(f, dir, power);
            }
          }
        }

        // Гравитация и движение
        if (!f.onGround) {
          const gravMult =
            f.vel.y > 0
              ? DEFAULT_FROG_CONFIG.gravityAscendMultiplier
              : DEFAULT_FROG_CONFIG.gravityDescendMultiplier;
          f.vel.y -= DEFAULT_FROG_CONFIG.baseGravity * gravMult * dt;
        } else {
          const friction = DEFAULT_FROG_CONFIG.groundFriction * dt;
          const speedH = Math.hypot(f.vel.x, f.vel.z);
          if (speedH <= friction) {
            f.vel.x = 0;
            f.vel.z = 0;
          } else {
            const scale = (speedH - friction) / speedH;
            f.vel.x *= scale;
            f.vel.z *= scale;
          }
        }

        f.pos.x += f.vel.x * dt;
        f.pos.y += f.vel.y * dt;
        f.pos.z += f.vel.z * dt;

        // Коллизия с круглой границей из высоких дряхлых деревьев (и невидимым цилиндром высоты 16м)
        const treeCollision = resolveCircularTreeBoundaryCollision(
          f.pos.x,
          f.pos.z,
          f.vel.x,
          f.vel.z,
          0.62,
          ARENA_CONSTANTS.arenaRadius,
          DEFAULT_FROG_CONFIG.wallBounceFactor
        );
        if (treeCollision.collided) {
          f.pos.x = treeCollision.x;
          f.pos.z = treeCollision.z;
          f.vel.x = treeCollision.vx;
          f.vel.z = treeCollision.vz;
        }

        // Невидимый потолок арены
        if (f.pos.y > ARENA_CONSTANTS.invisibleWallHeight) {
          f.pos.y = ARENA_CONSTANTS.invisibleWallHeight;
          if (f.vel.y > 0) f.vel.y = 0;
        }

        // Проверка приземления на кувшинку или на неровный болотный рельеф
        let landedOnPadIndex = -1;
        if (floodState.hasInitialWater && !padSubmergedByFlood) {
          for (const pad of lilyPads) {
            if (pad.state === "sunk" || !pad.group.visible) continue;
            const dPad = Math.hypot(f.pos.x - pad.basePos.x, f.pos.z - pad.basePos.z);
            if (dPad <= ARENA_CONSTANTS.lilyPadRadius * 0.96) {
              landedOnPadIndex = pad.index;
              break;
            }
          }
        }

        const terrainY = getSwampTerrainHeight(f.pos.x, f.pos.z, settings.mapVariant);
        const padSurfaceY = padFloatY + 0.03;
        const effectiveGroundY =
          landedOnPadIndex >= 0 ? Math.max(terrainY, padSurfaceY) : terrainY;

        if (f.pos.y <= effectiveGroundY) {
          const wasInAir = !f.onGround;
          f.pos.y = effectiveGroundY;
          f.vel.y = 0;
          f.onGround = true;
          f.airJumpsUsedSinceGround = 0;
          f.cameraLaughTriggeredThisJump = false;
          f.standingOnLilyPadIndex = landedOnPadIndex;

          // Центральный болотный батут
          const distCenter = Math.hypot(f.pos.x, f.pos.z);
          if (distCenter <= ARENA_CONSTANTS.centerBounceRadius) {
            f.vel.y = ARENA_CONSTANTS.centerBounceVelocity;
            f.onGround = false;
            f.standingOnLilyPadIndex = -1;
            soundEngine.playBouncePad();
          } else if (wasInAir) {
            if (
              isPointInSwampWater(
                f.pos.x,
                f.pos.y,
                f.pos.z,
                f.standingOnLilyPadIndex >= 0,
                floodState.waterLevelY,
                settings.mapVariant
              )
            ) {
              soundEngine.playWaterSplash();
            } else {
              soundEngine.playLand();
            }
          }
        } else {
          f.standingOnLilyPadIndex = -1;
          if (
            !f.isBot &&
            !f.cameraLaughTriggeredThisJump &&
            doesFrogTouchCameraTrigger(f.pos, f.vel, f.onGround)
          ) {
            f.cameraLaughTriggeredThisJump = true;
            soundEngine.playSecretFrogLaugh();
          }
        }

        // Проверка нахождения в болотной воде или под уровнем Потопа/Прилива: снимает HP каждую секунду!
        const nowInWater = isPointInSwampWater(
          f.pos.x,
          f.pos.y,
          f.pos.z,
          f.standingOnLilyPadIndex >= 0,
          floodState.waterLevelY,
          settings.mapVariant
        );
        f.inWater = nowInWater;
        if (nowInWater && settings.waterDamagePerSec > 0) {
          f.waterDamageAccumSec += dt;
          if (f.waterDamageAccumSec >= 1.0) {
            f.waterDamageAccumSec -= 1.0;
            applyDamageToFrog(f, Math.round(settings.waterDamagePerSec), null);
          }
        } else {
          f.waterDamageAccumSec = 0;
        }

        // Подбор одноразовых стакающихся баффов (до 3 каждого типа, макс. 9 всего)
        for (const p of pickups) {
          if (!p.active) continue;
          const dPick = Math.hypot(f.pos.x - p.pos.x, f.pos.z - p.pos.z);
          if (dPick <= 1.25 && Math.abs(f.pos.y - p.pos.y) <= 1.7) {
            const stackRes = addBuffChargeToStacks(f.buffStacks, p.type);
            if (stackRes.added) {
              f.buffStacks = stackRes.stacks;
              p.active = false;
              p.group.visible = false;
              p.respawnTimer = 6.5 / spawnFreqMult;

              // При получении «Древесной брони» появляется облачко пыли и надевается модель полой коры дерева
              if (p.type === PowerUpType.BARK_ARMOR) {
                f.dustCloudTimer = 0.48;
                f.bundle.barkArmorGroup.visible = true;
              }

              soundEngine.playBuffPickupByType(p.type);
              updateFrogOverheadLabel(
                f.bundle,
                f.nickname,
                f.hp,
                f.maxHp,
                f.teamId,
                f.buffStacks
              );

              if (f.peerId === localPeerId) {
                const addedStack = f.buffStacks.find((s) => s.type === p.type);
                triggerBanner(
                  `Бафф: ${addedStack?.displayName} (зарядов: x${addedStack?.charges ?? 1})`,
                  2.4
                );
              }
            }
          }
        }

      }

      // 6. Stomp-коллизии (прыжок сверху на голову соперника)
      for (let i = 0; i < frogs.length; i++) {
        const attacker = frogs[i];
        if (!attacker.isAlive || attacker.onGround) continue;
        if (attacker.vel.y > -DEFAULT_FROG_CONFIG.minFallSpeedForStomp) continue;

        for (let j = 0; j < frogs.length; j++) {
          if (i === j) continue;
          const victim = frogs[j];
          if (!victim.isAlive) continue;
          if (
            matchMode === MatchMode.TEAMS &&
            attacker.teamId >= 0 &&
            attacker.teamId === victim.teamId
          ) {
            continue;
          }

          const horizDist = Math.hypot(
            attacker.pos.x - victim.pos.x,
            attacker.pos.z - victim.pos.z
          );
          const heightDiff = attacker.pos.y - victim.pos.y;

          if (horizDist <= 1.18 && heightDiff >= 0.2 && heightDiff <= 1.48) {
            const dmg = calculateStompDamage(Math.abs(attacker.vel.y));
            attacker.vel.y = DEFAULT_FROG_CONFIG.stompBounceVelocity;
            triggerFrogStompStretch(attacker.bundle);
            soundEngine.playStompHit();
            shakeIntensity = 0.36;
            applyDamageToFrog(victim, dmg, attacker);
            break;
          }
        }
      }

      // 7. Горизонтальное расталкивание живых лягушек
      for (let i = 0; i < frogs.length; i++) {
        const a = frogs[i];
        if (!a.isAlive) continue;
        for (let j = i + 1; j < frogs.length; j++) {
          const b = frogs[j];
          if (!b.isAlive) continue;
          const dx = b.pos.x - a.pos.x;
          const dz = b.pos.z - a.pos.z;
          const dist = Math.hypot(dx, dz);
          const minDist = 1.05;
          if (dist > 1e-4 && dist < minDist && Math.abs(a.pos.y - b.pos.y) < 0.72) {
            const overlap = (minDist - dist) * 0.5;
            const nx = dx / dist;
            const nz = dz / dist;
            a.pos.x -= nx * overlap;
            a.pos.z -= nz * overlap;
            b.pos.x += nx * overlap;
            b.pos.z += nz * overlap;
          }
        }
      }

      // 8. Синхронизация 3D-моделей лягушек, полой коры и облачка пыли
      for (const f of frogs) {
        f.bundle.root.position.set(f.pos.x, f.pos.y, f.pos.z);
        f.bundle.root.rotation.y = f.yaw;
        const speedH = Math.hypot(f.vel.x, f.vel.z);

        const hasBark = f.buffStacks.some(
          (s) => s.type === PowerUpType.BARK_ARMOR && s.charges > 0
        );
        f.bundle.barkArmorGroup.visible = hasBark;

        const dustProgress =
          f.dustCloudTimer > 0 ? clamp(1.0 - f.dustCloudTimer / 0.48, 0.01, 0.99) : 0;

        if (!f.isSquashed) {
          const localAiming =
            f.peerId === localPeerId && isPointerDown ? currentAimPower : 0;
          updateFrogAnimation(
            f.bundle,
            dt,
            f.onGround,
            f.vel.y,
            speedH,
            localAiming,
            dustProgress
          );
        }
      }

      // 9. Проверка условий победы
      if (!matchEnded) {
        const outcome = evaluateVictoryConditions(
          frogs.map((f) => ({
            peerId: f.peerId,
            nickname: f.nickname,
            teamId: f.teamId,
            isAlive: f.isAlive,
          })),
          matchMode
        );
        if (outcome.finished) {
          matchEnded = true;
          if (outcome.type === "solo") {
            winnerBanner = `ПОБЕДИТЕЛЬ: ${outcome.winnerName}!`;
          } else if (outcome.type === "team") {
            const teamNames = ["ЗЕЛЕНЫЕ", "СИНИЕ", "КРАСНЫЕ", "ЖЕЛТЫЕ"];
            winnerBanner = `ПОБЕДА КОМАНДЫ «${teamNames[outcome.winningTeamId] ?? "1"}»!`;
          } else {
            winnerBanner = "НИЧЬЯ НА БОЛОТЕ!";
          }
          soundEngine.playVictory();
          if (onMatchFinished && winnerBanner) {
            onMatchFinished(winnerBanner);
          }
        }
      }

      // 10. Встряска камеры при ударе
      if (shakeIntensity > 0) {
        shakeIntensity = Math.max(0, shakeIntensity - dt * 1.8);
        camera.position.set(
          baseCamPos.x + (Math.random() - 0.5) * shakeIntensity,
          baseCamPos.y + (Math.random() - 0.5) * shakeIntensity,
          baseCamPos.z + (Math.random() - 0.5) * shakeIntensity
        );
      } else {
        camera.position.copy(baseCamPos);
      }
      camera.lookAt(baseCamTarget);

      // 11. Обновление HUD
      hudSyncAccum += dt;
      if (hudSyncAccum >= 0.08) {
        hudSyncAccum = 0;
        const lf = getLocalFrog();
        onHudUpdate({
          localHp: lf ? lf.hp : 0,
          localMaxHp: lf ? lf.maxHp : DEFAULT_FROG_CONFIG.maxHealth,
          localBuffStacks: lf ? lf.buffStacks.map((s) => ({ ...s })) : [],
          localInWater: lf ? lf.inWater : false,
          aliveCount: frogs.filter((f) => f.isAlive).length,
          totalCount: frogs.length,
          zoneShrinking: floodState.isFlooding,
          zoneRadius: floodState.waterLevelY,
          floodRaining: floodState.isRaining,
          floodWaterLevel: floodState.waterLevelY,
          floodCountdownSec: floodState.secondsUntilFlood,
          hasInitialWater: floodState.hasInitialWater,
          matchElapsedSec,
          frogs: frogs.map((f) => ({
            peerId: f.peerId,
            nickname: f.nickname,
            hp: f.hp,
            maxHp: f.maxHp,
            isAlive: f.isAlive,
            isBot: f.isBot,
            teamId: f.teamId,
            colorHex: FROG_PALETTE[f.colorIndex % FROG_PALETTE.length].hex,
            modelVariant: f.modelVariant,
            buffStacks: f.buffStacks.map((s) => ({ ...s })),
            inWater: f.inWater,
          })),
          statusBanner,
          winnerBanner,
          aimingPower: currentAimPower,
        });
      }
    };

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      stepSimulation(dt);
      renderer.render(scene, camera);
      afterDraw(tick);
    };

    afterDraw(tick);

    return () => {
      disposed = true;
      window.clearTimeout(timerId);
      domElem.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
    };
  }, [participants, localPeerId, matchMode, matchSeed]);

  if (webGlError) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-950 text-emerald-200 p-6">
        <div className="max-w-md rounded-xl border border-emerald-500/30 bg-slate-900/90 p-6 text-center">
          <p className="text-lg font-bold text-amber-300">Ошибка инициализации 3D-сцены</p>
          <p className="mt-2 text-sm text-slate-300">{webGlError}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-testid="arena-canvas-container"
      className="relative h-full w-full select-none overflow-hidden touch-none cursor-crosshair"
    />
  );
};
