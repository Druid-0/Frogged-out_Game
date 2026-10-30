class_name HealthComponent
extends Node
## Компонент здоровья и регистрации урона для лягушки (Godot 4.7).
## Отвечает за прием урона, защиту от мульти-хита в одном кадре (invulnerability window),
## генерацию сигналов урона и смерти, а также восстановление HP при респавне.

signal health_changed(current_hp: int, max_hp: int)
signal damage_registered(victim_peer_id: int, attacker_peer_id: int, damage_amount: int, remaining_hp: int)
signal health_depleted(victim_peer_id: int, attacker_peer_id: int)

@export var max_health: int = 100
@export var invulnerability_duration_sec: float = 0.28

var current_health: int = 100
var is_dead: bool = false

var _invulnerability_timer: float = 0.0


func _ready() -> void:
	reset_health(max_health)


func _process(delta: float) -> void:
	if _invulnerability_timer > 0.0:
		_invulnerability_timer = maxf(0.0, _invulnerability_timer - delta)


## Полностью восстанавливает здоровье (при спавне или начале нового раунда).
func reset_health(new_max_health: int = -1) -> void:
	if new_max_health > 0:
		max_health = new_max_health
	current_health = max_health
	is_dead = false
	_invulnerability_timer = 0.0
	health_changed.emit(current_health, max_health)


## Проверяет, может ли цель прямо сейчас получить урон.
func can_receive_damage() -> bool:
	return not is_dead and _invulnerability_timer <= 0.0


## Регистрирует входящий урон и возвращает true, если этот удар стал фатальным (HP <= 0).
func apply_damage(damage_amount: int, victim_peer_id: int, attacker_peer_id: int) -> bool:
	if not can_receive_damage() or damage_amount <= 0:
		return false

	_invulnerability_timer = invulnerability_duration_sec
	current_health = maxi(0, current_health - damage_amount)
	health_changed.emit(current_health, max_health)
	damage_registered.emit(victim_peer_id, attacker_peer_id, damage_amount, current_health)

	if current_health <= 0:
		is_dead = true
		health_depleted.emit(victim_peer_id, attacker_peer_id)
		return true

	return false
