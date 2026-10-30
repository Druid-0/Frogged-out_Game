class_name SinkingLilyPad3D
extends ArenaHazard3D
## Кувшинка на воде: находится строго на воде, НЕ пропадает и НЕ дает авто-прыжок при 1 лягушке,
## но если на одну кувшинку одновременно встанут X >= 2 лягушки — она почти сразу уходит под воду.

@export var max_frogs_before_sink: int = 2
@export var overload_sink_delay_sec: float = 0.18
@export var respawn_delay_sec: float = 3.2
@export var platform_body: AnimatableBody3D

var _occupants_count: int = 0
var _is_sinking: bool = false
var _initial_y: float = 0.0
var _pad_mesh: MeshInstance3D
var _pad_material: StandardMaterial3D

const COLOR_PAD_SAFE := Color(0.18, 0.66, 0.31)
const COLOR_PAD_OCCUPIED := Color(0.20, 0.83, 0.60)
const COLOR_PAD_OVERLOADED := Color(0.94, 0.27, 0.27)


func _ready() -> void:
	super._ready()
	_ensure_pad_geometry()
	if platform_body != null:
		_initial_y = platform_body.position.y


func _ensure_pad_geometry() -> void:
	if get_node_or_null("HazardCollision") == null:
		var trig_col := CollisionShape3D.new()
		trig_col.name = "HazardCollision"
		var cyl_shape := CylinderShape3D.new()
		cyl_shape.radius = 1.35
		cyl_shape.height = 0.45
		trig_col.shape = cyl_shape
		trig_col.position = Vector3(0.0, 0.22, 0.0)
		add_child(trig_col)

	if platform_body == null:
		platform_body = AnimatableBody3D.new()
		platform_body.name = "LilyPadPlatformBody"
		platform_body.collision_layer = 1
		platform_body.collision_mask = 0
		platform_body.sync_to_physics = false

		var body_col := CollisionShape3D.new()
		var body_cyl := CylinderShape3D.new()
		body_cyl.radius = 1.35
		body_cyl.height = 0.14
		body_col.shape = body_cyl
		body_col.position = Vector3(0.0, 0.07, 0.0)
		platform_body.add_child(body_col)

		_pad_mesh = MeshInstance3D.new()
		var mesh_cyl := CylinderMesh.new()
		mesh_cyl.top_radius = 1.35
		mesh_cyl.bottom_radius = 1.28
		mesh_cyl.height = 0.12
		_pad_mesh.mesh = mesh_cyl
		_pad_mesh.position = Vector3(0.0, 0.06, 0.0)

		_pad_material = StandardMaterial3D.new()
		_pad_material.albedo_color = COLOR_PAD_SAFE
		_pad_material.roughness = 0.68
		_pad_mesh.material_override = _pad_material
		platform_body.add_child(_pad_mesh)

		add_child(platform_body)


func _apply_hazard_on_enter(_frog: FrogCharacter) -> void:
	_occupants_count += 1
	if _is_sinking:
		return
	if _occupants_count >= max_frogs_before_sink:
		_start_overload_sink_sequence()
	elif _pad_material != null:
		_pad_material.albedo_color = COLOR_PAD_OCCUPIED


func _apply_hazard_on_exit(_frog: FrogCharacter) -> void:
	_occupants_count = max(0, _occupants_count - 1)
	if not _is_sinking and _pad_material != null:
		_pad_material.albedo_color = COLOR_PAD_OCCUPIED if _occupants_count == 1 else COLOR_PAD_SAFE


func _start_overload_sink_sequence() -> void:
	_is_sinking = true
	if _pad_material != null:
		_pad_material.albedo_color = COLOR_PAD_OVERLOADED

	var tween: Tween = create_tween()
	tween.tween_interval(overload_sink_delay_sec)
	tween.tween_property(platform_body, "position:y", _initial_y - 1.6, 0.25).set_trans(Tween.TRANS_SINE)
	tween.tween_interval(respawn_delay_sec)
	tween.tween_property(platform_body, "position:y", _initial_y, 0.45).set_trans(Tween.TRANS_BACK)
	tween.tween_callback(func() -> void:
		_is_sinking = false
		if _pad_material != null:
			_pad_material.albedo_color = COLOR_PAD_SAFE
	)
