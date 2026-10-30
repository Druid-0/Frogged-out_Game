class_name FrogModifierComponent
extends Node
## Компонент управления активными модификаторами и бонусами на конкретной лягушке (Godot 4.7).

signal modifier_added(effect: FrogModifierEffect)
signal modifier_removed(effect: FrogModifierEffect)
signal modifiers_changed()
signal shield_blocked_stomp()

var _active_effects: Array[FrogModifierEffect] = []
var _remaining_times: Dictionary[StringName, float] = {}
var _available_air_jumps: int = 0


func _process(delta: float) -> void:
	var owner_node := get_parent() as Node3D
	for i: int in range(_active_effects.size() - 1, -1, -1):
		var effect: FrogModifierEffect = _active_effects[i]
		effect.on_tick(owner_node, delta)
		if effect.duration_sec > 0.0 and _remaining_times.has(effect.modifier_id):
			var time_left: float = _remaining_times[effect.modifier_id] - delta
			if time_left <= 0.0:
				remove_modifier_by_id(effect.modifier_id)
			else:
				_remaining_times[effect.modifier_id] = time_left


func apply_modifier(effect: FrogModifierEffect) -> void:
	if effect == null:
		return
	remove_modifier_by_id(effect.modifier_id)
	_active_effects.append(effect)
	if effect.duration_sec > 0.0:
		_remaining_times[effect.modifier_id] = effect.duration_sec
	_recalculate_air_jumps()
	effect.on_applied(get_parent() as Node3D)
	modifier_added.emit(effect)
	modifiers_changed.emit()


func clear_all_modifiers() -> void:
	var owner_node := get_parent() as Node3D
	for effect: FrogModifierEffect in _active_effects:
		effect.on_removed(owner_node)
	_active_effects.clear()
	_remaining_times.clear()
	_available_air_jumps = 0
	modifiers_changed.emit()


func remove_modifier_by_id(modifier_id: StringName) -> void:
	for i: int in range(_active_effects.size()):
		if _active_effects[i].modifier_id == modifier_id:
			var removed: FrogModifierEffect = _active_effects[i]
			_active_effects.remove_at(i)
			_remaining_times.erase(modifier_id)
			_recalculate_air_jumps()
			removed.on_removed(get_parent() as Node3D)
			modifier_removed.emit(removed)
			modifiers_changed.emit()
			return


func has_active_shield() -> bool:
	for effect: FrogModifierEffect in _active_effects:
		if effect.blocks_single_stomp:
			return true
	return false


func get_active_badges_text() -> String:
	if _active_effects.is_empty():
		return ""
	var badges: PackedStringArray = PackedStringArray()
	for effect: FrogModifierEffect in _active_effects:
		badges.append("[%s]" % effect.display_name)
	return " ".join(badges)


func get_total_jump_multiplier() -> float:
	var multiplier: float = 1.0
	for effect: FrogModifierEffect in _active_effects:
		multiplier *= effect.jump_force_multiplier
	return multiplier


func try_consume_stomp_shield() -> bool:
	for effect: FrogModifierEffect in _active_effects:
		if effect.blocks_single_stomp:
			remove_modifier_by_id(effect.modifier_id)
			shield_blocked_stomp.emit()
			return true
	return false


func reset_air_jumps_on_floor() -> void:
	_recalculate_air_jumps()


func try_consume_air_jump() -> bool:
	if _available_air_jumps > 0:
		_available_air_jumps -= 1
		return true
	return false


func _recalculate_air_jumps() -> void:
	_available_air_jumps = 0
	for effect: FrogModifierEffect in _active_effects:
		_available_air_jumps += effect.extra_air_jumps
