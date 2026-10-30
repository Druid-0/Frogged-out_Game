class_name OrthoCameraRig
extends Camera3D
## Настоящая ортогональная 3D-камера (Camera3D.PROJECTION_ORTHOGONAL).
## Плавно сопровождает локального игрока внутри гольф-коробки без резких скачков при спавне ботов.

@export_group("Orthogonal 2.5D View")
@export_range(15.0, 80.0, 1.0) var pitch_degrees: float = 42.0
@export_range(-180.0, 180.0, 1.0) var yaw_degrees: float = 45.0
@export_range(10.0, 100.0, 1.0) var camera_distance: float = 38.0

@export_group("Framing")
@export_range(8.0, 40.0, 0.5) var default_ortho_size: float = 17.5
@export_range(1.0, 20.0, 0.5) var follow_lerp_speed: float = 6.0

@export var players_container: Node3D


func _ready() -> void:
	projection = Camera3D.PROJECTION_ORTHOGONAL
	size = default_ortho_size
	near = 0.1
	far = 200.0
	_apply_fixed_rotation()


func _process(delta: float) -> void:
	_apply_fixed_rotation()
	_update_camera_framing(delta)


func _apply_fixed_rotation() -> void:
	rotation_degrees = Vector3(-pitch_degrees, yaw_degrees, 0.0)


func _update_camera_framing(delta: float) -> void:
	var focus_center := Vector3.ZERO
	var local_frog: FrogCharacter = _find_local_player_frog()
	if local_frog != null and local_frog.is_alive:
		# Мягко смещаем центр камеры вслед за своей лягушкой, удерживая всю коробку в кадре
		focus_center = local_frog.global_position * 0.35

	var forward_dir: Vector3 = -global_transform.basis.z.normalized()
	var desired_position: Vector3 = focus_center - forward_dir * camera_distance
	global_position = global_position.lerp(desired_position, clampf(delta * follow_lerp_speed, 0.0, 1.0))
	size = lerpf(size, default_ortho_size, clampf(delta * follow_lerp_speed, 0.0, 1.0))


func _find_local_player_frog() -> FrogCharacter:
	if players_container == null:
		return null
	var my_id: int = multiplayer.get_unique_id() if multiplayer.has_multiplayer_peer() else 1
	var node_name := str(my_id)
	if players_container.has_node(node_name):
		return players_container.get_node(node_name) as FrogCharacter
	return null
