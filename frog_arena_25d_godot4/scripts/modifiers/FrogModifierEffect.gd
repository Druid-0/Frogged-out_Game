class_name FrogModifierEffect
extends Resource
## Базовый класс расширяемой системы модификаторов и бонусов для лягушки (Godot 4.7).

@export var modifier_id: StringName = &"base_modifier"
@export var display_name: String = "Базовый модификатор"
@export var duration_sec: float = 5.0
@export var jump_force_multiplier: float = 1.0
@export var blocks_single_stomp: bool = false
@export var extra_air_jumps: int = 0


func on_applied(_frog: Node3D) -> void:
	pass


func on_tick(_frog: Node3D, _delta: float) -> void:
	pass


func on_removed(_frog: Node3D) -> void:
	pass
