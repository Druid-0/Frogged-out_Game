class_name FrogCharacter
extends CharacterBody3D
## 3D-контроллер игрока-лягушки с поддержкой 3 случайных общих 3D-моделей (Godot 4.7):
## - Вариант 0: `res://assets/models/Frog_01.obj` (воксельная/блочная лягушка, 4 материала)
## - Вариант 1: `res://assets/models/Mesh_Frog.obj` + текстура `Tex_Frog.png` (классическая 3D-лягушка с UV)
## - Вариант 2: `res://assets/models/Frog.obj` (низкополигональная лягушка с золотыми глазами, 3 материала)
## Поддерживает визуальную сферу Аква-Щита, двойной прыжок в воздухе и Турбо-Пружину.

signal frog_damaged(victim: FrogCharacter, attacker: FrogCharacter, damage_amount: int, remaining_hp: int)
signal frog_squashed(victim: FrogCharacter, attacker: FrogCharacter)
signal frog_jumped(frog: FrogCharacter, power_ratio: float)

const BOT_ID_THRESHOLD: int = 500

const MODEL_VARIANTS: Array[Dictionary] = [
	{
		"name": "Frog_01",
		"obj_path": "res://assets/models/Frog_01.obj",
		"tex_path": "",
		"scale": Vector3(0.068, 0.068, 0.068),
		"rotation_deg": Vector3(0.0, 90.0, 0.0),
		"offset": Vector3(0.0, 0.0, 0.0),
	},
	{
		"name": "Mesh_Frog",
		"obj_path": "res://assets/models/Mesh_Frog.obj",
		"tex_path": "res://assets/models/Tex_Frog.png",
		"scale": Vector3(0.024, 0.024, 0.024),
		"rotation_deg": Vector3(0.0, 180.0, 0.0),
		"offset": Vector3(0.0, 0.427, 0.0),
	},
	{
		"name": "Frog",
		"obj_path": "res://assets/models/Frog.obj",
		"tex_path": "",
		"scale": Vector3(0.0046, 0.0058, 0.0046),
		"rotation_deg": Vector3(0.0, 90.0, 0.0),
		"offset": Vector3(0.0, 0.0, 0.0),
	},
]

const FROG_PALETTE: Array[Color] = [
	Color(0.30, 0.69, 0.31), # 0: Зеленый
	Color(0.22, 0.62, 1.00), # 1: Лазурно-синий
	Color(0.96, 0.30, 0.32), # 2: Кораллово-красный
	Color(1.00, 0.82, 0.20), # 3: Солнечно-желтый
	Color(0.72, 0.38, 0.96), # 4: Фиолетовый
	Color(1.00, 0.54, 0.18), # 5: Оранжевый
	Color(0.18, 0.90, 0.86), # 6: Бирюзовый
	Color(0.98, 0.48, 0.78), # 7: Розовый
]

static var _shared_meshes_cache: Dictionary[int, Mesh] = {}
static var _shared_textures_cache: Dictionary[String, Texture2D] = {}

@export var player_peer_id: int = 1
@export var player_nickname: String = "Frog"
@export var color_index: int = 0
@export var team_id: int = -1
@export var model_variant_index: int = 0
@export var config: FrogConfig

var is_alive: bool = true
var is_combat_enabled: bool = true
var is_bot: bool = false
var current_aim_power: float = 0.0

var visual_root: Node3D
var body_mesh: MeshInstance3D
var shield_bubble_mesh: MeshInstance3D
var ground_shadow: MeshInstance3D
var name_label_3d: Label3D
var hurtbox_area: Area3D
var stomp_hitbox_area: Area3D
var jump_input: JumpInputComponent
var health_component: HealthComponent
var modifier_component: FrogModifierComponent
var trajectory_preview: TrajectoryPreview3D

var _skin_material: StandardMaterial3D
var _applied_model_variant: int = -1
var _base_gravity: float = ProjectSettings.get_setting("physics/3d/default_gravity", 9.8)
var _pre_slide_vertical_velocity: float = 0.0
var _stomp_cooldown_sec: float = 0.0
var _jump_seq: int = 0

var _net_target_position: Vector3 = Vector3.ZERO
var _net_target_velocity: Vector3 = Vector3.ZERO
var _net_target_rotation_y: float = 0.0
var _net_has_target: bool = false
var _net_squash_applied: bool = false
var _last_snapshot_hp: int = -1


func _enter_tree() -> void:
	if name.is_valid_int():
		player_peer_id = name.to_int()
		set_multiplayer_authority(1)


func _ready() -> void:
	if config == null:
		config = FrogConfig.new()

	_ensure_node_hierarchy()
	_configure_collision_layers()
	_connect_signals()
	health_component.reset_health(config.max_health)
	apply_customization(player_nickname, color_index, team_id, model_variant_index)


func _physics_process(delta: float) -> void:
	if _stomp_cooldown_sec > 0.0:
		_stomp_cooldown_sec = maxf(0.0, _stomp_cooldown_sec - delta)

	if not is_alive:
		_update_ground_shadow_projection()
		return

	if _should_simulate_locally():
		_process_3d_movement_and_combat(delta)
	elif _net_has_target:
		_apply_remote_interpolation(delta)
		_update_visual_squash_stretch(delta)

	_update_ground_shadow_projection()


func _is_networked() -> bool:
	return multiplayer.has_multiplayer_peer()


func _is_server_peer() -> bool:
	return not _is_networked() or multiplayer.is_server()


func _is_local_owner() -> bool:
	if not _is_networked():
		return true
	return multiplayer.get_unique_id() == player_peer_id


func _should_simulate_locally() -> bool:
	if not _is_networked():
		return true
	if multiplayer.is_server():
		return true
	return _is_local_owner()


func apply_customization(
	nickname: String,
	new_color_index: int,
	new_team_id: int,
	new_model_variant: int = -1
) -> void:
	player_nickname = nickname
	color_index = new_color_index
	team_id = new_team_id

	if new_model_variant >= 0:
		model_variant_index = posmod(new_model_variant, MODEL_VARIANTS.size())

	if _applied_model_variant != model_variant_index or body_mesh == null or body_mesh.mesh == null:
		_setup_frog_3d_model(model_variant_index)

	_refresh_overhead_label()

	var chosen_color: Color = _get_base_frog_color()
	if _skin_material != null:
		if _skin_material.albedo_texture != null:
			_skin_material.albedo_color = Color.WHITE.lerp(chosen_color, 0.55)
		else:
			_skin_material.albedo_color = chosen_color

	if jump_input != null:
		jump_input.is_input_enabled = (not is_bot) and _is_local_owner()


## Применяет подобранный 3D-бонус арены к лягушке и обновляет визуальные индикаторы.
func apply_powerup_effect(effect: FrogModifierEffect) -> void:
	if effect == null or modifier_component == null:
		return
	modifier_component.apply_modifier(effect)
	_refresh_modifier_visuals()
	_spawn_floating_damage_popup("+%s!" % effect.display_name, Color(0.28, 0.96, 0.88))


func respawn_at(world_pos: Vector3, combat_active: bool) -> void:
	is_alive = true
	is_combat_enabled = combat_active
	visible = true
	velocity = Vector3.ZERO
	_pre_slide_vertical_velocity = 0.0
	position = world_pos
	global_position = world_pos
	current_aim_power = 0.0
	_net_has_target = false
	_net_squash_applied = false
	_last_snapshot_hp = -1
	collision_layer = 1 << 1

	if hurtbox_area != null:
		hurtbox_area.set_deferred("monitorable", true)
	if stomp_hitbox_area != null:
		stomp_hitbox_area.set_deferred("monitoring", false)
		stomp_hitbox_area.set_deferred("monitorable", false)

	if modifier_component != null:
		modifier_component.clear_all_modifiers()
	if health_component != null:
		health_component.reset_health(config.max_health)
	_refresh_modifier_visuals()
	_restore_skin_color()

	var center_look := Vector3(0.0, world_pos.y, 0.0)
	if world_pos.distance_squared_to(center_look) > 0.05:
		look_at(center_look, Vector3.UP)

	if visual_root != null:
		visual_root.scale = Vector3.ONE
	if trajectory_preview != null:
		trajectory_preview.hide_trajectory()
	if jump_input != null:
		jump_input.cancel_current_aim()
		jump_input.is_input_enabled = (not is_bot) and _is_local_owner()

	_configure_collision_layers()


func receive_stomp_damage(damage_amount: int, attacker_peer_id: int) -> void:
	if not _is_server_peer():
		return
	if not is_combat_enabled or not is_alive or health_component == null:
		return
	if not health_component.can_receive_damage():
		return

	if modifier_component != null and modifier_component.try_consume_stomp_shield():
		_play_shield_block_visual()
		if _is_networked() and not multiplayer.get_peers().is_empty():
			rpc_client_shield_event.rpc(attacker_peer_id)
		return

	var is_lethal: bool = health_component.apply_damage(damage_amount, player_peer_id, attacker_peer_id)
	_refresh_overhead_label()

	var attacker_frog: FrogCharacter = _find_frog_by_peer_id(attacker_peer_id)
	frog_damaged.emit(self, attacker_frog, damage_amount, health_component.current_health)

	if _is_networked() and not multiplayer.get_peers().is_empty():
		rpc_client_combat_event.rpc(damage_amount, attacker_peer_id, health_component.current_health, is_lethal)
	else:
		_play_hit_flash_and_recoil()
		_spawn_floating_damage_popup("-%d HP" % damage_amount, Color(1.0, 0.28, 0.22))

	if is_lethal:
		_execute_lethal_squash(attacker_frog)


@rpc("authority", "call_local", "unreliable")
func rpc_play_jump_squash(power_ratio: float) -> void:
	if visual_root != null:
		visual_root.scale = Vector3(0.74, 1.38, 0.74)
	frog_jumped.emit(self, power_ratio)


@rpc("authority", "call_remote", "reliable")
func rpc_client_combat_event(
	damage_amount: int,
	_attacker_peer_id: int,
	remaining_hp: int,
	is_lethal: bool
) -> void:
	if health_component != null:
		health_component.current_health = remaining_hp
		health_component.is_dead = is_lethal
	_last_snapshot_hp = remaining_hp
	_refresh_overhead_label()
	_play_hit_flash_and_recoil()
	_spawn_floating_damage_popup("-%d HP" % damage_amount, Color(1.0, 0.28, 0.22))

	var attacker_frog: FrogCharacter = _find_frog_by_peer_id(_attacker_peer_id)
	frog_damaged.emit(self, attacker_frog, damage_amount, remaining_hp)

	if is_lethal:
		_execute_lethal_squash(attacker_frog)


@rpc("authority", "call_remote", "reliable")
func rpc_client_shield_event(_attacker_peer_id: int) -> void:
	if modifier_component != null:
		modifier_component.remove_modifier_by_id(&"aqua_shield")
	_play_shield_block_visual()


func _play_shield_block_visual() -> void:
	_refresh_modifier_visuals()
	_spawn_floating_damage_popup("ЩИТ ОТРАЗИЛ УДАР!", Color(0.3, 0.88, 1.0))


func _process_3d_movement_and_combat(delta: float) -> void:
	var pre_move_horiz_vel := Vector3(velocity.x, 0.0, velocity.z)

	if not is_on_floor():
		var grav_mult: float = (
			config.gravity_ascend_multiplier
			if velocity.y > 0.0
			else config.gravity_descend_multiplier
		)
		velocity.y -= _base_gravity * grav_mult * delta
		_pre_slide_vertical_velocity = velocity.y
	else:
		if modifier_component != null:
			modifier_component.reset_air_jumps_on_floor()
		velocity.x = move_toward(velocity.x, 0.0, config.ground_friction * delta)
		velocity.z = move_toward(velocity.z, 0.0, config.ground_friction * delta)
		_pre_slide_vertical_velocity = 0.0

	var is_falling_down: bool = _pre_slide_vertical_velocity < -config.min_fall_speed_for_stomp
	if stomp_hitbox_area != null:
		stomp_hitbox_area.monitoring = is_falling_down

	move_and_slide()

	if is_falling_down and _stomp_cooldown_sec <= 0.0:
		_check_slide_collisions_for_stomp(absf(_pre_slide_vertical_velocity))

	if is_falling_down and _stomp_cooldown_sec <= 0.0 and stomp_hitbox_area != null and stomp_hitbox_area.monitoring:
		for area: Area3D in stomp_hitbox_area.get_overlapping_areas():
			_try_stomp_victim_from_area(area, absf(_pre_slide_vertical_velocity))

	if is_on_wall() and pre_move_horiz_vel.length_squared() > 1.0:
		var wall_normal: Vector3 = get_wall_normal()
		wall_normal.y = 0.0
		if wall_normal.length_squared() > 0.001:
			var bounced: Vector3 = pre_move_horiz_vel.bounce(wall_normal.normalized()) * config.wall_bounce_factor
			velocity.x = bounced.x
			velocity.z = bounced.z

	_update_visual_squash_stretch(delta)


func _check_slide_collisions_for_stomp(fall_speed_abs: float) -> void:
	var collision_count: int = get_slide_collision_count()
	for i: int in range(collision_count):
		var col: KinematicCollision3D = get_slide_collision(i)
		var collider: Object = col.get_collider()
		if collider is FrogCharacter:
			var victim := collider as FrogCharacter
			var normal_y: float = col.get_normal().y
			var height_diff: float = global_position.y - victim.global_position.y
			if normal_y > 0.35 or height_diff > 0.25:
				_trigger_stomp_attack_on_victim(victim, fall_speed_abs)
				return


func _on_stomp_hitbox_area_entered(other_area: Area3D) -> void:
	var fall_speed_abs: float = maxf(absf(velocity.y), absf(_pre_slide_vertical_velocity))
	_try_stomp_victim_from_area(other_area, fall_speed_abs)


func _try_stomp_victim_from_area(other_area: Area3D, fall_speed_abs: float) -> void:
	if not is_alive or _stomp_cooldown_sec > 0.0:
		return
	if fall_speed_abs < config.min_fall_speed_for_stomp:
		return

	var victim := other_area.get_parent() as FrogCharacter
	if victim == null or victim == self or not victim.is_alive:
		return
	if global_position.y <= victim.global_position.y + 0.12:
		return

	_trigger_stomp_attack_on_victim(victim, fall_speed_abs)


func _trigger_stomp_attack_on_victim(victim: FrogCharacter, fall_speed_abs: float) -> void:
	if victim == null or victim == self or not victim.is_alive:
		return
	if not is_combat_enabled or not victim.is_combat_enabled:
		return
	if not _is_server_peer():
		return
	if not _is_enemy_frog(victim):
		return
	if victim.health_component != null and not victim.health_component.can_receive_damage():
		return
	_stomp_cooldown_sec = 0.18
	var damage_to_deal: int = config.calculate_stomp_damage(fall_speed_abs)

	velocity.y = config.stomp_bounce_velocity
	_pre_slide_vertical_velocity = 0.0
	victim.receive_stomp_damage(damage_to_deal, player_peer_id)


func _execute_lethal_squash(attacker_frog: FrogCharacter) -> void:
	if not is_alive and _net_squash_applied:
		return
	_net_squash_applied = true
	is_alive = false
	velocity = Vector3.ZERO
	if trajectory_preview != null:
		trajectory_preview.hide_trajectory()

	if hurtbox_area != null:
		hurtbox_area.set_deferred("monitorable", false)
	if stomp_hitbox_area != null:
		stomp_hitbox_area.set_deferred("monitoring", false)
	if shield_bubble_mesh != null:
		shield_bubble_mesh.visible = false
	collision_layer = 0

	_spawn_floating_damage_popup("РАЗДАВЛЕН!", Color(1.0, 0.88, 0.2))

	if visual_root != null:
		var tween: Tween = create_tween()
		tween.tween_property(visual_root, "scale", Vector3(1.75, 0.12, 1.75), 0.15).set_trans(Tween.TRANS_BACK)
		tween.tween_interval(config.squash_disappear_delay)
		tween.tween_callback(func() -> void: visible = false)

	frog_squashed.emit(self, attacker_frog)


func _play_hit_flash_and_recoil() -> void:
	if visual_root != null:
		visual_root.scale = Vector3(1.42, 0.48, 1.42)

	if _skin_material != null:
		var base_col: Color = _get_base_frog_color()
		var restore_col: Color = Color.WHITE.lerp(base_col, 0.55) if _skin_material.albedo_texture != null else base_col
		_skin_material.albedo_color = Color(1.0, 0.18, 0.18)
		var tween: Tween = create_tween()
		tween.tween_property(_skin_material, "albedo_color", restore_col, 0.24)


func _spawn_floating_damage_popup(text_str: String, color: Color) -> void:
	if get_parent() == null:
		return

	var popup := Label3D.new()
	popup.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	popup.text = text_str
	popup.modulate = color
	popup.font_size = 54
	popup.outline_size = 14
	get_parent().add_child(popup)
	popup.global_position = global_position + Vector3(0.0, 1.55, 0.0)

	var tween: Tween = popup.create_tween()
	tween.set_parallel(true)
	tween.tween_property(popup, "global_position:y", popup.global_position.y + 1.4, 0.65).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.tween_property(popup, "modulate:a", 0.0, 0.65)
	tween.chain().tween_callback(popup.queue_free)


func _refresh_modifier_visuals() -> void:
	if shield_bubble_mesh != null and modifier_component != null:
		shield_bubble_mesh.visible = modifier_component.has_active_shield()
	_refresh_overhead_label()


func _refresh_overhead_label() -> void:
	if name_label_3d == null:
		return
	var team_tag: String = ""
	if team_id == 0:
		team_tag = "[СИНИЕ] "
	elif team_id == 1:
		team_tag = "[КРАСНЫЕ] "

	var hp_val: int = health_component.current_health if health_component != null else 100
	var max_hp_val: int = health_component.max_health if health_component != null else 100
	var badges: String = modifier_component.get_active_badges_text() if modifier_component != null else ""
	if not badges.is_empty():
		name_label_3d.text = "%s%s
[%d / %d HP]
%s" % [team_tag, player_nickname, hp_val, max_hp_val, badges]
	else:
		name_label_3d.text = "%s%s
[%d / %d HP]" % [team_tag, player_nickname, hp_val, max_hp_val]


func _get_base_frog_color() -> Color:
	var chosen_color: Color = FROG_PALETTE[posmod(color_index, FROG_PALETTE.size())]
	if team_id == 0:
		chosen_color = FROG_PALETTE[1]
	elif team_id == 1:
		chosen_color = FROG_PALETTE[2]
	return chosen_color


func _restore_skin_color() -> void:
	if _skin_material == null:
		return
	var base_col: Color = _get_base_frog_color()
	if _skin_material.albedo_texture != null:
		_skin_material.albedo_color = Color.WHITE.lerp(base_col, 0.55)
	else:
		_skin_material.albedo_color = base_col


func apply_network_snapshot(state: Dictionary) -> void:
	var snap_pos: Vector3 = state.get("p", global_position) as Vector3
	var snap_vel: Vector3 = state.get("v", velocity) as Vector3
	var snap_rot: float = float(state.get("r", rotation.y))
	var snap_hp: int = int(state.get("hp", 100))
	var snap_alive: bool = bool(state.get("a", true))

	_net_target_position = snap_pos
	_net_target_velocity = snap_vel
	_net_target_rotation_y = snap_rot
	_net_has_target = true

	if health_component != null:
		health_component.current_health = snap_hp
		health_component.is_dead = not snap_alive
	if snap_hp != _last_snapshot_hp:
		_last_snapshot_hp = snap_hp
		_refresh_overhead_label()

	if not snap_alive:
		if is_alive:
			_execute_lethal_squash(null)
		return

	if not is_alive:
		is_alive = true
		_net_squash_applied = false
		visible = true
		collision_layer = 1 << 1
		if visual_root != null:
			visual_root.scale = Vector3.ONE
		if hurtbox_area != null:
			hurtbox_area.set_deferred("monitorable", true)
		_restore_skin_color()

	if _is_local_owner():
		var error_dist: float = global_position.distance_to(snap_pos)
		if error_dist > 1.6:
			global_position = snap_pos
			velocity = snap_vel
		elif error_dist > 0.35:
			global_position = global_position.lerp(snap_pos, 0.28)
			velocity = velocity.lerp(snap_vel, 0.25)
		else:
			velocity = snap_vel


func _apply_remote_interpolation(delta: float) -> void:
	var lerp_weight: float = clampf(delta * 14.0, 0.0, 1.0)
	global_position = global_position.lerp(_net_target_position, lerp_weight)
	rotation.y = lerp_angle(rotation.y, _net_target_rotation_y, lerp_weight)


func _update_ground_shadow_projection() -> void:
	if ground_shadow == null:
		return
	ground_shadow.global_position = Vector3(global_position.x, 0.03, global_position.z)
	var height_above_floor: float = maxf(0.0, global_position.y)
	var shadow_scale: float = clampf(1.0 - height_above_floor * 0.08, 0.35, 1.0)
	ground_shadow.scale = Vector3(shadow_scale, 1.0, shadow_scale)


func _update_visual_squash_stretch(delta: float) -> void:
	if visual_root == null:
		return

	var target_scale := Vector3.ONE
	if is_on_floor() and current_aim_power > 0.01:
		var squash_y: float = lerpf(1.0, 0.52, current_aim_power)
		var expand_xz: float = lerpf(1.0, 1.30, current_aim_power)
		target_scale = Vector3(expand_xz, squash_y, expand_xz)
	elif not is_on_floor():
		var stretch: float = clampf(absf(velocity.y) * 0.022, 0.0, 0.28)
		target_scale = Vector3(1.0 - stretch * 0.5, 1.0 + stretch, 1.0 - stretch * 0.5)

	visual_root.scale = visual_root.scale.lerp(target_scale, clampf(delta * 15.0, 0.0, 1.0))


func _on_jump_aim_updated(
	world_direction: Vector3,
	power_ratio: float,
	_start_screen: Vector2,
	_current_screen: Vector2
) -> void:
	if not is_alive or not _can_currently_jump():
		return

	current_aim_power = power_ratio
	if world_direction.length_squared() > 0.001:
		var target_look: Vector3 = global_position + Vector3(world_direction.x, 0.0, world_direction.z)
		if target_look.distance_squared_to(global_position) > 0.001:
			look_at(target_look, Vector3.UP)

	if trajectory_preview != null:
		if power_ratio >= config.min_jump_power_ratio:
			trajectory_preview.update_ground_indicator(power_ratio)
		else:
			trajectory_preview.hide_trajectory()


func _on_jump_aim_cancelled() -> void:
	current_aim_power = 0.0
	if trajectory_preview != null:
		trajectory_preview.hide_trajectory()


func _on_jump_requested(world_direction: Vector3, power_ratio: float) -> void:
	current_aim_power = 0.0
	if trajectory_preview != null:
		trajectory_preview.hide_trajectory()

	if not is_alive or is_bot:
		return

	var was_air_jump: bool = not is_on_floor()
	if not _try_consume_jump_ability():
		return

	if was_air_jump:
		_spawn_floating_damage_popup("2x ПРЫЖОК!", Color(0.98, 0.88, 0.25))

	_jump_seq += 1
	_apply_jump_velocity(world_direction, power_ratio)

	if _is_networked() and not multiplayer.is_server():
		rpc_server_request_jump.rpc_id(1, _jump_seq, world_direction, power_ratio)
	else:
		rpc_play_jump_squash.rpc(power_ratio)


func apply_authoritative_jump(world_direction: Vector3, power_ratio: float) -> void:
	if not is_alive or not _is_server_peer():
		return
	if not _try_consume_jump_ability():
		return
	_apply_jump_velocity(world_direction, power_ratio)
	if _is_networked() and not multiplayer.get_peers().is_empty():
		rpc_play_jump_squash.rpc(power_ratio)
	else:
		rpc_play_jump_squash(power_ratio)


@rpc("any_peer", "call_remote", "reliable")
func rpc_server_request_jump(
	_seq: int,
	world_direction: Vector3,
	power_ratio: float
) -> void:
	if not _is_server_peer() or is_bot or not is_alive:
		return
	if multiplayer.has_multiplayer_peer():
		var sender_id: int = multiplayer.get_remote_sender_id()
		if sender_id != 0 and sender_id != player_peer_id:
			return
	if not _try_consume_jump_ability():
		return
	_apply_jump_velocity(world_direction, power_ratio)
	rpc_play_jump_squash.rpc(power_ratio)


func _can_currently_jump() -> bool:
	if is_on_floor():
		return true
	if modifier_component != null and modifier_component._available_air_jumps > 0:
		return true
	return false


func _try_consume_jump_ability() -> bool:
	if is_on_floor():
		return true
	if modifier_component != null and modifier_component.try_consume_air_jump():
		return true
	return false


func _apply_jump_velocity(world_direction: Vector3, power_ratio: float) -> void:
	var jump_mult: float = modifier_component.get_total_jump_multiplier() if modifier_component != null else 1.0
	velocity = config.calculate_jump_velocity(world_direction, power_ratio, jump_mult)

	var flat_dir := Vector3(world_direction.x, 0.0, world_direction.z)
	if flat_dir.length_squared() > 0.001:
		look_at(global_position + flat_dir.normalized(), Vector3.UP)


func _is_enemy_frog(other_frog: FrogCharacter) -> bool:
	if team_id < 0 or other_frog.team_id < 0:
		return true
	return team_id != other_frog.team_id


func _find_frog_by_peer_id(peer_id: int) -> FrogCharacter:
	if get_parent() == null:
		return null
	for child: Node in get_parent().get_children():
		if child is FrogCharacter and (child as FrogCharacter).player_peer_id == peer_id:
			return child as FrogCharacter
	return null


func _setup_frog_3d_model(variant_idx: int) -> void:
	if body_mesh == null:
		return

	var safe_idx: int = posmod(variant_idx, MODEL_VARIANTS.size())
	var variant_cfg: Dictionary = MODEL_VARIANTS[safe_idx]
	var obj_path: String = str(variant_cfg["obj_path"])
	var loaded_mesh: Mesh = _get_or_load_shared_mesh(safe_idx, obj_path)

	if loaded_mesh == null:
		for fallback_idx in range(MODEL_VARIANTS.size()):
			if fallback_idx == safe_idx:
				continue
			var alt_cfg: Dictionary = MODEL_VARIANTS[fallback_idx]
			var alt_mesh: Mesh = _get_or_load_shared_mesh(fallback_idx, str(alt_cfg["obj_path"]))
			if alt_mesh != null:
				safe_idx = fallback_idx
				variant_cfg = alt_cfg
				loaded_mesh = alt_mesh
				break

	_applied_model_variant = safe_idx
	var tex_path: String = str(variant_cfg["tex_path"])

	if loaded_mesh != null:
		body_mesh.mesh = loaded_mesh
		body_mesh.position = variant_cfg["offset"] as Vector3
		body_mesh.scale = variant_cfg["scale"] as Vector3
		body_mesh.rotation_degrees = variant_cfg["rotation_deg"] as Vector3
	else:
		var fallback_box := BoxMesh.new()
		fallback_box.size = Vector3(0.82, 0.65, 0.92)
		body_mesh.mesh = fallback_box
		body_mesh.position = Vector3(0.0, 0.325, 0.0)
		body_mesh.scale = Vector3.ONE
		body_mesh.rotation_degrees = Vector3.ZERO

	var surf_count: int = body_mesh.mesh.get_surface_count() if body_mesh.mesh != null else 0
	for s_i: int in range(surf_count):
		body_mesh.set_surface_override_material(s_i, null)

	_skin_material = StandardMaterial3D.new()
	_skin_material.roughness = 0.52
	_skin_material.cull_mode = BaseMaterial3D.CULL_DISABLED

	if not tex_path.is_empty():
		var tex: Texture2D = _get_or_load_shared_texture(tex_path)
		if tex != null:
			_skin_material.albedo_texture = tex
			_skin_material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
			_skin_material.albedo_color = Color.WHITE.lerp(_get_base_frog_color(), 0.55)
		else:
			_skin_material.albedo_color = _get_base_frog_color()
	else:
		_skin_material.albedo_color = _get_base_frog_color()

	var mat_pupil := StandardMaterial3D.new()
	mat_pupil.albedo_color = Color(0.08, 0.08, 0.08)
	mat_pupil.roughness = 0.22
	mat_pupil.cull_mode = BaseMaterial3D.CULL_DISABLED

	var mat_iris_or_gold := StandardMaterial3D.new()
	mat_iris_or_gold.albedo_color = Color(0.95, 0.68, 0.12)
	mat_iris_or_gold.roughness = 0.38
	mat_iris_or_gold.cull_mode = BaseMaterial3D.CULL_DISABLED

	var mat_mouth := StandardMaterial3D.new()
	mat_mouth.albedo_color = Color(0.95, 0.26, 0.21)
	mat_mouth.roughness = 0.50
	mat_mouth.cull_mode = BaseMaterial3D.CULL_DISABLED

	if surf_count >= 4:
		body_mesh.set_surface_override_material(0, _skin_material)
		body_mesh.set_surface_override_material(1, mat_pupil)
		body_mesh.set_surface_override_material(2, mat_iris_or_gold)
		body_mesh.set_surface_override_material(3, mat_mouth)
	elif surf_count == 3:
		body_mesh.set_surface_override_material(0, _skin_material)
		body_mesh.set_surface_override_material(1, mat_pupil)
		body_mesh.set_surface_override_material(2, mat_iris_or_gold)
	elif surf_count > 0:
		body_mesh.set_surface_override_material(0, _skin_material)


func _resolve_asset_path(primary_path: String) -> String:
	if FileAccess.file_exists(primary_path) or ResourceLoader.exists(primary_path):
		return primary_path
	var file_name: String = primary_path.get_file()
	var candidate_paths: Array[String] = [
		"res://assets/models/" + file_name,
		"res://" + file_name,
		"res://models/" + file_name,
	]
	for path: String in candidate_paths:
		if FileAccess.file_exists(path) or ResourceLoader.exists(path):
			return path
	return primary_path


func _get_or_load_shared_mesh(variant_idx: int, obj_path: String) -> Mesh:
	if _shared_meshes_cache.has(variant_idx):
		return _shared_meshes_cache[variant_idx]

	var resolved_path: String = _resolve_asset_path(obj_path)
	var mesh_res: Mesh = null

	if ResourceLoader.exists(resolved_path):
		var loaded: Resource = ResourceLoader.load(resolved_path)
		if loaded is Mesh and (loaded as Mesh).get_surface_count() > 0:
			mesh_res = loaded as Mesh

	if mesh_res == null and FileAccess.file_exists(resolved_path):
		mesh_res = _parse_obj_file_to_array_mesh(resolved_path)

	if mesh_res != null and mesh_res.get_surface_count() > 0:
		_shared_meshes_cache[variant_idx] = mesh_res
		return mesh_res

	return null


func _get_or_load_shared_texture(tex_path: String) -> Texture2D:
	var resolved_path: String = _resolve_asset_path(tex_path)
	if _shared_textures_cache.has(resolved_path):
		return _shared_textures_cache[resolved_path]

	var tex_res: Texture2D = null
	if ResourceLoader.exists(resolved_path):
		var loaded: Resource = ResourceLoader.load(resolved_path)
		if loaded is Texture2D:
			tex_res = loaded as Texture2D

	if tex_res == null and FileAccess.file_exists(resolved_path):
		var img := Image.load_from_file(resolved_path)
		if img != null and not img.is_empty():
			tex_res = ImageTexture.create_from_image(img)

	if tex_res != null:
		_shared_textures_cache[resolved_path] = tex_res
		return tex_res

	return null


func _parse_obj_file_to_array_mesh(obj_path: String) -> ArrayMesh:
	var file := FileAccess.open(obj_path, FileAccess.READ)
	if file == null:
		return null

	var positions: Array[Vector3] = []
	var uvs: Array[Vector2] = []
	var normals: Array[Vector3] = []
	var mat_order: Array[String] = []
	var mat_faces: Dictionary[String, Array] = {}
	var current_mat: String = "default"

	while not file.eof_reached():
		var line: String = file.get_line().strip_edges()
		if line.begins_with("v "):
			var parts: PackedStringArray = line.split(" ", false)
			if parts.size() >= 4:
				positions.append(Vector3(parts[1].to_float(), parts[2].to_float(), parts[3].to_float()))
		elif line.begins_with("vt "):
			var parts: PackedStringArray = line.split(" ", false)
			if parts.size() >= 3:
				uvs.append(Vector2(parts[1].to_float(), 1.0 - parts[2].to_float()))
		elif line.begins_with("vn "):
			var parts: PackedStringArray = line.split(" ", false)
			if parts.size() >= 4:
				normals.append(Vector3(parts[1].to_float(), parts[2].to_float(), parts[3].to_float()))
		elif line.begins_with("usemtl "):
			current_mat = line.substr(7).strip_edges()
			if not mat_faces.has(current_mat):
				mat_faces[current_mat] = []
				mat_order.append(current_mat)
		elif line.begins_with("f "):
			if not mat_faces.has(current_mat):
				mat_faces[current_mat] = []
				mat_order.append(current_mat)
			var tokens: PackedStringArray = line.split(" ", false)
			if tokens.size() >= 4:
				mat_faces[current_mat].append(tokens.slice(1))

	var array_mesh := ArrayMesh.new()
	for mat_name: String in mat_order:
		var st := SurfaceTool.new()
		st.begin(Mesh.PRIMITIVE_TRIANGLES)
		var faces_list: Array = mat_faces[mat_name]
		for face_tokens: PackedStringArray in faces_list:
			for i: int in range(1, face_tokens.size() - 1):
				var tri_tokens: Array[String] = [face_tokens[0], face_tokens[i], face_tokens[i + 1]]
				for tok: String in tri_tokens:
					var sub: PackedStringArray = tok.split("/")
					var v_idx: int = sub[0].to_int() - 1
					if sub.size() >= 2 and not sub[1].is_empty():
						var uv_idx: int = sub[1].to_int() - 1
						if uv_idx >= 0 and uv_idx < uvs.size():
							st.set_uv(uvs[uv_idx])
					if sub.size() >= 3 and not sub[2].is_empty():
						var n_idx: int = sub[2].to_int() - 1
						if n_idx >= 0 and n_idx < normals.size():
							st.set_normal(normals[n_idx])
					if v_idx >= 0 and v_idx < positions.size():
						st.add_vertex(positions[v_idx])
		if normals.is_empty():
			st.generate_normals()
		st.commit(array_mesh)
		var surf_idx: int = array_mesh.get_surface_count() - 1
		if surf_idx >= 0:
			array_mesh.surface_set_name(surf_idx, mat_name)

	return array_mesh


func _ensure_node_hierarchy() -> void:
	if get_node_or_null("BodyCollision") == null:
		var body_col := CollisionShape3D.new()
		body_col.name = "BodyCollision"
		var sphere := SphereShape3D.new()
		sphere.radius = 0.48
		body_col.shape = sphere
		body_col.position = Vector3(0.0, 0.48, 0.0)
		add_child(body_col)

	visual_root = get_node_or_null("VisualRoot") as Node3D
	if visual_root == null:
		visual_root = Node3D.new()
		visual_root.name = "VisualRoot"
		add_child(visual_root)

	body_mesh = visual_root.get_node_or_null("FrogMesh") as MeshInstance3D
	if body_mesh == null:
		body_mesh = MeshInstance3D.new()
		body_mesh.name = "FrogMesh"
		visual_root.add_child(body_mesh)
	body_mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF

	_setup_frog_3d_model(model_variant_index)

	shield_bubble_mesh = visual_root.get_node_or_null("ShieldBubbleMesh") as MeshInstance3D
	if shield_bubble_mesh == null:
		shield_bubble_mesh = MeshInstance3D.new()
		shield_bubble_mesh.name = "ShieldBubbleMesh"
		var bubble_sphere := SphereMesh.new()
		bubble_sphere.radius = 0.72
		bubble_sphere.height = 1.44
		shield_bubble_mesh.mesh = bubble_sphere
		shield_bubble_mesh.position = Vector3(0.0, 0.52, 0.0)
		var shield_mat := StandardMaterial3D.new()
		shield_mat.albedo_color = Color(0.20, 0.85, 1.0, 0.34)
		shield_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		shield_mat.emission_enabled = true
		shield_mat.emission = Color(0.20, 0.85, 1.0) * 0.45
		shield_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
		shield_bubble_mesh.material_override = shield_mat
		shield_bubble_mesh.visible = false
		visual_root.add_child(shield_bubble_mesh)

	ground_shadow = get_node_or_null("GroundShadow") as MeshInstance3D
	if ground_shadow == null:
		ground_shadow = MeshInstance3D.new()
		ground_shadow.name = "GroundShadow"
		var disc := CylinderMesh.new()
		disc.top_radius = 0.54
		disc.bottom_radius = 0.54
		disc.height = 0.02
		ground_shadow.mesh = disc
		var shadow_mat := StandardMaterial3D.new()
		shadow_mat.albedo_color = Color(0.0, 0.0, 0.0, 0.45)
		shadow_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		shadow_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		ground_shadow.material_override = shadow_mat
		add_child(ground_shadow)

	name_label_3d = get_node_or_null("NameLabel3D") as Label3D
	if name_label_3d == null:
		name_label_3d = Label3D.new()
		name_label_3d.name = "NameLabel3D"
		name_label_3d.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		name_label_3d.position = Vector3(0.0, 1.42, 0.0)
		name_label_3d.font_size = 38
		name_label_3d.outline_size = 10
		add_child(name_label_3d)

	hurtbox_area = get_node_or_null("Hurtbox") as Area3D
	if hurtbox_area == null:
		hurtbox_area = Area3D.new()
		hurtbox_area.name = "Hurtbox"
		var hurt_col := CollisionShape3D.new()
		var hurt_shape := BoxShape3D.new()
		hurt_shape.size = Vector3(1.12, 0.72, 1.12)
		hurt_col.shape = hurt_shape
		hurt_col.position = Vector3(0.0, 0.68, 0.0)
		hurtbox_area.add_child(hurt_col)
		add_child(hurtbox_area)

	stomp_hitbox_area = get_node_or_null("StompHitbox") as Area3D
	if stomp_hitbox_area == null:
		stomp_hitbox_area = Area3D.new()
		stomp_hitbox_area.name = "StompHitbox"
		var stomp_col := CollisionShape3D.new()
		var stomp_shape := BoxShape3D.new()
		stomp_shape.size = Vector3(1.05, 0.52, 1.05)
		stomp_col.shape = stomp_shape
		stomp_col.position = Vector3(0.0, 0.04, 0.0)
		stomp_hitbox_area.add_child(stomp_col)
		add_child(stomp_hitbox_area)

	health_component = get_node_or_null("HealthComponent") as HealthComponent
	if health_component == null:
		health_component = HealthComponent.new()
		health_component.name = "HealthComponent"
		health_component.max_health = config.max_health
		health_component.invulnerability_duration_sec = config.hit_invulnerability_sec
		add_child(health_component)

	jump_input = get_node_or_null("JumpInputComponent") as JumpInputComponent
	if jump_input == null:
		jump_input = JumpInputComponent.new()
		jump_input.name = "JumpInputComponent"
		jump_input.config = config
		add_child(jump_input)

	modifier_component = get_node_or_null("FrogModifierComponent") as FrogModifierComponent
	if modifier_component == null:
		modifier_component = FrogModifierComponent.new()
		modifier_component.name = "FrogModifierComponent"
		add_child(modifier_component)

	trajectory_preview = get_node_or_null("TrajectoryPreview3D") as TrajectoryPreview3D
	if trajectory_preview == null:
		trajectory_preview = TrajectoryPreview3D.new()
		trajectory_preview.name = "TrajectoryPreview3D"
		add_child(trajectory_preview)


func _configure_collision_layers() -> void:
	collision_layer = 1 << 1
	collision_mask = (1 << 0) | (1 << 1)

	if hurtbox_area != null:
		hurtbox_area.collision_layer = 1 << 2
		hurtbox_area.collision_mask = 0
		hurtbox_area.monitoring = false
		hurtbox_area.monitorable = true

	if stomp_hitbox_area != null:
		stomp_hitbox_area.collision_layer = 1 << 3
		stomp_hitbox_area.collision_mask = 1 << 2
		stomp_hitbox_area.monitoring = false
		stomp_hitbox_area.monitorable = false


func _connect_signals() -> void:
	if stomp_hitbox_area != null and not stomp_hitbox_area.area_entered.is_connected(_on_stomp_hitbox_area_entered):
		stomp_hitbox_area.area_entered.connect(_on_stomp_hitbox_area_entered)

	if modifier_component != null and not modifier_component.modifiers_changed.is_connected(_refresh_modifier_visuals):
		modifier_component.modifiers_changed.connect(_refresh_modifier_visuals)

	if jump_input != null:
		if not jump_input.aim_updated.is_connected(_on_jump_aim_updated):
			jump_input.aim_updated.connect(_on_jump_aim_updated)
		if not jump_input.aim_cancelled.is_connected(_on_jump_aim_cancelled):
			jump_input.aim_cancelled.connect(_on_jump_aim_cancelled)
		if not jump_input.jump_requested.is_connected(_on_jump_requested):
			jump_input.jump_requested.connect(_on_jump_requested)
