class_name ArenaHazard3D
extends Area3D
## Базовый класс для интерактивных элементов и ловушек 3D-арены.

signal frog_entered_hazard(frog: FrogCharacter)
signal frog_exited_hazard(frog: FrogCharacter)

@export var is_hazard_active: bool = true


func _ready() -> void:
	collision_layer = 1 << 4
	collision_mask = 1 << 1
	monitoring = true
	monitorable = false

	if not body_entered.is_connected(_on_body_entered):
		body_entered.connect(_on_body_entered)
	if not body_exited.is_connected(_on_body_exited):
		body_exited.connect(_on_body_exited)


func _apply_hazard_on_enter(_frog: FrogCharacter) -> void:
	pass


func _apply_hazard_on_exit(_frog: FrogCharacter) -> void:
	pass


func _on_body_entered(body: Node3D) -> void:
	if not is_hazard_active:
		return
	if body is FrogCharacter:
		var frog := body as FrogCharacter
		if frog.is_alive:
			_apply_hazard_on_enter(frog)
			frog_entered_hazard.emit(frog)


func _on_body_exited(body: Node3D) -> void:
	if body is FrogCharacter:
		var frog := body as FrogCharacter
		_apply_hazard_on_exit(frog)
		frog_exited_hazard.emit(frog)
