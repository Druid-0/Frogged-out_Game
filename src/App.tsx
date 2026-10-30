import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArenaCanvas3D,
  ArenaHudState,
  ParticipantSetup,
} from "./components/ArenaCanvas3D";
import { FrogModelPreview3D } from "./components/FrogModelPreview3D";
import {
  AimIndicatorStyle,
  ControlMode,
  DEFAULT_FROG_CONFIG,
  DEFAULT_HOST_SETTINGS,
  FROG_MODELS_CATALOG,
  FROG_PALETTE,
  HostMatchSettings,
  MAX_TOTAL_BUFF_CHARGES,
  MatchMode,
  NextMapSelectionMode,
  SWAMP_MAPS_CATALOG,
  SwampMapVariant,
  Vec3,
  clamp,
  tallyNextMapVotes,
} from "./game/rules";
import { FROG_CROAK_LIBRARY, soundEngine } from "./game/sound";

type ScreenPhase = "main_menu" | "online_hub" | "waiting_room" | "playing";
type GameSettingsTab = "players" | "map" | "bots";

interface RoomListing {
  id: string;
  name: string;
  players?: number;
  mapVariant?: string;
  nextMapSelectionMode?: string;
  createdAt?: number;
}

const BOT_NAMES = [
  "Квакс Болотный",
  "Жаба-Крушитель",
  "Сэр Прыгун",
  "Лорд Камыш",
  "Тина Торпеда",
  "Барон Кувшинка",
  "Профессор Ква",
];

interface EditableSliderProps {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  formatValue?: (val: number) => string;
  onChange: (nextVal: number) => void;
  testId?: string;
}

/**
 * Ползунок + изменяемое число в древесно-болотном стиле:
 * при нажатии на число открывается поле ручного ввода.
 */
const EditableNumberSlider: React.FC<EditableSliderProps> = ({
  label,
  hint,
  value,
  min,
  max,
  step,
  suffix = "",
  formatValue,
  onChange,
  testId,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(String(value));

  useEffect(() => {
    if (!isEditing) {
      setDraftText(String(Number(value.toFixed(2))));
    }
  }, [value, isEditing]);

  const commitManualValue = () => {
    setIsEditing(false);
    const parsed = parseFloat(draftText.replace(",", "."));
    if (!Number.isNaN(parsed)) {
      onChange(clamp(parsed, min, max));
    } else {
      setDraftText(String(Number(value.toFixed(2))));
    }
  };

  const displayedText = formatValue
    ? formatValue(value)
    : `${Number(value.toFixed(2))}${suffix}`;

  return (
    <div className="uneven-card p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-extrabold uppercase tracking-wider text-lime-200">
            {label}
          </div>
          {hint && <div className="text-[11px] text-lime-100/75">{hint}</div>}
        </div>

        {isEditing ? (
          <input
            type="number"
            step={step}
            min={min}
            max={max}
            autoFocus
            data-testid={testId ? `${testId}-manual-input` : undefined}
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onBlur={commitManualValue}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitManualValue();
              if (e.key === "Escape") setIsEditing(false);
            }}
            className="uneven-input w-24 px-2.5 py-1 text-right text-xs font-black text-amber-300"
          />
        ) : (
          <button
            type="button"
            data-testid={testId ? `${testId}-value-btn` : undefined}
            onClick={() => {
              setDraftText(String(Number(value.toFixed(2))));
              setIsEditing(true);
            }}
            title="Нажмите на число, чтобы ввести значение вручную"
            className="wood-plank px-3 py-1 text-xs font-black text-amber-200 transition hover:scale-105 hover:text-yellow-200"
          >
            {displayedText} ✎
          </button>
        )}
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        data-testid={testId ? `${testId}-slider` : undefined}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mt-2.5 h-2.5 w-full cursor-pointer appearance-none rounded-full bg-[#10200e] accent-lime-400"
      />
      <div className="mt-1 flex justify-between text-[10px] text-lime-200/70">
        <span>
          {min}
          {suffix}
        </span>
        <span>Нажмите на число сверху для ручного ввода</span>
        <span>
          {max}
          {suffix}
        </span>
      </div>
    </div>
  );
};

export function App() {
  const autostartParam = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("autostart") === "1";
  }, []);

  const initialRoomParam = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("room");
  }, []);

  const [phase, setPhase] = useState<ScreenPhase>(
    autostartParam ? "playing" : "main_menu"
  );
  const [isExitedActivity, setIsExitedActivity] = useState<boolean>(false);

  // Личные настройки самой игры (открываются по кнопке «НАСТРОЙКИ» в главном меню)
  const [showPersonalSettingsModal, setShowPersonalSettingsModal] = useState<boolean>(false);
  const [soundMuted, setSoundMuted] = useState<boolean>(false);
  const [sfxVolume, setSfxVolume] = useState<number>(0.85);
  const [bgSoundVolume, setBgSoundVolume] = useState<number>(0.75);
  const [croakOnJumpEnabled, setCroakOnJumpEnabled] = useState<boolean>(true);
  const [jumpBgSoundEnabled, setJumpBgSoundEnabled] = useState<boolean>(true);
  const [selectedCroakId, setSelectedCroakId] = useState<string>("random");

  // Персонаж игрока (никнейм, окрас и 3D-моделька .obj)
  const [nickname, setNickname] = useState<string>("Квакер");
  const [localColorIndex, setLocalColorIndex] = useState<number>(0);
  const [localModelVariant, setLocalModelVariant] = useState<number>(1); // 0: Frog_01.obj, 1: Mesh_Frog.obj + Tex_Frog.png, 2: Frog.obj
  const [localTeamId, setLocalTeamId] = useState<number>(0);

  // Режим и «Настройки игры» (бывшая Панель Хоста, открывается при создании лобби)
  const [matchMode, setMatchMode] = useState<MatchMode>(MatchMode.FREE_FOR_ALL);
  const [controlMode, setControlMode] = useState<ControlMode>(
    ControlMode.SLINGSHOT_DRAG
  );
  // По умолчанию при натягивании отображается классическая Стрелка (можно сменить на Луч в настройках)
  const [aimIndicatorStyle, setAimIndicatorStyle] = useState<AimIndicatorStyle>(
    AimIndicatorStyle.ARROW
  );
  const [hostSettings, setHostSettings] = useState<HostMatchSettings>(
    DEFAULT_HOST_SETTINGS
  );
  const [settingsTab, setSettingsTab] = useState<GameSettingsTab>("players");

  // Онлайн-подключение и комнаты
  const [rooms, setRooms] = useState<RoomListing[]>([]);
  const [roomNameInput, setRoomNameInput] = useState<string>("Древесное Болото #1");
  const [directConnectCode, setDirectConnectCode] = useState<string>(initialRoomParam || "");
  const [activeRoom, setActiveRoom] = useState<RoomListing | null>(null);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [onlineStatusText, setOnlineStatusText] = useState<string>("Готов к подключению");
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [isCreatingRoom, setIsCreatingRoom] = useState<boolean>(false);
  const [copiedInvite, setCopiedInvite] = useState<boolean>(false);

  // Голосование / выбор следующей карты при окончании раунда
  const [mapVotes, setMapVotes] = useState< Record<string, SwampMapVariant> >({});
  const [selectedNextMapByHost, setSelectedNextMapByHost] = useState<SwampMapVariant>(
    DEFAULT_HOST_SETTINGS.mapVariant
  );
  const [manualRoundEndBanner, setManualRoundEndBanner] = useState<string | null>(null);

  const [participants, setParticipants] = useState<ParticipantSetup[]>(() => [
    {
      peerId: 1,
      nickname: "Квакер",
      colorIndex: 0,
      modelVariant: 1,
      teamId: -1,
      isBot: false,
    },
    {
      peerId: 501,
      nickname: "Квакс Болотный",
      colorIndex: 2,
      modelVariant: 0,
      teamId: -1,
      isBot: true,
    },
    {
      peerId: 502,
      nickname: "Жаба-Крушитель",
      colorIndex: 3,
      modelVariant: 2,
      teamId: -1,
      isBot: true,
    },
    {
      peerId: 503,
      nickname: "Сэр Прыгун",
      colorIndex: 4,
      modelVariant: 1,
      teamId: -1,
      isBot: true,
    },
  ]);

  const [matchSeed, setMatchSeed] = useState<number>(1);
  const [hud, setHud] = useState<ArenaHudState>({
    localHp: DEFAULT_FROG_CONFIG.maxHealth,
    localMaxHp: DEFAULT_FROG_CONFIG.maxHealth,
    localBuffStacks: [],
    localInWater: false,
    aliveCount: 4,
    totalCount: 4,
    zoneShrinking: false,
    zoneRadius: 10.6,
    matchElapsedSec: 0,
    frogs: [],
    statusBanner: null,
    winnerBanner: null,
    aimingPower: 0,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const [localPeerId, setLocalPeerId] = useState<number>(1);
  const localPeerIdRef = useRef<number>(1);
  localPeerIdRef.current = localPeerId;
  const remoteJumpQueueRef = useRef<
    Array<{ peerId: number; dir: Vec3; power: number; pos?: Vec3 }>
  >([]);

  const activeWinnerBanner = hud.winnerBanner || manualRoundEndBanner;

  // Синхронизируем dataset.state на body для проверок состояния
  useEffect(() => {
    if (phase === "playing") {
      document.body.dataset.state = activeWinnerBanner ? "gameover" : "playing";
    } else {
      document.body.dataset.state = "title";
    }
  }, [phase, activeWinnerBanner]);

  // Предзагрузка библиотеки звуков кваканья при старте
  useEffect(() => {
    soundEngine.unlock();
  }, []);

  // Синхронизация звуковых настроек
  useEffect(() => {
    soundEngine.setMuted(soundMuted);
    soundEngine.setSfxVolume(sfxVolume);
    soundEngine.setMusicVolume(bgSoundVolume);
    soundEngine.croakOnJumpEnabled = croakOnJumpEnabled;
    soundEngine.jumpBackgroundSfxEnabled = jumpBgSoundEnabled;
    soundEngine.selectedCroakId = selectedCroakId;
  }, [
    soundMuted,
    sfxVolume,
    bgSoundVolume,
    croakOnJumpEnabled,
    jumpBgSoundEnabled,
    selectedCroakId,
  ]);

  const refreshRooms = useCallback(async () => {
    try {
      const res = await fetch("/api/rooms");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        setRooms(data);
      }
    } catch {
      // Локальный режим при недоступности шлюза
    }
  }, []);

  useEffect(() => {
    refreshRooms();
    const id = window.setInterval(refreshRooms, 4000);
    return () => window.clearInterval(id);
  }, [refreshRooms]);

  // Синхронизируем локального игрока (никнейм, цвет, 3D-моделька, команда)
  useEffect(() => {
    setParticipants((prev) =>
      prev.map((p) =>
        p.peerId === localPeerId
          ? {
              ...p,
              nickname: nickname.trim() || "Квакер",
              colorIndex: localColorIndex,
              modelVariant: localModelVariant,
              teamId: matchMode === MatchMode.TEAMS ? localTeamId : -1,
            }
          : {
              ...p,
              teamId:
                matchMode === MatchMode.TEAMS
                  ? p.teamId < 0
                    ? p.peerId % 2
                    : p.teamId
                  : -1,
            }
      )
    );

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "join_room",
          peerId: localPeerId,
          nickname: nickname.trim() || "Квакер",
          colorIndex: localColorIndex,
          modelVariant: localModelVariant,
          teamId: matchMode === MatchMode.TEAMS ? localTeamId : -1,
        })
      );
    }
  }, [nickname, localColorIndex, localModelVariant, localTeamId, matchMode, localPeerId]);

  // При смене карты в настройках игры синхронизируем выбранную следующую карту
  useEffect(() => {
    setSelectedNextMapByHost(hostSettings.mapVariant);
  }, [hostSettings.mapVariant]);

  const disconnectWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setWsConnected(false);
    setOnlineStatusText("Отключен от сервера");
  }, []);

  const connectRoomWebSocket = useCallback(
    (room: RoomListing, customWsEndpoint?: string) => {
      disconnectWebSocket();
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl =
        customWsEndpoint && customWsEndpoint.startsWith("ws")
          ? customWsEndpoint
          : `${proto}//${window.location.host}/ws/room/${encodeURIComponent(room.id)}`;

      setOnlineStatusText(`Подключение к ${room.name}...`);
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setWsConnected(true);
          setOnlineStatusText(`Онлайн: подключено к «${room.name}» (${room.id})`);
          ws.send(
            JSON.stringify({
              type: "join_room",
              peerId: localPeerId,
              nickname: nickname.trim() || "Квакер",
              colorIndex: localColorIndex,
              modelVariant: localModelVariant,
              teamId: matchMode === MatchMode.TEAMS ? localTeamId : -1,
            })
          );
        };

        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(String(ev.data));
            if (msg.type === "welcome" && typeof msg.peerId === "number") {
              const assignedId = msg.peerId;
              setLocalPeerId(assignedId);
              localPeerIdRef.current = assignedId;
              setParticipants((prev) =>
                prev.map((p, idx) =>
                  idx === 0 || !p.isBot
                    ? { ...p, peerId: assignedId }
                    : p
                )
              );
              ws.send(
                JSON.stringify({
                  type: "join_room",
                  peerId: assignedId,
                  nickname: nickname.trim() || `Квакер #${assignedId}`,
                  colorIndex: localColorIndex,
                  modelVariant: localModelVariant,
                  teamId: matchMode === MatchMode.TEAMS ? localTeamId : -1,
                })
              );
              return;
            }
            if (msg.type === "player_jump" && typeof msg.peerId === "number" && msg.dir) {
              if (msg.peerId !== localPeerIdRef.current) {
                remoteJumpQueueRef.current.push({
                  peerId: msg.peerId,
                  dir: msg.dir,
                  power: Number(msg.power ?? 0.75),
                  pos: msg.pos,
                });
              }
              return;
            }
            if (msg.type === "start_match") {
              if (msg.hostSettings) {
                setHostSettings((s) => ({ ...s, ...msg.hostSettings }));
              } else if (msg.mapVariant) {
                setHostSettings((s) => ({
                  ...s,
                  mapVariant: msg.mapVariant as SwampMapVariant,
                }));
              }
              if (typeof msg.matchMode === "number") {
                setMatchMode(msg.matchMode as MatchMode);
              }
              if (Array.isArray(msg.participants) && msg.participants.length > 0) {
                setParticipants(msg.participants);
              }
              setMapVotes({});
              setManualRoundEndBanner(null);
              setMatchSeed((s) => (typeof msg.matchSeed === "number" ? msg.matchSeed : s + 1));
              setPhase("playing");
            } else if (msg.type === "map_votes_updated" && msg.votes) {
              setMapVotes(msg.votes);
            } else if (msg.type === "next_map_selected" && msg.mapVariant) {
              const nextVariant = msg.mapVariant as SwampMapVariant;
              setSelectedNextMapByHost(nextVariant);
              setHostSettings((s) => ({ ...s, mapVariant: nextVariant }));
            } else if (msg.type === "room_state") {
              const activeMyPeerId = localPeerIdRef.current;
              if (msg.votes) {
                setMapVotes(msg.votes);
              }
              if (Array.isArray(msg.participants) && msg.participants.length > 0) {
                setParticipants((prev) => {
                  const bots = prev.filter((p) => p.isBot);
                  const remoteHumans: ParticipantSetup[] = msg.participants
                    .filter((rp: { peerId: number }) => rp.peerId !== activeMyPeerId)
                    .map(
                      (rp: {
                        peerId: number;
                        nickname: string;
                        colorIndex: number;
                        modelVariant?: number;
                        teamId?: number;
                      }) => ({
                        peerId: rp.peerId,
                        nickname: rp.nickname || "Игрок",
                        colorIndex: rp.colorIndex ?? 1,
                        modelVariant: rp.modelVariant ?? 1,
                        teamId: rp.teamId ?? -1,
                        isBot: false,
                      })
                    );
                  const me = prev.find((p) => p.peerId === activeMyPeerId) || {
                    peerId: activeMyPeerId,
                    nickname: nickname.trim() || "Квакер",
                    colorIndex: localColorIndex,
                    modelVariant: localModelVariant,
                    teamId: matchMode === MatchMode.TEAMS ? localTeamId : -1,
                    isBot: false,
                  };
                  return [me, ...remoteHumans, ...bots].slice(0, 8);
                });
              }
            }
          } catch {
            // Сетевой пакет синхронизации
          }
        };

        ws.onclose = () => {
          setWsConnected(false);
          setOnlineStatusText("Соединение с комнатой закрыто");
        };
      } catch {
        setWsConnected(false);
        setOnlineStatusText("Локальный режим комнаты");
      }
    },
    [
      disconnectWebSocket,
      localPeerId,
      nickname,
      localColorIndex,
      localModelVariant,
      matchMode,
      localTeamId,
    ]
  );

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Если в URL передан ?room=..., сразу переходим в онлайн-хаб и подставляем код комнаты
  useEffect(() => {
    if (initialRoomParam && phase === "main_menu" && !autostartParam) {
      setDirectConnectCode(initialRoomParam);
      setPhase("online_hub");
    }
  }, [initialRoomParam, phase, autostartParam]);

  // При создании лобби открываются «Настройки игры» (бывшая Панель Хоста)
  const handleCreateRoomAndOpenSettings = async () => {
    soundEngine.unlock();
    soundEngine.playLibraryCroak(0.8);
    setIsCreatingRoom(true);
    setLobbyError(null);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: roomNameInput.trim() || "Древесное Болото",
          mapVariant: hostSettings.mapVariant,
          nextMapSelectionMode: hostSettings.nextMapSelectionMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLobbyError(data?.error || "Не удалось создать лобби");
      } else {
        setActiveRoom(data);
        connectRoomWebSocket(data);
        setSettingsTab("players");
        setPhase("waiting_room");
        await refreshRooms();
      }
    } catch {
      const fallbackRoom: RoomListing = {
        id: `swamp-${Date.now().toString(36)}`,
        name: roomNameInput.trim() || "Древесное Болото",
        players: 1,
        mapVariant: hostSettings.mapVariant,
      };
      setActiveRoom(fallbackRoom);
      setSettingsTab("players");
      setPhase("waiting_room");
    } finally {
      setIsCreatingRoom(false);
    }
  };

  const handleJoinRoom = (room: RoomListing) => {
    soundEngine.unlock();
    soundEngine.playLibraryCroak(0.75);
    setActiveRoom(room);
    connectRoomWebSocket(room);
    setSettingsTab("players");
    setPhase("waiting_room");
  };

  const handleDirectConnect = () => {
    soundEngine.unlock();
    const raw = directConnectCode.trim();
    if (!raw) {
      setLobbyError("Введите код комнаты или ws:// адрес сервера");
      return;
    }
    setLobbyError(null);
    if (raw.startsWith("ws://") || raw.startsWith("wss://")) {
      const customRoom: RoomListing = {
        id: "direct-ws",
        name: `Сервер ${raw.replace(/^wss?:\/\//, "").slice(0, 22)}`,
        players: 1,
      };
      setActiveRoom(customRoom);
      connectRoomWebSocket(customRoom, raw);
      setPhase("waiting_room");
      return;
    }

    const existing = rooms.find(
      (r) => r.id.toLowerCase() === raw.toLowerCase() || r.name.toLowerCase() === raw.toLowerCase()
    );
    const targetRoom: RoomListing = existing || {
      id: raw,
      name: `Болото #${raw.slice(0, 8)}`,
      players: 1,
    };
    setActiveRoom(targetRoom);
    connectRoomWebSocket(targetRoom);
    setPhase("waiting_room");
  };

  const handleCopyInviteLink = () => {
    const roomId = activeRoom?.id || "swamp-room";
    const url = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(
      roomId
    )}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).catch(() => {});
    }
    setCopiedInvite(true);
    window.setTimeout(() => setCopiedInvite(false), 2200);
  };

  const handleAddBot = () => {
    setParticipants((prev) => {
      if (prev.length >= 8) return prev;
      const botIndex = prev.filter((p) => p.isBot).length;
      const nextPeerId = 501 + botIndex + Math.floor(Math.random() * 90);
      const colorIdx = (prev.length + 1) % FROG_PALETTE.length;
      const modelVar = (prev.length + 1) % FROG_MODELS_CATALOG.length;
      return [
        ...prev,
        {
          peerId: nextPeerId,
          nickname: BOT_NAMES[botIndex % BOT_NAMES.length],
          colorIndex: colorIdx,
          modelVariant: modelVar,
          teamId: matchMode === MatchMode.TEAMS ? prev.length % 2 : -1,
          isBot: true,
        },
      ];
    });
  };

  const handleRemoveBot = () => {
    setParticipants((prev) => {
      const lastBotIdx = [...prev].reverse().findIndex((p) => p.isBot);
      if (lastBotIdx === -1) return prev;
      const removeAt = prev.length - 1 - lastBotIdx;
      return prev.filter((_, idx) => idx !== removeAt);
    });
  };

  const handleLocalJumpBroadcast = useCallback(
    (dir: Vec3, power: number, pos: Vec3) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "player_jump",
            peerId: localPeerIdRef.current,
            dir,
            power,
            pos,
          })
        );
      }
    },
    []
  );

  const handleStartMatchFromLobby = () => {
    soundEngine.unlock();
    soundEngine.playLibraryCroak(0.95);
    setMapVotes({});
    setManualRoundEndBanner(null);
    const nextSeed = matchSeed + 1;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "start_match",
          mapVariant: hostSettings.mapVariant,
          hostSettings,
          matchMode,
          participants,
          matchSeed: nextSeed,
        })
      );
    }
    setMatchSeed(nextSeed);
    setPhase("playing");
  };

  // Кнопка «ВЫЙТИ» — выходит из текущей активности / отключается от сервера
  const handleExitActivityOrServer = () => {
    soundEngine.unlock();
    disconnectWebSocket();
    setActiveRoom(null);
    setMapVotes({});
    if (phase !== "main_menu") {
      setPhase("main_menu");
      setIsExitedActivity(false);
      refreshRooms();
    } else {
      setIsExitedActivity(true);
    }
  };

  // Голосование живых игроков за следующую карту при окончании раунда
  const handleCastMapVote = (variant: SwampMapVariant) => {
    soundEngine.unlock();
    soundEngine.playLibraryCroak(0.7);

    // Голосует локальный игрок + живые лягушки в раунде выражают предпочтение
    setMapVotes((prev) => {
      const next: Record<string, SwampMapVariant> = {
        ...prev,
        [String(localPeerId)]: variant,
      };
      // Если есть другие выжившие боты/игроки и они еще не голосовали — распределяем их голоса
      const aliveOtherFrogs = hud.frogs.filter(
        (f) => f.isAlive && f.peerId !== localPeerId
      );
      aliveOtherFrogs.forEach((f, idx) => {
        const key = String(f.peerId);
        if (!next[key]) {
          const allVariants = SWAMP_MAPS_CATALOG.map((m) => m.id);
          next[key] = allVariants[(idx + 1) % allVariants.length];
        }
      });
      return next;
    });

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "cast_map_vote",
          peerId: localPeerId,
          mapVariant: variant,
        })
      );
    }
  };

  // Выбор следующей карты Хостом
  const handleHostPickNextMap = (variant: SwampMapVariant) => {
    soundEngine.unlock();
    soundEngine.playLibraryCroak(0.75);
    setSelectedNextMapByHost(variant);
    setHostSettings((s) => ({ ...s, mapVariant: variant }));

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "select_next_map",
          mapVariant: variant,
        })
      );
    }
  };

  // Запуск следующего раунда на выбранной / победившей в голосовании карте
  const handleStartNextRoundWithSelectedMap = () => {
    soundEngine.unlock();
    soundEngine.playLibraryCroak(0.95);

    let nextVariant = selectedNextMapByHost;
    if (hostSettings.nextMapSelectionMode === NextMapSelectionMode.PLAYERS_VOTE) {
      const tally = tallyNextMapVotes(mapVotes, hostSettings.mapVariant);
      nextVariant = tally.winnerMap;
    }

    setHostSettings((s) => ({ ...s, mapVariant: nextVariant }));
    setMapVotes({});
    setManualRoundEndBanner(null);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "start_match",
          mapVariant: nextVariant,
        })
      );
    }
    setMatchSeed((s) => s + 1);
  };

  const voteTally = useMemo(
    () => tallyNextMapVotes(mapVotes, hostSettings.mapVariant),
    [mapVotes, hostSettings.mapVariant]
  );

  const currentMapMeta = useMemo(
    () =>
      SWAMP_MAPS_CATALOG.find((m) => m.id === hostSettings.mapVariant) ||
      SWAMP_MAPS_CATALOG[0],
    [hostSettings.mapVariant]
  );

  const totalLocalBuffCharges = hud.localBuffStacks.reduce(
    (sum, s) => sum + s.charges,
    0
  );

  // Модальное окно личных настроек игры (Звук / Музыка / Кваканье / Прицел)
  const renderPersonalSettingsModal = () => {
    if (!showPersonalSettingsModal) return null;
    return (
      <div
        data-testid="personal-settings-modal"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      >
        <div className="wood-panel relative w-full max-w-2xl p-5 text-lime-50">
          <div className="flex items-center justify-between border-b-2 border-[#271509] pb-2.5">
            <div>
              <div className="text-xs font-black uppercase tracking-widest text-lime-300">
                Параметры самой игры
              </div>
              <h2 className="stroke-wood text-2xl font-black text-amber-200">
                НАСТРОЙКИ ЗВУКА И МУЗЫКИ
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setShowPersonalSettingsModal(false)}
              className="round-btn round-btn-danger px-4 py-1.5 text-xs font-black"
            >
              ЗАКРЫТЬ ✕
            </button>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <EditableNumberSlider
              label="Громкость эффектов и кваканья (SFX)"
              hint="Кваканье из библиотеки, удары и всплески"
              value={Math.round(sfxVolume * 100)}
              min={0}
              max={100}
              step={5}
              suffix="%"
              testId="sfx-volume"
              onChange={(v) => setSfxVolume(v / 100)}
            />

            <EditableNumberSlider
              label="Фоновые звуки болота и прыжка (Музыка)"
              hint="Шелест камышей, ветер и всплеск тины"
              value={Math.round(bgSoundVolume * 100)}
              min={0}
              max={100}
              step={5}
              suffix="%"
              testId="bg-volume"
              onChange={(v) => setBgSoundVolume(v / 100)}
            />

            <div className="uneven-card p-3 sm:col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-black uppercase tracking-wider text-lime-200">
                    Звук кваканья из библиотеки при прыжке (/media/frog-sounds/)
                  </div>
                  <div className="text-[11px] text-lime-100/75">
                    Выберите любимый голос жабы или случайное живое кваканье
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCroakOnJumpEnabled((v) => !v)}
                  className={`round-btn px-4 py-1 text-xs font-black ${
                    croakOnJumpEnabled ? "round-btn-moss" : "round-btn-bark"
                  }`}
                >
                  {croakOnJumpEnabled ? "ВКЛ" : "ВЫКЛ"}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedCroakId}
                  onChange={(e) => setSelectedCroakId(e.target.value)}
                  className="uneven-input flex-1 px-3 py-1.5 text-xs font-bold"
                >
                  <option value="random">🎲 Случайное живое кваканье из библиотеки</option>
                  {FROG_CROAK_LIBRARY.map((item) => (
                    <option key={item.id} value={item.id}>
                      🐸 {item.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.unlock();
                    soundEngine.playLibraryCroak(0.9, selectedCroakId);
                  }}
                  className="round-btn round-btn-moss px-4 py-1.5 text-xs font-black"
                >
                  ПРОВЕРИТЬ КВАК! 🐸
                </button>
              </div>
            </div>

            <div className="uneven-card flex items-center justify-between p-3">
              <div>
                <div className="text-xs font-black uppercase text-lime-200">
                  Общий звук болота
                </div>
                <div className="text-[11px] text-lime-100/75">
                  Быстрое отключение звука
                </div>
              </div>
              <button
                type="button"
                data-testid="toggle-mute-btn"
                onClick={() => setSoundMuted((m) => !m)}
                className={`round-btn px-4 py-1.5 text-xs font-black ${
                  soundMuted ? "round-btn-danger" : "round-btn-moss"
                }`}
              >
                {soundMuted ? "ВЫКЛ 🔇" : "ВКЛ 🔊"}
              </button>
            </div>

            <div className="uneven-card flex items-center justify-between p-3">
              <div>
                <div className="text-xs font-black uppercase text-lime-200">
                  Фоновые звуки при прыжке
                </div>
                <div className="text-[11px] text-lime-100/75">
                  Шуршание листвы и отрыв от кочки
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = !jumpBgSoundEnabled;
                  setJumpBgSoundEnabled(next);
                  if (next) {
                    soundEngine.unlock();
                    soundEngine.playJumpBackgroundAmbience(0.85, false);
                  }
                }}
                className={`round-btn px-4 py-1.5 text-xs font-black ${
                  jumpBgSoundEnabled ? "round-btn-moss" : "round-btn-bark"
                }`}
              >
                {jumpBgSoundEnabled ? "ВКЛ 🌿" : "ВЫКЛ"}
              </button>
            </div>

            <div className="uneven-card flex items-center justify-between p-3">
              <div>
                <div className="text-xs font-black uppercase text-lime-200">
                  Вид прицела при натягивании
                </div>
                <div className="text-[11px] text-lime-100/75">
                  Стрелка направления (как было раньше) или луч из точек
                </div>
              </div>
              <button
                type="button"
                data-testid="toggle-aim-indicator-btn"
                onClick={() =>
                  setAimIndicatorStyle((style) =>
                    style === AimIndicatorStyle.ARROW
                      ? AimIndicatorStyle.TRAJECTORY_RAY
                      : AimIndicatorStyle.ARROW
                  )
                }
                className="round-btn round-btn-moss px-4 py-1.5 text-xs font-black"
              >
                {aimIndicatorStyle === AimIndicatorStyle.ARROW
                  ? "🏹 Стрелка (по умолч.)"
                  : "✨ Луч траектории"}
              </button>
            </div>

            <div className="uneven-card flex items-center justify-between p-3">
              <div>
                <div className="text-xs font-black uppercase text-lime-200">
                  Режим прицеливания прыжком
                </div>
                <div className="text-[11px] text-lime-100/75">
                  Мышь: тяни рогатку или удерживай заряд • Клавиатура: WASD + Пробел
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setControlMode((m) =>
                    m === ControlMode.SLINGSHOT_DRAG
                      ? ControlMode.HOLD_TO_CHARGE
                      : ControlMode.SLINGSHOT_DRAG
                  )
                }
                className="round-btn round-btn-bark px-4 py-1.5 text-xs font-black"
              >
                {controlMode === ControlMode.SLINGSHOT_DRAG
                  ? "Рогатка (тяни назад)"
                  : "Заряд удержанием"}
              </button>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => setShowPersonalSettingsModal(false)}
              className="round-btn round-btn-moss px-7 py-2 text-sm font-black"
            >
              ГОТОВО — СОХРАНИТЬ!
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ==================== ЭКРАН 4: ИГРОВАЯ АРЕНА (3D БОЛОТО + ДРЕВЕСНЫЙ HUD + ВЫБОР СЛЕДУЮЩЕЙ КАРТЫ) ====================
  if (phase === "playing") {
    const hpPercent = clamp(
      (hud.localHp / Math.max(1, hud.localMaxHp)) * 100,
      0,
      100
    );

    return (
      <div className="relative h-screen w-screen overflow-hidden bg-[#0e1f11] select-none">
        <ArenaCanvas3D
          participants={participants}
          localPeerId={localPeerId}
          matchMode={matchMode}
          controlMode={controlMode}
          aimIndicatorStyle={aimIndicatorStyle}
          hostSettings={hostSettings}
          soundMuted={soundMuted}
          onHudUpdate={setHud}
          onLocalJump={handleLocalJumpBroadcast}
          remoteJumpQueueRef={remoteJumpQueueRef}
          matchSeed={matchSeed}
        />

        {/* Верхняя левая древесно-мшистая панель HUD */}
        <div className="pointer-events-none absolute top-3 left-3 z-20 flex flex-col gap-2">
          <div className="wood-panel w-76 p-3.5">
            <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-lime-200">
              <span className="flex items-center gap-1.5">
                🐸 {nickname || "Квакер"}
              </span>
              <span className="tabular-nums text-amber-200">
                HP: {hud.localHp} / {hud.localMaxHp}
              </span>
            </div>

            <div className="mt-1.5 h-3.5 w-full overflow-hidden rounded-full border-2 border-[#1f1106] bg-[#132211] p-0.5">
              <div
                className="h-full rounded-full transition-all duration-150"
                style={{
                  width: `${hpPercent}%`,
                  backgroundColor:
                    hpPercent > 50
                      ? "#65a30d"
                      : hpPercent > 25
                      ? "#eab308"
                      : "#dc2626",
                }}
              />
            </div>

            {hud.localInWater && (
              <div className="mt-2 rounded-xl border-2 border-amber-400 bg-[#521c13] px-2.5 py-1 text-[11px] font-black text-amber-200">
                🌊 В БОЛОТНОЙ ТРЯСИНЕ: -{hostSettings.waterDamagePerSec} HP/сек! Прыгай на кочку или кувшинку!
              </div>
            )}

            <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-lime-100/90">
              <span>
                Баффы ({totalLocalBuffCharges}/{MAX_TOTAL_BUFF_CHARGES}):
              </span>
              <span className="text-lime-300 font-black">
                В живых: {hud.aliveCount}/{hud.totalCount}
              </span>
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {hud.localBuffStacks.length === 0 ? (
                <span className="text-[11px] text-lime-200/70">
                  Подбирайте полую кору, крылья стрекозы и пружины!
                </span>
              ) : (
                hud.localBuffStacks.map((buff) => (
                  <div
                    key={buff.id}
                    className="wood-plank flex items-center gap-1.5 px-2.5 py-1 text-xs font-black text-amber-200"
                  >
                    <span
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-slate-950 font-black"
                      style={{ backgroundColor: buff.colorHex }}
                    >
                      {buff.charges}
                    </span>
                    <span>{buff.shortTag}</span>
                    <span className="text-[10px] text-lime-300">
                      x{buff.charges}/{buff.maxCharges}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="mt-2 flex items-center justify-between border-t-2 border-[#271509] pt-1.5 text-[11px] font-bold">
              <span
                className={
                  hud.zoneShrinking ? "font-black text-rose-300" : "text-lime-200/80"
                }
              >
                {!hostSettings.floodEnabled
                  ? "🌿 Потоп отключён хостом"
                  : hud.zoneShrinking
                  ? hud.floodRaining
                    ? `🌧️ ДОЖДЬ И ПОТОП (уровень ${(hud.floodWaterLevel ?? 0).toFixed(2)}м)`
                    : `🌊 ИДЁТ ПРИЛИВ (уровень ${(hud.floodWaterLevel ?? 0).toFixed(2)}м)`
                  : currentMapMeta.hasInitialWater
                  ? `🌊 До прилива из воды: ${Math.max(
                      0,
                      Math.ceil(
                        hud.floodCountdownSec ??
                          hostSettings.floodStartDelaySec - hud.matchElapsedSec
                      )
                    )}с`
                  : `🌧️ До дождя и потопа: ${Math.max(
                      0,
                      Math.ceil(
                        hud.floodCountdownSec ??
                          hostSettings.floodStartDelaySec - hud.matchElapsedSec
                      )
                    )}с`}
              </span>
              <span className="text-amber-200 font-black">{currentMapMeta.title}</span>
            </div>
          </div>

          {hud.aimingPower > 0.05 && (
            <div className="moss-panel w-76 px-3.5 py-2">
              <div className="flex justify-between text-xs font-black text-amber-200">
                <span>НАТЯЖЕНИЕ ПРЫЖКА</span>
                <span className="tabular-nums">{Math.round(hud.aimingPower * 100)}%</span>
              </div>
              <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full border border-[#1f1106] bg-[#0e1d0d]">
                <div
                  className="h-full bg-gradient-to-r from-lime-400 via-amber-400 to-rose-500"
                  style={{ width: `${Math.round(hud.aimingPower * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Верхние правые живые древесные кнопки (.round-btn 60%) */}
        <div className="absolute top-3 right-3 z-20 flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="finish-round-map-select-btn"
            onClick={() => {
              soundEngine.unlock();
              soundEngine.playVictory();
              setManualRoundEndBanner(`ПОБЕДИТЕЛЬ РАУНДА: ${nickname || "Квакер"}!`);
            }}
            className="round-btn round-btn-moss px-4 py-2 text-xs font-black"
          >
            🗺️ Выбор следующей карты
          </button>

          <button
            type="button"
            onClick={() => setShowPersonalSettingsModal(true)}
            className="round-btn round-btn-bark px-4 py-2 text-xs font-black"
          >
            ⚙️ НАСТРОЙКИ
          </button>

          <button
            type="button"
            onClick={() => setPhase("waiting_room")}
            className="round-btn round-btn-moss px-4 py-2 text-xs font-black"
          >
            🪵 Настройки игры
          </button>

          <button
            type="button"
            data-testid="hud-exit-btn"
            onClick={handleExitActivityOrServer}
            className="round-btn round-btn-danger px-4 py-2 text-xs font-black"
          >
            🚪 ВЫЙТИ
          </button>
        </div>

        {/* Центральная деревянная табличка события */}
        {hud.statusBanner && !activeWinnerBanner && (
          <div className="pointer-events-none absolute top-16 left-1/2 z-20 -translate-x-1/2 wood-plank px-5 py-1.5 text-xs font-black tracking-wide text-amber-200">
            🐸 {hud.statusBanner}
          </div>
        )}

        {/* МОДАЛЬНОЕ ОКНО ОКОНЧАНИЯ РАУНДА + ВЫБОР СЛЕДУЮЩЕЙ КАРТЫ (ХОСТОМ ИЛИ ЖИВЫМИ ИГРОКАМИ) */}
        {activeWinnerBanner && (
          <div
            data-testid="round-end-modal"
            className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 p-4"
          >
            <div className="wood-panel w-full max-w-2xl p-6 text-center">
              <div className="text-xs font-black uppercase tracking-widest text-lime-300">
                Раунд на болоте завершён!
              </div>
              <h2 className="stroke-wood mt-1 text-3xl font-black text-amber-300">
                {activeWinnerBanner}
              </h2>

              {/* Блок выбора следующей карты */}
              <div className="moss-panel mt-4 p-4 text-left">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-lime-500/30 pb-2.5">
                  <div>
                    <div className="text-sm font-black uppercase tracking-wider text-lime-200">
                      🗺️ Выбор следующей карты для следующего раунда
                    </div>
                    <div className="text-xs text-lime-100/80">
                      {hostSettings.nextMapSelectionMode === NextMapSelectionMode.HOST_ONLY
                        ? "Режим из «Настроек игры»: карту выбирает Хост лобби"
                        : "Режим из «Настроек игры»: голосование живых игроков!"}
                    </div>
                  </div>

                  <span className="wood-plank px-3 py-1 text-xs font-black text-amber-200">
                    {hostSettings.nextMapSelectionMode === NextMapSelectionMode.HOST_ONLY
                      ? "👑 Выбор Хоста"
                      : `🗳️ Голосов: ${voteTally.totalVotes}`}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {SWAMP_MAPS_CATALOG.map((mapItem) => {
                    const isHostMode =
                      hostSettings.nextMapSelectionMode === NextMapSelectionMode.HOST_ONLY;
                    const votesForMap = voteTally.counts[mapItem.id] ?? 0;
                    const isSelected = isHostMode
                      ? selectedNextMapByHost === mapItem.id
                      : voteTally.winnerMap === mapItem.id;
                    const myVote = mapVotes[String(localPeerId)] === mapItem.id;

                    return (
                      <button
                        key={mapItem.id}
                        type="button"
                        data-testid={`end-map-card-${mapItem.id}`}
                        onClick={() =>
                          isHostMode
                            ? handleHostPickNextMap(mapItem.id)
                            : handleCastMapVote(mapItem.id)
                        }
                        className={`uneven-card flex flex-col justify-between p-3 text-left transition ${
                          isSelected
                            ? "border-lime-400 ring-2 ring-lime-300 bg-[#23451e]"
                            : "opacity-90 hover:opacity-100"
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className="text-sm font-black"
                              style={{ color: mapItem.badgeColor }}
                            >
                              {mapItem.title}
                            </span>
                            {isHostMode ? (
                              isSelected && (
                                <span className="rounded-full bg-lime-400 px-2 py-0.5 text-[10px] font-black text-slate-950">
                                  ВЫБРАНА ХОСТОМ
                                </span>
                              )
                            ) : (
                              <span className="rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-black text-slate-950">
                                Голосов: {votesForMap}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 text-[11px] font-bold text-lime-200/85">
                            {mapItem.subtitle}
                          </div>
                          <p className="mt-1 text-[11px] text-lime-100/70">
                            {mapItem.description}
                          </p>
                        </div>

                        {!isHostMode && (
                          <div className="mt-2 flex items-center justify-between border-t border-lime-500/20 pt-1.5 text-[11px] font-black">
                            <span className="text-lime-300">
                              {myVote ? "✓ Ваш голос учтён!" : "Нажмите, чтобы голосовать"}
                            </span>
                            {isSelected && voteTally.totalVotes > 0 && (
                              <span className="text-amber-300">🏆 Лидер!</span>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  data-testid="next-round-btn"
                  onClick={handleStartNextRoundWithSelectedMap}
                  className="round-btn round-btn-moss px-7 py-3 text-sm font-black"
                >
                  🐸 СЛЕДУЮЩИЙ РАУНД НА КАРТЕ «
                  {
                    (
                      SWAMP_MAPS_CATALOG.find(
                        (m) =>
                          m.id ===
                          (hostSettings.nextMapSelectionMode ===
                          NextMapSelectionMode.HOST_ONLY
                            ? selectedNextMapByHost
                            : voteTally.winnerMap)
                      ) || SWAMP_MAPS_CATALOG[0]
                    ).title
                  }
                  »!
                </button>

                <button
                  type="button"
                  onClick={() => setPhase("waiting_room")}
                  className="round-btn round-btn-bark px-5 py-3 text-sm font-black"
                >
                  🪵 В «Настройки игры»
                </button>

                <button
                  type="button"
                  onClick={handleExitActivityOrServer}
                  className="round-btn round-btn-danger px-5 py-3 text-sm font-black"
                >
                  🚪 ВЫЙТИ
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Нижняя деревянная подсказка */}
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 wood-plank px-5 py-1.5 text-[11px] font-bold text-lime-100">
          Тяните ЛКМ назад как рогатку (или WASD + Пробел) • При прыжке звучит кваканье и шорох камыша • Кувшинка тонет при 2+ лягушках!
        </div>

        {renderPersonalSettingsModal()}
      </div>
    );
  }

  // ==================== ЭКРАН 3: ЛОББИ И «НАСТРОЙКИ ИГРЫ» (ОТКРЫВАЕТСЯ ПРИ СОЗДАНИИ ЛОББИ) ====================
  if (phase === "waiting_room") {
    return (
      <div
        data-testid="game-settings-panel"
        className="swamp-wood-bg relative flex min-h-screen w-screen items-center justify-center overflow-y-auto p-4 text-lime-50"
      >
        <div className="wood-panel relative z-10 w-full max-w-6xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-[#271509] pb-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-lime-300">
                <span>🪵 Древесное Лобби Болота</span>
                <span>•</span>
                <span className={wsConnected ? "text-lime-300" : "text-amber-300"}>
                  {onlineStatusText}
                </span>
              </div>
              <h1 className="stroke-wood mt-0.5 text-2xl font-black text-amber-200 sm:text-3xl">
                НАСТРОЙКИ ИГРЫ — {activeRoom?.name || "Круглое Болото"}
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleStartMatchFromLobby}
                className="round-btn round-btn-moss px-5 py-2 text-xs font-black"
              >
                🐸 В БОЙ НА БОЛОТЕ!
              </button>

              <button
                type="button"
                onClick={handleCopyInviteLink}
                className="round-btn round-btn-bark px-3.5 py-2 text-xs font-black"
              >
                {copiedInvite
                  ? "✓ ССЫЛКА СКОПИРОВАНА!"
                  : `🔗 Код: ${activeRoom?.id || "local"}`}
              </button>

              <button
                type="button"
                onClick={() => setPhase("online_hub")}
                className="round-btn round-btn-bark px-3.5 py-2 text-xs font-black"
              >
                🌐 Серверы / Моделька
              </button>

              <button
                type="button"
                data-testid="lobby-exit-btn"
                onClick={handleExitActivityOrServer}
                className="round-btn round-btn-danger px-4 py-2 text-xs font-black"
              >
                🚪 ВЫЙТИ ИЗ СЕРВЕРА
              </button>
            </div>
          </div>

          {/* Вкладки «Настроек игры» */}
          <div className="mt-4 flex flex-wrap gap-2.5 border-b-2 border-[#271509] pb-3">
            <button
              type="button"
              data-testid="host-tab-players"
              onClick={() => setSettingsTab("players")}
              className={`round-btn px-5 py-2 text-xs font-black uppercase tracking-wider ${
                settingsTab === "players" ? "round-btn-moss" : "round-btn-bark opacity-80"
              }`}
            >
              🐸 1. Игроки, Здоровье и Моделька
            </button>

            <button
              type="button"
              data-testid="host-tab-map"
              onClick={() => setSettingsTab("map")}
              className={`round-btn px-5 py-2 text-xs font-black uppercase tracking-wider ${
                settingsTab === "map" ? "round-btn-moss" : "round-btn-bark opacity-80"
              }`}
            >
              🗺️ 2. Карта и Потоп (Зона ограничения)
            </button>

            <button
              type="button"
              data-testid="host-tab-bots"
              onClick={() => setSettingsTab("bots")}
              className={`round-btn px-5 py-2 text-xs font-black uppercase tracking-wider ${
                settingsTab === "bots" ? "round-btn-moss" : "round-btn-bark opacity-80"
              }`}
            >
              🤖 3. Параметры Ботов
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Левая колонка: Настройки выбранной вкладки */}
            <div className="space-y-4 lg:col-span-7">
              {settingsTab === "players" && (
                <div className="moss-panel space-y-3.5 p-4">
                  <h2 className="text-sm font-black uppercase tracking-wider text-lime-300">
                    Параметры Игроков, Здоровья и 3D-Модельки
                  </h2>

                  <EditableNumberSlider
                    label="Множитель здоровья игроков (от базовых 100 HP)"
                    hint={`Итоговое здоровье игрока: ${Math.round(
                      DEFAULT_FROG_CONFIG.maxHealth * hostSettings.playerHpMultiplier
                    )} HP`}
                    value={hostSettings.playerHpMultiplier}
                    min={0.25}
                    max={5.0}
                    step={0.05}
                    suffix="x"
                    testId="player-hp-mult"
                    onChange={(v) =>
                      setHostSettings((s) => ({ ...s, playerHpMultiplier: v }))
                    }
                  />

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="uneven-card p-3">
                      <label className="block text-xs font-black uppercase text-lime-200">
                        Режим боя на болоте
                      </label>
                      <select
                        value={matchMode}
                        onChange={(e) =>
                          setMatchMode(Number(e.target.value) as MatchMode)
                        }
                        className="uneven-input mt-1.5 w-full px-3 py-2 text-sm font-bold"
                      >
                        <option value={MatchMode.FREE_FOR_ALL}>
                          🐸 Каждый сам за себя
                        </option>
                        <option value={MatchMode.TEAMS}>🤝 Команды (2 на 2)</option>
                      </select>
                    </div>

                    <div className="uneven-card p-3">
                      <label className="block text-xs font-black uppercase text-lime-200">
                        Окрас вашей лягушки
                      </label>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {FROG_PALETTE.map((c, idx) => (
                          <button
                            key={c.name}
                            type="button"
                            onClick={() => setLocalColorIndex(idx)}
                            title={c.name}
                            className={`h-7 w-7 rounded-full border-2 transition ${
                              localColorIndex === idx
                                ? "scale-115 border-amber-200 ring-2 ring-lime-300"
                                : "border-[#1b1207] opacity-80 hover:opacity-100"
                            }`}
                            style={{ backgroundColor: c.hex }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Выбор 3D-модельки из библиотеки .obj */}
                  <div className="uneven-card p-3">
                    <div className="text-xs font-black uppercase text-lime-200">
                      Ваша 3D-моделька персонажа (.obj из коллекции)
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {FROG_MODELS_CATALOG.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setLocalModelVariant(m.variantIndex);
                            soundEngine.unlock();
                            soundEngine.playLibraryCroak(0.8);
                          }}
                          className={`wood-plank p-2.5 text-left transition ${
                            localModelVariant === m.variantIndex
                              ? "ring-2 ring-lime-300 brightness-115"
                              : "opacity-80 hover:opacity-100"
                          }`}
                        >
                          <div className="text-xs font-black text-amber-200">
                            🐸 {m.title}
                          </div>
                          <div className="text-[10px] font-bold text-lime-300">
                            Файл: {m.objFile}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {settingsTab === "map" && (
                <div className="moss-panel space-y-3.5 p-4">
                  <h2 className="text-sm font-black uppercase tracking-wider text-lime-300">
                    Выбор Карты и Правила Выбора Следующей Карты
                  </h2>

                  {/* Настройка: кто выбирает следующую карту при окончании раунда */}
                  <div className="uneven-card p-3.5">
                    <div className="text-xs font-black uppercase tracking-wider text-amber-200">
                      🗳️ Кто выбирает следующую карту при окончании раунда?
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <button
                        type="button"
                        data-testid="next-map-mode-host"
                        onClick={() =>
                          setHostSettings((s) => ({
                            ...s,
                            nextMapSelectionMode: NextMapSelectionMode.HOST_ONLY,
                          }))
                        }
                        className={`round-btn px-4 py-2.5 text-left text-xs font-black ${
                          hostSettings.nextMapSelectionMode ===
                          NextMapSelectionMode.HOST_ONLY
                            ? "round-btn-moss"
                            : "round-btn-bark opacity-80"
                        }`}
                      >
                        <div>👑 Определяется Хостом</div>
                        <div className="mt-0.5 text-[10px] font-normal text-lime-100/85">
                          Хост единолично выбирает карту после раунда
                        </div>
                      </button>

                      <button
                        type="button"
                        data-testid="next-map-mode-vote"
                        onClick={() =>
                          setHostSettings((s) => ({
                            ...s,
                            nextMapSelectionMode: NextMapSelectionMode.PLAYERS_VOTE,
                          }))
                        }
                        className={`round-btn px-4 py-2.5 text-left text-xs font-black ${
                          hostSettings.nextMapSelectionMode ===
                          NextMapSelectionMode.PLAYERS_VOTE
                            ? "round-btn-moss"
                            : "round-btn-bark opacity-80"
                        }`}
                      >
                        <div>🐸 Голосование живых игроков</div>
                        <div className="mt-0.5 text-[10px] font-normal text-lime-100/85">
                          Побеждает карта, набравшая больше голосов выживших лягушек
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Стартовая карта раунда */}
                  <div>
                    <label className="block text-xs font-black uppercase text-lime-200">
                      Стартовая болотная карта (все окружены дряхлыми деревьями)
                    </label>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {SWAMP_MAPS_CATALOG.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() =>
                            setHostSettings((s) => ({
                              ...s,
                              mapVariant: m.id,
                            }))
                          }
                          className={`uneven-card p-3 text-left transition ${
                            hostSettings.mapVariant === m.id
                              ? "border-lime-300 ring-2 ring-lime-400 bg-[#23451e]"
                              : "opacity-85 hover:opacity-100"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className="text-xs font-black"
                              style={{ color: m.badgeColor }}
                            >
                              {m.title} — {m.subtitle}
                            </span>
                            <span className="rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-black text-lime-200">
                              {m.hasInitialWater ? "🌊 Прилив из воды" : "🌧️ Дождь и потоп"}
                            </span>
                          </div>
                          <div className="mt-0.5 text-[11px] text-lime-100/75">
                            {m.description}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Настройка зоны ограничения для Хоста: Потоп и Дождь вместо круга */}
                  <div className="uneven-card space-y-3 p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-black uppercase tracking-wider text-amber-200">
                          🌊 Зона ограничения: Потоп вместо круга
                        </div>
                        <div className="text-[11px] text-lime-100/80">
                          {currentMapMeta.hasInitialWater
                            ? "На выбранной карте есть вода — начнётся прилив прямо из водоёмов и не остановится, пока не умрут все!"
                            : "На выбранной карте нет воды — начнётся проливной дождь и потоп, пока не умрут все!"}
                        </div>
                      </div>
                      <button
                        type="button"
                        data-testid="toggle-flood-enabled-btn"
                        onClick={() =>
                          setHostSettings((s) => ({
                            ...s,
                            floodEnabled: !s.floodEnabled,
                          }))
                        }
                        className={`round-btn px-4 py-1.5 text-xs font-black ${
                          hostSettings.floodEnabled ? "round-btn-moss" : "round-btn-danger"
                        }`}
                      >
                        {hostSettings.floodEnabled ? "ПОТОП ВКЛ 🌊" : "ПОТОП ВЫКЛ"}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <EditableNumberSlider
                        label="Время до начала прилива / дождя"
                        hint="Через сколько секунд вода начнёт подниматься"
                        value={hostSettings.floodStartDelaySec}
                        min={3}
                        max={60}
                        step={1}
                        suffix=" сек"
                        testId="flood-delay-sec"
                        onChange={(v) =>
                          setHostSettings((s) => ({
                            ...s,
                            floodStartDelaySec: Math.round(v),
                          }))
                        }
                      />

                      <EditableNumberSlider
                        label="Скорость подъёма воды (потопа)"
                        hint="Не останавливается, пока не погибнут все"
                        value={hostSettings.floodRiseRatePerSec}
                        min={0.03}
                        max={0.45}
                        step={0.01}
                        suffix=" м/с"
                        testId="flood-rise-rate"
                        onChange={(v) =>
                          setHostSettings((s) => ({
                            ...s,
                            floodRiseRatePerSec: v,
                          }))
                        }
                      />
                    </div>
                  </div>

                  <EditableNumberSlider
                    label="Частота появления баффов на карте"
                    hint="Скорость респавна Древесной коры, Крыльев стрекозы и Пружин"
                    value={hostSettings.objectSpawnFrequencyMultiplier}
                    min={0.25}
                    max={4.0}
                    step={0.05}
                    suffix="x"
                    testId="spawn-freq-mult"
                    onChange={(v) =>
                      setHostSettings((s) => ({
                        ...s,
                        objectSpawnFrequencyMultiplier: v,
                      }))
                    }
                  />

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <EditableNumberSlider
                      label="Урон от воды и потопа"
                      value={hostSettings.waterDamagePerSec}
                      min={0}
                      max={40}
                      step={1}
                      suffix=" HP/с"
                      testId="water-dmg"
                      onChange={(v) =>
                        setHostSettings((s) => ({
                          ...s,
                          waterDamagePerSec: Math.round(v),
                        }))
                      }
                    />

                    <EditableNumberSlider
                      label="Перегруз кувшинки"
                      value={hostSettings.lilyPadMaxFrogsBeforeSink}
                      min={1}
                      max={4}
                      step={1}
                      suffix=" ляг."
                      testId="lilypad-overload"
                      onChange={(v) =>
                        setHostSettings((s) => ({
                          ...s,
                          lilyPadMaxFrogsBeforeSink: Math.round(v),
                        }))
                      }
                    />
                  </div>
                </div>
              )}

              {settingsTab === "bots" && (
                <div className="moss-panel space-y-3.5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-black uppercase tracking-wider text-lime-300">
                      Настройка Ботов (Здоровье, Интервал Прыжков, Агрессия)
                    </h2>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleAddBot}
                        className="round-btn round-btn-moss px-3.5 py-1.5 text-xs font-black"
                      >
                        + Добавить бота
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveBot}
                        className="round-btn round-btn-bark px-3.5 py-1.5 text-xs font-black"
                      >
                        - Убрать бота
                      </button>
                    </div>
                  </div>

                  <EditableNumberSlider
                    label="Множитель здоровья ботов"
                    hint={`Здоровье каждого бота: ${Math.round(
                      DEFAULT_FROG_CONFIG.maxHealth * hostSettings.botHpMultiplier
                    )} HP`}
                    value={hostSettings.botHpMultiplier}
                    min={0.25}
                    max={5.0}
                    step={0.05}
                    suffix="x"
                    testId="bot-hp-mult"
                    onChange={(v) =>
                      setHostSettings((s) => ({ ...s, botHpMultiplier: v }))
                    }
                  />

                  <EditableNumberSlider
                    label="Интервал между прыжками ботов"
                    value={hostSettings.botJumpIntervalSec}
                    min={0.4}
                    max={5.0}
                    step={0.1}
                    suffix=" сек"
                    testId="bot-jump-interval"
                    onChange={(v) =>
                      setHostSettings((s) => ({ ...s, botJumpIntervalSec: v }))
                    }
                  />

                  <EditableNumberSlider
                    label="Меткость и агрессия ботов"
                    value={hostSettings.botAggression}
                    min={0.2}
                    max={1.0}
                    step={0.05}
                    formatValue={(v) => `${Math.round(v * 100)}%`}
                    testId="bot-aggression"
                    onChange={(v) =>
                      setHostSettings((s) => ({ ...s, botAggression: v }))
                    }
                  />
                </div>
              )}
            </div>

            {/* Правая колонка: 3D-превью выбранной модельки, список игроков и старт боя */}
            <div className="moss-panel flex flex-col justify-between p-4 lg:col-span-5">
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-black uppercase tracking-wider text-amber-200">
                    Участники в лобби ({participants.length}/8)
                  </h2>
                  <span className="text-xs font-bold text-lime-300">
                    Карта: {currentMapMeta.title}
                  </span>
                </div>

                {/* Мини-превью вашей 3D-модельки лягушки */}
                <div className="mt-2.5 h-40 w-full">
                  <FrogModelPreview3D
                    colorIndex={localColorIndex}
                    modelVariant={localModelVariant}
                  />
                </div>

                <div className="mt-3 max-h-52 space-y-2 overflow-y-auto pr-1">
                  {participants.map((p) => {
                    const pal = FROG_PALETTE[p.colorIndex % FROG_PALETTE.length];
                    const modelMeta =
                      FROG_MODELS_CATALOG[
                        (p.modelVariant ?? 0) % FROG_MODELS_CATALOG.length
                      ];
                    const hp = Math.round(
                      DEFAULT_FROG_CONFIG.maxHealth *
                        (p.isBot
                          ? hostSettings.botHpMultiplier
                          : hostSettings.playerHpMultiplier)
                    );
                    return (
                      <div
                        key={p.peerId}
                        className="uneven-card flex items-center justify-between px-3 py-2"
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className="h-4 w-4 rounded-full border border-black"
                            style={{ backgroundColor: pal.hex }}
                          />
                          <div>
                            <div className="text-xs font-black text-lime-50">
                              {p.nickname}{" "}
                              {p.peerId === localPeerId && (
                                <span className="text-amber-300">(Вы)</span>
                              )}
                            </div>
                            <div className="text-[10px] text-lime-200/75">
                              {p.isBot ? "🤖 Бот" : "🌐 Живой игрок"} • {modelMeta.title} •{" "}
                              {hp} HP
                            </div>
                          </div>
                        </div>

                        {matchMode === MatchMode.TEAMS && (
                          <button
                            type="button"
                            onClick={() => {
                              if (p.peerId === localPeerId) {
                                setLocalTeamId((t) => (t + 1) % 2);
                              } else {
                                setParticipants((prev) =>
                                  prev.map((item) =>
                                    item.peerId === p.peerId
                                      ? { ...item, teamId: (item.teamId + 1) % 2 }
                                      : item
                                  )
                                );
                              }
                            }}
                            className="wood-plank px-2.5 py-1 text-[10px] font-black text-amber-200"
                          >
                            Команда {(p.teamId < 0 ? 0 : p.teamId) + 1}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t-2 border-[#271509]">
                <button
                  type="button"
                  data-testid="start-match-from-lobby-btn"
                  onClick={handleStartMatchFromLobby}
                  className="round-btn round-btn-moss w-full py-3.5 text-base font-black tracking-wide"
                >
                  🐸 ВПРЫГНУТЬ В БОЙ НА БОЛОТЕ!
                </button>
              </div>
            </div>
          </div>
        </div>

        {renderPersonalSettingsModal()}
      </div>
    );
  }

  // ==================== ЭКРАН 2: ОНЛАЙН-ПОДКЛЮЧЕНИЕ И 3D-МОДЕЛЬКИ ПЕРСОНАЖЕЙ (`online_hub`) ====================
  if (phase === "online_hub") {
    const selectedModelMeta =
      FROG_MODELS_CATALOG[localModelVariant % FROG_MODELS_CATALOG.length];

    return (
      <div
        data-testid="online-hub-screen"
        style={{ backgroundColor: "#2e950a" }}
        className="swamp-wood-bg relative flex min-h-screen w-screen items-center justify-center overflow-y-auto p-4 text-lime-50"
      >
        <div className="wood-panel relative z-10 w-full max-w-6xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#271509] pb-4">
            <div>
              <div className="text-xs font-black uppercase tracking-widest text-lime-300">
                Сетевая игра • Выбор 3D-персонажа • Создание лобби
              </div>
              <h1 className="stroke-wood text-2xl font-black text-amber-200 sm:text-3xl">
                ОНЛАЙН-ПОДКЛЮЧЕНИЕ И МОДЕЛЬКИ ЖАБ
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setShowPersonalSettingsModal(true)}
                className="round-btn round-btn-bark px-4 py-2 text-xs font-black"
              >
                ⚙️ НАСТРОЙКИ ЗВУКА
              </button>

              <button
                type="button"
                data-testid="online-hub-exit-btn"
                onClick={handleExitActivityOrServer}
                className="round-btn round-btn-danger px-5 py-2 text-xs font-black"
              >
                🚪 ВЫЙТИ В МЕНЮ
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Левая колонка: Мои 3D-модельки персонажей (.obj из /assets/models/) */}
            <div className="moss-panel flex flex-col justify-between p-4 lg:col-span-5">
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-black uppercase tracking-wider text-lime-300">
                    🐸 Мои 3D-Модельки Персонажей
                  </h2>
                  <span className="wood-plank px-2.5 py-0.5 text-[11px] font-black text-amber-200">
                    {selectedModelMeta.objFile}
                  </span>
                </div>

                {/* Живой 3D-подиум на пеньке */}
                <div className="mt-3 h-52 w-full">
                  <FrogModelPreview3D
                    colorIndex={localColorIndex}
                    modelVariant={localModelVariant}
                  />
                </div>

                {/* Переключатель 3 оригинальных 3D-моделей из папки assets/models */}
                <div className="mt-3 space-y-2">
                  {FROG_MODELS_CATALOG.map((modelItem) => (
                    <button
                      key={modelItem.id}
                      type="button"
                      data-testid={`select-frog-model-${modelItem.variantIndex}`}
                      onClick={() => {
                        setLocalModelVariant(modelItem.variantIndex);
                        soundEngine.unlock();
                        soundEngine.playLibraryCroak(0.85);
                      }}
                      className={`uneven-card flex w-full items-center justify-between p-2.5 text-left transition ${
                        localModelVariant === modelItem.variantIndex
                          ? "border-lime-300 ring-2 ring-lime-400 bg-[#24481e]"
                          : "opacity-85 hover:opacity-100"
                      }`}
                    >
                      <div>
                        <div className="text-xs font-black text-amber-200">
                          {modelItem.title}
                        </div>
                        <div className="text-[11px] text-lime-100/80">
                          {modelItem.description}
                        </div>
                      </div>
                      <span className="wood-plank px-2 py-1 text-[10px] font-black text-lime-300">
                        {localModelVariant === modelItem.variantIndex
                          ? "✓ ВЫБРАНА"
                          : "Выбрать"}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Имя и окрас */}
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-black uppercase text-lime-200">
                      Имя вашей жабы
                    </label>
                    <input
                      type="text"
                      maxLength={18}
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      className="uneven-input mt-1 w-full px-3 py-2 text-sm font-black"
                      placeholder="Квакер"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black uppercase text-lime-200">
                      Болотный окрас
                    </label>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {FROG_PALETTE.map((c, idx) => (
                        <button
                          key={c.name}
                          type="button"
                          onClick={() => setLocalColorIndex(idx)}
                          title={c.name}
                          className={`h-6 w-6 rounded-full border-2 transition ${
                            localColorIndex === idx
                              ? "scale-115 border-amber-200 ring-2 ring-lime-300"
                              : "border-black opacity-80 hover:opacity-100"
                          }`}
                          style={{ backgroundColor: c.hex }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Правая колонка: Онлайн-подключение, Список серверов и Создание лобби */}
            <div className="moss-panel flex flex-col justify-between p-4 lg:col-span-7">
              <div className="space-y-4">
                {/* 1. Создание нового лобби -> открывает «Настройки игры» */}
                <div className="uneven-card p-4">
                  <div className="text-xs font-black uppercase tracking-wider text-lime-300">
                    🪵 Создать своё болотное лобби (Откроет «Настройки игры»)
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2.5">
                    <input
                      type="text"
                      maxLength={32}
                      value={roomNameInput}
                      onChange={(e) => setRoomNameInput(e.target.value)}
                      className="uneven-input flex-1 px-3.5 py-2 text-sm font-bold"
                      placeholder="Название вашего болота..."
                    />
                    <button
                      type="button"
                      data-testid="create-lobby-btn"
                      disabled={isCreatingRoom}
                      onClick={handleCreateRoomAndOpenSettings}
                      className="round-btn round-btn-moss px-6 py-2.5 text-xs font-black uppercase"
                    >
                      {isCreatingRoom
                        ? "Создаём..."
                        : "➕ СОЗДАТЬ ЛОББИ (НАСТРОЙКИ ИГРЫ)"}
                    </button>
                  </div>
                </div>

                {/* 2. Прямое онлайн-подключение по коду комнаты или адресу сервера */}
                <div className="uneven-card p-4">
                  <div className="text-xs font-black uppercase tracking-wider text-amber-200">
                    🌐 Прямое онлайн-подключение к серверу / комнате
                  </div>
                  <p className="mt-0.5 text-[11px] text-lime-100/75">
                    Введите ID комнаты друга или адрес WebSocket-сервера (например, ws://localhost:3000/ws/room/swamp-1)
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2.5">
                    <input
                      type="text"
                      value={directConnectCode}
                      onChange={(e) => setDirectConnectCode(e.target.value)}
                      placeholder="Код комнаты или ws:// адрес сервера..."
                      className="uneven-input flex-1 px-3.5 py-2 text-sm font-bold"
                    />
                    <button
                      type="button"
                      data-testid="direct-connect-btn"
                      onClick={handleDirectConnect}
                      className="round-btn round-btn-bark px-5 py-2.5 text-xs font-black uppercase"
                    >
                      🔌 ПОДКЛЮЧИТЬСЯ
                    </button>
                  </div>
                  {lobbyError && (
                    <div className="mt-2 text-xs font-bold text-rose-300">
                      ⚠️ {lobbyError}
                    </div>
                  )}
                </div>

                {/* 3. Список активных онлайн-комнат на сервере */}
                <div className="uneven-card p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-black uppercase tracking-wider text-lime-300">
                      📡 Активные серверы и болотные комнаты ({rooms.length})
                    </div>
                    <button
                      type="button"
                      onClick={refreshRooms}
                      className="wood-plank px-3 py-1 text-[11px] font-black text-amber-200"
                    >
                      ↻ Обновить список
                    </button>
                  </div>

                  <div className="mt-2.5 max-h-44 space-y-2 overflow-y-auto pr-1">
                    {rooms.length === 0 ? (
                      <div className="rounded-xl border border-lime-500/20 bg-[#11220f] p-3 text-center text-xs text-lime-200/75">
                        Никто ещё не создал комнату. Нажмите «Создать лобби» выше, чтобы открыть своё лобби и «Настройки игры»!
                      </div>
                    ) : (
                      rooms.map((r, index) => (
                        <div
                          key={r.id}
                          style={
                            index === 1
                              ? { backgroundColor: "#169516", borderWidth: "4px" }
                              : undefined
                          }
                          className="wood-plank flex items-center justify-between px-3.5 py-2.5"
                        >
                          <div>
                            <div className="text-sm font-black text-amber-200">
                              🐸 {r.name}
                            </div>
                            <div className="text-[11px] text-lime-200/80">
                              Код: <span className="font-mono">{r.id}</span> • В комнате:{" "}
                              {r.players ?? 1}/8
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleJoinRoom(r)}
                            className="round-btn round-btn-moss px-4 py-1.5 text-xs font-black"
                          >
                            ВОЙТИ В ЛОББИ →
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t-2 border-[#271509] pt-3">
                <span className="text-xs font-bold text-lime-200/80">
                  Хотите сразу запрыгнуть на арену с выбранной моделькой?
                </span>
                <button
                  type="button"
                  data-testid="quick-play-arena-btn"
                  onClick={() => {
                    soundEngine.unlock();
                    soundEngine.playLibraryCroak(0.9);
                    setMatchSeed((s) => s + 1);
                    setPhase("playing");
                  }}
                  className="round-btn round-btn-moss px-6 py-2.5 text-xs font-black uppercase"
                >
                  ⚡ БЫСТРЫЙ БОЙ НА БОЛОТЕ!
                </button>
              </div>
            </div>
          </div>
        </div>

        {renderPersonalSettingsModal()}
      </div>
    );
  }

  // ==================== ЭКРАН 1: ГЛАВНОЕ МЕНЮ (ТОЛЬКО 3 КНОПКИ: «ИГРАТЬ», «НАСТРОЙКИ», «ВЫЙТИ») ====================
  return (
    <div
      data-testid="main-menu-screen"
      className="swamp-wood-bg relative flex min-h-screen w-screen items-center justify-center overflow-y-auto p-4 text-lime-50"
    >

      {isExitedActivity ? (
        <div
          data-testid="exited-activity-card"
          className="wood-panel relative z-10 max-w-md p-8 text-center"
        >
          <div className="text-4xl">🐸🌿</div>
          <h1 className="stroke-wood mt-2 text-2xl font-black text-amber-200">
            ВЫ ВЫШЛИ ИЗ АКТИВНОСТИ И СЕРВЕРА
          </h1>
          <p className="mt-2 text-sm text-lime-100/85">
            Ваша жаба отдыхает на тёплом пеньке, сетевые соединения закрыты.
          </p>
          <button
            type="button"
            data-testid="return-from-exit-btn"
            onClick={() => {
              soundEngine.unlock();
              soundEngine.playLibraryCroak(0.8);
              setIsExitedActivity(false);
            }}
            className="round-btn round-btn-moss mt-6 px-8 py-3.5 text-base font-black"
          >
            ВЕРНУТЬСЯ В БОЛОТО!
          </button>
        </div>
      ) : (
        <div className="wood-panel relative z-10 w-full max-w-4xl p-6 sm:p-8">
          {/* Вырезанная деревянная вывеска игры */}
          <div className="wood-plank mx-auto max-w-2xl px-6 py-4 text-center">
            <div className="text-xs font-black uppercase tracking-widest text-lime-300">
              🐸 Болотный 2.5D Экшен с Живыми 3D-Жабами 🪵
            </div>
            <h1 className="stroke-wood mt-1 text-4xl font-black tracking-tight text-amber-300 sm:text-5xl">
              КВА-КВА БОЛОТО!
            </h1>
            <p className="mt-1 text-xs font-bold text-lime-100/90 sm:text-sm">
              Прыгай на головы соперникам, собирай полую древесную кору и не утони с друзьями на одной кувшинке!
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 items-center gap-6 md:grid-cols-12">
            {/* Левая часть: Живая 3D-лягушка на деревянном пеньке */}
            <div className="moss-panel p-4 md:col-span-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black uppercase tracking-wider text-lime-300">
                  Ваша 3D-Жаба: {FROG_MODELS_CATALOG[localModelVariant]?.title}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.unlock();
                    soundEngine.playLibraryCroak(0.95);
                    setLocalModelVariant((v) => (v + 1) % FROG_MODELS_CATALOG.length);
                  }}
                  className="wood-plank px-3 py-1 text-[11px] font-black text-amber-200 hover:scale-105 transition"
                >
                  🎲 Сменить модельку 🐸
                </button>
              </div>

              <div className="h-56 w-full">
                <FrogModelPreview3D
                  colorIndex={localColorIndex}
                  modelVariant={localModelVariant}
                />
              </div>

              <div className="mt-2.5 flex items-center justify-between text-[11px] font-bold text-lime-200/85">
                <span>Нажмите на жабу, чтобы она подпрыгнула и квакнула!</span>
                <span className="text-amber-200">3D .OBJ Модели</span>
              </div>
            </div>

            {/* Правая часть: СТРОГО 3 КНОПКИ ГЛАВНОГО МЕНЮ («ИГРАТЬ», «НАСТРОЙКИ», «ВЫЙТИ») с классом .round-btn 60% */}
            <div
              data-testid="main-menu-buttons"
              className="flex flex-col items-stretch justify-center gap-4 md:col-span-6"
            >
              <button
                type="button"
                data-start="true"
                data-testid="main-btn-play"
                onClick={() => {
                  soundEngine.unlock();
                  soundEngine.playLibraryCroak(0.9);
                  setPhase("online_hub");
                }}
                className="round-btn round-btn-moss py-5 px-8 text-2xl font-black uppercase tracking-wider stroke-wood"
              >
                🐸 ИГРАТЬ
              </button>

              <button
                type="button"
                data-testid="main-btn-settings"
                onClick={() => {
                  soundEngine.unlock();
                  soundEngine.playLibraryCroak(0.75);
                  setShowPersonalSettingsModal(true);
                }}
                className="round-btn round-btn-bark py-4 px-8 text-xl font-black uppercase tracking-wider stroke-wood"
              >
                🔊 НАСТРОЙКИ
              </button>

              <button
                type="button"
                data-testid="main-btn-exit"
                onClick={handleExitActivityOrServer}
                className="round-btn round-btn-danger py-4 px-8 text-xl font-black uppercase tracking-wider stroke-wood"
              >
                🚪 ВЫЙТИ
              </button>
            </div>
          </div>
        </div>
      )}

      {renderPersonalSettingsModal()}
    </div>
  );
}

export default App;
