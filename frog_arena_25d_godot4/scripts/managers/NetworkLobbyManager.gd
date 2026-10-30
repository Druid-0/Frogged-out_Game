class_name NetworkLobbyManager
extends Node
## Сетевой менеджер комнаты (Godot 4.7, WebSocket).
## Поддерживает:
## 1) Выделенный авторитетный сервер (headless) + клиентов браузера через Node-шлюз (/ws/room/<id>).
## 2) Локальный хост-режим (start_local_host_lobby) при прямом запуске из редактора Godot (F5) или в LAN без Node-шлюза.

signal lobby_state_changed(new_state: LobbyState)
signal roster_updated(players_roster: Dictionary)
signal room_owner_changed(owner_peer_id: int)
signal countdown_tick(seconds_left: int)
signal match_started()
signal connection_status_message(message: String)

enum LobbyState {
	MAIN_MENU,
	WAITING_IN_LOBBY,
	COUNTDOWN,
	IN_MATCH,
}

const DEFAULT_PORT: int = 7777
const MAX_PLAYERS: int = 8
const MIN_PLAYERS_TO_START: int = 2
const COUNTDOWN_DURATION_SEC: int = 5
const MIN_SPAWN_SEPARATION: float = 2.8
const LOBBY_WARMUP_RESPAWN_DELAY_SEC: float = 2.0
const SNAPSHOT_INTERVAL_SEC: float = 0.05
const BOT_MIN_JUMP_INTERVAL_SEC: float = 1.4
const BOT_MAX_JUMP_INTERVAL_SEC: float = 3.0

const ARENA_SPAWN_SLOTS: Array[Vector3] = [
	Vector3(-6.5, 0.6, -6.5),
	Vector3(6.5, 0.6, 6.5),
	Vector3(-6.5, 0.6, 6.5),
	Vector3(6.5, 0.6, -6.5),
	Vector3(0.0, 0.6, -7.5),
	Vector3(0.0, 0.6, 7.5),
	Vector3(-7.5, 0.6, 0.0),
	Vector3(7.5, 0.6, 0.0),
	Vector3(-3.9, 0.6, -6.5),
	Vector3(3.9, 0.6, 6.5),
	Vector3(-6.5, 0.6, 3.9),
	Vector3(6.5, 0.6, -3.9),
]

@export var frog_scene: PackedScene
@export var players_container: Node3D
@export var rules_manager: GameRulesManager
@export var settings_manager: UserSettingsManager
@export var powerup_spawner: ArenaPowerUpSpawner3D
@export var shrinking_zone: ShrinkingZoneHazard3D

var current_state: LobbyState = LobbyState.MAIN_MENU
var active_port: int = DEFAULT_PORT
var active_server_ip: String = "127.0.0.1"
var active_url: String = ""
var players_roster: Dictionary[int, Dictionary] = {}
var room_owner_peer_id: int = 0
var is_dedicated_server: bool = false
var room_id: String = ""

var _countdown_remaining: int = 0
var _countdown_accum: float = 0.0
var _bot_id_counter: int = 500
var _rng := RandomNumberGenerator.new()
var _snapshot_accum: float = 0.0
var _snapshot_tick: int = 0
var _bot_next_jump_sec: Dictionary[int, float] = {}


func _ready() -> void:
	_rng.randomize()
	multiplayer.peer_connected.connect(_on_peer_connected)
	multiplayer.peer_disconnected.connect(_on_peer_disconnected)
	multiplayer.connected_to_server.connect(_on_connected_to_server)
	multiplayer.connection_failed.connect(_on_connection_failed)
	multiplayer.server_disconnected.connect(_on_server_disconnected)


func _process(delta: float) -> void:
	if not _is_server_authority():
		return

	if current_state == LobbyState.COUNTDOWN:
		_countdown_accum += delta
		if _countdown_accum >= 1.0:
			_countdown_accum -= 1.0
			_countdown_remaining -= 1
			if _countdown_remaining > 0:
				_broadcast_countdown_tick(_countdown_remaining)
			else:
				_begin_combat_match_authoritative()

	_process_bot_ai(delta)
	_process_snapshot_broadcast(delta)


## Запускает выделенный WebSocket-сервер комнаты (используется headless-воркером Node-шлюза).
func start_dedicated_server(custom_port: int = DEFAULT_PORT, new_room_id: String = "") -> Error:
	leave_lobby()
	active_port = clampi(custom_port, 1024, 65535)
	room_id = new_room_id
	is_dedicated_server = true

	var peer := WebSocketMultiplayerPeer.new()
	var err: Error = peer.create_server(active_port)
	if err != OK:
		connection_status_message.emit("Не удалось открыть WebSocket-порт %d (ошибка %d)" % [active_port, err])
		return err

	multiplayer.multiplayer_peer = peer
	_set_lobby_state(LobbyState.WAITING_IN_LOBBY)
	print("FROG_SERVER_READY port=%d room=%s" % [active_port, room_id])
	return OK


## Псевдоним для обратной совместимости со старыми вызовами.
func host_dedicated_room(custom_port: int = DEFAULT_PORT, new_room_id: String = "") -> Error:
	return start_dedicated_server(custom_port, new_room_id)


## Запускает локальное лобби с игроком-хостом (peer_id = 1) при запуске напрямую из редактора Godot (F5) или в LAN без Node-шлюза.
func start_local_host_lobby(custom_port: int = DEFAULT_PORT, host_nickname: String = "Квакер") -> Error:
	leave_lobby()
	active_port = clampi(custom_port, 1024, 65535)
	room_id = "LOCAL:%d" % active_port
	is_dedicated_server = false

	if not OS.has_feature("web"):
		var peer := WebSocketMultiplayerPeer.new()
		var err: Error = peer.create_server(active_port)
		if err == OK:
			multiplayer.multiplayer_peer = peer
			connection_status_message.emit("Локальное лобби создано (ws://127.0.0.1:%d)" % active_port)
		else:
			multiplayer.multiplayer_peer = null
			connection_status_message.emit("Локальное лобби (одиночный/боты режим, порт %d занят)" % active_port)
	else:
		multiplayer.multiplayer_peer = null
		connection_status_message.emit("Локальное лобби в браузере (с ботами)")

	var clean_name: String = host_nickname.strip_edges()
	if clean_name.is_empty():
		clean_name = "Хост-Квакер"

	var host_pos: Vector3 = _find_unoccupied_spawn_position(0)
	_register_player_entry(1, clean_name, 0, _get_default_team_for_index(0), false, host_pos)
	_spawn_or_update_frog_node(1)
	_set_room_owner(1)
	_set_lobby_state(LobbyState.WAITING_IN_LOBBY)
	_sync_full_roster_to_clients()
	return OK


## Подключается к комнате через WebSocket-шлюз Node (ws:// или wss://).
func connect_to_room_url(room_url: String, client_nickname: String) -> Error:
	leave_lobby()
	var clean_url: String = room_url.strip_edges()
	if clean_url.is_empty():
		connection_status_message.emit("Пустой адрес комнаты")
		return ERR_INVALID_PARAMETER

	active_url = clean_url
	var peer := WebSocketMultiplayerPeer.new()
	var err: Error = peer.create_client(clean_url)
	if err != OK:
		connection_status_message.emit("Ошибка подключения к %s (код %d)" % [clean_url, err])
		return err

	multiplayer.multiplayer_peer = peer
	set_meta("pending_nickname", client_nickname)
	_set_lobby_state(LobbyState.WAITING_IN_LOBBY)
	connection_status_message.emit("Подключение к комнате... Ожидание ответа сервера")
	return OK


func leave_lobby() -> void:
	if multiplayer.has_multiplayer_peer():
		multiplayer.multiplayer_peer.close()
		multiplayer.multiplayer_peer = null

	players_roster.clear()
	room_owner_peer_id = 0
	_bot_next_jump_sec.clear()
	if players_container != null:
		for child: Node in players_container.get_children():
			child.queue_free()

	if powerup_spawner != null:
		powerup_spawner.rpc_client_clear_pickups()
	if shrinking_zone != null:
		shrinking_zone.reset_zone()

	is_dedicated_server = false
	_set_lobby_state(LobbyState.MAIN_MENU)


func add_bot_frog_to_lobby() -> void:
	if not _is_server_authority():
		return
	if players_roster.size() >= MAX_PLAYERS:
		return

	_bot_id_counter += 1
	var bot_id: int = _bot_id_counter
	var slot_idx: int = players_roster.size()
	var bot_name: String = "Бот-Квак #%d" % slot_idx
	var bot_spawn_pos: Vector3 = _find_unoccupied_spawn_position(slot_idx)

	_register_player_entry(
		bot_id,
		bot_name,
		slot_idx % 8,
		_get_default_team_for_index(slot_idx),
		true,
		bot_spawn_pos
	)
	_spawn_or_update_frog_node(bot_id)
	_sync_full_roster_to_clients()


func request_customization_change(new_color_index: int, new_team_id: int) -> void:
	var my_id: int = multiplayer.get_unique_id() if multiplayer.has_multiplayer_peer() else 1
	if multiplayer.has_multiplayer_peer() and not multiplayer.is_server():
		rpc_server_update_customization.rpc_id(1, my_id, new_color_index, new_team_id)
	else:
		rpc_server_update_customization(my_id, new_color_index, new_team_id)


func request_start_countdown() -> void:
	if multiplayer.has_multiplayer_peer() and not multiplayer.is_server():
		rpc_server_request_start.rpc_id(1)
	else:
		host_request_start_countdown()


func request_add_bot() -> void:
	if multiplayer.has_multiplayer_peer() and not multiplayer.is_server():
		rpc_server_request_add_bot.rpc_id(1)
	else:
		add_bot_frog_to_lobby()


func request_toggle_match_mode() -> void:
	if multiplayer.has_multiplayer_peer() and not multiplayer.is_server():
		rpc_server_request_toggle_mode.rpc_id(1)
	else:
		_toggle_match_mode()


func host_request_start_countdown() -> void:
	if not _is_server_authority():
		return
	if players_roster.size() < MIN_PLAYERS_TO_START:
		return

	_countdown_remaining = COUNTDOWN_DURATION_SEC
	_countdown_accum = 0.0
	_broadcast_state_change(LobbyState.COUNTDOWN)
	_broadcast_countdown_tick(_countdown_remaining)


func return_all_to_waiting_lobby() -> void:
	if not _is_server_authority():
		return
	if rules_manager != null:
		rules_manager.stop_combat_round()
	if powerup_spawner != null:
		powerup_spawner.clear_all_pickups_authoritative()
	if shrinking_zone != null:
		shrinking_zone.reset_zone()

	_broadcast_state_change(LobbyState.WAITING_IN_LOBBY)
	_respawn_all_frogs_for_state(false)


func apply_local_control_mode_preference() -> void:
	if settings_manager == null or players_container == null:
		return
	var my_id: int = multiplayer.get_unique_id() if multiplayer.has_multiplayer_peer() else 1
	var my_frog: FrogCharacter = _get_frog_node(my_id)
	if my_frog != null and my_frog.jump_input != null:
		my_frog.jump_input.control_mode = settings_manager.current_control_mode


@rpc("any_peer", "call_remote", "reliable")
func rpc_server_register_client(peer_id: int, nickname: String) -> void:
	if not _is_server_authority():
		return
	if multiplayer.has_multiplayer_peer():
		var sender_id: int = multiplayer.get_remote_sender_id()
		if sender_id != 0 and sender_id != peer_id:
			return

	if players_roster.has(peer_id):
		var existing: Dictionary = players_roster[peer_id]
		existing["nickname"] = nickname.strip_edges()
		players_roster[peer_id] = existing
		_spawn_or_update_frog_node(peer_id)
		_sync_full_roster_to_clients()
		return

	var slot_idx: int = players_roster.size()
	var clean_name: String = nickname.strip_edges()
	if clean_name.is_empty():
		clean_name = "Лягушка #%d" % peer_id

	var client_spawn_pos: Vector3 = _find_unoccupied_spawn_position(slot_idx)
	_register_player_entry(
		peer_id,
		clean_name,
		slot_idx % 8,
		_get_default_team_for_index(slot_idx),
		false,
		client_spawn_pos
	)
	_spawn_or_update_frog_node(peer_id)

	if room_owner_peer_id == 0:
		_set_room_owner(peer_id)

	_sync_full_roster_to_clients()


@rpc("any_peer", "call_remote", "reliable")
func rpc_server_update_customization(peer_id: int, new_color_index: int, new_team_id: int) -> void:
	if not _is_server_authority():
		return
	if multiplayer.has_multiplayer_peer():
		var sender_id: int = multiplayer.get_remote_sender_id()
		if sender_id != 0 and sender_id != peer_id:
			return
	if not players_roster.has(peer_id):
		return

	var entry: Dictionary = players_roster[peer_id]
	entry["color_index"] = new_color_index
	entry["team_id"] = new_team_id
	players_roster[peer_id] = entry

	_sync_full_roster_to_clients()


@rpc("any_peer", "call_remote", "reliable")
func rpc_server_request_start() -> void:
	if not _is_server_authority():
		return
	if multiplayer.has_multiplayer_peer() and multiplayer.get_remote_sender_id() != room_owner_peer_id:
		return
	host_request_start_countdown()


@rpc("any_peer", "call_remote", "reliable")
func rpc_server_request_add_bot() -> void:
	if not _is_server_authority():
		return
	if multiplayer.has_multiplayer_peer() and multiplayer.get_remote_sender_id() != room_owner_peer_id:
		return
	add_bot_frog_to_lobby()


@rpc("any_peer", "call_remote", "reliable")
func rpc_server_request_toggle_mode() -> void:
	if not _is_server_authority():
		return
	if multiplayer.has_multiplayer_peer() and multiplayer.get_remote_sender_id() != room_owner_peer_id:
		return
	_toggle_match_mode()


@rpc("authority", "call_local", "reliable")
func rpc_client_receive_roster(serialized_roster: Dictionary, match_mode_int: int) -> void:
	if rules_manager != null:
		rules_manager.current_mode = match_mode_int as GameRulesManager.MatchMode

	var roster_snapshot: Dictionary = serialized_roster.duplicate(true)

	if players_container != null:
		for child: Node in players_container.get_children():
			if child is FrogCharacter:
				var f_id: int = (child as FrogCharacter).player_peer_id
				if not roster_snapshot.has(f_id):
					child.queue_free()

	players_roster.clear()
	for key: Variant in roster_snapshot.keys():
		var peer_id: int = int(key)
		players_roster[peer_id] = roster_snapshot[key] as Dictionary
		_spawn_or_update_frog_node(peer_id)

	apply_local_control_mode_preference()
	roster_updated.emit(players_roster)


@rpc("authority", "call_local", "reliable")
func rpc_client_set_room_owner(owner_peer_id: int) -> void:
	room_owner_peer_id = owner_peer_id
	room_owner_changed.emit(room_owner_peer_id)


@rpc("authority", "call_local", "reliable")
func rpc_client_set_lobby_state(state_int: int) -> void:
	_set_lobby_state(state_int as LobbyState)


@rpc("authority", "call_local", "reliable")
func rpc_client_countdown_tick(seconds_left: int) -> void:
	countdown_tick.emit(seconds_left)


@rpc("authority", "call_local", "reliable")
func rpc_client_prepare_frog_for_round(peer_id: int, spawn_pos: Vector3, combat_enabled: bool) -> void:
	if players_roster.has(peer_id):
		var entry: Dictionary = players_roster[peer_id]
		entry["spawn_pos"] = spawn_pos
		players_roster[peer_id] = entry

	var frog: FrogCharacter = _get_frog_node(peer_id)
	if frog != null:
		frog.respawn_at(spawn_pos, combat_enabled)


@rpc("authority", "call_remote", "unreliable")
func rpc_client_snapshot(_tick: int, states: Dictionary) -> void:
	for key: Variant in states.keys():
		var frog: FrogCharacter = _get_frog_node(int(key))
		if frog != null:
			frog.apply_network_snapshot(states[key] as Dictionary)


func _toggle_match_mode() -> void:
	if not _is_server_authority() or rules_manager == null:
		return

	if rules_manager.current_mode == GameRulesManager.MatchMode.FREE_FOR_ALL:
		rules_manager.current_mode = GameRulesManager.MatchMode.TEAMS
	else:
		rules_manager.current_mode = GameRulesManager.MatchMode.FREE_FOR_ALL

	var idx: int = 0
	for peer_id: int in players_roster.keys():
		var team_id: int = (idx % 2) if rules_manager.current_mode == GameRulesManager.MatchMode.TEAMS else -1
		var entry: Dictionary = players_roster[peer_id]
		entry["team_id"] = team_id
		players_roster[peer_id] = entry
		idx += 1

	_sync_full_roster_to_clients()


func _begin_combat_match_authoritative() -> void:
	if powerup_spawner != null:
		powerup_spawner.clear_all_pickups_authoritative()
	_broadcast_state_change(LobbyState.IN_MATCH)
	_respawn_all_frogs_for_state(true)
	if rules_manager != null:
		rules_manager.start_combat_round()
	match_started.emit()


func _respawn_all_frogs_for_state(combat_enabled: bool) -> void:
	var peer_ids: Array = players_roster.keys()
	for i: int in range(peer_ids.size()):
		var peer_id: int = int(peer_ids[i])
		var slot_pos: Vector3 = ARENA_SPAWN_SLOTS[i % ARENA_SPAWN_SLOTS.size()]
		var jitter := Vector3(_rng.randf_range(-0.45, 0.45), 0.0, _rng.randf_range(-0.45, 0.45))
		var final_pos: Vector3 = slot_pos + jitter
		if multiplayer.has_multiplayer_peer():
			rpc_client_prepare_frog_for_round.rpc(peer_id, final_pos, combat_enabled)
		else:
			rpc_client_prepare_frog_for_round(peer_id, final_pos, combat_enabled)


func _find_unoccupied_spawn_position(preferred_slot_index: int) -> Vector3:
	var total_slots: int = ARENA_SPAWN_SLOTS.size()
	for attempt: int in range(total_slots):
		var candidate_idx: int = (preferred_slot_index + attempt) % total_slots
		var base_candidate: Vector3 = ARENA_SPAWN_SLOTS[candidate_idx]
		var jitter := Vector3(_rng.randf_range(-0.5, 0.5), 0.0, _rng.randf_range(-0.5, 0.5))
		var candidate_pos: Vector3 = base_candidate + jitter
		if _is_position_free_of_frogs(candidate_pos):
			return candidate_pos

	for _retry: int in range(24):
		var rand_pos := Vector3(
			_rng.randf_range(-7.6, 7.6),
			0.6,
			_rng.randf_range(-7.6, 7.6)
		)
		if rand_pos.length() > 2.2 and _is_position_free_of_frogs(rand_pos):
			return rand_pos

	return ARENA_SPAWN_SLOTS[preferred_slot_index % total_slots]


func _is_position_free_of_frogs(candidate_pos: Vector3) -> bool:
	if players_container != null:
		for child: Node in players_container.get_children():
			if child is FrogCharacter:
				var existing_frog := child as FrogCharacter
				var flat_dist: float = Vector2(
					existing_frog.global_position.x - candidate_pos.x,
					existing_frog.global_position.z - candidate_pos.z
				).length()
				if flat_dist < MIN_SPAWN_SEPARATION:
					return false

	for peer_id: int in players_roster.keys():
		var info: Dictionary = players_roster[peer_id]
		if info.has("spawn_pos") and info["spawn_pos"] is Vector3:
			var saved_pos: Vector3 = info["spawn_pos"] as Vector3
			var saved_dist: float = Vector2(
				saved_pos.x - candidate_pos.x,
				saved_pos.z - candidate_pos.z
			).length()
			if saved_dist < MIN_SPAWN_SEPARATION:
				return false

	return true


func _register_player_entry(
	peer_id: int,
	nickname: String,
	color_idx: int,
	team: int,
	is_bot: bool,
	spawn_pos: Vector3
) -> void:
	var random_model_idx: int = _rng.randi_range(0, FrogCharacter.MODEL_VARIANTS.size() - 1)
	players_roster[peer_id] = {
		"nickname": nickname,
		"color_index": color_idx,
		"team_id": team,
		"is_bot": is_bot,
		"spawn_pos": spawn_pos,
		"model_variant": random_model_idx,
	}
	roster_updated.emit(players_roster)


func _spawn_or_update_frog_node(peer_id: int) -> FrogCharacter:
	if players_container == null or not players_roster.has(peer_id):
		return null

	var info: Dictionary = players_roster[peer_id]
	var frog: FrogCharacter = _get_frog_node(peer_id)

	if frog == null:
		if frog_scene != null:
			frog = frog_scene.instantiate() as FrogCharacter
		else:
			frog = FrogCharacter.new()
		frog.name = str(peer_id)
		frog.player_peer_id = peer_id

		var slot_idx: int = max(0, players_roster.keys().find(peer_id))
		var target_pos: Vector3 = info.get("spawn_pos", _find_unoccupied_spawn_position(slot_idx)) as Vector3
		frog.position = target_pos
		players_container.add_child(frog, true)
		frog.respawn_at(target_pos, true)

		if not frog.frog_squashed.is_connected(_on_frog_squashed_in_lobby_or_match):
			frog.frog_squashed.connect(_on_frog_squashed_in_lobby_or_match)

		if rules_manager != null:
			rules_manager.register_frog(frog)

	frog.is_bot = bool(info.get("is_bot", false))
	frog.apply_customization(
		str(info.get("nickname", "Frog")),
		int(info.get("color_index", 0)),
		int(info.get("team_id", -1)),
		int(info.get("model_variant", 0))
	)
	# В лобби ожидания включен разминочный урон (с авто-респавном через 2 сек), а в матче — полный бой на выбывание.
	frog.is_combat_enabled = (
		current_state == LobbyState.IN_MATCH
		or current_state == LobbyState.WAITING_IN_LOBBY
	)
	if frog.is_bot and frog.jump_input != null:
		frog.jump_input.is_input_enabled = false
	apply_local_control_mode_preference()
	return frog


func _on_frog_squashed_in_lobby_or_match(victim: FrogCharacter, _attacker: FrogCharacter) -> void:
	if not _is_server_authority():
		return
	if current_state == LobbyState.IN_MATCH:
		return

	var victim_id: int = victim.player_peer_id
	var timer: SceneTreeTimer = get_tree().create_timer(LOBBY_WARMUP_RESPAWN_DELAY_SEC)
	timer.timeout.connect(func() -> void:
		if current_state != LobbyState.IN_MATCH and players_roster.has(victim_id):
			var new_pos: Vector3 = _find_unoccupied_spawn_position(victim_id % ARENA_SPAWN_SLOTS.size())
			if multiplayer.has_multiplayer_peer():
				rpc_client_prepare_frog_for_round.rpc(victim_id, new_pos, true)
			else:
				rpc_client_prepare_frog_for_round(victim_id, new_pos, true)
	)


func _get_frog_node(peer_id: int) -> FrogCharacter:
	if players_container == null:
		return null
	var node_name := str(peer_id)
	if players_container.has_node(node_name):
		return players_container.get_node(node_name) as FrogCharacter
	return null


func _get_default_team_for_index(idx: int) -> int:
	if rules_manager != null and rules_manager.current_mode == GameRulesManager.MatchMode.TEAMS:
		return idx % max(2, rules_manager.teams_count)
	return -1


func _sync_full_roster_to_clients() -> void:
	var mode_int: int = int(rules_manager.current_mode) if rules_manager != null else 0
	var payload: Dictionary = players_roster.duplicate(true)
	if multiplayer.has_multiplayer_peer():
		rpc_client_receive_roster.rpc(payload, mode_int)
	else:
		rpc_client_receive_roster(payload, mode_int)


func _broadcast_state_change(new_state: LobbyState) -> void:
	if multiplayer.has_multiplayer_peer():
		rpc_client_set_lobby_state.rpc(int(new_state))
	else:
		rpc_client_set_lobby_state(int(new_state))


func _broadcast_countdown_tick(seconds_left: int) -> void:
	if multiplayer.has_multiplayer_peer():
		rpc_client_countdown_tick.rpc(seconds_left)
	else:
		rpc_client_countdown_tick(seconds_left)


func _set_room_owner(new_owner: int) -> void:
	room_owner_peer_id = new_owner
	if multiplayer.has_multiplayer_peer():
		rpc_client_set_room_owner.rpc(new_owner)
	else:
		rpc_client_set_room_owner(new_owner)


func _set_lobby_state(new_state: LobbyState) -> void:
	current_state = new_state
	if shrinking_zone != null:
		if current_state == LobbyState.IN_MATCH:
			shrinking_zone.start_zone_for_match()
		else:
			shrinking_zone.reset_zone()
	lobby_state_changed.emit(current_state)


func _process_snapshot_broadcast(delta: float) -> void:
	if players_container == null:
		return
	if multiplayer.has_multiplayer_peer() and multiplayer.get_peers().is_empty():
		return

	_snapshot_accum += delta
	if _snapshot_accum < SNAPSHOT_INTERVAL_SEC:
		return
	_snapshot_accum = 0.0
	_snapshot_tick += 1

	var states: Dictionary = {}
	for child: Node in players_container.get_children():
		if child is FrogCharacter:
			var frog := child as FrogCharacter
			states[frog.player_peer_id] = {
				"p": frog.global_position,
				"v": frog.velocity,
				"r": frog.rotation.y,
				"hp": frog.health_component.current_health if frog.health_component != null else 100,
				"a": frog.is_alive,
			}

	if multiplayer.has_multiplayer_peer():
		rpc_client_snapshot.rpc(_snapshot_tick, states)


func _process_bot_ai(_delta: float) -> void:
	if current_state != LobbyState.IN_MATCH and current_state != LobbyState.WAITING_IN_LOBBY:
		return
	if players_container == null:
		return
	var now_sec: float = Time.get_ticks_msec() / 1000.0
	for child: Node in players_container.get_children():
		if not (child is FrogCharacter):
			continue
		var frog := child as FrogCharacter
		if not frog.is_bot or not frog.is_alive:
			continue

		if not _bot_next_jump_sec.has(frog.player_peer_id):
			_bot_next_jump_sec[frog.player_peer_id] = now_sec + _rng.randf_range(
				BOT_MIN_JUMP_INTERVAL_SEC,
				BOT_MAX_JUMP_INTERVAL_SEC
			)

		if now_sec < float(_bot_next_jump_sec[frog.player_peer_id]):
			continue
		_bot_next_jump_sec[frog.player_peer_id] = now_sec + _rng.randf_range(
			BOT_MIN_JUMP_INTERVAL_SEC,
			BOT_MAX_JUMP_INTERVAL_SEC
		)

		if not frog.is_on_floor():
			continue

		var jump_dir := Vector3(_rng.randf_range(-1.0, 1.0), 0.0, _rng.randf_range(-1.0, 1.0))
		var jump_power: float = _rng.randf_range(0.55, 1.0)

		# Если рядом есть бонус и у бота нет щита или мало здоровья — бот может прыгнуть за бонусом
		var nearest_pickup: ArenaPowerUpPickup3D = (
			powerup_spawner.find_nearest_pickup(frog.global_position)
			if powerup_spawner != null
			else null
		)
		var target_enemy: FrogCharacter = _find_nearest_enemy_for_bot(frog)

		var aim_pos: Vector3 = Vector3.ZERO
		var has_aim_pos: bool = false

		if nearest_pickup != null and (
			target_enemy == null
			or frog.global_position.distance_to(nearest_pickup.global_position) < 4.8
		):
			aim_pos = nearest_pickup.global_position
			has_aim_pos = true
		elif target_enemy != null:
			aim_pos = target_enemy.global_position
			has_aim_pos = true

		if has_aim_pos:
			jump_dir = aim_pos - frog.global_position
			jump_dir.y = 0.0
			var target_distance: float = jump_dir.length()
			jump_power = _bot_jump_power_for_distance(target_distance)
			jump_dir = jump_dir.normalized().rotated(Vector3.UP, _rng.randf_range(-0.07, 0.07))
		else:
			if jump_dir.length_squared() < 0.01:
				jump_dir = Vector3.FORWARD
			jump_dir = jump_dir.normalized().rotated(Vector3.UP, _rng.randf_range(-0.45, 0.45))

		frog.apply_authoritative_jump(jump_dir, jump_power)


func _bot_jump_power_for_distance(distance: float) -> float:
	var clamped_distance: float = clampf(distance, 1.0, 21.0)
	var power: float = (-7.57 + sqrt(57.3 + 56.3 * clamped_distance)) / 28.14
	return clampf(power, 0.34, 1.0)


func _find_nearest_enemy_for_bot(bot: FrogCharacter) -> FrogCharacter:
	var best: FrogCharacter = null
	var best_dist: float = 1e20
	if players_container == null:
		return null
	for child: Node in players_container.get_children():
		if not (child is FrogCharacter):
			continue
		var other := child as FrogCharacter
		if other == bot or not other.is_alive:
			continue
		if not bot._is_enemy_frog(other):
			continue
		var d: float = bot.global_position.distance_squared_to(other.global_position)
		if d < best_dist:
			best_dist = d
			best = other
	return best


func _is_server_authority() -> bool:
	if not multiplayer.has_multiplayer_peer():
		return true
	return multiplayer.is_server()


func _on_peer_connected(peer_id: int) -> void:
	if not _is_server_authority():
		return
	if multiplayer.has_multiplayer_peer():
		rpc_client_set_lobby_state.rpc_id(peer_id, int(current_state))
		if room_owner_peer_id != 0:
			rpc_client_set_room_owner.rpc_id(peer_id, room_owner_peer_id)


func _on_peer_disconnected(peer_id: int) -> void:
	if not _is_server_authority():
		return
	if players_roster.has(peer_id):
		players_roster.erase(peer_id)
	var frog: FrogCharacter = _get_frog_node(peer_id)
	if frog != null:
		frog.queue_free()

	if room_owner_peer_id == peer_id:
		var next_owner: int = 0
		for remaining_id: int in players_roster.keys():
			if not bool(players_roster[remaining_id].get("is_bot", false)):
				next_owner = remaining_id
				break
		_set_room_owner(next_owner)

	_sync_full_roster_to_clients()


func _on_connected_to_server() -> void:
	var my_id: int = multiplayer.get_unique_id()
	var my_nick: String = str(get_meta("pending_nickname", "Лягушка"))
	connection_status_message.emit("Подключено к комнате! Ожидание остальных игроков...")
	rpc_server_register_client.rpc_id(1, my_id, my_nick)


func _on_connection_failed() -> void:
	connection_status_message.emit("Не удалось подключиться к комнате")
	leave_lobby()


func _on_server_disconnected() -> void:
	connection_status_message.emit("Сервер закрыл комнату.")
	leave_lobby()
