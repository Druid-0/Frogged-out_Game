class_name LanServerAdvertiser
extends Node
## Компонент автоматического обнаружения локальных комнат по Wi-Fi / LAN (UDP Broadcast).
## Отправляет анонс как на широковещательный адрес 255.255.255.255 (для телефонов и ПК в Wi-Fi сети),
## так и на 127.0.0.1 (для теста нескольких окон на одном компьютере).

signal server_discovered(server_ip: String, server_info: Dictionary)
signal server_lost(server_ip: String)

const BROADCAST_PORT: int = 7778
const BROADCAST_INTERVAL_SEC: float = 1.0
const SERVER_TIMEOUT_SEC: float = 3.5

var is_broadcasting: bool = false
var is_listening: bool = false
var host_room_info: Dictionary = {
	"room_name": "Лобби Лягушек",
	"game_port": 7777,
	"players_count": 1,
	"max_players": 8,
	"mode_name": "Каждый за себя",
}

var _broadcaster_udp: PacketPeerUDP
var _listener_udp: PacketPeerUDP
var _broadcast_timer: float = 0.0
var _discovered_servers: Dictionary[String, Dictionary] = {}


func _process(delta: float) -> void:
	if is_broadcasting:
		_broadcast_timer += delta
		if _broadcast_timer >= BROADCAST_INTERVAL_SEC:
			_broadcast_timer = 0.0
			_send_broadcast_packet()

	if is_listening:
		_poll_incoming_packets()
		_prune_stale_servers()


func start_advertising(game_port: int, room_name: String) -> void:
	stop_advertising()
	_broadcaster_udp = PacketPeerUDP.new()
	_broadcaster_udp.set_broadcast_enabled(true)
	host_room_info["game_port"] = game_port
	host_room_info["room_name"] = room_name
	is_broadcasting = true
	_send_broadcast_packet()


func stop_advertising() -> void:
	is_broadcasting = false
	if _broadcaster_udp != null:
		_broadcaster_udp.close()
		_broadcaster_udp = null


func start_listening() -> void:
	stop_listening()
	_listener_udp = PacketPeerUDP.new()
	var err: Error = _listener_udp.bind(BROADCAST_PORT)
	if err == OK:
		is_listening = true


func stop_listening() -> void:
	is_listening = false
	_discovered_servers.clear()
	if _listener_udp != null:
		_listener_udp.close()
		_listener_udp = null


func _send_broadcast_packet() -> void:
	if _broadcaster_udp == null:
		return
	var buffer: PackedByteArray = JSON.stringify(host_room_info).to_utf8_buffer()
	# 1. Широковещательный пакет для всех устройств в Wi-Fi / LAN
	_broadcaster_udp.set_dest_address("255.255.255.255", BROADCAST_PORT)
	_broadcaster_udp.put_packet(buffer)
	# 2. Локальный loopback-пакет для второго окна на этом же устройстве
	_broadcaster_udp.set_dest_address("127.0.0.1", BROADCAST_PORT)
	_broadcaster_udp.put_packet(buffer)


func _poll_incoming_packets() -> void:
	if _listener_udp == null:
		return

	while _listener_udp.get_available_packet_count() > 0:
		var sender_ip: String = _listener_udp.get_packet_ip()
		var raw_bytes: PackedByteArray = _listener_udp.get_packet()
		var text: String = raw_bytes.get_string_from_utf8()
		var parsed: Variant = JSON.parse_string(text)
		if parsed is Dictionary and not sender_ip.is_empty():
			var info := parsed as Dictionary
			info["last_seen_sec"] = Time.get_ticks_msec() / 1000.0
			_discovered_servers[sender_ip] = info
			server_discovered.emit(sender_ip, info)


func _prune_stale_servers() -> void:
	var now_sec: float = Time.get_ticks_msec() / 1000.0
	var expired_ips: Array[String] = []
	for ip: String in _discovered_servers.keys():
		var info: Dictionary = _discovered_servers[ip]
		var last_seen: float = float(info.get("last_seen_sec", now_sec))
		if now_sec - last_seen > SERVER_TIMEOUT_SEC:
			expired_ips.append(ip)

	for ip: String in expired_ips:
		_discovered_servers.erase(ip)
		server_lost.emit(ip)
