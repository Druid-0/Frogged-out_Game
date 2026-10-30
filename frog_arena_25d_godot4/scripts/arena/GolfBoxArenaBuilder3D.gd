class_name GolfBoxArenaBuilder3D
extends Node3D
## Процедурный генератор 3D-арены в виде коробки с живым гольф-полем и 4 динамическими кувшинками.

const GRID_TILES_PER_SIDE: int = 8
const TILE_SIZE_METERS: float = 2.6
const FLOOR_THICKNESS: float = 0.1
const WALL_HEIGHT: float = 1
const WALL_THICKNESS: float = 0.8
const INVISIBLE_WALL: float = 10

const COLOR_TILE_LIGHT_YELLOW_GREEN := Color(0.66, 0.86, 0.26)
const COLOR_TILE_DARK_GOLF_GREEN := Color(0.28, 0.62, 0.22)
const COLOR_TILE_BORDER_ACCENT := Color(0.84, 0.88, 0.32)
const COLOR_WALL_MAIN := Color(0.82, 0.44, 0.24)
const COLOR_WALL_TOP_TRIM := Color(0.95, 0.78, 0.32)
const COLOR_CORNER_PILLAR := Color(0.22, 0.48, 0.36)

const LILY_PAD_POSITIONS: Array[Vector3] = [
	Vector3(-4.2, 0.02, -4.2),
	Vector3(4.2, 0.02, -4.2),
	Vector3(-4.2, 0.02, 4.2),
	Vector3(4.2, 0.02, 4.2),
]


func _ready() -> void:
	_build_golf_checkerboard_floor()
	_build_colored_box_walls()
	_build_sinking_lily_pads()


func get_inner_half_extent() -> float:
	return (float(GRID_TILES_PER_SIDE) * TILE_SIZE_METERS) * 0.5


func _build_sinking_lily_pads() -> void:
	var pads_root := Node3D.new()
	pads_root.name = "SinkingLilyPads"
	add_child(pads_root)

	for i: int in range(LILY_PAD_POSITIONS.size()):
		var pad := SinkingLilyPad3D.new()
		pad.name = "SinkingLilyPad_%d" % i
		pad.position = LILY_PAD_POSITIONS[i]
		pads_root.add_child(pad)


func _build_golf_checkerboard_floor() -> void:
	var arena_span: float = float(GRID_TILES_PER_SIDE) * TILE_SIZE_METERS
	var half_span: float = arena_span * 0.5

	var floor_body := StaticBody3D.new()
	floor_body.name = "GolfFloorStaticBody"
	floor_body.collision_layer = 1
	floor_body.collision_mask = 0

	var floor_col := CollisionShape3D.new()
	var floor_shape := BoxShape3D.new()
	floor_shape.size = Vector3(arena_span + WALL_THICKNESS * 2.0, FLOOR_THICKNESS, arena_span + WALL_THICKNESS * 2.0)
	floor_col.shape = floor_shape
	floor_col.position = Vector3(0.0, -FLOOR_THICKNESS * 0.5, 0.0)
	floor_body.add_child(floor_col)
	add_child(floor_body)

	var mat_light := StandardMaterial3D.new()
	mat_light.albedo_color = COLOR_TILE_LIGHT_YELLOW_GREEN
	mat_light.roughness = 0.85

	var mat_dark := StandardMaterial3D.new()
	mat_dark.albedo_color = COLOR_TILE_DARK_GOLF_GREEN
	mat_dark.roughness = 0.88

	var mat_border := StandardMaterial3D.new()
	mat_border.albedo_color = COLOR_TILE_BORDER_ACCENT
	mat_border.roughness = 0.80

	var tiles_root := Node3D.new()
	tiles_root.name = "CheckerboardGolfTiles"
	add_child(tiles_root)

	var tile_mesh := BoxMesh.new()
	tile_mesh.size = Vector3(TILE_SIZE_METERS * 0.985, 0.08, TILE_SIZE_METERS * 0.985)

	for row: int in range(GRID_TILES_PER_SIDE):
		for col: int in range(GRID_TILES_PER_SIDE):
			var tile_instance := MeshInstance3D.new()
			tile_instance.mesh = tile_mesh

			var pos_x: float = -half_span + (float(col) + 0.5) * TILE_SIZE_METERS
			var pos_z: float = -half_span + (float(row) + 0.5) * TILE_SIZE_METERS
			tile_instance.position = Vector3(pos_x, -0.04, pos_z)

			var is_even: bool = ((row + col) % 2) == 0
			tile_instance.material_override = mat_light if is_even else mat_dark
			tiles_root.add_child(tile_instance)

	var base_mesh_inst := MeshInstance3D.new()
	var base_box := BoxMesh.new()
	base_box.size = Vector3(arena_span + 0.2, FLOOR_THICKNESS, arena_span + 0.2)
	base_mesh_inst.mesh = base_box
	base_mesh_inst.position = Vector3(0.0, -FLOOR_THICKNESS * 0.5 - 0.02, 0.0)
	base_mesh_inst.material_override = mat_border
	tiles_root.add_child(base_mesh_inst)


func _build_colored_box_walls() -> void:
	var arena_span: float = float(GRID_TILES_PER_SIDE) * TILE_SIZE_METERS
	var half_span: float = arena_span * 0.5
	var wall_offset: float = half_span + (WALL_THICKNESS * 0.5)
	var full_wall_len: float = arena_span + (WALL_THICKNESS * 2.0)

	var wall_mat := StandardMaterial3D.new()
	wall_mat.albedo_color = COLOR_WALL_MAIN
	wall_mat.roughness = 0.65

	var trim_mat := StandardMaterial3D.new()
	trim_mat.albedo_color = COLOR_WALL_TOP_TRIM
	trim_mat.roughness = 0.50

	var pillar_mat := StandardMaterial3D.new()
	pillar_mat.albedo_color = COLOR_CORNER_PILLAR
	pillar_mat.roughness = 0.60

	var walls_root := StaticBody3D.new()
	walls_root.name = "BoxPerimeterWalls"
	walls_root.collision_layer = 1
	walls_root.collision_mask = 0
	add_child(walls_root)

	var wall_configs: Array[Dictionary] = [
		{"name": "NorthWall", "pos": Vector3(0.0, WALL_HEIGHT * 0.5, -wall_offset), "size": Vector3(full_wall_len, WALL_HEIGHT, WALL_THICKNESS)},
		{"name": "SouthWall", "pos": Vector3(0.0, WALL_HEIGHT * 0.5, wall_offset), "size": Vector3(full_wall_len, WALL_HEIGHT, WALL_THICKNESS)},
		{"name": "EastWall", "pos": Vector3(wall_offset, WALL_HEIGHT * 0.5, 0.0), "size": Vector3(WALL_THICKNESS, WALL_HEIGHT, arena_span)},
		{"name": "WestWall", "pos": Vector3(-wall_offset, WALL_HEIGHT * 0.5, 0.0), "size": Vector3(WALL_THICKNESS, WALL_HEIGHT, arena_span)},
	]
	
	#var invsible_wall_configs: Array[Dictionary] = [
		#{"name": "NorthWall", "pos": Vector3(0.0, INVISIBLE_WALL * 0.5, -wall_offset), "size": Vector3(full_wall_len, INVISIBLE_WALL, WALL_THICKNESS)},
		#{"name": "SouthWall", "pos": Vector3(0.0, INVISIBLE_WALL * 0.5, wall_offset), "size": Vector3(full_wall_len, INVISIBLE_WALL, WALL_THICKNESS)},
		#{"name": "EastWall", "pos": Vector3(wall_offset, INVISIBLE_WALL * 0.5, 0.0), "size": Vector3(INVISIBLE_WALL, INVISIBLE_WALL, arena_span)},
		#{"name": "WestWall", "pos": Vector3(-wall_offset, INVISIBLE_WALL * 0.5, 0.0), "size": Vector3(INVISIBLE_WALL, INVISIBLE_WALL, arena_span)},
	#]
	
	for cfg: Dictionary in wall_configs:
		var w_pos: Vector3 = cfg["pos"] as Vector3
		var w_size: Vector3 = cfg["size"] as Vector3

		var col := CollisionShape3D.new()
		var box_shape := BoxShape3D.new()
		box_shape.size = Vector3(w_size.x, WALL_HEIGHT * 100, w_size.z)
		col.shape = box_shape
		col.position = Vector3(w_pos.x, WALL_HEIGHT * 1.4, w_pos.z)
		walls_root.add_child(col)

		var wall_mesh_inst := MeshInstance3D.new()
		wall_mesh_inst.name = str(cfg["name"])
		var wall_box := BoxMesh.new()
		wall_box.size = w_size
		wall_mesh_inst.mesh = wall_box
		wall_mesh_inst.position = w_pos
		wall_mesh_inst.material_override = wall_mat
		walls_root.add_child(wall_mesh_inst)

		var trim_inst := MeshInstance3D.new()
		var trim_box := BoxMesh.new()
		trim_box.size = Vector3(w_size.x + 0.08, 0.24, w_size.z + 0.08)
		trim_inst.mesh = trim_box
		trim_inst.position = Vector3(w_pos.x, WALL_HEIGHT + 0.12, w_pos.z)
		trim_inst.material_override = trim_mat
		walls_root.add_child(trim_inst)

	var corners: Array[Vector3] = [
		Vector3(-wall_offset, 0.0, -wall_offset),
		Vector3(wall_offset, 0.0, -wall_offset),
		Vector3(-wall_offset, 0.0, wall_offset),
		Vector3(wall_offset, 0.0, wall_offset),
	]
	for corner_pos: Vector3 in corners:
		var pillar := MeshInstance3D.new()
		var p_mesh := BoxMesh.new()
		p_mesh.size = Vector3(WALL_THICKNESS * 1.35, WALL_HEIGHT + 0.55, WALL_THICKNESS * 1.35)
		pillar.mesh = p_mesh
		pillar.position = Vector3(corner_pos.x, (WALL_HEIGHT + 0.55) * 0.5, corner_pos.z)
		pillar.material_override = pillar_mat
		walls_root.add_child(pillar)
