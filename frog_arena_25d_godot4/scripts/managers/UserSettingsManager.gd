class_name UserSettingsManager
extends Node
## Настройки пользователя: громкость звуков/музыки и режим прыжка (Godot 4.7).
## В Web-сборке сохраняются в localStorage браузера, на десктопе и мобильных — в user://frog_arena_settings.cfg.

signal control_mode_changed(new_mode: ControlMode)
signal audio_volumes_changed(sfx_volume: float, music_volume: float)

enum ControlMode {
	SLINGSHOT_DRAG,
	HOLD_TO_CHARGE,
}

const STORAGE_KEY: String = "frog_arena_settings"
const CONFIG_PATH: String = "user://frog_arena_settings.cfg"

var current_control_mode: ControlMode = ControlMode.SLINGSHOT_DRAG
var sfx_volume_linear: float = 0.85
var music_volume_linear: float = 0.70


func _ready() -> void:
	_load_settings()
	apply_audio_settings()


func set_control_mode(new_mode: ControlMode) -> void:
	current_control_mode = new_mode
	_save_settings()
	control_mode_changed.emit(new_mode)


func set_volumes(sfx: float, music: float) -> void:
	set_audio_volumes(sfx, music)


func set_audio_volumes(sfx: float, music: float) -> void:
	sfx_volume_linear = clampf(sfx, 0.0, 1.0)
	music_volume_linear = clampf(music, 0.0, 1.0)
	_save_settings()
	apply_audio_settings()
	audio_volumes_changed.emit(sfx_volume_linear, music_volume_linear)


func apply_audio_settings() -> void:
	var master_idx: int = AudioServer.get_bus_index("Master")
	if master_idx != -1:
		AudioServer.set_bus_volume_db(master_idx, linear_to_db(maxf(0.0001, sfx_volume_linear)))
	var sfx_bus_idx: int = AudioServer.get_bus_index("SFX")
	var music_bus_idx: int = AudioServer.get_bus_index("Music")
	if sfx_bus_idx != -1:
		AudioServer.set_bus_volume_db(sfx_bus_idx, linear_to_db(maxf(0.0001, sfx_volume_linear)))
	if music_bus_idx != -1:
		AudioServer.set_bus_volume_db(music_bus_idx, linear_to_db(maxf(0.0001, music_volume_linear)))


func _save_settings() -> void:
	if OS.has_feature("web"):
		var payload := {
			"control_mode": int(current_control_mode),
			"sfx": sfx_volume_linear,
			"music": music_volume_linear,
		}
		var json_str: String = JSON.stringify(payload).replace("'", "")
		JavaScriptBridge.eval("try { localStorage.setItem('%s', '%s'); } catch(e) {}" % [STORAGE_KEY, json_str])
	else:
		var cfg := ConfigFile.new()
		cfg.set_value("controls", "mode", int(current_control_mode))
		cfg.set_value("audio", "sfx", sfx_volume_linear)
		cfg.set_value("audio", "music", music_volume_linear)
		cfg.save(CONFIG_PATH)


func _load_settings() -> void:
	if OS.has_feature("web"):
		var raw: Variant = JavaScriptBridge.eval("try { localStorage.getItem('%s') || ''; } catch(e) { ''; }" % STORAGE_KEY)
		if raw is String and not (raw as String).is_empty():
			var parsed: Variant = JSON.parse_string(raw as String)
			if parsed is Dictionary:
				var dict := parsed as Dictionary
				var mode_int: int = int(dict.get("control_mode", int(ControlMode.SLINGSHOT_DRAG)))
				current_control_mode = ControlMode.HOLD_TO_CHARGE if mode_int == 1 else ControlMode.SLINGSHOT_DRAG
				sfx_volume_linear = clampf(float(dict.get("sfx", 0.85)), 0.0, 1.0)
				music_volume_linear = clampf(float(dict.get("music", 0.70)), 0.0, 1.0)
	else:
		var cfg := ConfigFile.new()
		if cfg.load(CONFIG_PATH) == OK:
			var mode_int: int = int(cfg.get_value("controls", "mode", int(ControlMode.SLINGSHOT_DRAG)))
			current_control_mode = ControlMode.HOLD_TO_CHARGE if mode_int == 1 else ControlMode.SLINGSHOT_DRAG
			sfx_volume_linear = clampf(float(cfg.get_value("audio", "sfx", 0.85)), 0.0, 1.0)
			music_volume_linear = clampf(float(cfg.get_value("audio", "music", 0.70)), 0.0, 1.0)
