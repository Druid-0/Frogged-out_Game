class_name GameRulesManager
extends Node
## Менеджер правил боевого раунда и учета попаданий по врагам (Godot 4.7).

signal damage_dealt(victim_name: String, attacker_name: String, damage_amount: int, remaining_hp: int)
signal player_eliminated(victim_peer_id: int, attacker_peer_id: int)
signal match_won_solo(winner_peer_id: int, winner_name: String)
signal match_won_team(winning_team_id: int)
signal match_draw()

enum MatchMode {
	FREE_FOR_ALL,
	TEAMS,
}

@export var current_mode: MatchMode = MatchMode.FREE_FOR_ALL
@export var teams_count: int = 2
@export var players_container: Node3D

var is_round_active: bool = false


func register_frog(frog: FrogCharacter) -> void:
	if not frog.frog_damaged.is_connected(_on_frog_damaged):
		frog.frog_damaged.connect(_on_frog_damaged)
	if not frog.frog_squashed.is_connected(_on_frog_squashed):
		frog.frog_squashed.connect(_on_frog_squashed)


func start_combat_round() -> void:
	is_round_active = true


func stop_combat_round() -> void:
	is_round_active = false


func _on_frog_damaged(
	victim: FrogCharacter,
	attacker: FrogCharacter,
	damage_amount: int,
	remaining_hp: int
) -> void:
	var attacker_name: String = attacker.player_nickname if attacker != null else "Опасная зона"
	damage_dealt.emit(victim.player_nickname, attacker_name, damage_amount, remaining_hp)


func _on_frog_squashed(victim: FrogCharacter, attacker: FrogCharacter) -> void:
	var attacker_id: int = attacker.player_peer_id if attacker != null else -1
	player_eliminated.emit(victim.player_peer_id, attacker_id)

	if not is_round_active:
		return
	if multiplayer.has_multiplayer_peer() and not multiplayer.is_server():
		return

	_evaluate_victory_conditions()


func _evaluate_victory_conditions() -> void:
	if players_container == null:
		return

	var alive_frogs: Array[FrogCharacter] = []
	var alive_teams: Dictionary[int, bool] = {}

	for child: Node in players_container.get_children():
		if child is FrogCharacter:
			var frog := child as FrogCharacter
			if frog.is_alive:
				alive_frogs.append(frog)
				if frog.team_id >= 0:
					alive_teams[frog.team_id] = true

	if current_mode == MatchMode.FREE_FOR_ALL:
		if alive_frogs.size() == 1:
			is_round_active = false
			var winner: FrogCharacter = alive_frogs[0]
			if multiplayer.has_multiplayer_peer():
				rpc_announce_solo_victory.rpc(winner.player_peer_id, winner.player_nickname)
			else:
				rpc_announce_solo_victory(winner.player_peer_id, winner.player_nickname)
		elif alive_frogs.is_empty():
			is_round_active = false
			if multiplayer.has_multiplayer_peer():
				rpc_announce_draw.rpc()
			else:
				rpc_announce_draw()

	elif current_mode == MatchMode.TEAMS:
		if alive_teams.size() == 1:
			is_round_active = false
			var winning_team: int = alive_teams.keys()[0]
			if multiplayer.has_multiplayer_peer():
				rpc_announce_team_victory.rpc(winning_team)
			else:
				rpc_announce_team_victory(winning_team)
		elif alive_teams.is_empty():
			is_round_active = false
			if multiplayer.has_multiplayer_peer():
				rpc_announce_draw.rpc()
			else:
				rpc_announce_draw()


@rpc("authority", "call_local", "reliable")
func rpc_announce_solo_victory(winner_peer_id: int, winner_name: String) -> void:
	is_round_active = false
	match_won_solo.emit(winner_peer_id, winner_name)


@rpc("authority", "call_local", "reliable")
func rpc_announce_team_victory(winning_team_id: int) -> void:
	is_round_active = false
	match_won_team.emit(winning_team_id)


@rpc("authority", "call_local", "reliable")
func rpc_announce_draw() -> void:
	is_round_active = false
	match_draw.emit()
