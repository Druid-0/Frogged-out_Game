class_name MainArenaController
extends Node3D
## Главный контроллер сцены (Godot 4.7): меню, браузер комнат, лобби ожидания и бой с бонусами и сужением зоны.
## Поддерживает работу через Web/Node-шлюз (/api/rooms) и автоматический локальный хост-фоллбэк при запуске из редактора (F5).

@onready var players_container: Node3D = $PlayersContainer
@onready var ortho_camera: OrthoCameraRig = $OrthoCameraRig
@onready var rules_manager: GameRulesManager = $GameRulesManager
@onready var lobby_manager: NetworkLobbyManager = $NetworkLobbyManager
@onready var settings_manager: UserSettingsManager = $UserSettingsManager
@onready var powerup_spawner: ArenaPowerUpSpawner3D = get_node_or_null("ArenaPowerUpSpawner3D") as ArenaPowerUpSpawner3D
@onready var shrinking_zone: ShrinkingZoneHazard3D = get_node_or_null("ShrinkingZoneHazard3D") as ShrinkingZoneHazard3D

@onready var menu_backdrop: ColorRect = $UI/HUD/MenuBackdrop
@onready var title_screen_panel: PanelContainer = $UI/HUD/TitleScreenPanel
@onready var nickname_input: LineEdit = $UI/HUD/TitleScreenPanel/Margin/VBox/NicknameInput
@onready var open_play_menu_button: Button = $UI/HUD/TitleScreenPanel/Margin/VBox/OpenPlayMenuButton
@onready var open_settings_button: Button = $UI/HUD/TitleScreenPanel/Margin/VBox/OpenSettingsButton
@onready var quit_game_button: Button = $UI/HUD/TitleScreenPanel/Margin/VBox/QuitGameButton

@onready var play_menu_panel: PanelContainer = $UI/HUD/PlayMenuPanel
@onready var ip_input: LineEdit = $UI/HUD/PlayMenuPanel/Margin/VBox/AddressGrid/IpInput
@onready var port_input: LineEdit = $UI/HUD/PlayMenuPanel/Margin/VBox/AddressGrid/PortInput
@onready var create_lobby_button: Button = $UI/HUD/PlayMenuPanel/Margin/VBox/ActionsRow/CreateLobbyButton
@onready var join_lobby_button: Button = $UI/HUD/PlayMenuPanel/Margin/VBox/ActionsRow/JoinLobbyButton
@onready var server_list_vbox: VBoxContainer = $UI/HUD/PlayMenuPanel/Margin/VBox/ServerListVBox
@onready var back_from_play_button: Button = $UI/HUD/PlayMenuPanel/Margin/VBox/BackFromPlayButton

@onready var settings_panel: PanelContainer = $UI/HUD/SettingsPanel
@onready var sfx_volume_slider: HSlider = $UI/HUD/SettingsPanel/Margin/VBox/SfxVolumeSlider
@onready var music_volume_slider: HSlider = $UI/HUD/SettingsPanel/Margin/VBox/MusicVolumeSlider
@onready var control_mode_option: OptionButton = $UI/HUD/SettingsPanel/Margin/VBox/ControlModeOption
@onready var back_from_settings_button: Button = $UI/HUD/SettingsPanel/Margin/VBox/BackFromSettingsButton

@onready var waiting_room_hud: Control = $UI/HUD/WaitingRoomHUD
@onready var settings_summary_label: Label = $UI/HUD/WaitingRoomHUD/SettingsBox/SettingsSummaryLabel
@onready var player_counter_label: Label = $UI/HUD/WaitingRoomHUD/BottomBar/PlayerCounterLabel
@onready var color_cycle_button: Button = $UI/HUD/WaitingRoomHUD/BottomBar/ColorCycleButton
@onready var team_toggle_button: Button = $UI/HUD/WaitingRoomHUD/BottomBar/TeamToggleButton
@onready var add_bot_button: Button = $UI/HUD/WaitingRoomHUD/BottomBar/AddBotButton
@onready var start_match_button: Button = $UI/HUD/WaitingRoomHUD/BottomBar/StartMatchButton
@onready var leave_lobby_button: Button = $UI/HUD/WaitingRoomHUD/BottomBar/LeaveLobbyButton
@onready var center_banner_label: Label = $UI/HUD/CenterBannerLabel

const ROOMS_REFRESH_INTERVAL_SEC: float = 3.0

var _my_color_index: int = 0
var _http: HTTPRequest
var _pending_action: String = ""
var _selected_room_id: String = ""
var _refresh_accum: float = 0.0
var _server_mode: bool = false
var _room_buttons: Array[Button] = []


func _ready() -> void:
	_ensure_stage2_arena_systems()

	ortho_camera.players_container = players_container
	rules_manager.players_container = players_container
	lobby_manager.players_container = players_container
	lobby_manager.rules_manager = rules_manager
	lobby_manager.settings_manager = settings_manager
	lobby_manager.powerup_spawner = powerup_spawner
	lobby_manager.shrinking_zone = shrinking_zone

	_connect_match_rules_signals()

	_server_mode = _detect_server_mode()
	if _server_mode:
		_start_dedicated_room()
		return

	_setup_settings_controls()
	_connect_ui_signals()
	_show_title_window()


func _ensure_stage2_arena_systems() -> void:
	if powerup_spawner == null:
		powerup_spawner = ArenaPowerUpSpawner3D.new()
		powerup_spawner.name = "ArenaPowerUpSpawner3D"
		add_child(powerup_spawner)
	powerup_spawner.players_container = players_container
	if not powerup_spawner.bonus_picked_up_banner.is_connected(_on_bonus_picked_up):
		powerup_spawner.bonus_picked_up_banner.connect(_on_bonus_picked_up)

	if shrinking_zone == null:
		shrinking_zone = ShrinkingZoneHazard3D.new()
		shrinking_zone.name = "ShrinkingZoneHazard3D"
		add_child(shrinking_zone)
	shrinking_zone.players_container = players_container
	if not shrinking_zone.zone_warning_started.is_connected(_on_zone_warning_started):
		shrinking_zone.zone_warning_started.connect(_on_zone_warning_started)


func _process(delta: float) -> void:
	if _server_mode:
		return
	if play_menu_panel != null and play_menu_panel.visible:
		_refresh_accum += delta
		if _refresh_accum >= ROOMS_REFRESH_INTERVAL_SEC:
			_refresh_accum = 0.0
			_request_rooms_list()


func _detect_server_mode() -> bool:
	if OS.get_environment("FROG_SERVER") == "1":
		return true
	for arg: String in OS.get_cmdline_user_args():
		if arg == "--server":
			return true
	return false


func _get_user_arg(prefix: String, fallback: String) -> String:
	var eq_prefix: String = prefix + "="
	var args: PackedStringArray = OS.get_cmdline_user_args()
	for i: int in range(args.size()):
		var arg: String = args[i]
		if arg.begins_with(eq_prefix):
			return arg.substr(eq_prefix.length())
		if arg == prefix and i + 1 < args.size():
			return args[i + 1]
	return fallback


func _start_dedicated_room() -> void:
	if menu_backdrop != null:
		menu_backdrop.hide()
	if title_screen_panel != null:
		title_screen_panel.hide()
	if play_menu_panel != null:
		play_menu_panel.hide()
	if settings_panel != null:
		settings_panel.hide()
	if waiting_room_hud != null:
		waiting_room_hud.hide()

	var port: int = int(_get_user_arg("--port", _get_user_arg("--server-port", "7777")))
	var room_id: String = _get_user_arg("--room", "default")
	var err: Error = lobby_manager.start_dedicated_server(port, room_id)
	if err != OK:
		print("FROG_SERVER_ERROR code=%d" % err)
		get_tree().quit(1)


func _setup_settings_controls() -> void:
	control_mode_option.clear()
	control_mode_option.add_item("Рогатка (Оттягивание с любой части экрана – По умолчанию)", 0)
	control_mode_option.add_item("Зажатие экрана (Заряд силы по времени)", 1)
	control_mode_option.selected = int(settings_manager.current_control_mode)

	sfx_volume_slider.value = settings_manager.sfx_volume_linear * 100.0
	music_volume_slider.value = settings_manager.music_volume_linear * 100.0


func _connect_ui_signals() -> void:
	open_play_menu_button.pressed.connect(_show_play_window)
	open_settings_button.pressed.connect(_show_settings_window)
	quit_game_button.pressed.connect(_on_quit_game_pressed)

	create_lobby_button.pressed.connect(_on_create_lobby_pressed)
	join_lobby_button.pressed.connect(_on_join_lobby_pressed)
	back_from_play_button.pressed.connect(_show_title_window)

	sfx_volume_slider.value_changed.connect(_on_volume_sliders_changed)
	music_volume_slider.value_changed.connect(_on_volume_sliders_changed)
	control_mode_option.item_selected.connect(_on_control_mode_selected)
	back_from_settings_button.pressed.connect(_show_title_window)

	color_cycle_button.pressed.connect(_on_color_cycle_pressed)
	team_toggle_button.pressed.connect(_on_team_toggle_pressed)
	add_bot_button.pressed.connect(_on_add_bot_pressed)
	start_match_button.pressed.connect(_on_start_match_pressed)
	leave_lobby_button.pressed.connect(_on_leave_lobby_pressed)

	lobby_manager.lobby_state_changed.connect(_on_lobby_state_changed)
	lobby_manager.roster_updated.connect(_on_roster_updated)
	lobby_manager.room_owner_changed.connect(_on_room_owner_changed)
	lobby_manager.countdown_tick.connect(_on_countdown_tick)
	lobby_manager.match_started.connect(_on_match_started)
	lobby_manager.connection_status_message.connect(_on_connection_status_message)

	_http = HTTPRequest.new()
	_http.timeout = 3.5
	add_child(_http)
	_http.request_completed.connect(_on_http_request_completed)


func _connect_match_rules_signals() -> void:
	rules_manager.damage_dealt.connect(_on_damage_dealt)
	rules_manager.match_won_solo.connect(_on_match_won_solo)
	rules_manager.match_won_team.connect(_on_match_won_team)
	rules_manager.match_draw.connect(_on_match_draw)
	rules_manager.player_eliminated.connect(_on_player_eliminated)


func _show_title_window() -> void:
	menu_backdrop.visible = true
	title_screen_panel.visible = true
	play_menu_panel.visible = false
	settings_panel.visible = false
	waiting_room_hud.visible = false
	center_banner_label.text = ""
	_refresh_accum = 0.0


func _show_play_window() -> void:
	menu_backdrop.visible = true
	title_screen_panel.visible = false
	play_menu_panel.visible = true
	settings_panel.visible = false
	waiting_room_hud.visible = false
	_refresh_accum = 0.0
	_request_rooms_list()


func _show_settings_window() -> void:
	menu_backdrop.visible = true
	title_screen_panel.visible = false
	play_menu_panel.visible = false
	settings_panel.visible = true
	waiting_room_hud.visible = false


func _on_quit_game_pressed() -> void:
	lobby_manager.leave_lobby()
	get_tree().quit()


func _get_clean_nickname() -> String:
	var nick: String = nickname_input.text.strip_edges()
	return nick if not nick.is_empty() else "Квакер"


func _get_entered_port() -> int:
	var p: int = port_input.text.strip_edges().to_int()
	return p if p >= 1024 and p <= 65535 else NetworkLobbyManager.DEFAULT_PORT


func _get_http_base() -> String:
	if OS.has_feature("web"):
		var origin: Variant = JavaScriptBridge.eval("window.location.origin")
		if origin is String and not (origin as String).is_empty():
			return (origin as String).trim_suffix("/")
	var configured: String = _get_user_arg("--server-url", "")
	if not configured.is_empty():
		return configured.trim_suffix("/")
	return "http://127.0.0.1:8080"


func _get_ws_url(room_id: String) -> String:
	if OS.has_feature("web"):
		var protocol: String = str(JavaScriptBridge.eval("window.location.protocol"))
		var host: String = str(JavaScriptBridge.eval("window.location.host"))
		var scheme: String = "wss" if protocol == "https:" else "ws"
		return "%s://%s/ws/room/%s" % [scheme, host, room_id]

	var base: String = _get_http_base()
	var ws_base: String = base.replace("https://", "wss://").replace("http://", "ws://")
	return "%s/ws/room/%s" % [ws_base, room_id]


func _request_rooms_list() -> void:
	if _http == null or _pending_action != "":
		return
	_pending_action = "list"
	var err: Error = _http.request(_get_http_base() + "/api/rooms")
	if err != OK:
		_pending_action = ""


func _on_create_lobby_pressed() -> void:
	if _http == null or _pending_action != "":
		return
	var nick: String = _get_clean_nickname()
	var payload: String = JSON.stringify({"name": "%s — комната" % nick})
	_pending_action = "create"
	center_banner_label.text = "Создание комнаты..."
	var err: Error = _http.request(
		_get_http_base() + "/api/rooms",
		PackedStringArray(["Content-Type: application/json"]),
		HTTPClient.METHOD_POST,
		payload
	)
	if err != OK:
		_pending_action = ""
		lobby_manager.start_local_host_lobby(_get_entered_port(), nick)


func _on_join_lobby_pressed() -> void:
	var typed_code: String = ip_input.text.strip_edges()
	if not typed_code.is_empty() and typed_code != "127.0.0.1":
		if typed_code.contains(".") or typed_code.begins_with("ws://") or typed_code.begins_with("wss://"):
			var direct_url: String = (
				typed_code
				if (typed_code.begins_with("ws://") or typed_code.begins_with("wss://"))
				else "ws://%s:%d" % [typed_code, _get_entered_port()]
			)
			lobby_manager.connect_to_room_url(direct_url, _get_clean_nickname())
			return
		_connect_to_room(typed_code)
		return
	if not _selected_room_id.is_empty():
		_connect_to_room(_selected_room_id)
		return
	# Если открытых комнат на шлюзе нет, пробуем подключиться к локальному WebSocket-хосту по IP:Port
	var local_ws_url: String = "ws://%s:%d" % [
		typed_code if not typed_code.is_empty() else "127.0.0.1",
		_get_entered_port()
	]
	lobby_manager.connect_to_room_url(local_ws_url, _get_clean_nickname())


func _on_http_request_completed(
	result: int,
	response_code: int,
	_headers: PackedStringArray,
	body: PackedByteArray
) -> void:
	var action: String = _pending_action
	_pending_action = ""

	if result != HTTPRequest.RESULT_SUCCESS or response_code < 200 or response_code >= 300:
		if action == "create":
			# Если Node-шлюз не запущен (например, при тесте из редактора Godot F5), запускаем локальное лобби!
			lobby_manager.start_local_host_lobby(_get_entered_port(), _get_clean_nickname())
		return

	var text: String = body.get_string_from_utf8()
	var parsed: Variant = JSON.parse_string(text)
	if action == "create":
		if parsed is Dictionary and (parsed as Dictionary).has("id"):
			var new_id: String = str((parsed as Dictionary)["id"])
			_connect_to_room(new_id)
		else:
			lobby_manager.start_local_host_lobby(_get_entered_port(), _get_clean_nickname())
	elif action == "list":
		if parsed is Array:
			_populate_room_list(parsed as Array)


func _populate_room_list(rooms: Array) -> void:
	for child: Node in server_list_vbox.get_children():
		child.queue_free()
	_room_buttons.clear()
	_selected_room_id = ""

	for entry: Variant in rooms:
		if not (entry is Dictionary):
			continue
		var info := entry as Dictionary
		var room_id: String = str(info.get("id", ""))
		if room_id.is_empty():
			continue
		var room_name: String = str(info.get("name", "Комната %s" % room_id))
		var players: int = int(info.get("players", 0))
		var max_players: int = int(info.get("max", info.get("maxPlayers", 8)))
		var state_text: String = str(info.get("state", "Ожидание"))

		var button := Button.new()
		button.text = "%s [%d/%d] - %s" % [room_name, players, max_players, state_text]
		button.pressed.connect(_on_room_button_pressed.bind(room_id))
		server_list_vbox.add_child(button)
		_room_buttons.append(button)
		if _selected_room_id.is_empty():
			_selected_room_id = room_id

	if rooms.is_empty():
		var empty_label := Label.new()
		empty_label.text = "Открытых комнат нет. Нажмите «СОЗДАТЬ ЛОББИ»."
		server_list_vbox.add_child(empty_label)


func _on_room_button_pressed(room_id: String) -> void:
	_selected_room_id = room_id
	_connect_to_room(room_id)


func _connect_to_room(room_id: String) -> void:
	center_banner_label.text = "Подключение к комнате..."
	var err: Error = lobby_manager.connect_to_room_url(_get_ws_url(room_id), _get_clean_nickname())
	if err != OK:
		center_banner_label.text = "Не удалось начать подключение"


func _on_volume_sliders_changed(_val: float) -> void:
	settings_manager.set_volumes(
		sfx_volume_slider.value / 100.0,
		music_volume_slider.value / 100.0
	)


func _on_control_mode_selected(index: int) -> void:
	var mode: UserSettingsManager.ControlMode = (
		UserSettingsManager.ControlMode.SLINGSHOT_DRAG
		if index == 0
		else UserSettingsManager.ControlMode.HOLD_TO_CHARGE
	)
	settings_manager.set_control_mode(mode)
	lobby_manager.apply_local_control_mode_preference()


func _on_color_cycle_pressed() -> void:
	_my_color_index = (_my_color_index + 1) % FrogCharacter.FROG_PALETTE.size()
	var my_id: int = multiplayer.get_unique_id() if multiplayer.has_multiplayer_peer() else 1
	var current_team: int = -1
	if lobby_manager.players_roster.has(my_id):
		current_team = int(lobby_manager.players_roster[my_id].get("team_id", -1))
	lobby_manager.request_customization_change(_my_color_index, current_team)


func _on_team_toggle_pressed() -> void:
	lobby_manager.request_toggle_match_mode()


func _on_add_bot_pressed() -> void:
	lobby_manager.request_add_bot()


func _on_start_match_pressed() -> void:
	lobby_manager.request_start_countdown()


func _on_leave_lobby_pressed() -> void:
	lobby_manager.leave_lobby()
	_show_title_window()


func _on_room_owner_changed(_owner_peer_id: int) -> void:
	_refresh_waiting_room_ui()


func _on_lobby_state_changed(new_state: NetworkLobbyManager.LobbyState) -> void:
	match new_state:
		NetworkLobbyManager.LobbyState.MAIN_MENU:
			_show_title_window()
		NetworkLobbyManager.LobbyState.WAITING_IN_LOBBY:
			menu_backdrop.visible = false
			title_screen_panel.visible = false
			play_menu_panel.visible = false
			settings_panel.visible = false
			waiting_room_hud.visible = true
			start_match_button.disabled = false
			_refresh_waiting_room_ui()
		NetworkLobbyManager.LobbyState.COUNTDOWN:
			menu_backdrop.visible = false
			waiting_room_hud.visible = true
			start_match_button.disabled = true
		NetworkLobbyManager.LobbyState.IN_MATCH:
			menu_backdrop.visible = false
			waiting_room_hud.visible = false
			center_banner_label.text = "БОЙ НАЧАЛСЯ! Собирайте бонусы и прыгайте сверху на врагов!"


func _on_roster_updated(_roster: Dictionary) -> void:
	_refresh_waiting_room_ui()


func _on_countdown_tick(seconds_left: int) -> void:
	center_banner_label.text = "Матч начнется через %d..." % seconds_left


func _on_match_started() -> void:
	center_banner_label.text = "ВПЕРЕД! Раздавите соперников!"


func _on_connection_status_message(message: String) -> void:
	center_banner_label.text = message


func _on_bonus_picked_up(frog_name: String, bonus_title: String) -> void:
	center_banner_label.text = "%s подобрал бонус: %s!" % [frog_name, bonus_title]


func _on_zone_warning_started() -> void:
	center_banner_label.text = "ВНИМАНИЕ! Безопасная зона арены начинает сужаться к центру!"


func _on_damage_dealt(
	victim_name: String,
	attacker_name: String,
	damage_amount: int,
	remaining_hp: int
) -> void:
	center_banner_label.text = "%s нанес %d урона по %s (Осталось: %d HP)" % [
		attacker_name,
		damage_amount,
		victim_name,
		remaining_hp,
	]


func _on_player_eliminated(victim_id: int, attacker_id: int) -> void:
	if attacker_id > 0:
		center_banner_label.text = "Лягушка #%d РАЗДАВИЛА лягушку #%d!" % [attacker_id, victim_id]
	else:
		center_banner_label.text = "Лягушка #%d выбыла за пределами безопасной зоны!" % victim_id


func _on_match_won_solo(_winner_peer_id: int, winner_name: String) -> void:
	print("FROG_UI victory_solo winner=%s" % winner_name)
	center_banner_label.text = "ПОБЕДА! Единственная выжившая лягушка: %s" % winner_name
	_schedule_return_to_lobby()


func _on_match_won_team(winning_team_id: int) -> void:
	print("FROG_UI victory_team team=%d" % winning_team_id)
	var team_title: String = "СИНЯЯ КОМАНДА" if winning_team_id == 0 else "КРАСНАЯ КОМАНДА"
	center_banner_label.text = "ПОБЕДА КОМАНДЫ: %s!" % team_title
	_schedule_return_to_lobby()


func _on_match_draw() -> void:
	print("FROG_UI draw")
	center_banner_label.text = "НИЧЬЯ! Никто не уцелел."
	_schedule_return_to_lobby()


func _schedule_return_to_lobby() -> void:
	if multiplayer.has_multiplayer_peer() and not multiplayer.is_server():
		return
	var timer: SceneTreeTimer = get_tree().create_timer(3.5)
	timer.timeout.connect(func() -> void:
		lobby_manager.return_all_to_waiting_lobby()
	)


func _refresh_waiting_room_ui() -> void:
	var count: int = lobby_manager.players_roster.size()
	var max_p: int = NetworkLobbyManager.MAX_PLAYERS
	var min_p: int = NetworkLobbyManager.MIN_PLAYERS_TO_START
	player_counter_label.text = "Ожидание игроков: %d / %d (Мин. %d)" % [count, max_p, min_p]

	var my_id: int = multiplayer.get_unique_id() if multiplayer.has_multiplayer_peer() else 1
	var is_owner: bool = (lobby_manager.room_owner_peer_id == my_id) or not multiplayer.has_multiplayer_peer()
	start_match_button.visible = is_owner
	start_match_button.disabled = count < min_p
	add_bot_button.visible = is_owner
	team_toggle_button.visible = is_owner
	color_cycle_button.visible = true

	var mode_str: String = (
		"Командный бой (2 команды)"
		if rules_manager.current_mode == GameRulesManager.MatchMode.TEAMS
		else "Каждый сам за себя"
	)
	team_toggle_button.text = "Режим: %s" % (
		"Команды" if rules_manager.current_mode == GameRulesManager.MatchMode.TEAMS else "Каждый за себя"
	)
	var ctrl_str: String = (
		"Рогатка (с любой точки экрана)"
		if settings_manager.current_control_mode == UserSettingsManager.ControlMode.SLINGSHOT_DRAG
		else "Зажатие экрана (по времени)"
	)

	var players_lines: PackedStringArray = PackedStringArray()
	if count == 0:
		players_lines.append("• Ожидание ответа от сервера...")
	else:
		for peer_id: int in lobby_manager.players_roster.keys():
			var p_info: Dictionary = lobby_manager.players_roster[peer_id]
			var owner_mark: String = " (владелец)" if peer_id == lobby_manager.room_owner_peer_id else ""
			players_lines.append("• %s%s" % [str(p_info.get("nickname", "Frog")), owner_mark])

	var room_label: String = lobby_manager.room_id if not lobby_manager.room_id.is_empty() else lobby_manager.active_server_ip
	settings_summary_label.text = (
		"КОМНАТА: %s
" % room_label
		+ "Режим матча: %s
" % mode_str
		+ "Управление: %s
" % ctrl_str
		+ "Арена: Бонусы + Кувшинки + Сужение зоны

"
		+ "Игроки в коробке (%d/%d):
" % [count, max_p]
		+ "
".join(players_lines)
	)
