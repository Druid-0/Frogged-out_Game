class_name ArenaPowerUpPickup3D
extends Area3D
## 3D-бонус на гольф-арене (Этап 2):
## - SHIELD (0): Аква-Щит — поглощает следующее напрыгивание врага сверху.
## - DOUBLE_JUMP (1): Крылья Стрекозы — дает 1 дополнительный прыжок прямо в воздухе.
## - SUPER_SPRING (2): Турбо-Пружина — усиливает дальность и высоту прыжка на +35%.

signal pickup_collected(pickup_id: int, powerup_type: PowerUpType, collector: FrogCharacter)

enum PowerUpType {
	SHIELD = 0,
	DOUBLE_JUMP = 1,
	SUPER_SPRING = 2,
}

@export var pickup_id: int = 0
@export var powerup_type: PowerUpType = PowerUpType.SHIELD

var _visual_root: Node3D
var _core_mesh: MeshInstance3D
var _ring_mesh: MeshInstance3D
var _label_3d: Label3D
var _bob_time: float = 0.0
var _is_consumed: bool = false


func _ready() -> void:
	collision_layer = 1 << 4
	collision_mask = 1 << 1
	monitoring = true
	monitorable = false

	_build_pickup_visuals()
	if not body_entered.is_connected(_on_body_entered):
		body_entered.connect(_on_body_entered)


func _process(delta: float) -> void:
	_bob_time += delta * 3.0
	if _visual_root != null:
		_visual_root.position.y = 0.55 + sin(_bob_time) * 0.14
		_visual_root.rotate_y(delta * 2.1)
	if _ring_mesh != null:
		_ring_mesh.rotate_x(delta * 1.8)


func setup_pickup(new_id: int, new_type: PowerUpType, world_pos: Vector3) -> void:
	pickup_id = new_id
	powerup_type = new_type
	position = world_pos
	if is_inside_tree():
		global_position = world_pos
		_apply_type_theme()


func create_modifier_effect() -> FrogModifierEffect:
	var effect := FrogModifierEffect.new()
	match powerup_type:
		PowerUpType.SHIELD:
			effect.modifier_id = &"aqua_shield"
			effect.display_name = "АКВА-ЩИТ"
			effect.duration_sec = 12.0
			effect.blocks_single_stomp = true
			effect.jump_force_multiplier = 1.0
			effect.extra_air_jumps = 0
		PowerUpType.DOUBLE_JUMP:
			effect.modifier_id = &"dragonfly_wings"
			effect.display_name = "2x ПРЫЖОК В ВОЗДУХЕ"
			effect.duration_sec = 10.0
			effect.blocks_single_stomp = false
			effect.jump_force_multiplier = 1.0
			effect.extra_air_jumps = 1
		PowerUpType.SUPER_SPRING:
			effect.modifier_id = &"turbo_spring"
			effect.display_name = "ТУРБО-ПРУЖИНА x1.35"
			effect.duration_sec = 9.0
			effect.blocks_single_stomp = false
			effect.jump_force_multiplier = 1.35
			effect.extra_air_jumps = 0
	return effect


func get_pickup_title() -> String:
	match powerup_type:
		PowerUpType.SHIELD:
			return "АКВА-ЩИТ"
		PowerUpType.DOUBLE_JUMP:
			return "2x ПРЫЖОК"
		PowerUpType.SUPER_SPRING:
			return "ТУРБО-ПРЫЖОК"
	return "БОНУС"


func get_pickup_color() -> Color:
	match powerup_type:
		PowerUpType.SHIELD:
			return Color(0.20, 0.82, 1.00)
		PowerUpType.DOUBLE_JUMP:
			return Color(0.98, 0.86, 0.22)
		PowerUpType.SUPER_SPRING:
			return Color(1.00, 0.44, 0.20)
	return Color.WHITE


func play_collect_and_free() -> void:
	if _is_consumed:
		return
	_is_consumed = true
	set_deferred("monitoring", false)
	if _visual_root != null:
		var tween: Tween = create_tween()
		tween.tween_property(_visual_root, "scale", Vector3.ONE * 1.65, 0.14).set_trans(Tween.TRANS_BACK)
		tween.tween_property(_visual_root, "scale", Vector3.ZERO, 0.12)
		tween.tween_callback(queue_free)
	else:
		queue_free()


func _build_pickup_visuals() -> void:
	var col := CollisionShape3D.new()
	var sphere_shape := SphereShape3D.new()
	sphere_shape.radius = 0.72
	col.shape = sphere_shape
	col.position = Vector3(0.0, 0.55, 0.0)
	add_child(col)

	_visual_root = Node3D.new()
	_visual_root.name = "VisualRoot"
	_visual_root.position = Vector3(0.0, 0.55, 0.0)
	add_child(_visual_root)

	_core_mesh = MeshInstance3D.new()
	var core_sphere := SphereMesh.new()
	core_sphere.radius = 0.34
	core_sphere.height = 0.68
	_core_mesh.mesh = core_sphere
	_visual_root.add_child(_core_mesh)

	_ring_mesh = MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = 0.40
	torus.outer_radius = 0.52
	_ring_mesh.mesh = torus
	_visual_root.add_child(_ring_mesh)

	_label_3d = Label3D.new()
	_label_3d.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	_label_3d.position = Vector3(0.0, 0.65, 0.0)
	_label_3d.font_size = 32
	_label_3d.outline_size = 10
	_visual_root.add_child(_label_3d)

	_apply_type_theme()


func _apply_type_theme() -> void:
	if _core_mesh == null:
		return
	var theme_color: Color = get_pickup_color()

	var core_mat := StandardMaterial3D.new()
	core_mat.albedo_color = theme_color
	core_mat.emission_enabled = true
	core_mat.emission = theme_color * 0.65
	core_mat.roughness = 0.25
	_core_mesh.material_override = core_mat

	if _ring_mesh != null:
		var ring_mat := StandardMaterial3D.new()
		ring_mat.albedo_color = theme_color.lightened(0.35)
		ring_mat.emission_enabled = true
		ring_mat.emission = theme_color * 0.35
		ring_mat.roughness = 0.35
		_ring_mesh.material_override = ring_mat

	if _label_3d != null:
		_label_3d.text = get_pickup_title()
		_label_3d.modulate = theme_color.lightened(0.25)


func _on_body_entered(body: Node3D) -> void:
	if _is_consumed:
		return
	if body is FrogCharacter:
		var frog := body as FrogCharacter
		if frog.is_alive:
			pickup_collected.emit(pickup_id, powerup_type, frog)
