class_name JumpInputComponent
extends Node
## Компонент мобильного управления прыжком с поддержкой натягивания рогатки
## С ЛЮБОЙ ТОЧКИ ЭКРАНА (Screen-Space Virtual Slingshot) и режима зажатия (Hold-to-Charge).
## Игнорирует нажатия по кнопкам интерфейса HUD, чтобы клик по «+ Добавить бота» не вызывал прыжок.

signal aim_updated(world_direction: Vector3, power_ratio: float, start_screen: Vector2, current_screen: Vector2)
signal aim_cancelled()
signal jump_requested(world_direction: Vector3, power_ratio: float)

@export var config: FrogConfig
@export var control_mode: UserSettingsManager.ControlMode = UserSettingsManager.ControlMode.SLINGSHOT_DRAG
@export var is_input_enabled: bool = true

var frog_owner: Node3D
var ortho_camera: Camera3D

var _is_pressing: bool = false
var _active_touch_index: int = -1
var _press_start_screen_pos: Vector2 = Vector2.ZERO
var _press_current_screen_pos: Vector2 = Vector2.ZERO
var _hold_elapsed_sec: float = 0.0


func _ready() -> void:
	if config == null:
		config = FrogConfig.new()
	frog_owner = get_parent() as Node3D


func _process(delta: float) -> void:
	if not is_input_enabled or not _has_local_authority() or not _is_pressing:
		return

	if control_mode == UserSettingsManager.ControlMode.HOLD_TO_CHARGE:
		_hold_elapsed_sec = minf(_hold_elapsed_sec + delta, config.max_charge_time_sec)
		var power_ratio: float = _compute_power_ratio()
		var direction: Vector3 = _compute_world_jump_direction()
		aim_updated.emit(direction, power_ratio, _press_start_screen_pos, _press_current_screen_pos)


func _unhandled_input(event: InputEvent) -> void:
	if not is_input_enabled or not _has_local_authority():
		return

	if event is InputEventScreenTouch:
		var touch_event := event as InputEventScreenTouch
		if touch_event.pressed and not _is_pressing:
			if _is_touch_over_interactive_ui():
				return
			_start_press(touch_event.index, touch_event.position)
		elif not touch_event.pressed and _is_pressing and touch_event.index == _active_touch_index:
			_finish_press(touch_event.position)

	elif event is InputEventScreenDrag:
		var drag_event := event as InputEventScreenDrag
		if _is_pressing and drag_event.index == _active_touch_index:
			_update_drag(drag_event.position)


func cancel_current_aim() -> void:
	if _is_pressing:
		_is_pressing = false
		_active_touch_index = -1
		_hold_elapsed_sec = 0.0
		aim_cancelled.emit()


## Проверяет, не находится ли курсор/палец над кнопкой или полем ввода HUD.
func _is_touch_over_interactive_ui() -> bool:
	if get_viewport() == null:
		return false
	var hovered: Control = get_viewport().gui_get_hovered_control()
	if hovered != null and (hovered is BaseButton or hovered is LineEdit or hovered is Slider):
		return true
	return false


func _start_press(touch_index: int, screen_pos: Vector2) -> void:
	_is_pressing = true
	_active_touch_index = touch_index
	_press_start_screen_pos = screen_pos
	_press_current_screen_pos = screen_pos
	_hold_elapsed_sec = 0.0
	var dir: Vector3 = _compute_world_jump_direction()
	var power: float = _compute_power_ratio()
	aim_updated.emit(dir, power, _press_start_screen_pos, _press_current_screen_pos)


func _update_drag(screen_pos: Vector2) -> void:
	_press_current_screen_pos = screen_pos
	var power_ratio: float = _compute_power_ratio()
	var direction: Vector3 = _compute_world_jump_direction()
	aim_updated.emit(direction, power_ratio, _press_start_screen_pos, _press_current_screen_pos)


func _finish_press(screen_pos: Vector2) -> void:
	_press_current_screen_pos = screen_pos
	_is_pressing = false
	_active_touch_index = -1

	var power_ratio: float = _compute_power_ratio()
	if power_ratio < config.min_jump_power_ratio:
		aim_cancelled.emit()
		return

	var direction: Vector3 = _compute_world_jump_direction()
	jump_requested.emit(direction, power_ratio)


func _compute_power_ratio() -> float:
	if control_mode == UserSettingsManager.ControlMode.SLINGSHOT_DRAG:
		var pull_vector: Vector2 = _press_start_screen_pos - _press_current_screen_pos
		var pull_distance: float = pull_vector.length()
		if pull_distance <= config.drag_deadzone_px:
			return 0.0

		var effective_distance: float = pull_distance - config.drag_deadzone_px
		var max_span: float = maxf(1.0, config.max_drag_distance_px - config.drag_deadzone_px)
		return clampf(effective_distance / max_span, 0.0, 1.0)
	else:
		var ratio: float = clampf(_hold_elapsed_sec / maxf(0.01, config.max_charge_time_sec), 0.0, 1.0)
		return maxf(config.min_jump_power_ratio, ratio)


func _compute_world_jump_direction() -> Vector3:
	if frog_owner == null:
		return Vector3.FORWARD

	var cam: Camera3D = ortho_camera
	if cam == null and get_viewport() != null:
		cam = get_viewport().get_camera_3d()

	var cam_right := Vector3.RIGHT
	var cam_forward_ground := Vector3.FORWARD
	if cam != null:
		cam_right = cam.global_transform.basis.x
		cam_right.y = 0.0
		cam_right = cam_right.normalized()

		cam_forward_ground = -cam.global_transform.basis.z
		cam_forward_ground.y = 0.0
		if cam_forward_ground.length_squared() < 0.0001:
			cam_forward_ground = cam.global_transform.basis.y
			cam_forward_ground.y = 0.0
		cam_forward_ground = cam_forward_ground.normalized()

	if control_mode == UserSettingsManager.ControlMode.SLINGSHOT_DRAG:
		var screen_pull: Vector2 = _press_start_screen_pos - _press_current_screen_pos
		if screen_pull.length_squared() < 1.0:
			return -frog_owner.global_transform.basis.z.normalized()

		var world_dir: Vector3 = (cam_right * screen_pull.x) + (cam_forward_ground * (-screen_pull.y))
		world_dir.y = 0.0
		if world_dir.length_squared() > 0.0001:
			return world_dir.normalized()
		return -frog_owner.global_transform.basis.z.normalized()

	else:
		var drag_offset: Vector2 = _press_current_screen_pos - _press_start_screen_pos
		if drag_offset.length_squared() > 100.0:
			var offset_dir: Vector3 = (cam_right * drag_offset.x) + (cam_forward_ground * (-drag_offset.y))
			offset_dir.y = 0.0
			if offset_dir.length_squared() > 0.0001:
				return offset_dir.normalized()

		if cam != null:
			var ground_plane := Plane(Vector3.UP, frog_owner.global_position.y)
			var ray_origin: Vector3 = cam.project_ray_origin(_press_current_screen_pos)
			var ray_dir: Vector3 = cam.project_ray_normal(_press_current_screen_pos)
			var hit: Variant = ground_plane.intersects_ray(ray_origin, ray_dir)
			if hit != null:
				var to_touch: Vector3 = (hit as Vector3) - frog_owner.global_position
				to_touch.y = 0.0
				if to_touch.length_squared() > 0.001:
					return to_touch.normalized()

		return -frog_owner.global_transform.basis.z.normalized()


func _has_local_authority() -> bool:
	if frog_owner == null:
		return false
	if not multiplayer.has_multiplayer_peer():
		return true
	var my_peer_id: int = multiplayer.get_unique_id()
	return (frog_owner as FrogCharacter).player_peer_id == my_peer_id
