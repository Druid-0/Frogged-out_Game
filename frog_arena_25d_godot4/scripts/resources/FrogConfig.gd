class_name FrogConfig
extends Resource
## Ресурс баланса, физических характеристик и параметров урона лягушки (Godot 4.7).

@export_group("Jump Physics")
## Максимальная горизонтальная скорость прыжка при 100% заряде (м/с).
@export_range(2.0, 30.0, 0.5) var max_horizontal_jump_speed: float = 13.0
## Максимальная вертикальная скорость прыжка при 100% заряде (м/с).
@export_range(4.0, 35.0, 0.5) var max_vertical_jump_speed: float = 14.5
## Минимальный порог силы прыжка [0..1], ниже которого прыжок отменяется.
@export_range(0.05, 0.5, 0.05) var min_jump_power_ratio: float = 0.14
## Множитель гравитации при взлете вверх.
@export_range(0.5, 5.0, 0.1) var gravity_ascend_multiplier: float = 1.6
## Множитель гравитации при падении вниз (делает приземление резким и точным).
@export_range(0.5, 6.0, 0.1) var gravity_descend_multiplier: float = 2.5
## Коэффициент торможения о газон после приземления.
@export_range(5.0, 50.0, 1.0) var ground_friction: float = 26.0
## Коэффициент упругого отскока от стенок коробки.
@export_range(0.1, 1.0, 0.05) var wall_bounce_factor: float = 0.55

@export_group("Jump Cooldown (Bots & Players)")
## Минимальная перезарядка (КД) между прыжками бота после приземления (сек).
@export_range(0.5, 10.0, 0.1) var bot_jump_cooldown_min_sec: float = 2.0
## Максимальная перезарядка (КД) между прыжками бота после приземления (сек).
@export_range(0.5, 10.0, 0.1) var bot_jump_cooldown_max_sec: float = 3.0

@export_group("Touch Controls (Slingshot & Hold)")
## Длина оттягивания пальца в любой части экрана (в пикселях) для 100% силы рогатки.
@export_range(60.0, 600.0, 10.0) var max_drag_distance_px: float = 210.0
## Радиус мертвой зоны оттягивания (в пикселях) для отмены случайного касания.
@export_range(5.0, 80.0, 5.0) var drag_deadzone_px: float = 18.0
## Время полного заряда прыжка (в секундах) для альтернативного режима зажатия экрана.
@export_range(0.3, 4.0, 0.1) var max_charge_time_sec: float = 1.15

@export_group("Health & Stomp Damage Registration")
## Максимальный запас здоровья лягушки (по умолчанию 100 HP).
@export_range(10, 500, 10) var max_health: int = 100
## Базовый урон при напрыгивании сверху (50 = раздавливание за 2 прыжка, 100 = мгновенное раздавливание).
@export_range(10, 500, 5) var base_stomp_damage: int = 50
## Бонусный урон за высокую скорость падения сверху (до +50 урона при сильном прыжке).
@export_range(0, 100, 5) var max_fall_speed_bonus_damage: int = 50
## Минимальная скорость падения вниз (м/с) для регистрации урона сверху.
@export_range(0.2, 15.0, 0.2) var min_fall_speed_for_stomp: float = 1.2
## Вертикальный импульс отскока атакующей лягушки вверх после нанесения урона.
@export_range(3.0, 25.0, 0.5) var stomp_bounce_velocity: float = 11.5
## Кратковременная неуязвимость жертвы после получения урона (сек), чтобы один прыжок не нанес урон дважды.
@export_range(0.05, 1.0, 0.05) var hit_invulnerability_sec: float = 0.28
## Задержка перед скрытием сплющенной лягушки (сек).
@export_range(0.2, 3.0, 0.1) var squash_disappear_delay: float = 0.7


## Вычисляет трехмерный вектор начальной скорости прыжка по направлению и силе натяжения.
func calculate_jump_velocity(world_direction: Vector3, power_ratio: float, jump_multiplier: float = 1.0) -> Vector3:
	var clamped_power: float = clampf(power_ratio, 0.0, 1.0)
	var clean_dir: Vector3 = Vector3(world_direction.x, 0.0, world_direction.z).normalized()
	var horizontal_speed: float = max_horizontal_jump_speed * clamped_power * jump_multiplier
	var vertical_factor: float = clampf(0.35 + clamped_power * 0.65, 0.35, 1.0)
	var vertical_speed: float = max_vertical_jump_speed * vertical_factor * jump_multiplier
	return Vector3(clean_dir.x * horizontal_speed, vertical_speed, clean_dir.z * horizontal_speed)


## Вычисляет итоговый урон при приземлении сверху в зависимости от скорости падения.
func calculate_stomp_damage(fall_speed_abs: float) -> int:
	var speed_ratio: float = clampf((fall_speed_abs - min_fall_speed_for_stomp) / 14.0, 0.0, 1.0)
	var bonus: int = roundi(float(max_fall_speed_bonus_damage) * speed_ratio)
	return base_stomp_damage + bonus
