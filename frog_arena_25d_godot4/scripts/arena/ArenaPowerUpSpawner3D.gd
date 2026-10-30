class_name ArenaPowerUpSpawner3D
extends Node3D
## Серверно-авторитетный генератор бонусов на арене (Godot 4.7).
## Спавнит до MAX_ACTIVE_PICKUPS усилителей на свободных клетках гольф-поля
## и синхронизирует их подбор между всеми клиентами через RPC.

signal bonus_picked_up_banner(frog_name: String, bonus_title: String)

const MAX_ACTIVE_PICKUPS: int = 3
const SPAWN_INTERVAL_SEC: float = 6.5

const PICKUP_SPAWN_CANDIDATES: Array[Vector3] = [
	Vector3(-3.8, 0.0, 0.0),
	Vector3(3.8, 0.0, 0.0),
	Vector3(0.0, 0.0, -3.8),
	Vector3(0.0, 0.0, 3.8),
	Vector3(-5.2, 0.0, -2.6),
	Vector3(5.2, 0.0, 2.6),
	Vector3(-2.6, 0.0, 5.2),
	Vector3(2.6, 0.0, -5.2),
]

@export var players_container: Node3D
@export var spawning_enabled: bool = true

var _active_pickups: Dictionary[int, ArenaPowerUpPickup3D] = {}
var _next_pickup_id: int = 1
var _spawn_timer: float = 2.5
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	_rng.randomize()


func _process(delta: float) -> void:
	if not spawning_enabled or not _is_server_authority():
		return

	if _active_pickups.size() >= MAX_ACTIVE_PICKUPS:
		return

	_spawn_timer -= delta
	if _spawn_timer <= 0.0:
		_spawn_timer = SPAWN_INTERVAL_SEC
		_spawn_random_pickup_authoritative()


func clear_all_pickups_authoritative() -> void:
	if not _is_server_authority():
		return
	if multiplayer.has_multiplayer_peer() and not multiplayer.get_peers().is_empty():
		rpc_client_clear_pickups.rpc()
	else:
		rpc_client_clear_pickups()


## Возвращает ближайший активный бонус для ИИ-ботов.
func find_nearest_pickup(from_pos: Vector3) -> ArenaPowerUpPickup3D:
	var best: ArenaPowerUpPickup3D = null
	var best_dist_sq: float = 1e20
	for id_key: int in _active_pickups.keys():
		var pickup: ArenaPowerUpPickup3D = _active_pickups[id_key]
		if is_instance_valid(pickup):
			var d_sq: float = from_pos.distance_squared_to(pickup.global_position)
			if d_sq < best_dist_sq:
				best_dist_sq = d_sq
				best = pickup
	return best


func _spawn_random_pickup_authoritative() -> void:
	var spawn_pos: Vector3 = _pick_free_pickup_position()
	var random_type: int = _rng.randi_range(0, 2)
	var new_id: int = _next_pickup_id
	_next_pickup_id += 1

	if multiplayer.has_multiplayer_peer() and not multiplayer.get_peers().is_empty():
		rpc_client_spawn_pickup.rpc(new_id, random_type, spawn_pos)
	else:
		rpc_client_spawn_pickup(new_id, random_type, spawn_pos)


func _pick_free_pickup_position() -> Vector3:
	var shuffled: Array[Vector3] = PICKUP_SPAWN_CANDIDATES.duplicate()
	for i: int in range(shuffled.size()):
		var swap_idx: int = _rng.randi_range(0, shuffled.size() - 1)
		var tmp: Vector3 = shuffled[i]
		shuffled[i] = shuffled[swap_idx]
		shuffled[swap_idx] = tmp

	for candidate: Vector3 in shuffled:
		var occupied: bool = false
		for id_key: int in _active_pickups.keys():
			var existing: ArenaPowerUpPickup3D = _active_pickups[id_key]
			if is_instance_valid(existing) and existing.position.distance_to(candidate) < 2.0:
				occupied = true
				break
		if not occupied:
			return candidate

	return PICKUP_SPAWN_CANDIDATES[0]


@rpc("authority", "call_local", "reliable")
func rpc_client_spawn_pickup(pickup_id: int, type_int: int, world_pos: Vector3) -> void:
	if _active_pickups.has(pickup_id) and is_instance_valid(_active_pickups[pickup_id]):
		return

	var pickup := ArenaPowerUpPickup3D.new()
	pickup.name = "Pickup_%d" % pickup_id
	add_child(pickup)
	pickup.setup_pickup(pickup_id, type_int as ArenaPowerUpPickup3D.PowerUpType, world_pos)
	pickup.pickup_collected.connect(_on_pickup_touched_by_frog)
	_active_pickups[pickup_id] = pickup


@rpc("authority", "call_local", "reliable")
func rpc_client_consume_pickup(pickup_id: int, type_int: int, collector_peer_id: int) -> void:
	var pickup: ArenaPowerUpPickup3D = _active_pickups.get(pickup_id, null) as ArenaPowerUpPickup3D
	_active_pickups.erase(pickup_id)

	var effect: FrogModifierEffect = null
	var bonus_title: String = "БОНУС"
	if is_instance_valid(pickup):
		effect = pickup.create_modifier_effect()
		bonus_title = pickup.get_pickup_title()
		pickup.play_collect_and_free()
	else:
		var temp := ArenaPowerUpPickup3D.new()
		temp.powerup_type = type_int as ArenaPowerUpPickup3D.PowerUpType
		effect = temp.create_modifier_effect()
		bonus_title = temp.get_pickup_title()
		temp.free()

	var collector: FrogCharacter = _find_frog(collector_peer_id)
	if collector != null and effect != null:
		collector.apply_powerup_effect(effect)
		bonus_picked_up_banner.emit(collector.player_nickname, bonus_title)


@rpc("authority", "call_local", "reliable")
func rpc_client_clear_pickups() -> void:
	for id_key: int in _active_pickups.keys():
		var pickup: ArenaPowerUpPickup3D = _active_pickups[id_key]
		if is_instance_valid(pickup):
			pickup.queue_free()
	_active_pickups.clear()
	_spawn_timer = 2.5


func _on_pickup_touched_by_frog(
	pickup_id: int,
	powerup_type: ArenaPowerUpPickup3D.PowerUpType,
	collector: FrogCharacter
) -> void:
	if not _is_server_authority():
		return
	if not _active_pickups.has(pickup_id):
		return

	if multiplayer.has_multiplayer_peer() and not multiplayer.get_peers().is_empty():
		rpc_client_consume_pickup.rpc(pickup_id, int(powerup_type), collector.player_peer_id)
	else:
		rpc_client_consume_pickup(pickup_id, int(powerup_type), collector.player_peer_id)


func _find_frog(peer_id: int) -> FrogCharacter:
	if players_container == null:
		return null
	var node_name := str(peer_id)
	if players_container.has_node(node_name):
		return players_container.get_node(node_name) as FrogCharacter
	return null


func _is_server_authority() -> bool:
	if not multiplayer.has_multiplayer_peer():
		return true
	return multiplayer.is_server()
