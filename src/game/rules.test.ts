import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateJumpVelocity,
  calculateStompDamage,
  computeSlingshotPower,
  computeSafeZoneRadius,
  computeFloodZoneState,
  doesMapHaveInitialWater,
  addBuffChargeToStacks,
  consumeSingleBuffCharge,
  shouldLilyPadSinkFromOccupants,
  getSwampTerrainHeight,
  resolveCircularTreeBoundaryCollision,
  evaluateVictoryConditions,
  doesFrogTouchCameraTrigger,
  tallyNextMapVotes,
  SwampMapVariant,
  SWAMP_MAPS_CATALOG,
  FROG_MODELS_CATALOG,
  MatchMode,
  PowerUpType,
  ARENA_CONSTANTS,
  FrogBuffStack,
} from "./rules";

test("calculateJumpVelocity scales horizontal and vertical speeds accurately", () => {
  const vFull = calculateJumpVelocity({ x: 0, y: 0, z: -1 }, 1.0, 1.0);
  assert.equal(vFull.x, 0);
  assert.equal(vFull.z, -13.0);
  assert.equal(vFull.y, 14.5);

  const vTurbo = calculateJumpVelocity({ x: 1, y: 0, z: 0 }, 1.0, 1.35);
  assert.ok(Math.abs(vTurbo.x - 13.0 * 1.35) < 1e-6);
  assert.ok(Math.abs(vTurbo.y - 14.5 * 1.35) < 1e-6);
});

test("calculateStompDamage computes base and fall-speed bonus damage", () => {
  assert.equal(calculateStompDamage(1.2), 50);
  assert.equal(calculateStompDamage(8.2), 75);
  assert.equal(calculateStompDamage(20.0), 100);
});

test("computeSlingshotPower respects deadzone and max drag distance", () => {
  assert.equal(computeSlingshotPower({ x: 100, y: 100 }, { x: 110, y: 105 }), 0);
  const fullPull = computeSlingshotPower({ x: 300, y: 300 }, { x: 300, y: 550 });
  assert.equal(fullPull, 1.0);
});

test("computeSafeZoneRadius holds during grace period and shrinks to minRadius", () => {
  const before = computeSafeZoneRadius(10.0);
  assert.equal(before.isShrinking, false);
  assert.equal(before.radius, ARENA_CONSTANTS.zoneInitialRadius);

  const mid = computeSafeZoneRadius(18.0 + 17.5);
  assert.equal(mid.isShrinking, true);
  assert.ok(Math.abs(mid.radius - 7.1) < 1e-5);
});

test("single-use buff stacking caps each buff at 3 charges and total at 9 charges", () => {
  let stacks: FrogBuffStack[] = [];

  for (let i = 0; i < 4; i++) {
    const res = addBuffChargeToStacks(stacks, PowerUpType.BARK_ARMOR);
    stacks = res.stacks;
  }
  assert.equal(stacks.length, 1);
  assert.equal(stacks[0].charges, 3); // capped at 3

  for (let i = 0; i < 3; i++) {
    stacks = addBuffChargeToStacks(stacks, PowerUpType.DOUBLE_JUMP).stacks;
    stacks = addBuffChargeToStacks(stacks, PowerUpType.SUPER_SPRING).stacks;
  }
  const totalCharges = stacks.reduce((sum, s) => sum + s.charges, 0);
  assert.equal(totalCharges, 9);

  // Consuming 1 Bark Armor charge reduces it from 3 to 2
  const afterConsume = consumeSingleBuffCharge(stacks, PowerUpType.BARK_ARMOR);
  assert.equal(afterConsume.consumed, true);
  assert.equal(afterConsume.stacks.find((s) => s.type === PowerUpType.BARK_ARMOR)?.charges, 2);
});

test("water lily pads stay afloat with 1 frog and sink immediately with >= 2 frogs", () => {
  assert.equal(shouldLilyPadSinkFromOccupants(0, 2), false);
  assert.equal(shouldLilyPadSinkFromOccupants(1, 2), false);
  assert.equal(shouldLilyPadSinkFromOccupants(2, 2), true);
  assert.equal(shouldLilyPadSinkFromOccupants(3, 2), true);
});

test("swamp terrain height creates water basins under lily pad positions and uneven mounds elsewhere", () => {
  const padPos = ARENA_CONSTANTS.lilyPadPositions[0];
  const atPad = getSwampTerrainHeight(padPos.x, padPos.z);
  const atCenter = getSwampTerrainHeight(0, 0);
  assert.ok(atPad < ARENA_CONSTANTS.waterLevelY);
  assert.ok(atCenter > 0);

  const atStump = getSwampTerrainHeight(-3.2, 0.0, SwampMapVariant.ROTTEN_STUMPS);
  assert.ok(atStump > 0.5);
});

test("resolveCircularTreeBoundaryCollision keeps frogs inside the circular decrepit tree perimeter", () => {
  const inside = resolveCircularTreeBoundaryCollision(3.0, 4.0, 2.0, 1.0, 0.6, 10.6);
  assert.equal(inside.collided, false);

  const outside = resolveCircularTreeBoundaryCollision(12.0, 0.0, 8.0, 0.0, 0.6, 10.6);
  assert.equal(outside.collided, true);
  assert.ok(Math.abs(outside.x - 10.0) < 1e-5);
  assert.ok(outside.vx < 0); // reflected inward
});

test("evaluateVictoryConditions detects solo winner, team winner, and draw", () => {
  const soloWin = evaluateVictoryConditions(
    [
      { peerId: 1, nickname: "Квакер", teamId: -1, isAlive: true },
      { peerId: 501, nickname: "Бот #1", teamId: -1, isAlive: false },
    ],
    MatchMode.FREE_FOR_ALL
  );
  assert.equal(soloWin.finished, true);
});

test("tallyNextMapVotes selects majority-voted swamp map and falls back when empty", () => {
  assert.equal(SWAMP_MAPS_CATALOG.length, 4);
  assert.equal(FROG_MODELS_CATALOG.length, 3);

  const emptyRes = tallyNextMapVotes({}, SwampMapVariant.DEEP_MIRE);
  assert.equal(emptyRes.winnerMap, SwampMapVariant.DEEP_MIRE);
  assert.equal(emptyRes.totalVotes, 0);

  const votedRes = tallyNextMapVotes(
    {
      "1": SwampMapVariant.ROTTEN_STUMPS,
      "2": SwampMapVariant.FIREFLY_GROVE,
      "3": SwampMapVariant.ROTTEN_STUMPS,
    },
    SwampMapVariant.WILD_SWAMP
  );
  assert.equal(votedRes.winnerMap, SwampMapVariant.ROTTEN_STUMPS);
  assert.equal(votedRes.totalVotes, 3);
  assert.equal(votedRes.counts[SwampMapVariant.ROTTEN_STUMPS], 2);
});

test("doesFrogTouchCameraTrigger detects frog jumping toward camera trigger area", () => {
  // Jumping toward camera (+Z) inside trigger box
  assert.equal(
    doesFrogTouchCameraTrigger({ x: 0, y: 1.5, z: 6.2 }, { x: 0, y: 3.0, z: 5.5 }, false),
    true
  );
  // On ground -> false
  assert.equal(
    doesFrogTouchCameraTrigger({ x: 0, y: 1.5, z: 6.2 }, { x: 0, y: 0, z: 5.5 }, true),
    false
  );
  // Jumping away from camera (-Z) -> false
  assert.equal(
    doesFrogTouchCameraTrigger({ x: 0, y: 1.5, z: 6.2 }, { x: 0, y: 3.0, z: -4.0 }, false),
    false
  );
});

test("computeFloodZoneState triggers tide on water maps and rain+flood on dry maps without stopping", () => {
  assert.equal(doesMapHaveInitialWater(SwampMapVariant.WILD_SWAMP), true);
  assert.equal(doesMapHaveInitialWater(SwampMapVariant.DEEP_MIRE), true);
  assert.equal(doesMapHaveInitialWater(SwampMapVariant.ROTTEN_STUMPS), false);
  assert.equal(doesMapHaveInitialWater(SwampMapVariant.FIREFLY_GROVE), false);

  // Before delay on water map: not flooding, no rain, water at base level
  const beforeWet = computeFloodZoneState(5, SwampMapVariant.WILD_SWAMP, true, 14, 0.15);
  assert.equal(beforeWet.isFlooding, false);
  assert.equal(beforeWet.isRaining, false);
  assert.equal(beforeWet.waterLevelY, ARENA_CONSTANTS.waterLevelY);

  // After delay on water map: tide rises continuously without upper bound
  const floodingWet = computeFloodZoneState(24, SwampMapVariant.WILD_SWAMP, true, 14, 0.15);
  assert.equal(floodingWet.isFlooding, true);
  assert.equal(floodingWet.isRaining, false);
  assert.ok(floodingWet.waterLevelY > ARENA_CONSTANTS.waterLevelY + 1.4);

  // On dry map (ROTTEN_STUMPS): starts dry (-0.65), then rain + flood rises continuously
  const beforeDry = computeFloodZoneState(4, SwampMapVariant.ROTTEN_STUMPS, true, 10, 0.2);
  assert.equal(beforeDry.isFlooding, false);
  assert.equal(beforeDry.isRaining, false);
  assert.ok(beforeDry.waterLevelY < -0.5);

  const floodingDry = computeFloodZoneState(30, SwampMapVariant.ROTTEN_STUMPS, true, 10, 0.2);
  assert.equal(floodingDry.isFlooding, true);
  assert.equal(floodingDry.isRaining, true);
  assert.ok(floodingDry.waterLevelY > 3.5);
});

