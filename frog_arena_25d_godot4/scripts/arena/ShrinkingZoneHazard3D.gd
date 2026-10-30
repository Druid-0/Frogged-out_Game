class_name ShrinkingZoneHazard3D
extends Node3D
## Сужающаяся со временем опасная зона («Болотный прилив») для ускорения эндшпиля (Этап 2).
## Через GRACE_PERIOD_SEC после старта боя безопасный радиус плавно уменьшается с INITIAL_RADIUS до MIN_RADIUS.
## Лягушки за пределами кольца получают периодический урон и легкий импульс к центру арены.

signal zone_warning_started()

const INITIAL_RADIUS: float = 10.6
const MIN_RADIUS: float = 3.6
const GRACE_PERIOD_SEC: float = 18.0
const SHRINK_DURATION_SEC: float = 35.0
const DAMAGE_TICK_INTERVAL_SEC: float = 1.0
const ZONE_TICK_DAMAGE: int = 10

@export var players_container: Node3D

var is_zone_active: bool = false
var current_safe_radius: float = INITIAL_RADIUS
var _match_elapsed_sec: float = 0.0
var _damage_tick_accum: float = 0.0
var _warning_emitted: bool = false
var _ring_mesh_instance: MeshInstance3D
var _ring_torus: TorusMesh


func _ready() -> void:
	_build_zone_ring_visual()
	reset_zone()


func _process(delta: float) -> void:
	if not is_zone_active:
		return

	_match_elapsed_sec += delta
	if _match_elapsed_sec < GRACE_PERIOD_SEC:
		return

	if not _warning_emitted:
		_warning_emitted = true
		if _ring_mesh_instance != null:
			_ring_mesh_instance.visible = true
		zone_warning_started.emit()

	var shrink_progress: float = clampf(
		(_match_elapsed_sec - GRACE_PERIOD_SEC) / SHRINK_DURATION_SEC,
		0.0,
		1.0
	)
	current_safe_radius = lerpf(INITIAL_RADIUS, MIN_RADIUS, shrink_progress)
	_update_ring_visual_radius(current_safe_radius)

	if not _is_server_authority():
		return

	_damage_tick_accum += delta
	if _damage_tick_accum >= DAMAGE_TICK_INTERVAL_SEC:
		_damage_tick_accum -= DAMAGE_TICK_INTERVAL_SEC
		_apply_zone_damage_tick()


func start_zone_for_match() -> void:
	is_zone_active = true
	_match_elapsed_sec = 0.0
	_damage_tick_accum = 0.0
	_warning_emitted = false
	current_safe_radius = INITIAL_RADIUS
	if _ring_mesh_instance != null:
		_ring_mesh_instance.visible = false
	_update_ring_visual_radius(INITIAL_RADIUS)


func reset_zone() -> void:
	is_zone_active = false
	_match_elapsed_sec = 0.0
	_damage_tick_accum = 0.0
	_warning_emitted = false
	current_safe_radius = INITIAL_RADIUS
	if _ring_mesh_instance != null:
		_ring_mesh_instance.visible = false


func _build_zone_ring_visual() -> void:
	_ring_mesh_instance = MeshInstance3D.new()
	_ring_mesh_instance.name = "SafeZoneRing"
	_ring_torus = TorusMesh.new()
	_ring_torus.inner_radius = INITIAL_RADIUS - 0.18
	_ring_torus.outer_radius = INITIAL_RADIUS + 0.18
	_ring_mesh_instance.mesh = _ring_torus
	_ring_mesh_instance.position = Vector3(0.0, 0.12, 0.0)

	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.95, 0.22, 0.65, 0.78)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.emission_enabled = true
	mat.emission = Color(0.95, 0.22, 0.65) * 0.65
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_ring_mesh_instance.material_override = mat
	_ring_mesh_instance.visible = false
	add_child(_ring_mesh_instance)


func _update_ring_visual_radius(radius: float) -> void:
	if _ring_torus == null:
		return
	_ring_torus.inner_radius = maxf(0.5, radius - 0.16)
	_ring_torus.outer_radius = radius + 0.16


func _apply_zone_damage_tick() -> void:
	if players_container == null:
		return
	for child: Node in players_container.get_children():
		if not (child is FrogCharacter):
			continue
		var frog := child as FrogCharacter
		if not frog.is_alive or not frog.is_combat_enabled:
			continue
		var flat_pos := Vector2(frog.global_position.x, frog.global_position.z)
		if flat_pos.length() > current_safe_radius:
			var inward_dir := Vector3(-frog.global_position.x, 0.0, -frog.global_position.z).normalized()
			frog.velocity += inward_dir * 3.5 + Vector3(0.0, 4.5, 0.0)
			frog.receive_stomp_damage(ZONE_TICK_DAMAGE, -1)


func _is_server_authority() -> bool:
	if not multiplayer.has_multiplayer_peer():
		return true
	return multiplayer.is_server()
