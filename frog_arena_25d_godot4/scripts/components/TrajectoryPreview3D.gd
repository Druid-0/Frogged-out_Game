class_name TrajectoryPreview3D
extends Node3D
## Наземный указатель направления и силы прыжка (как в ранних версиях прототипа).
## Лежит строго на плоскости газона перед лягушкой (вдоль локальной оси -Z) и растягивается
## пропорционально силе натяжения рогатки, не создавая точек или дуг в воздухе.

var _arrow_shaft: MeshInstance3D
var _arrow_head: MeshInstance3D
var _indicator_material: StandardMaterial3D


func _ready() -> void:
	top_level = false
	position = Vector3.ZERO
	_build_ground_arrow_meshes()
	hide_trajectory()


## Обновляет длину и цвет наземной стрелки на основе коэффициента натяжения [0.0 .. 1.0].
func update_ground_indicator(power_ratio: float) -> void:
	var clamped_power: float = clampf(power_ratio, 0.0, 1.0)
	visible = true
	scale = Vector3(1.0, 1.0, 0.5 + clamped_power * 2.0)

	if _indicator_material != null:
		# Плавный переход цвета полосы на траве от желтого к ярко-оранжевому при максимальном натяжении
		_indicator_material.albedo_color = Color(1.0, 0.95, 0.35, 0.92).lerp(
			Color(1.0, 0.38, 0.20, 0.95),
			clamped_power
		)


## Совместимая обертка для вызова из контроллера лягушки.
func update_trajectory(
	_origin: Vector3,
	_initial_velocity: Vector3,
	_ascend_grav_mult: float,
	_descend_grav_mult: float,
	power_ratio: float = 1.0
) -> void:
	update_ground_indicator(power_ratio)


func hide_trajectory() -> void:
	visible = false
	scale = Vector3.ONE


func _build_ground_arrow_meshes() -> void:
	_indicator_material = StandardMaterial3D.new()
	_indicator_material.albedo_color = Color(1.0, 0.95, 0.35, 0.92)
	_indicator_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_indicator_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_indicator_material.cull_mode = BaseMaterial3D.CULL_DISABLED

	# Продольная полоса указателя на земле (как AimArrow в первой версии)
	_arrow_shaft = MeshInstance3D.new()
	_arrow_shaft.name = "GroundArrowShaft"
	var shaft_box := BoxMesh.new()
	shaft_box.size = Vector3(0.18, 0.05, 1.2)
	_arrow_shaft.mesh = shaft_box
	_arrow_shaft.position = Vector3(0.0, 0.08, -0.8)
	_arrow_shaft.material_override = _indicator_material
	add_child(_arrow_shaft)

	# Плоский наконечник стрелки на газоне на конце полосы
	_arrow_head = MeshInstance3D.new()
	_arrow_head.name = "GroundArrowHead"
	var head_prism := PrismMesh.new()
	head_prism.size = Vector3(0.42, 0.36, 0.05)
	_arrow_head.mesh = head_prism
	_arrow_head.rotation_degrees = Vector3(-90.0, 0.0, 0.0)
	_arrow_head.position = Vector3(0.0, 0.08, -1.55)
	_arrow_head.material_override = _indicator_material
	add_child(_arrow_head)
