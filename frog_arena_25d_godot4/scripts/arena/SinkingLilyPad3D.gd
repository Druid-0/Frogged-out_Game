class_name SinkingLilyPad3D
extends ArenaHazard3D
## Динамический элемент арены (Этап 2): пружинящая/тонущая кувшинка.
## При приземлении лягушки дает легкий подброс, предупреждающе меняет цвет на янтарно-красный,
## уходит под уровень пола и через respawn_delay_sec всплывает обратно.

@export var sink_delay_sec: float = 1.4
@export var respawn_delay_sec: float = 3.0
@export var pad_bounce_velocity: float = 10.5
@export var platform_body: AnimatableBody3D

var _occupants_count: int = 0
var _is_sinking: bool = false
var _initial_y: float = 0.0
var _pad_mesh: MeshInstance3D
var _pad_material: StandardMaterial3D

const COLOR_PAD_SAFE := Color(0.18, 0.78, 0.44)
const COLOR_PAD_WARNING := Color(0.96, 0.46, 0.18)


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
		cyl_shape.radius = 1.15
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
		body_cyl.radius = 1.15
		body_cyl.height = 0.18
		body_col.shape = body_cyl
		body_col.position = Vector3(0.0, 0.09, 0.0)
		platform_body.add_child(body_col)

		_pad_mesh = MeshInstance3D.new()
		var mesh_cyl := CylinderMesh.new()
		mesh_cyl.top_radius = 1.15
		mesh_cyl.bottom_radius = 1.05
		mesh_cyl.height = 0.18
		_pad_mesh.mesh = mesh_cyl
		_pad_mesh.position = Vector3(0.0, 0.09, 0.0)

		_pad_material = StandardMaterial3D.new()
		_pad_material.albedo_color = COLOR_PAD_SAFE
		_pad_material.roughness = 0.55
		_pad_mesh.material_override = _pad_material
		platform_body.add_child(_pad_mesh)

		add_child(platform_body)


func _apply_hazard_on_enter(frog: FrogCharacter) -> void:
	_occupants_count += 1
	if not _is_sinking and platform_body != null:
		if frog.velocity.y <= 0.5:
			frog.velocity.y = pad_bounce_velocity
		_start_sink_sequence()


func _apply_hazard_on_exit(_frog: FrogCharacter) -> void:
	_occupants_count = max(0, _occupants_count - 1)


func _start_sink_sequence() -> void:
	_is_sinking = true
	if _pad_material != null:
		_pad_material.albedo_color = COLOR_PAD_WARNING

	var tween: Tween = create_tween()
	tween.tween_interval(sink_delay_sec)
	tween.tween_property(platform_body, "position:y", _initial_y - 1.6, 0.40).set_trans(Tween.TRANS_SINE)
	tween.tween_interval(respawn_delay_sec)
	tween.tween_property(platform_body, "position:y", _initial_y, 0.55).set_trans(Tween.TRANS_BACK)
	tween.tween_callback(func() -> void:
		_is_sinking = false
		if _pad_material != null:
			_pad_material.albedo_color = COLOR_PAD_SAFE
	)
