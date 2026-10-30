class_name GolfBoxArenaBuilder3D
extends Node3D
## Процедурный генератор круглой 3D-арены «Болото» с неровными кочками, водой,
## кувшинками и высокими дряхлыми деревьями по кругу вместо стен.

const ARENA_RADIUS: float = 10.6
const DECREPIT_TREE_RING_RADIUS: float = 10.95
const DECREPIT_TREE_COUNT: int = 28
const INVISIBLE_WALL_HEIGHT: float = 16.0
const WATER_LEVEL_Y: float = -0.14

const COLOR_SWAMP_MOSS := Color(0.24, 0.46, 0.20)
const COLOR_SWAMP_HUMMOCK := Color(0.32, 0.56, 0.24)
const COLOR_SWAMP_MUD := Color(0.20, 0.16, 0.11)
const COLOR_SWAMP_WATER := Color(0.11, 0.34, 0.25, 0.78)
const COLOR_DECREPIT_BARK := Color(0.22, 0.15, 0.10)
const COLOR_HANGING_MOSS := Color(0.30, 0.49, 0.24)

const LILY_PAD_POSITIONS: Array[Vector3] = [
	Vector3(-4.4, -0.08, -4.4),
	Vector3(4.4, -0.08, -4.4),
	Vector3(-4.4, -0.08, 4.4),
	Vector3(4.4, -0.08, 4.4),
	Vector3(0.0, -0.08, -5.4),
	Vector3(0.0, -0.08, 5.4),
]


func _ready() -> void:
	_build_circular_swamp_floor()
	_build_circular_decrepit_trees_perimeter()
	_build_sinking_lily_pads()


func get_inner_half_extent() -> float:
	return ARENA_RADIUS


func _build_sinking_lily_pads() -> void:
	var pads_root := Node3D.new()
	pads_root.name = "SinkingLilyPads"
	add_child(pads_root)

	for i: int in range(LILY_PAD_POSITIONS.size()):
		var pad := SinkingLilyPad3D.new()
		pad.name = "SinkingLilyPad_%d" % i
		pad.position = LILY_PAD_POSITIONS[i]
		pads_root.add_child(pad)


func _build_circular_swamp_floor() -> void:
	var floor_body := StaticBody3D.new()
	floor_body.name = "SwampCircularFloorBody"
	floor_body.collision_layer = 1
	floor_body.collision_mask = 0

	var floor_col := CollisionShape3D.new()
	var floor_cyl := CylinderShape3D.new()
	floor_cyl.radius = ARENA_RADIUS + 1.2
	floor_cyl.height = 0.24
	floor_col.shape = floor_cyl
	floor_col.position = Vector3(0.0, -0.12, 0.0)
	floor_body.add_child(floor_col)
	add_child(floor_body)

	var mat_moss := StandardMaterial3D.new()
	mat_moss.albedo_color = COLOR_SWAMP_MOSS
	mat_moss.roughness = 0.92

	var mat_hummock := StandardMaterial3D.new()
	mat_hummock.albedo_color = COLOR_SWAMP_HUMMOCK
	mat_hummock.roughness = 0.88

	var mat_water := StandardMaterial3D.new()
	mat_water.albedo_color = COLOR_SWAMP_WATER
	mat_water.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat_water.roughness = 0.20

	var swamp_root := Node3D.new()
	swamp_root.name = "CircularSwampTerrain"
	add_child(swamp_root)

	# Основной круглый остров болота
	var main_disc := MeshInstance3D.new()
	var disc_mesh := CylinderMesh.new()
	disc_mesh.top_radius = ARENA_RADIUS + 0.9
	disc_mesh.bottom_radius = ARENA_RADIUS + 1.4
	disc_mesh.height = 0.22
	disc_mesh.radial_segments = 48
	main_disc.mesh = disc_mesh
	main_disc.position = Vector3(0.0, -0.14, 0.0)
	main_disc.material_override = mat_moss
	swamp_root.add_child(main_disc)

	# Полупрозрачная болотная вода
	var water_inst := MeshInstance3D.new()
	var water_cyl := CylinderMesh.new()
	water_cyl.top_radius = ARENA_RADIUS + 2.4
	water_cyl.bottom_radius = ARENA_RADIUS + 2.4
	water_cyl.height = 0.04
	water_inst.mesh = water_cyl
	water_inst.position = Vector3(0.0, WATER_LEVEL_Y, 0.0)
	water_inst.material_override = mat_water
	swamp_root.add_child(water_inst)

	# Неровные болотные кочки внутри круга
	for i: int in range(18):
		var ang: float = (float(i) / 18.0) * TAU
		var rad: float = 2.6 + float(i % 3) * 2.3
		var hummock := MeshInstance3D.new()
		var h_mesh := CylinderMesh.new()
		h_mesh.top_radius = 1.15
		h_mesh.bottom_radius = 1.55
		h_mesh.height = 0.28 + float(i % 2) * 0.14
		hummock.mesh = h_mesh
		hummock.position = Vector3(cos(ang) * rad, 0.04, sin(ang) * rad)
		hummock.material_override = mat_hummock
		swamp_root.add_child(hummock)


func _build_circular_decrepit_trees_perimeter() -> void:
	var bark_mat := StandardMaterial3D.new()
	bark_mat.albedo_color = COLOR_DECREPIT_BARK
	bark_mat.roughness = 0.95

	var moss_mat := StandardMaterial3D.new()
	moss_mat.albedo_color = COLOR_HANGING_MOSS
	moss_mat.roughness = 0.90

	var perimeter_body := StaticBody3D.new()
	perimeter_body.name = "CircularDecrepitTreePerimeter"
	perimeter_body.collision_layer = 1
	perimeter_body.collision_mask = 0
	add_child(perimeter_body)

	var chord_len: float = (TAU * ARENA_RADIUS) / float(DECREPIT_TREE_COUNT)

	for i: int in range(DECREPIT_TREE_COUNT):
		var angle: float = (float(i) / float(DECREPIT_TREE_COUNT)) * TAU
		var tx: float = cos(angle) * DECREPIT_TREE_RING_RADIUS
		var tz: float = sin(angle) * DECREPIT_TREE_RING_RADIUS

		# Высокая невидимая коллизия по сегменту круга, предотвращающая вылет с карты
		var col := CollisionShape3D.new()
		var box_shape := BoxShape3D.new()
		box_shape.size = Vector3(0.85, INVISIBLE_WALL_HEIGHT * 2.0, chord_len * 1.15)
		col.shape = box_shape
		col.position = Vector3(cos(angle) * ARENA_RADIUS, INVISIBLE_WALL_HEIGHT * 0.5, sin(angle) * ARENA_RADIUS)
		col.rotation.y = -angle
		perimeter_body.add_child(col)

		# Модели высоких дряхлых болотных деревьев вместо стен
		var tree_root := Node3D.new()
		tree_root.name = "DecrepitSwampTree_%d" % i
		tree_root.position = Vector3(tx, 0.0, tz)
		tree_root.rotation.y = -angle
		perimeter_body.add_child(tree_root)

		var is_front_arc: bool = tz > 7.8 and absf(tx) < 5.8
		var trunk_h: float = 3.8 if is_front_arc else (6.0 + float(i % 3) * 1.2)

		var trunk := MeshInstance3D.new()
		var trunk_cyl := CylinderMesh.new()
		trunk_cyl.top_radius = 0.22
		trunk_cyl.bottom_radius = 0.56
		trunk_cyl.height = trunk_h
		trunk_cyl.radial_segments = 7
		trunk.mesh = trunk_cyl
		trunk.position = Vector3(0.0, trunk_h * 0.5, 0.0)
		trunk.rotation.z = 0.08
		trunk.material_override = bark_mat
		tree_root.add_child(trunk)

		# Корявая ветвь со свисающим болотным мхом
		var branch := MeshInstance3D.new()
		var b_cyl := CylinderMesh.new()
		b_cyl.top_radius = 0.06
		b_cyl.bottom_radius = 0.15
		b_cyl.height = 1.8
		branch.mesh = b_cyl
		branch.position = Vector3(0.55, trunk_h * 0.72, 0.0)
		branch.rotation.z = -1.1
		branch.material_override = bark_mat
		tree_root.add_child(branch)

		var hanging_moss := MeshInstance3D.new()
		var moss_cone := CylinderMesh.new()
		moss_cone.top_radius = 0.20
		moss_cone.bottom_radius = 0.02
		moss_cone.height = 1.15
		hanging_moss.mesh = moss_cone
		hanging_moss.position = Vector3(0.95, trunk_h * 0.62, 0.0)
		hanging_moss.material_override = moss_mat
		tree_root.add_child(hanging_moss)
