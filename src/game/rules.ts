export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export enum MatchMode {
  FREE_FOR_ALL = 0,
  TEAMS = 1,
}

export enum ControlMode {
  SLINGSHOT_DRAG = 0,
  HOLD_TO_CHARGE = 1,
}

export enum AimIndicatorStyle {
  ARROW = "arrow", // Стрелка направления при натягивании (по умолчанию, как было раньше)
  TRAJECTORY_RAY = "trajectory_ray", // Луч траектории из точек
}

export enum PowerUpType {
  BARK_ARMOR = 0, // Древесная броня (полая кора дерева)
  DOUBLE_JUMP = 1, // Крылья стрекозы (2x прыжок в воздухе)
  SUPER_SPRING = 2, // Турбо-пружина (+35% к прыжку)
}

export enum SwampMapVariant {
  WILD_SWAMP = "wild_swamp", // Карта 1: Дикое Болото (неровный рельеф, мшистые кочки, дряхлые деревья по кругу)
  DEEP_MIRE = "deep_mire", // Карта 2: Глубокая Топь (затопленное болото с широким кольцом воды и кувшинками)
  ROTTEN_STUMPS = "rotten_stumps", // Карта 3: Гнилые Пни (высокие трухлявые пни-колонны и грибные шляпки)
  FIREFLY_GROVE = "firefly_grove", // Карта 4: Роща Светлячков (ночная биолюминесцентная заводь с островками)
}

export enum NextMapSelectionMode {
  HOST_ONLY = "host_only", // Следующую карту в конце раунда выбирает только Хост
  PLAYERS_VOTE = "players_vote", // Следующую карту выбирают живые игроки голосованием
}

export interface SwampMapInfo {
  id: SwampMapVariant;
  title: string;
  subtitle: string;
  description: string;
  badgeColor: string;
  hazardHint: string;
  hasInitialWater: boolean;
}

export const SWAMP_MAPS_CATALOG: SwampMapInfo[] = [
  {
    id: SwampMapVariant.WILD_SWAMP,
    title: "Дикое Болото",
    subtitle: "Мшистые кочки и водоёмы",
    description:
      "Круглая поляна с болотной водой и 6 кувшинками. Во время потопа прилив начинается прямо из этих водоёмов и не останавливается!",
    badgeColor: "#84cc16",
    hazardHint: "🌊 Есть вода • Прилив из водоёмов",
    hasInitialWater: true,
  },
  {
    id: SwampMapVariant.DEEP_MIRE,
    title: "Глубокая Топь",
    subtitle: "Затопленная трясина",
    description:
      "Широкое кольцо болотной жижи! При начале потопа мощный прилив поднимается из трясины, пока не затопит все островки.",
    badgeColor: "#2dd4bf",
    hazardHint: "🌊 Много воды • Мощный прилив",
    hasInitialWater: true,
  },
  {
    id: SwampMapVariant.ROTTEN_STUMPS,
    title: "Гнилые Пни",
    subtitle: "Сухая поляна и высокие пни",
    description:
      "Сухая лесная поляна без воды с 4 высокими трухлявыми пнями. В фазе ограничения начинается проливной дождь и потоп!",
    badgeColor: "#f59e0b",
    hazardHint: "🌧️ Нет воды • Дождь и потоп",
    hasInitialWater: false,
  },
  {
    id: SwampMapVariant.FIREFLY_GROVE,
    title: "Роща Светлячков",
    subtitle: "Сухая ночная роща и мхи",
    description:
      "Сухая сумеречная роща со светящимися грибами без водоёмов. Когда начинается ливень, потоп заливает низины и кочки до самого верха!",
    badgeColor: "#a3e635",
    hazardHint: "🌧️ Нет воды • Ночной ливень и потоп",
    hasInitialWater: false,
  },
];

export function doesMapHaveInitialWater(
  mapVariant: SwampMapVariant = SwampMapVariant.WILD_SWAMP
): boolean {
  const found = SWAMP_MAPS_CATALOG.find((m) => m.id === mapVariant);
  return found ? found.hasInitialWater : true;
}

export interface FrogModelInfo {
  variantIndex: number;
  id: string;
  title: string;
  objFile: string;
  mtlFile: string;
  texFile: string | null;
  description: string;
}

export const FROG_MODELS_CATALOG: FrogModelInfo[] = [
  {
    variantIndex: 0,
    id: "Frog_01",
    title: "Воксельная Жаба",
    objFile: "/assets/models/Frog_01.obj",
    mtlFile: "/assets/models/Frog_01.mtl",
    texFile: null,
    description: "Коренастая рубленая жаба (Frog_01.obj) с яркой пастью и оранжевыми глазами",
  },
  {
    variantIndex: 1,
    id: "Mesh_Frog",
    title: "Болотная Классика",
    objFile: "/assets/models/Mesh_Frog.obj",
    mtlFile: "/assets/models/Mesh_Frog.mtl",
    texFile: "/assets/models/Tex_Frog.png",
    description: "Гладкая 3D-лягушка (Mesh_Frog.obj) с фирменной текстурой Tex_Frog.png",
  },
  {
    variantIndex: 2,
    id: "Frog",
    title: "Золотоглазый Квакер",
    objFile: "/assets/models/Frog.obj",
    mtlFile: "/assets/models/Frog.mtl",
    texFile: null,
    description: "Хитрая древесная лягушка (Frog.obj) с блестящими золотыми глазами",
  },
];

export interface HostMatchSettings {
  playerHpMultiplier: number; // Множитель здоровья игроков (0.25x .. 5.0x, по умолч. 1.0)
  objectSpawnFrequencyMultiplier: number; // Множитель частоты появления объектов/баффов (0.25x .. 4.0x)
  botHpMultiplier: number; // Множитель здоровья ботов (0.25x .. 5.0x)
  botJumpIntervalSec: number; // Такт прыжков ботов в секундах (0.4 .. 5.0)
  botAggression: number; // Точность/агрессивность ботов (0.2 .. 1.0)
  mapVariant: SwampMapVariant; // Выбранная карта болота
  nextMapSelectionMode: NextMapSelectionMode; // Кто выбирает следующую карту в конце раунда (Хост или Живые игроки)
  vegetationDensityMultiplier: number; // Плотность болотной растительности (0.5x .. 2.5x)
  waterDamagePerSec: number; // Урон от падения в болотную воду / потоп (HP/сек)
  lilyPadMaxFrogsBeforeSink: number; // X <= 2 лягушек для мгновенного затопления кувшинки
  floodEnabled: boolean; // Включена ли зона ограничения «Потоп» (вместо старого круга)
  floodStartDelaySec: number; // Задержка в секундах до начала прилива / дождя и потопа
  floodRiseRatePerSec: number; // Скорость подъёма воды (м/сек), не останавливается пока не погибнут все
}

export const DEFAULT_HOST_SETTINGS: HostMatchSettings = {
  playerHpMultiplier: 1.0,
  objectSpawnFrequencyMultiplier: 1.0,
  botHpMultiplier: 1.0,
  botJumpIntervalSec: 1.8,
  botAggression: 0.8,
  mapVariant: SwampMapVariant.WILD_SWAMP,
  nextMapSelectionMode: NextMapSelectionMode.PLAYERS_VOTE,
  vegetationDensityMultiplier: 1.2,
  waterDamagePerSec: 10,
  lilyPadMaxFrogsBeforeSink: 2,
  floodEnabled: true,
  floodStartDelaySec: 14,
  floodRiseRatePerSec: 0.12,
};

/**
 * Подсчитывает голоса живых игроков за следующую карту.
 * Если голосов нет, возвращает текущую/резервную карту.
 */
export function tallyNextMapVotes(
  votesByPeer: Record<string, SwampMapVariant>,
  fallbackMap: SwampMapVariant = SwampMapVariant.WILD_SWAMP
): {
  winnerMap: SwampMapVariant;
  counts: Record<SwampMapVariant, number>;
  totalVotes: number;
} {
  const counts: Record<SwampMapVariant, number> = {
    [SwampMapVariant.WILD_SWAMP]: 0,
    [SwampMapVariant.DEEP_MIRE]: 0,
    [SwampMapVariant.ROTTEN_STUMPS]: 0,
    [SwampMapVariant.FIREFLY_GROVE]: 0,
  };

  let totalVotes = 0;
  for (const voted of Object.values(votesByPeer)) {
    if (voted in counts) {
      counts[voted] += 1;
      totalVotes += 1;
    }
  }

  if (totalVotes === 0) {
    return { winnerMap: fallbackMap, counts, totalVotes: 0 };
  }

  let bestMap = fallbackMap;
  let bestScore = -1;
  for (const mapInfo of SWAMP_MAPS_CATALOG) {
    const c = counts[mapInfo.id];
    if (c > bestScore) {
      bestScore = c;
      bestMap = mapInfo.id;
    }
  }

  return { winnerMap: bestMap, counts, totalVotes };
}

/**
 * Одноразовый стакающийся бафф (до 3 зарядов каждого типа, максимум 9 зарядов всего).
 */
export interface FrogBuffStack {
  type: PowerUpType;
  id: "bark_armor" | "dragonfly_wings" | "turbo_spring";
  displayName: string;
  shortTag: string;
  charges: number; // 1..3 одноразовых заряда
  maxCharges: number; // 3
  cooldownProgress: number; // 0..1 визуальный индикатор готовности/КД
  colorHex: string;
  blocksSingleStomp: boolean;
  jumpForceMultiplier: number;
  extraAirJumps: number;
}

export const MAX_BUFF_STACK_PER_TYPE = 3;
export const MAX_TOTAL_BUFF_CHARGES = 9;

export interface FrogConfigParams {
  maxHorizontalJumpSpeed: number;
  maxVerticalJumpSpeed: number;
  minJumpPowerRatio: number;
  gravityAscendMultiplier: number;
  gravityDescendMultiplier: number;
  groundFriction: number;
  wallBounceFactor: number;
  maxDragDistancePx: number;
  dragDeadzonePx: number;
  maxChargeTimeSec: number;
  maxHealth: number;
  baseStompDamage: number;
  maxFallSpeedBonusDamage: number;
  minFallSpeedForStomp: number;
  stompBounceVelocity: number;
  hitInvulnerabilitySec: number;
  squashDisappearDelay: number;
  baseGravity: number;
}

export const DEFAULT_FROG_CONFIG: FrogConfigParams = {
  maxHorizontalJumpSpeed: 13.0,
  maxVerticalJumpSpeed: 14.5,
  minJumpPowerRatio: 0.14,
  gravityAscendMultiplier: 1.6,
  gravityDescendMultiplier: 2.5,
  groundFriction: 26.0,
  wallBounceFactor: 0.55,
  maxDragDistancePx: 210.0,
  dragDeadzonePx: 18.0,
  maxChargeTimeSec: 1.15,
  maxHealth: 100,
  baseStompDamage: 50,
  maxFallSpeedBonusDamage: 50,
  minFallSpeedForStomp: 1.2,
  stompBounceVelocity: 11.5,
  hitInvulnerabilitySec: 0.28,
  squashDisappearDelay: 0.7,
  baseGravity: 9.8,
};

export const ARENA_CONSTANTS = {
  arenaRadius: 10.6, // Радиус круглой болотной арены
  innerHalfExtent: 10.6, // Совместимость со старыми расчетами
  decrepitTreeRingRadius: 10.95, // Радиус кольца высоких дряхлых болотных деревьев вместо стен
  decrepitTreeCount: 28, // Количество высоких дряхлых деревьев по периметру круга
  invisibleWallHeight: 16.0, // Невидимая цилиндрическая коллизия до самого верха, чтобы лягушки не вылетали за деревья
  waterLevelY: -0.14,
  centerBounceRadius: 1.2,
  centerBounceVelocity: 16.5,
  lilyPadRadius: 1.35,
  lilyPadOverloadSinkDelaySec: 0.18, // тонет почти сразу при >= 2 лягушках
  lilyPadRespawnDelaySec: 3.2,
  lilyPadPositions: [
    { x: -4.4, y: -0.08, z: -4.4 },
    { x: 4.4, y: -0.08, z: -4.4 },
    { x: -4.4, y: -0.08, z: 4.4 },
    { x: 4.4, y: -0.08, z: 4.4 },
    { x: 0.0, y: -0.08, z: -5.4 },
    { x: 0.0, y: -0.08, z: 5.4 },
  ] as Vec3[],
  pickupSpawnCandidates: [
    { x: -3.6, y: 0.0, z: 0.0 },
    { x: 3.6, y: 0.0, z: 0.0 },
    { x: 0.0, y: 0.0, z: -3.4 },
    { x: 0.0, y: 0.0, z: 3.4 },
    { x: -5.2, y: 0.0, z: -2.2 },
    { x: 5.2, y: 0.0, z: 2.2 },
    { x: -2.2, y: 0.0, z: 5.2 },
    { x: 2.2, y: 0.0, z: -5.2 },
  ] as Vec3[],
  spawnSlots: [
    { x: -5.2, y: 0.0, z: -5.2 },
    { x: 5.2, y: 0.0, z: 5.2 },
    { x: -5.2, y: 0.0, z: 5.2 },
    { x: 5.2, y: 0.0, z: -5.2 },
    { x: 0.0, y: 0.0, z: -7.4 },
    { x: 0.0, y: 0.0, z: 7.4 },
    { x: -7.4, y: 0.0, z: 0.0 },
    { x: 7.4, y: 0.0, z: 0.0 },
  ] as Vec3[],
  zoneInitialRadius: 10.6,
  zoneMinRadius: 3.6,
  zoneGracePeriodSec: 18.0,
  zoneShrinkDurationSec: 35.0,
  zoneDamageTickSec: 1.0,
  zoneTickDamage: 10,
};

export interface PaletteColor {
  name: string;
  hex: string;
  r: number;
  g: number;
  b: number;
}

export const FROG_PALETTE: PaletteColor[] = [
  { name: "Болотный", hex: "#4db04f", r: 0.30, g: 0.69, b: 0.31 },
  { name: "Лазурный", hex: "#389eff", r: 0.22, g: 0.62, b: 1.00 },
  { name: "Коралловый", hex: "#f54d52", r: 0.96, g: 0.30, b: 0.32 },
  { name: "Янтарный", hex: "#ffd133", r: 1.00, g: 0.82, b: 0.20 },
  { name: "Фиолетовый", hex: "#b861f5", r: 0.72, g: 0.38, b: 0.96 },
  { name: "Ржавый", hex: "#ff8a2e", r: 1.00, g: 0.54, b: 0.18 },
  { name: "Бирюзовый", hex: "#2ee6db", r: 0.18, g: 0.90, b: 0.86 },
  { name: "Лотосовый", hex: "#fa7ac7", r: 0.98, g: 0.48, b: 0.78 },
];

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Вычисляет неровную высоту круглого болотного рельефа в точке (x, z).
 * Отрицательные значения (< waterLevelY) означают затопленные участки болотной воды,
 * где расположены кувшинки.
 */
export function getSwampTerrainHeight(
  x: number,
  z: number,
  mapVariant: SwampMapVariant = SwampMapVariant.WILD_SWAMP
): number {
  const distFromCenter = Math.hypot(x, z);
  const hasWater = doesMapHaveInitialWater(mapVariant);

  // На картах с изначальной водой в местах кувшинок расположены водоёмы
  if (hasWater) {
    for (const pad of ARENA_CONSTANTS.lilyPadPositions) {
      const dPad = Math.hypot(x - pad.x, z - pad.z);
      if (dPad < 2.25) {
        const basinDepth = mapVariant === SwampMapVariant.DEEP_MIRE ? -0.45 : -0.36;
        const blend = clamp(1 - dPad / 2.25, 0, 1);
        return basinDepth * blend + 0.08 * (1 - blend);
      }
    }
  }

  // На карте «Глубокая Топь» кольцо воды шире
  if (mapVariant === SwampMapVariant.DEEP_MIRE) {
    if (distFromCenter > 2.3 && distFromCenter < 6.4) {
      const ringWave = Math.sin(x * 0.65) * Math.cos(z * 0.65) * 0.14;
      return -0.32 + ringWave;
    }
  }

  // На карте «Гнилые Пни» (сухая карта без начальной воды) 4 возвышенных пня-плацдарма
  if (mapVariant === SwampMapVariant.ROTTEN_STUMPS) {
    const stumps = [
      { x: -3.2, z: 0.0 },
      { x: 3.2, z: 0.0 },
      { x: 0.0, z: -3.2 },
      { x: 0.0, z: 3.2 },
    ];
    for (const st of stumps) {
      const dStump = Math.hypot(x - st.x, z - st.z);
      if (dStump < 1.45) {
        return 0.68 * clamp(1 - (dStump / 1.45) * 0.35, 0.5, 1.0);
      }
    }
    const dryFloor = Math.sin(x * 0.45) * Math.cos(z * 0.45) * 0.16 + 0.08;
    return clamp(dryFloor, -0.05, 0.55);
  }

  // На карте «Роща Светлячков» (сухая роща без начальной воды) мшистые ложбины и холмики
  if (mapVariant === SwampMapVariant.FIREFLY_GROVE) {
    const swirl = Math.sin(distFromCenter * 1.15 - Math.atan2(z, x) * 2.0) * 0.22;
    const centerHill = distFromCenter < 2.6 ? (1 - distFromCenter / 2.6) * 0.36 : 0;
    return clamp(swirl + centerHill + 0.16, -0.04, 0.68);
  }

  // Неровные болотные кочки, мшистые холмики и корневища у края круглой карты
  const mound1 = Math.sin(x * 0.52 + 0.4) * Math.cos(z * 0.48 - 0.3) * 0.34;
  const mound2 = Math.cos((x + z) * 0.37) * 0.18;
  const centerMound = distFromCenter < 2.4 ? (1 - distFromCenter / 2.4) * 0.28 : 0;
  const outerRootBank =
    distFromCenter > 8.2 ? Math.min(0.55, (distFromCenter - 8.2) * 0.22) : 0;

  return clamp(mound1 + mound2 + centerMound + outerRootBank, -0.28, 0.72);
}

/**
 * Коллизия с круглой границей из высоких дряхлых деревьев:
 * удерживает лягушку внутри круга радиуса (arenaRadius - frogRadius) и отражает радиальную скорость внутрь арены.
 */
export function resolveCircularTreeBoundaryCollision(
  x: number,
  z: number,
  vx: number,
  vz: number,
  frogRadius = 0.62,
  arenaRadius = ARENA_CONSTANTS.arenaRadius,
  bounceFactor = DEFAULT_FROG_CONFIG.wallBounceFactor
): { x: number; z: number; vx: number; vz: number; collided: boolean } {
  const maxDist = Math.max(1.0, arenaRadius - frogRadius);
  const dist = Math.hypot(x, z);
  if (dist <= maxDist || dist < 1e-5) {
    return { x, z, vx, vz, collided: false };
  }

  const nx = x / dist;
  const nz = z / dist;
  const clampedX = nx * maxDist;
  const clampedZ = nz * maxDist;

  // Отражаем только компоненту скорости, направленную наружу круга
  const radialVel = vx * nx + vz * nz;
  let nextVx = vx;
  let nextVz = vz;
  if (radialVel > 0) {
    nextVx = (vx - (1 + bounceFactor) * radialVel * nx) * 0.92;
    nextVz = (vz - (1 + bounceFactor) * radialVel * nz) * 0.92;
  }

  return {
    x: clampedX,
    z: clampedZ,
    vx: nextVx,
    vz: nextVz,
    collided: true,
  };
}

/**
 * Проверяет, находится ли точка (x, y, z) в воде или под уровнем потопа/прилива.
 * При сильном подъёме воды (currentWaterLevelY > 0.30) затапливает даже кувшинки!
 */
export function isPointInSwampWater(
  x: number,
  y: number,
  z: number,
  standingOnLilyPad: boolean,
  currentWaterLevelY: number = ARENA_CONSTANTS.waterLevelY,
  mapVariant: SwampMapVariant = SwampMapVariant.WILD_SWAMP
): boolean {
  // На сухой карте до начала дождя и потопа воды нет
  if (currentWaterLevelY < -0.45) return false;
  // Кувшинка спасает от воды только пока уровень прилива не затопил её стебель (до +0.28м)
  if (standingOnLilyPad && currentWaterLevelY <= 0.28) return false;
  return (
    y <= currentWaterLevelY + 0.06 &&
    getSwampTerrainHeight(x, z, mapVariant) <= currentWaterLevelY + 0.03
  );
}

/**
 * Проверяет, должна ли кувшинка сразу утонуть под весом лягушек (при X >= 2 лягушках на кувшинке).
 */
export function shouldLilyPadSinkFromOccupants(
  occupantCount: number,
  maxBeforeSink = DEFAULT_HOST_SETTINGS.lilyPadMaxFrogsBeforeSink
): boolean {
  return occupantCount >= Math.max(1, maxBeforeSink);
}

export function calculateJumpVelocity(
  worldDirection: Vec3,
  powerRatio: number,
  jumpMultiplier = 1.0,
  cfg: FrogConfigParams = DEFAULT_FROG_CONFIG
): Vec3 {
  const clampedPower = clamp(powerRatio, 0.0, 1.0);
  const len = Math.hypot(worldDirection.x, worldDirection.z);
  const dirX = len > 1e-5 ? worldDirection.x / len : 0;
  const dirZ = len > 1e-5 ? worldDirection.z / len : -1;

  const horizontalSpeed = cfg.maxHorizontalJumpSpeed * clampedPower * jumpMultiplier;
  const verticalFactor = clamp(0.35 + clampedPower * 0.65, 0.35, 1.0);
  const verticalSpeed = cfg.maxVerticalJumpSpeed * verticalFactor * jumpMultiplier;

  return {
    x: dirX * horizontalSpeed,
    y: verticalSpeed,
    z: dirZ * horizontalSpeed,
  };
}

export function calculateStompDamage(
  fallSpeedAbs: number,
  cfg: FrogConfigParams = DEFAULT_FROG_CONFIG
): number {
  const speedRatio = clamp((fallSpeedAbs - cfg.minFallSpeedForStomp) / 14.0, 0.0, 1.0);
  const bonus = Math.round(cfg.maxFallSpeedBonusDamage * speedRatio);
  return cfg.baseStompDamage + bonus;
}

export function computeSlingshotPower(
  startScreen: Vec2,
  currentScreen: Vec2,
  cfg: FrogConfigParams = DEFAULT_FROG_CONFIG
): number {
  const pullX = startScreen.x - currentScreen.x;
  const pullY = startScreen.y - currentScreen.y;
  const pullDistance = Math.hypot(pullX, pullY);
  if (pullDistance <= cfg.dragDeadzonePx) {
    return 0.0;
  }
  const effectiveDistance = pullDistance - cfg.dragDeadzonePx;
  const maxSpan = Math.max(1.0, cfg.maxDragDistancePx - cfg.dragDeadzonePx);
  return clamp(effectiveDistance / maxSpan, 0.0, 1.0);
}

export function computeSlingshotWorldDirection(
  startScreen: Vec2,
  currentScreen: Vec2,
  cameraYawRad = Math.PI / 4
): Vec3 {
  const pullX = startScreen.x - currentScreen.x;
  const pullY = startScreen.y - currentScreen.y;
  if (pullX * pullX + pullY * pullY < 1.0) {
    return { x: 0, y: 0, z: -1 };
  }
  const cosY = Math.cos(cameraYawRad);
  const sinY = Math.sin(cameraYawRad);
  const camRightX = cosY;
  const camRightZ = -sinY;
  const camFwdX = -sinY;
  const camFwdZ = -cosY;

  const worldX = camRightX * pullX + camFwdX * -pullY;
  const worldZ = camRightZ * pullX + camFwdZ * -pullY;
  const len = Math.hypot(worldX, worldZ);
  if (len < 1e-4) {
    return { x: 0, y: 0, z: -1 };
  }
  return { x: worldX / len, y: 0, z: worldZ / len };
}

export interface FloodZoneState {
  isFlooding: boolean;
  isRaining: boolean;
  hasInitialWater: boolean;
  waterLevelY: number;
  baseWaterLevelY: number;
  secondsUntilFlood: number;
  floodRiseMeters: number;
}

/**
 * Вычисляет состояние зоны ограничения «Потоп» (вместо старого круга):
 * - На картах с водой (Дикое Болото, Глубокая Топь) начинается прилив прямо из водоёмов
 *   и не останавливается, пока не умрут все.
 * - На картах без воды (Гнилые Пни, Роща Светлячков) начинается проливной дождь и потоп
 *   по такой же логике (вода поднимается снизу вверх без остановки).
 */
export function computeFloodZoneState(
  matchElapsedSec: number,
  mapVariant: SwampMapVariant = SwampMapVariant.WILD_SWAMP,
  floodEnabled = DEFAULT_HOST_SETTINGS.floodEnabled,
  floodStartDelaySec = DEFAULT_HOST_SETTINGS.floodStartDelaySec,
  floodRiseRatePerSec = DEFAULT_HOST_SETTINGS.floodRiseRatePerSec
): FloodZoneState {
  const hasInitialWater = doesMapHaveInitialWater(mapVariant);
  // На картах без воды до начала дождя вода скрыта глубоко под рельефом (-0.65)
  const baseWaterLevelY = hasInitialWater ? ARENA_CONSTANTS.waterLevelY : -0.65;
  // Когда на сухой карте начинается ливень, вода начинает подниматься из самых низких ложбин (-0.16)
  const floodStartBaseY = hasInitialWater ? ARENA_CONSTANTS.waterLevelY : -0.16;

  if (!floodEnabled || matchElapsedSec < floodStartDelaySec) {
    return {
      isFlooding: false,
      isRaining: false,
      hasInitialWater,
      waterLevelY: baseWaterLevelY,
      baseWaterLevelY,
      secondsUntilFlood: floodEnabled
        ? Math.max(0, floodStartDelaySec - matchElapsedSec)
        : 0,
      floodRiseMeters: 0,
    };
  }

  const floodElapsed = Math.max(0, matchElapsedSec - floodStartDelaySec);
  const effectiveRate = clamp(floodRiseRatePerSec, 0.01, 2.0);
  const floodRiseMeters = floodElapsed * effectiveRate;
  const waterLevelY = floodStartBaseY + floodRiseMeters;

  return {
    isFlooding: true,
    isRaining: !hasInitialWater,
    hasInitialWater,
    waterLevelY,
    baseWaterLevelY,
    secondsUntilFlood: 0,
    floodRiseMeters,
  };
}

export function computeSafeZoneRadius(
  matchElapsedSec: number,
  gracePeriodSec = ARENA_CONSTANTS.zoneGracePeriodSec,
  shrinkDurationSec = ARENA_CONSTANTS.zoneShrinkDurationSec,
  initialRadius = ARENA_CONSTANTS.zoneInitialRadius,
  minRadius = ARENA_CONSTANTS.zoneMinRadius
): { radius: number; isShrinking: boolean } {
  if (matchElapsedSec < gracePeriodSec) {
    return { radius: initialRadius, isShrinking: false };
  }
  const progress = clamp((matchElapsedSec - gracePeriodSec) / shrinkDurationSec, 0.0, 1.0);
  const radius = initialRadius + (minRadius - initialRadius) * progress;
  return { radius, isShrinking: true };
}

export function botJumpPowerForDistance(distance: number): number {
  const clampedDistance = clamp(distance, 1.0, 21.0);
  const power = (-7.57 + Math.sqrt(57.3 + 56.3 * clampedDistance)) / 28.14;
  return clamp(power, 0.34, 1.0);
}

/**
 * Создает описание одноразового стакающегося баффа.
 */
export function createBuffTemplate(type: PowerUpType): FrogBuffStack {
  switch (type) {
    case PowerUpType.BARK_ARMOR:
      return {
        type: PowerUpType.BARK_ARMOR,
        id: "bark_armor",
        displayName: "ДРЕВЕСНАЯ БРОНЯ",
        shortTag: "КОРА",
        charges: 1,
        maxCharges: MAX_BUFF_STACK_PER_TYPE,
        cooldownProgress: 1.0,
        colorHex: "#a16207",
        blocksSingleStomp: true,
        jumpForceMultiplier: 1.0,
        extraAirJumps: 0,
      };
    case PowerUpType.DOUBLE_JUMP:
      return {
        type: PowerUpType.DOUBLE_JUMP,
        id: "dragonfly_wings",
        displayName: "КРЫЛЬЯ СТРЕКОЗЫ",
        shortTag: "2x ПРЫЖОК",
        charges: 1,
        maxCharges: MAX_BUFF_STACK_PER_TYPE,
        cooldownProgress: 1.0,
        colorHex: "#eab308",
        blocksSingleStomp: false,
        jumpForceMultiplier: 1.0,
        extraAirJumps: 1,
      };
    case PowerUpType.SUPER_SPRING:
      return {
        type: PowerUpType.SUPER_SPRING,
        id: "turbo_spring",
        displayName: "ТУРБО-ПРУЖИНА",
        shortTag: "ПРУЖИНА",
        charges: 1,
        maxCharges: MAX_BUFF_STACK_PER_TYPE,
        cooldownProgress: 1.0,
        colorHex: "#f97316",
        blocksSingleStomp: false,
        jumpForceMultiplier: 1.35,
        extraAirJumps: 0,
      };
  }
}

/**
 * Добавляет 1 заряд баффа в инвентарь лягушки:
 * - Каждый из 3 баффов стакается до 3 зарядов (максимум 9 зарядов суммарно).
 */
export function addBuffChargeToStacks(
  currentStacks: FrogBuffStack[],
  type: PowerUpType
): { stacks: FrogBuffStack[]; added: boolean; totalCharges: number } {
  const totalBefore = currentStacks.reduce((sum, s) => sum + s.charges, 0);
  if (totalBefore >= MAX_TOTAL_BUFF_CHARGES) {
    return { stacks: currentStacks, added: false, totalCharges: totalBefore };
  }

  const next = currentStacks.map((s) => ({ ...s }));
  const existing = next.find((s) => s.type === type);
  if (existing) {
    if (existing.charges >= MAX_BUFF_STACK_PER_TYPE) {
      return { stacks: next, added: false, totalCharges: totalBefore };
    }
    existing.charges += 1;
    existing.cooldownProgress = 1.0;
    return { stacks: next, added: true, totalCharges: totalBefore + 1 };
  }

  const template = createBuffTemplate(type);
  next.push(template);
  return { stacks: next, added: true, totalCharges: totalBefore + 1 };
}

/**
 * Расходует 1 заряд одноразового баффа при его срабатывании (удар по коре, прыжок в воздухе или турбо-прыжок).
 */
export function consumeSingleBuffCharge(
  currentStacks: FrogBuffStack[],
  type: PowerUpType
): { stacks: FrogBuffStack[]; consumed: boolean } {
  const next: FrogBuffStack[] = [];
  let consumed = false;

  for (const s of currentStacks) {
    if (!consumed && s.type === type && s.charges > 0) {
      consumed = true;
      if (s.charges - 1 > 0) {
        next.push({
          ...s,
          charges: s.charges - 1,
          cooldownProgress: (s.charges - 1) / s.maxCharges,
        });
      }
    } else {
      next.push({ ...s });
    }
  }
  return { stacks: next, consumed };
}

export interface VictoryCheckFrog {
  peerId: number;
  nickname: string;
  teamId: number;
  isAlive: boolean;
}

export type VictoryOutcome =
  | { finished: false }
  | { finished: true; type: "solo"; winnerPeerId: number; winnerName: string }
  | { finished: true; type: "team"; winningTeamId: number }
  | { finished: true; type: "draw" };

export function evaluateVictoryConditions(
  frogs: VictoryCheckFrog[],
  mode: MatchMode
): VictoryOutcome {
  const aliveFrogs = frogs.filter((f) => f.isAlive);
  if (mode === MatchMode.FREE_FOR_ALL) {
    if (aliveFrogs.length === 1) {
      return {
        finished: true,
        type: "solo",
        winnerPeerId: aliveFrogs[0].peerId,
        winnerName: aliveFrogs[0].nickname,
      };
    }
    if (aliveFrogs.length === 0) {
      return { finished: true, type: "draw" };
    }
    return { finished: false };
  } else {
    const aliveTeams = new Set<number>();
    for (const f of aliveFrogs) {
      if (f.teamId >= 0) {
        aliveTeams.add(f.teamId);
      }
    }
    if (aliveTeams.size === 1) {
      const [winningTeamId] = Array.from(aliveTeams);
      return {
        finished: true,
        type: "team",
        winningTeamId,
      };
    }
    if (aliveTeams.size === 0) {
      return { finished: true, type: "draw" };
    }
    return { finished: false };
  }
}

export const CAMERA_LAUGH_TRIGGER_BOX = {
  minX: -5.8,
  maxX: 5.8,
  minY: 0.25,
  maxY: 16.5,
  minZ: 4.5,
  maxZ: 11.5,
};

/**
 * Проверяет, задел ли прыгающий персонаж триггер в области камеры (при прыжке в сторону камеры +Z)
 */
export function doesFrogTouchCameraTrigger(
  pos: Vec3,
  vel: Vec3,
  onGround: boolean
): boolean {
  if (onGround) return false;
  if (vel.z <= 0.8) return false;
  return (
    pos.x >= CAMERA_LAUGH_TRIGGER_BOX.minX &&
    pos.x <= CAMERA_LAUGH_TRIGGER_BOX.maxX &&
    pos.y >= CAMERA_LAUGH_TRIGGER_BOX.minY &&
    pos.y <= CAMERA_LAUGH_TRIGGER_BOX.maxY &&
    pos.z >= CAMERA_LAUGH_TRIGGER_BOX.minZ &&
    pos.z <= CAMERA_LAUGH_TRIGGER_BOX.maxZ
  );
}
