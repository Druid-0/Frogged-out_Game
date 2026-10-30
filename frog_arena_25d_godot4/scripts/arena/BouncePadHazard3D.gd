class_name BouncePadHazard3D
extends ArenaHazard3D
## Интерактивный элемент гольф-арены: пружинящий батут в центре коробки.

@export_range(8.0, 35.0, 0.5) var bounce_upward_velocity: float = 18.0


func _apply_hazard_on_enter(frog: FrogCharacter) -> void:
	frog.velocity.y = bounce_upward_velocity
