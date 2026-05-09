import React, { useState } from "react";
import { Link, useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { 
  Map as MapIcon, 
  Search, 
  FileText, 
  MessageSquare, 
  ArrowLeft,
  X,
  HelpCircle,
  Crosshair,
  User,
  Box,
  MapPin,
  Cpu,
  Activity,
  Zap,
  Wifi,
  Shield,
  Radio,
  Database
} from "lucide-react";
import { DiceAnimation } from "../DiceAnimation";
import {
  createLobbySocketClient,
  emitTeamSecretPassage,
  emitTeamHeartbeat,
  subscribeTeamToLobby,
  type GameStartedPayload,
  type LobbySocketClient,
  type LobbyPresenceState,
} from "../../src/lib/lobbySocket";
import {
  findNearestBoardMovementNode,
  getRoomEntryNodeByDoorNodeId,
  getSecretPassageDestinationNodeByRoomNodeId,
  type BoardMovementNode,
} from "../../src/lib/boardMovement";
import { BOARD_CENTER_IMAGE_BOUNDS, mapBoardSpaces, readStoredBoardTheme, toBoardPercent, type StoredBoardTheme } from "../../src/lib/boardTheme";
import {
  buildBoardDebugProbe,
  getStoredBoardDebugMode,
  setStoredBoardDebugMode,
  type BoardDebugProbe,
} from "../../src/lib/boardDebug";
import {
  getStoredSessionCode,
  getStoredSessionId,
  getStoredSessionStatus,
  getStoredTeamColor,
  getStoredTeamId,
  getStoredTeamName,
  storeJoinedLobbySession,
} from "../../src/lib/lobbyStorage";
import { TEAM_HEARTBEAT_INTERVAL_MS } from "../../src/lib/teamMonitoring";
import { getTeamMeta } from "../../src/lib/teamMeta";
import {
  getSessionErrorMessage,
  getTeamMoveState,
  getTeamTerminalState,
  moveTeam,
  rollTeamDice,
  type LobbySession,
  type SessionStatus,
  type TeamColor,
  type TeamHandCard,
  type TeamMoveNode,
} from "../../src/lib/sessionApi";
import { ThemedBoard } from "../game/ThemedBoard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";

interface ElementoItem {
  name: string;
  desc: string;
  avatar: React.ReactNode;
  color: string;
  motif?: string;
}

// Interfaz para los datos puros que vienen del "activeConfig"
interface RawItem {
  id: string;
  name: string;
  desc: string;
  motif?: string;
  imageUrl?: string;
}

interface GameConfig {
  id: string;
  cat1Name?: string;
  cat2Name?: string;
  cat3Name?: string;
  centerImage?: string;
  hasMotifs?: boolean;
  subjects?: RawItem[];
  objects?: RawItem[];
  spaces?: RawItem[];
}

const DICE_RESULT_VISIBILITY_DELAY_MS = 1300;
const DICE_CENTER_VERTICAL_OFFSET_PERCENT = 2;

interface TerminalCard {
  id: string;
  kind: TeamHandCard["kind"];
  name: string;
  desc: string;
  type: string;
  color: string;
  bg: string;
  image?: string;
}

// Categorías convertidas a objetos dinámicos con avatares predefinidos (íconos tech)
const CATEGORIES = {
  sujetos: [
    { name: "Ada Lovelace", avatar: <User className="w-3 h-3 text-pink-400" />, color: "bg-pink-950/30 border-pink-800" },
    { name: "Alan Turing", avatar: <Cpu className="w-3 h-3 text-blue-400" />, color: "bg-blue-950/30 border-blue-800" },
    { name: "Nikola Tesla", avatar: <Zap className="w-3 h-3 text-yellow-400" />, color: "bg-yellow-950/30 border-yellow-800" },
    { name: "Marie Curie", avatar: <Activity className="w-3 h-3 text-emerald-400" />, color: "bg-emerald-950/30 border-emerald-800" },
    { name: "Hedy Lamarr", avatar: <Wifi className="w-3 h-3 text-cyan-400" />, color: "bg-cyan-950/30 border-cyan-800" },
    { name: "Max Planck", avatar: <Database className="w-3 h-3 text-purple-400" />, color: "bg-purple-950/30 border-purple-800" }
  ],
  objetos: [
    { name: "Osciloscopio", avatar: <Activity className="w-3 h-3 text-emerald-400" />, color: "bg-emerald-950/30 border-emerald-800" },
    { name: "Cable de Fibra", avatar: <Radio className="w-3 h-3 text-orange-400" />, color: "bg-orange-950/30 border-orange-800" },
    { name: "Diodo Láser", avatar: <Crosshair className="w-3 h-3 text-red-400" />, color: "bg-red-950/30 border-red-800" },
    { name: "Soldador", avatar: <Zap className="w-3 h-3 text-amber-400" />, color: "bg-amber-950/30 border-amber-800" },
    { name: "Batería C.", avatar: <Shield className="w-3 h-3 text-lime-400" />, color: "bg-lime-950/30 border-lime-800" },
    { name: "Llave Inglesa", avatar: <Box className="w-3 h-3 text-slate-400" />, color: "bg-slate-800/50 border-slate-600" }
  ],
  espacios: [
    { name: "Cámara Anecoica", avatar: <MapPin className="w-3 h-3 text-red-500" />, color: "bg-red-950/20 border-red-900" },
    { name: "Sala H. Lamarr", avatar: <MapPin className="w-3 h-3 text-red-500" />, color: "bg-red-950/20 border-red-900" },
    { name: "C. Conmutación", avatar: <MapPin className="w-3 h-3 text-red-500" />, color: "bg-red-950/20 border-red-900" },
    { name: "Seminario Haykin", avatar: <MapPin className="w-3 h-3 text-red-500" />, color: "bg-red-950/20 border-red-900" },
    { name: "Club de radio", avatar: <MapPin className="w-3 h-3 text-red-500" />, color: "bg-red-950/20 border-red-900" },
    { name: "L. Com. Ópticas", avatar: <MapPin className="w-3 h-3 text-red-500" />, color: "bg-red-950/20 border-red-900" },
    { name: "L. Electrónica", avatar: <MapPin className="w-3 h-3 text-red-500" />, color: "bg-red-950/20 border-red-900" },
    { name: "Seminario Maxwell", avatar: <MapPin className="w-3 h-3 text-red-500" />, color: "bg-red-950/20 border-red-900" },
    { name: "S. Torres Quevedo", avatar: <MapPin className="w-3 h-3 text-red-500" />, color: "bg-red-950/20 border-red-900" }
  ]
};

const TEAMS = ["Rojo", "Amarillo", "Azul", "Verde", "Morado", "Blanco"];

function mapHandCardToTerminalCard(card: TeamHandCard, config: GameConfig): TerminalCard {
  if (card.kind === "SUJETO") {
    return {
      id: card.id,
      kind: card.kind,
      name: card.name,
      desc: card.desc,
      type: config.cat1Name || "Sujetos",
      color: "border-blue-500",
      bg: "bg-blue-950",
      image: card.imageUrl,
    };
  }

  if (card.kind === "OBJETO") {
    return {
      id: card.id,
      kind: card.kind,
      name: card.name,
      desc: card.desc,
      type: config.cat2Name || "Objetos",
      color: "border-emerald-500",
      bg: "bg-emerald-950",
      image: card.imageUrl,
    };
  }

  return {
    id: card.id,
    kind: card.kind,
    name: card.name,
    desc: card.desc,
    type: config.cat3Name || "Espacios",
    color: "border-red-500",
    bg: "bg-red-950",
    image: card.imageUrl,
  };
}

export function TerminalView() {
  const navigate = useNavigate();
  const lobbySocketRef = React.useRef<LobbySocketClient | null>(null);
  const [activeTab, setActiveTab] = useState("map");
  const [centerImage, setCenterImage] = useState("");
  const [boardTheme, setBoardTheme] = useState<StoredBoardTheme | null>(() => readStoredBoardTheme());
  const [boardTeams, setBoardTeams] = useState<LobbySession["teams"]>([]);
  const [teamName, setTeamName] = useState(getStoredTeamName() || "Equipo sin asignar");
  const [teamColor, setTeamColor] = useState<TeamColor | null>(getStoredTeamColor());
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>(getStoredSessionStatus() ?? "LOBBY");
  const [lobbyConnectionStatus, setLobbyConnectionStatus] = useState<"connecting" | "connected" | "disconnected" | "error">("connecting");
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [handError, setHandError] = useState<string | null>(null);
  const [isLoadingHand, setIsLoadingHand] = useState(false);
  const [teamHand, setTeamHand] = useState<TerminalCard[]>([]);
  const [destinationNodes, setDestinationNodes] = useState<TeamMoveNode[]>([]);
  const [selectedDestinationNodeId, setSelectedDestinationNodeId] = useState("");
  const [isMoveConfirmOpen, setIsMoveConfirmOpen] = useState(false);
  const [currentMoveNode, setCurrentMoveNode] = useState<TeamMoveNode | null>(null);
  const [sessionTurn, setSessionTurn] = useState<LobbySession["turn"]>(null);
  const [isBoardDebugEnabled, setIsBoardDebugEnabled] = useState(() => getStoredBoardDebugMode());
  const [boardDebugProbe, setBoardDebugProbe] = useState<BoardDebugProbe | null>(null);
  const [diceResetSignal, setDiceResetSignal] = useState(0);
  const [isLoadingMoves, setIsLoadingMoves] = useState(false);
  const [isMovingPawn, setIsMovingPawn] = useState(false);
  const [isEmittingSecretPassage, setIsEmittingSecretPassage] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  
  const [categories, setCategories] = useState<{
    c1: ElementoItem[];
    c2: ElementoItem[];
    c3: ElementoItem[];
  }>({
    c1: CATEGORIES.sujetos.map(s => ({ ...s, desc: "Descripción", motif: "" })),
    c2: CATEGORIES.objetos.map(o => ({ ...o, desc: "Descripción", motif: "" })),
    c3: CATEGORIES.espacios.map(e => ({ ...e, desc: "Descripción", motif: "" }))
  });
  const [catNames, setCatNames] = useState({ c1: "Sujetos", c2: "Objetos", c3: "Espacios" });

  const storedTeamId = getStoredTeamId();
  const isMyTurn = sessionTurn?.currentTeamId === storedTeamId;
  const currentTurnRemainingMoves = sessionTurn?.remainingMoves ?? null;

  const [selectedCard, setSelectedCard] = useState<TerminalCard | null>(null);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [suggestMode, setSuggestMode] = useState("hipotesis");
  
  // Mock room for locking hypothesis
  const currentRoomMock = "Cámara Anecoica";
  const [selectedRoom, setSelectedRoom] = useState(currentRoomMock);

  // Fetch active config and map to Terminal's internal state
  React.useEffect(() => {
    if (suggestMode === "hipotesis") {
      setSelectedRoom(currentRoomMock);
    }
  }, [suggestMode, currentRoomMock]);

  const applyRealtimeSession = (session: LobbySession, currentTeam: LobbySession["teams"][number]) => {
    storeJoinedLobbySession({ session, team: currentTeam });
    setTeamName(currentTeam.name);
    setTeamColor(currentTeam.color);
    setSessionStatus(session.status);
    setBoardTeams(session.teams);
    setSessionTurn(session.turn);
    setLobbyError(null);
  };

  const refreshMoveState = React.useEffectEvent(async () => {
    const accessCode = getStoredSessionCode();
    const teamId = getStoredTeamId();

    if (!accessCode || !teamId || sessionStatus !== "EN_CURSO" || !isMyTurn) {
      setDestinationNodes([]);
      setSelectedDestinationNodeId("");
      setIsMoveConfirmOpen(false);
      return;
    }

    setDestinationNodes([]);
    setSelectedDestinationNodeId("");
    setIsMoveConfirmOpen(false);
    setMoveError(null);
    setIsLoadingMoves(true);

    try {
      const moveState = await getTeamMoveState(accessCode, teamId);
      setCurrentMoveNode(moveState.currentNode);
      setDestinationNodes(moveState.destinationNodes);
      setMoveError(null);
    } catch (error) {
      setDestinationNodes([]);
      setMoveError(getSessionErrorMessage(error, "No se ha podido preparar la selección de destino."));
    } finally {
      setIsLoadingMoves(false);
    }
  });

  const handleDiceRoll = async () => {
    const accessCode = getStoredSessionCode();
    const teamId = getStoredTeamId();

    if (!accessCode || !teamId || sessionStatus !== "EN_CURSO" || !isMyTurn) {
      throw new Error("El turno actual no permite lanzar los dados desde este terminal.");
    }

    setDestinationNodes([]);
    setSelectedDestinationNodeId("");
    setIsMoveConfirmOpen(false);
    setMoveError(null);
    const rollStartedAt = Date.now();

    const waitForDiceAnimationToFinish = async () => {
      const elapsed = Date.now() - rollStartedAt;
      const remaining = DICE_RESULT_VISIBILITY_DELAY_MS - elapsed;
      if (remaining > 0) {
        await new Promise<void>((resolve) => {
          window.setTimeout(() => resolve(), remaining);
        });
      }
    };

    try {
      const rollResult = await rollTeamDice(accessCode, teamId);
      const currentTeam = rollResult.session.teams.find((team) => team.id === teamId);

      await waitForDiceAnimationToFinish();

      setCurrentMoveNode(rollResult.currentNode);
      setDestinationNodes(rollResult.destinationNodes);
      setMoveError(
        rollResult.turnAdvanced
          ? "La tirada no deja movimientos legales. El turno ha pasado automáticamente al siguiente equipo."
          : null
      );

      if (currentTeam) {
        applyRealtimeSession(rollResult.session, currentTeam);
      }

      if (rollResult.turnAdvanced) {
        setDiceResetSignal((previousValue) => previousValue + 1);
      }

      return rollResult.dice;
    } catch (error) {
      await waitForDiceAnimationToFinish();
      setDestinationNodes([]);
      setMoveError(getSessionErrorMessage(error, "No se ha podido registrar la tirada del turno actual."));
      setDiceResetSignal((previousValue) => previousValue + 1);
      throw error;
    }
  };

  const handleDestinationNodePress = (destinationNodeId: string) => {
    setSelectedDestinationNodeId(destinationNodeId);
    setMoveError(null);
    setIsMoveConfirmOpen(true);
  };

  const handleBoardNodePress = (boardNode: BoardMovementNode) => {
    setIsMoveConfirmOpen(false);
    setSelectedDestinationNodeId("");

    if (sessionStatus !== "EN_CURSO") {
      return;
    }

    if (!isMyTurn) {
      setMoveError("Ahora mismo no puedes mover este peón porque no es tu turno.");
      return;
    }

    if (sessionTurn?.dice === null) {
      setMoveError("Pulsa Tirar dados antes de seleccionar una casilla del tablero.");
      return;
    }

    if (isLoadingMoves) {
      setMoveError("Todavía se están calculando las casillas alcanzables para la tirada actual.");
      return;
    }

    if (destinationNodes.length === 0) {
      setMoveError("La tirada actual no deja destinos válidos en el tablero.");
      return;
    }

    const selectedDestination = destinationNodes.find((destinationNode) => destinationNode.id === boardNode.id) ?? null;
    if (!selectedDestination) {
      setMoveError("La casilla o sala seleccionada no es alcanzable con la tirada actual.");
      return;
    }

    handleDestinationNodePress(selectedDestination.id);
  };

  const handleBoardSurfaceClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const boardBounds = event.currentTarget.getBoundingClientRect();
    if (boardBounds.width === 0 || boardBounds.height === 0) {
      return;
    }

    const positionX = ((event.clientX - boardBounds.left) / boardBounds.width) * 100;
    const positionY = ((event.clientY - boardBounds.top) / boardBounds.height) * 100;
    const matchedNode = findNearestBoardMovementNode(positionX, positionY);
    const matchedDestinationNode = destinationNodes.length > 0
      ? findNearestBoardMovementNode(
          positionX,
          positionY,
          destinationNodes.map((destinationNode) => destinationNode.id)
        )
      : null;

    if (isBoardDebugEnabled) {
      setBoardDebugProbe(buildBoardDebugProbe(positionX, positionY, matchedNode));
    }

    if (
      sessionStatus === "EN_CURSO" &&
      isMyTurn &&
      sessionTurn?.dice !== null &&
      !isLoadingMoves &&
      destinationNodes.length > 0
    ) {
      if (!matchedDestinationNode) {
        setIsMoveConfirmOpen(false);
        setSelectedDestinationNodeId("");
        setMoveError("La casilla o sala seleccionada no es alcanzable con la tirada actual.");
        return;
      }

      handleBoardNodePress(matchedDestinationNode);
      return;
    }

    if (!matchedNode) {
      setIsMoveConfirmOpen(false);
      setSelectedDestinationNodeId("");
      setMoveError("Pulsa una casilla o una sala real del tablero para intentar el movimiento.");
      return;
    }

    handleBoardNodePress(matchedNode);
  };

  const handleBoardDebugToggle = () => {
    setIsBoardDebugEnabled((currentValue) => {
      const nextValue = !currentValue;
      setStoredBoardDebugMode(nextValue);
      if (!nextValue) {
        setBoardDebugProbe(null);
      }
      return nextValue;
    });
  };

  const handleMoveConfirmOpenChange = (open: boolean) => {
    setIsMoveConfirmOpen(open);

    if (!open) {
      setSelectedDestinationNodeId("");
    }
  };

  const handleMovePawn = async (targetNodeId = selectedDestinationNodeId) => {
    const accessCode = getStoredSessionCode();
    const teamId = getStoredTeamId();

    if (!accessCode || !teamId || !targetNodeId) {
      return;
    }

    const selectedDestinationNode = destinationNodes.find((node) => node.id === targetNodeId) ?? null;
    setIsMoveConfirmOpen(false);
    setIsMovingPawn(true);

    try {
      const moveResult = await moveTeam(accessCode, teamId, targetNodeId);
      const currentTeam = moveResult.session.teams.find((team) => team.id === teamId);

      setBoardTeams(moveResult.session.teams);
      setCurrentMoveNode(moveResult.currentNode);
      setDestinationNodes([]);
      setSelectedDestinationNodeId("");
      setMoveError(null);
      setDiceResetSignal((previousValue) => previousValue + 1);

      if (currentTeam) {
        applyRealtimeSession(moveResult.session, currentTeam);
      }
    } catch (error) {
      const fallbackMessage = selectedDestinationNode
        ? "El movimiento no es válido para la tirada actual. Prueba con otra casilla o sala."
        : "El movimiento no es válido para la tirada actual. Prueba con otra casilla o sala.";

      setMoveError(getSessionErrorMessage(error, fallbackMessage));
    } finally {
      setIsMovingPawn(false);
    }
  };

  const handleEmitSecretPassage = async () => {
    if (!currentMoveNode || currentMoveNode.kind !== "room") {
      return;
    }

    const destinationRoomNode = getSecretPassageDestinationNodeByRoomNodeId(currentMoveNode.id);
    const socket = lobbySocketRef.current;

    if (!destinationRoomNode || !socket) {
      setMoveError("No se ha podido usar el pasadizo porque la conexión realtime no está disponible.");
      return;
    }

    setIsEmittingSecretPassage(true);

    try {
      const response = await emitTeamSecretPassage(socket, currentMoveNode.id, destinationRoomNode.id);
      if (!response.ok) {
        setMoveError(response.error);
        return;
      }

      setDiceResetSignal((previousValue) => previousValue + 1);
      setCurrentMoveNode(null);
      void refreshMoveState();
    } catch {
      setMoveError("No se ha podido usar el pasadizo desde este terminal.");
    } finally {
      setIsEmittingSecretPassage(false);
    }
  };

  const applyGameConfig = (config: GameConfig) => {
    setBoardTheme(config);
    setCatNames({
      c1: config.cat1Name || "Sujetos",
      c2: config.cat2Name || "Objetos",
      c3: config.cat3Name || "Espacios",
    });

    const showMotifs = config.hasMotifs === true;
    const mapItems = (items: RawItem[], defaultIcon: React.ReactNode, defaultColor: string): ElementoItem[] => {
      return items.map((item) => ({
        name: item.name,
        desc: item.desc,
        motif: showMotifs ? item.motif : undefined,
        avatar: defaultIcon,
        color: defaultColor,
      }));
    };

    setCategories({
      c1: mapItems(config.subjects || [], <User className="w-3 h-3 text-cyan-400" />, "bg-cyan-950/30 border-cyan-800"),
      c2: mapItems(config.objects || [], <Box className="w-3 h-3 text-emerald-400" />, "bg-emerald-950/30 border-emerald-800"),
      c3: mapItems(config.spaces || [], <MapPin className="w-3 h-3 text-red-500" />, "bg-red-950/20 border-red-900"),
    });

    if (config.centerImage !== undefined) {
      setCenterImage(config.centerImage || "");
    }
  };

  // Fetch active config and map to Terminal's internal state
  React.useEffect(() => {
    const storedTheme = readStoredBoardTheme();

    if (storedTheme) {
      applyGameConfig(storedTheme as GameConfig);
      return;
    }

    const savedImg = localStorage.getItem("centerImage");
    if (savedImg) {
      setCenterImage(savedImg);
    }
  }, []);

  React.useEffect(() => {
    const accessCode = getStoredSessionCode();
    const teamId = getStoredTeamId();

    if (!accessCode || !teamId || sessionStatus === "LOBBY") {
      if (sessionStatus === "LOBBY") {
        setHandError(null);
        setIsLoadingHand(false);
      }

      return;
    }

    let active = true;
    setIsLoadingHand(true);
    setHandError(null);

    getTeamTerminalState(accessCode, teamId)
      .then((state) => {
        if (!active) {
          return;
        }

        const sessionConfig = state.session.skin as unknown as GameConfig;
        storeJoinedLobbySession({ session: state.session, team: state.team });
        applyGameConfig(sessionConfig);
        setBoardTeams(state.session.teams);
        setTeamName(state.team.name);
        setTeamColor(state.team.color);
        setSessionStatus(state.session.status);
        setSessionTurn(state.session.turn);
        setTeamHand(state.hand.map((card) => mapHandCardToTerminalCard(card, sessionConfig)));
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        setHandError(getSessionErrorMessage(error, "No se han podido cargar las cartas del equipo."));
      })
      .finally(() => {
        if (active) {
          setIsLoadingHand(false);
        }
      });

    return () => {
      active = false;
    };
  }, [sessionStatus]);

  React.useEffect(() => {
    const sessionId = getStoredSessionId();
    const teamId = getStoredTeamId();

    if (!sessionId || !teamId) {
      navigate("/join", { replace: true });
      return;
    }

    const socket = createLobbySocketClient();
    lobbySocketRef.current = socket;
    let isSubscribed = false;

    const sendHeartbeat = () => {
      if (!socket.connected || !isSubscribed) {
        return;
      }

      emitTeamHeartbeat(socket);
    };

    const heartbeatIntervalId = window.setInterval(sendHeartbeat, TEAM_HEARTBEAT_INTERVAL_MS);

    const applyGameStarted = (payload: GameStartedPayload) => {
      const currentTeam = payload.session.teams.find((team) => team.id === teamId) ?? null;

      if (!currentTeam) {
        setLobbyConnectionStatus("error");
        setLobbyError("El equipo seleccionado ya no pertenece a la partida actual.");
        return;
      }

      applyRealtimeSession(payload.session, currentTeam);
      setLobbyConnectionStatus("connected");
      setHandError(null);
    };

    const applyPresenceState = (state: LobbyPresenceState) => {
      const currentTeam = state.teams.find((team) => team.id === teamId);

      if (!currentTeam) {
        setLobbyConnectionStatus("error");
        setLobbyError("El equipo seleccionado ya no pertenece al lobby actual.");
        return;
      }

      setBoardTeams(
        state.teams.map((team) => ({
          id: team.id,
          name: team.name,
          color: team.color,
          positionX: team.positionX,
          positionY: team.positionY,
          falseAccusation: team.falseAccusation,
        }))
      );
      setTeamName(currentTeam.name);
      setTeamColor(currentTeam.color);
      setSessionStatus(state.status);
      setSessionTurn(state.turn);
      setLobbyConnectionStatus(currentTeam.connected ? "connected" : "disconnected");
    };

    socket.on("connect", async () => {
      setLobbyConnectionStatus("connecting");

      const response = await subscribeTeamToLobby(socket, sessionId, teamId);
      if (!response.ok) {
        setLobbyConnectionStatus("error");
        setLobbyError(response.error);
        return;
      }

      isSubscribed = true;
      setLobbyError(null);
      applyPresenceState(response.state);
      sendHeartbeat();
    });

    socket.on("lobby:presence-updated", applyPresenceState);
    socket.on("gameStarted", applyGameStarted);
    socket.on("disconnect", () => {
      isSubscribed = false;
      setLobbyConnectionStatus("disconnected");
    });
    socket.on("connect_error", () => {
      isSubscribed = false;
      setLobbyConnectionStatus("error");
      setLobbyError("No se ha podido conectar el terminal con la sala de espera.");
    });

    socket.connect();

    return () => {
      window.clearInterval(heartbeatIntervalId);
      lobbySocketRef.current = null;
      socket.disconnect();
    };
  }, [navigate]);

  React.useEffect(() => {
    if (!isMyTurn || activeTab !== "map" || sessionStatus !== "EN_CURSO") {
      setDestinationNodes([]);
      setSelectedDestinationNodeId("");
      setIsMoveConfirmOpen(false);
      setIsLoadingMoves(false);
      setDiceResetSignal((previousValue) => previousValue + 1);
      return;
    }

    if (sessionTurn?.dice !== null && destinationNodes.length === 0 && !isLoadingMoves) {
      void refreshMoveState();
      return;
    }

    if (sessionTurn?.dice === null) {
      setDestinationNodes([]);
      setSelectedDestinationNodeId("");
      setIsMoveConfirmOpen(false);
      setIsLoadingMoves(false);
      setDiceResetSignal((previousValue) => previousValue + 1);
    }
  }, [activeTab, destinationNodes.length, isLoadingMoves, isMyTurn, sessionStatus, sessionTurn?.currentTeamId, sessionTurn?.dice]);

  // Carga la posición actual del equipo al inicio del turno (dado=null) para detectar sala esquina
  React.useEffect(() => {
    if (!isMyTurn || sessionStatus !== "EN_CURSO" || sessionTurn?.dice !== null) {
      return;
    }
    void refreshMoveState();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyTurn, sessionStatus, sessionTurn?.currentTeamId]);

  const currentTeamMeta = teamColor ? getTeamMeta(teamColor) : null;
  const sessionStatusLabel =
    sessionStatus === "EN_CURSO"
      ? "PARTIDA EN CURSO"
      : sessionStatus === "REPARTO"
      ? "REPARTO DE CARTAS"
      : "SALA DE ESPERA";
  const connectionLabel =
    lobbyConnectionStatus === "connected"
      ? "CONECTADO"
      : lobbyConnectionStatus === "connecting"
      ? "CONECTANDO"
      : lobbyConnectionStatus === "disconnected"
      ? "DESCONECTADO"
      : "ERROR DE ENLACE";
  
  // Matrix state: "row-col" -> 0 (neutral), 1 (doubt), 2 (discarded)
  const [matrix, setMatrix] = useState<Record<string, number>>({});
  
  const handleCellClick = (row: string, col: string) => {
    const key = `${row}-${col}`;
    const current = matrix[key] || 0;
    const next = (current + 1) % 3;
    setMatrix(prev => ({ ...prev, [key]: next }));
  };

  const renderCellIcon = (state: number) => {
    if (state === 1) return <HelpCircle className="w-4 h-4 text-orange-500" />;
    if (state === 2) return <X className="w-4 h-4 text-red-500" />;
    return null;
  };

  const boardSpaces = mapBoardSpaces(boardTheme);
  const boardPawns = boardTeams
    .filter((team) => team.id === getStoredTeamId())
    .map((team) => ({
      id: team.id,
      color: team.color,
      positionX: team.positionX,
      positionY: team.positionY,
      opacity: 1,
      isCurrent: true,
    }));
  const selectedDestinationNode = destinationNodes.find((node) => node.id === selectedDestinationNodeId) ?? null;
  const secretPassageDestinationNode = currentMoveNode?.kind === "room"
    ? getSecretPassageDestinationNodeByRoomNodeId(currentMoveNode.id)
    : null;
  const canEmitSecretPassageEvent =
    sessionStatus === "EN_CURSO" &&
    isMyTurn &&
    sessionTurn?.dice === null &&
    currentMoveNode?.kind === "room" &&
    Boolean(secretPassageDestinationNode) &&
    lobbyConnectionStatus === "connected";
  const selectedDestinationRoomNode = currentMoveNode?.kind !== "room" && selectedDestinationNode
    ? getRoomEntryNodeByDoorNodeId(selectedDestinationNode.id)
    : null;
  const boardDebugHighlightedNodeIds = [currentMoveNode?.id, selectedDestinationNode?.id, selectedDestinationRoomNode?.id].filter(
    (nodeId): nodeId is string => Boolean(nodeId)
  );
  const currentTurnLabel = sessionTurn?.currentTeamName ?? "Sin turno activo";
  const currentTurnDiceLabel = sessionTurn?.dice
    ? `${sessionTurn.dice.valueOne} + ${sessionTurn.dice.valueTwo} = ${sessionTurn.dice.total}`
    : "Pendiente de lanzamiento";
  const currentTurnRemainingLabel = currentTurnRemainingMoves === null
    ? "Sin movimiento activo"
    : `Alcance de tirada: ${currentTurnRemainingMoves}`;

  return (
    <div className="flex flex-col h-[100dvh] w-full max-w-md mx-auto bg-[#020617] text-cyan-400 font-mono relative overflow-hidden shadow-2xl border-x border-slate-900">
      
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-slate-950/80 backdrop-blur-md border-b border-cyan-900/50 sticky top-0 z-50">
        <Link to="/" className="text-slate-500 hover:text-cyan-400 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="text-center flex flex-col items-center">
          <h2 className="text-xs font-bold text-emerald-400 tracking-widest uppercase flex items-center gap-2">
            Terminal
            <span
              data-cy="terminal-turn-indicator"
              className={`text-[8px] px-2 py-0.5 rounded-full font-bold border transition-colors ${isMyTurn ? 'bg-cyan-900 border-cyan-400 text-cyan-200' : 'bg-slate-800 border-slate-600 text-slate-400'}`}
              title={currentTurnLabel}
            >
              {isMyTurn ? "MI TURNO" : "ESPERA"}
            </span>
          </h2>
          <p className={`text-[10px] mt-1 ${currentTeamMeta?.textClass ?? 'text-slate-500'}`}>
            {teamName.toUpperCase()} - {sessionStatusLabel} - {connectionLabel}
          </p>
        </div>
        <div className={`w-3 h-3 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse ${isMyTurn ? 'bg-emerald-500 shadow-emerald-500/80' : 'bg-red-500 shadow-red-500/80'}`}></div>
      </div>

      {!lobbyError ? (
        <div data-cy="terminal-lobby-status-banner" className="px-4 py-2 bg-cyan-950/30 border-b border-cyan-900/50 text-[11px] text-cyan-100 uppercase tracking-[0.22em]">
          {sessionStatus === "EN_CURSO"
            ? `Turno actual: ${currentTurnLabel}. ${sessionTurn?.dice ? `Dados ${currentTurnDiceLabel}. ${currentTurnRemainingLabel}.` : "Sin tirada activa."}`
            : "Esperando a que el Game Master inicie la partida."}
        </div>
      ) : null}

      {lobbyError ? (
        <div className="px-4 py-2 bg-red-950/40 border-b border-red-900/60 text-[11px] text-red-100">
          {lobbyError}
        </div>
      ) : null}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden relative bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900/50 to-[#020617]">
        <AnimatePresence mode="wait">
          
          {/* MAP & DICE TAB */}
          {activeTab === "map" && (
            <motion.div 
              key="map"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 pb-20 bg-[#380b0b] flex flex-col items-center justify-start overflow-y-auto"
            >
              {/* Tablero sobre base cuadrada fija para mantener coordenadas y áreas clicables consistentes */}
              <div className="relative h-[clamp(18rem,88vw,26rem)] w-[clamp(18rem,88vw,26rem)] bg-black/50 rounded-b-xl border-b-2 border-slate-800 shadow-[0_0_30px_rgba(0,0,0,0.8)] flex-shrink-0 overflow-hidden">
                 <button
                   type="button"
                   data-cy="terminal-board-debug-toggle"
                   onClick={handleBoardDebugToggle}
                   className={`absolute right-3 top-3 z-40 rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] shadow-[0_0_10px_rgba(0,0,0,0.35)] ${isBoardDebugEnabled ? 'border-fuchsia-400/70 bg-fuchsia-950/75 text-fuchsia-100' : 'border-cyan-900/60 bg-slate-950/80 text-cyan-200'}`}
                   title="Activa la rejilla y los nodos del tablero para ajustar el mapa"
                 >
                   {isBoardDebugEnabled ? 'Debug on' : 'Debug off'}
                 </button>
                 <ThemedBoard
                   centerImage={centerImage}
                   spaces={boardSpaces}
                   showSpaceLabels={false}
                   pawns={boardPawns}
                   showDebugOverlay={isBoardDebugEnabled}
                   debugProbe={boardDebugProbe}
                   debugHighlightedNodeIds={boardDebugHighlightedNodeIds}
                   boardImageAlt="Mapa temático de la partida"
                   dataCy="terminal-themed-board"
                 >
                   {sessionStatus === "EN_CURSO" ? (
                     <div
                       data-cy="terminal-board-surface"
                       className="absolute inset-0 z-20 cursor-crosshair"
                       onClick={handleBoardSurfaceClick}
                     />
                   ) : null}

                   {/* Center Area for Dice (Only on My Turn) */}
                   {isMyTurn && (
                     <div
                       className="absolute z-30 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
                       style={{
                         left: toBoardPercent(BOARD_CENTER_IMAGE_BOUNDS.positionX),
                         top: `calc(${toBoardPercent(BOARD_CENTER_IMAGE_BOUNDS.positionY)} - ${DICE_CENTER_VERTICAL_OFFSET_PERCENT}%)`,
                         width: `${BOARD_CENTER_IMAGE_BOUNDS.widthPercent}%`,
                         height: `${BOARD_CENTER_IMAGE_BOUNDS.heightPercent}%`,
                       }}
                     >
                       <div className="scale-[0.28] sm:scale-[0.34] md:scale-[0.42] origin-center">
                         <DiceAnimation
                           dataCy="terminal-dice-roll"
                           disabled={sessionStatus !== "EN_CURSO" || !isMyTurn || sessionTurn?.dice !== null || isLoadingMoves || isMovingPawn}
                           resetSignal={diceResetSignal}
                            onRollRequest={handleDiceRoll}
                         />
                       </div>
                     </div>
                   )}

                   {/* Card Modal Overlay */}
                   <AnimatePresence>
                     {selectedCard && (
                       <motion.div 
                         initial={{ opacity: 0 }}
                         animate={{ opacity: 1 }}
                         exit={{ opacity: 0 }}
                         className="absolute inset-0 bg-black/80 z-40 flex items-center justify-center p-6 backdrop-blur-sm"
                         onClick={() => {
                           setSelectedCard(null);
                           setCardFlipped(false);
                         }}
                       >
                         <motion.div 
                           initial={{ scale: 0.8, y: 20 }}
                           animate={{ scale: 1, y: 0, rotateY: cardFlipped ? 180 : 0 }}
                           exit={{ scale: 0.8, opacity: 0 }}
                           transition={{ duration: 0.4, type: "spring" }}
                           onClick={(e) => { e.stopPropagation(); setCardFlipped(!cardFlipped); }}
                           className={`w-48 aspect-[2.5/3.5] rounded-xl border-4 ${selectedCard.color} shadow-[0_0_30px_rgba(0,0,0,0.8)] relative cursor-pointer [transform-style:preserve-3d]`}
                         >
                           {/* Front of card */}
                           <div className={`absolute inset-0 [backface-visibility:hidden] flex flex-col items-center justify-start text-center ${selectedCard.bg} bg-opacity-90 overflow-hidden rounded-lg`}>
                             <div className="w-full h-[60%] bg-black/40 border-b border-slate-700/50 flex flex-col items-center justify-center relative overflow-hidden">
                               {selectedCard.image ? (
                                 <img src={selectedCard.image} alt={selectedCard.name} className="w-full h-full object-cover opacity-90" />
                               ) : (
                                 <div className="w-12 h-12 bg-black/60 rounded-full flex items-center justify-center border border-slate-700">
                                   {selectedCard.type === catNames.c1 && <User className="w-6 h-6 text-slate-300" />}
                                   {selectedCard.type === catNames.c2 && <Box className="w-6 h-6 text-slate-300" />}
                                   {selectedCard.type === catNames.c3 && <MapPin className="w-6 h-6 text-slate-300" />}
                                 </div>
                               )}
                             </div>
                             <div className="w-full flex-1 flex flex-col items-center justify-center p-2">
                               <h4 className="font-bold text-sm tracking-widest uppercase text-white drop-shadow-md leading-tight line-clamp-2 px-1">{selectedCard.name}</h4>
                               <span className="text-[9px] uppercase tracking-widest text-slate-400 mt-2 bg-black/50 px-2 py-1 rounded border border-slate-800">{selectedCard.type}</span>
                             </div>
                           </div>
                           
                           {/* Back of card */}
                           <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] flex flex-col items-center justify-center p-4 text-center bg-slate-950 border border-slate-700">
                             <h4 className="font-bold text-xs tracking-widest uppercase text-slate-300 mb-4 border-b border-slate-800 pb-2 w-full">{selectedCard.name}</h4>
                             <p className="text-xs text-slate-400 leading-relaxed font-mono">{selectedCard.desc}</p>
                             <div className="mt-auto text-[8px] text-cyan-500 uppercase tracking-widest animate-pulse flex gap-1 items-center">
                                Toca para voltear
                             </div>
                           </div>
                         </motion.div>
                       </motion.div>
                     )}
                   </AnimatePresence>
                 </ThemedBoard>
              </div>

              {sessionStatus === "EN_CURSO" ? (
                <div className="w-full px-4 pt-4">
                  <div className="rounded-xl border border-cyan-900/50 bg-slate-950/70 px-4 py-3 shadow-[0_0_20px_rgba(0,0,0,0.35)]">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-[10px] font-bold tracking-widest uppercase text-cyan-300">Movimiento del peón</h3>
                      <span className="text-[9px] uppercase tracking-[0.2em] text-slate-500">
                        {currentMoveNode ? currentTurnRemainingLabel : "Esperando sincronización del peón"}
                      </span>
                    </div>

                    {moveError ? (
                      <p className="mt-3 text-[11px] text-red-200">
                        {moveError}
                      </p>
                    ) : null}

                    {!sessionTurn ? (
                      <p className="mt-3 text-[11px] text-slate-400">
                        Sincronizando el estado del turno actual.
                      </p>
                    ) : !isMyTurn ? (
                      <p className="mt-3 text-[11px] text-slate-400">
                        Ahora mismo juega {currentTurnLabel}. La terminal se activará automáticamente cuando llegue tu turno.
                      </p>
                    ) : sessionTurn.dice === null ? (
                      <div className="mt-3 space-y-3">
                        <p className="text-[11px] text-slate-400">
                          Pulsa Tirar dados para registrar la tirada del turno actual y desbloquear los destinos válidos en el tablero.
                        </p>
                      </div>
                    ) : isLoadingMoves ? (
                      <p className="mt-3 text-[11px] text-cyan-200 uppercase tracking-[0.18em]">
                        Preparando selector de destino...
                      </p>
                    ) : destinationNodes.length === 0 ? (
                      <p className="mt-3 text-[11px] text-slate-400">
                        La tirada actual no deja destinos seleccionables en el tablero.
                      </p>
                    ) : null}

                    {canEmitSecretPassageEvent && secretPassageDestinationNode ? (
                      <div className="mt-3 rounded-lg border border-amber-800/70 bg-amber-950/20 p-3">
                        <button
                          type="button"
                          data-cy="terminal-secret-passage-emit"
                          onClick={() => void handleEmitSecretPassage()}
                          disabled={isEmittingSecretPassage}
                          className="rounded-md border border-amber-500/70 bg-amber-500 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isEmittingSecretPassage ? "Usando..." : `Usar pasadizo → ${secretPassageDestinationNode.label}`}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <AlertDialog open={isMoveConfirmOpen} onOpenChange={handleMoveConfirmOpenChange}>
                <AlertDialogContent data-cy="terminal-move-confirm-dialog" className="max-w-sm border-cyan-900/60 bg-slate-950 text-cyan-100">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-sm font-black uppercase tracking-[0.18em] text-cyan-300">
                      Confirmar movimiento
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-sm text-slate-300">
                      Confirma para ejecutar el movimiento seleccionado.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel
                      data-cy="terminal-move-cancel"
                      className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white"
                    >
                      Cancelar
                    </AlertDialogCancel>
                    <AlertDialogAction
                      data-cy="terminal-move-confirm"
                      className="bg-emerald-600 text-slate-950 hover:bg-emerald-500"
                      disabled={isMovingPawn || !selectedDestinationNode}
                      onClick={() => void handleMovePawn(selectedDestinationNode?.id)}
                    >
                      Confirmar movimiento
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              
              {/* Inventory Cards List */}
              <div className="w-full flex-1 p-4 flex flex-col gap-3 min-h-[160px]">
                <h3 className="text-[10px] font-bold tracking-widest uppercase text-slate-500 flex items-center gap-2">
                  <Database className="w-3 h-3" /> INVENTARIO DE CARTAS
                </h3>
                {isLoadingHand ? (
                  <div data-cy="terminal-hand-state" className="rounded-lg border border-cyan-900/40 bg-cyan-950/10 px-4 py-3 text-xs uppercase tracking-[0.2em] text-cyan-200">
                    Cargando cartas del equipo...
                  </div>
                ) : handError ? (
                  <div data-cy="terminal-hand-state" className="rounded-lg border border-red-900/60 bg-red-950/20 px-4 py-3 text-xs text-red-100">
                    {handError}
                  </div>
                ) : teamHand.length === 0 ? (
                  <div data-cy="terminal-hand-state" className="rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3 text-xs text-slate-400">
                    {sessionStatus === "LOBBY"
                      ? "Las cartas se repartirán automáticamente cuando el Game Master inicie la partida."
                      : "Todavía no hay cartas disponibles para este terminal."}
                  </div>
                ) : (
                  <div data-cy="terminal-hand-list" className="flex gap-4 overflow-x-auto pb-2 scrollbar-none snap-x snap-mandatory">
                    {teamHand.map(card => (
                      <div 
                        data-cy="terminal-hand-card"
                        key={card.id} 
                        onClick={() => { setSelectedCard(card); setCardFlipped(false); }}
                        className={`w-28 flex-shrink-0 aspect-[2.5/3.5] rounded-lg border-2 ${card.color} ${card.bg} bg-opacity-40 flex flex-col items-center justify-start cursor-pointer snap-center hover:scale-105 transition-transform shadow-lg relative overflow-hidden`}
                      >
                        <div className="w-full h-1/2 relative overflow-hidden border-b border-slate-800">
                          {card.image ? (
                            <img src={card.image} alt={card.name} className="w-full h-full object-cover opacity-80" />
                          ) : (
                            <div className="w-full h-full bg-slate-900 flex items-center justify-center">
                              {card.kind === "SUJETO" && <User className="w-5 h-5 text-slate-400 opacity-80" />}
                              {card.kind === "OBJETO" && <Box className="w-5 h-5 text-slate-400 opacity-80" />}
                              {card.kind === "ESPACIO" && <MapPin className="w-5 h-5 text-slate-400 opacity-80" />}
                            </div>
                          )}
                          <div className="absolute top-0 right-0 w-6 h-6 bg-black/60 rounded-bl-full backdrop-blur-sm border-b border-l border-slate-700/50 flex items-start justify-end p-1">
                            {card.kind === "SUJETO" && <User className="w-3 h-3 text-cyan-400" />}
                            {card.kind === "OBJETO" && <Box className="w-3 h-3 text-emerald-400" />}
                            {card.kind === "ESPACIO" && <MapPin className="w-3 h-3 text-red-400" />}
                          </div>
                        </div>
                        <div className="p-2 w-full flex-1 flex items-center justify-center">
                          <span className="text-[9px] font-bold text-center leading-tight text-slate-200 uppercase px-1 line-clamp-2">{card.name}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* MATRIX TAB */}
          {activeTab === "matrix" && (
            <motion.div 
              key="matrix"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="p-2 pb-24"
            >
              <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden flex flex-col shadow-inner shadow-black">
                
                {/* Fixed Header Row */}
                <div className="flex bg-slate-900 border-b border-slate-700 sticky top-0 z-20 shadow-[0_4px_10px_rgba(0,0,0,0.5)]">
                  <div className="w-32 flex-shrink-0 p-2 border-r border-slate-700 flex items-center justify-center bg-slate-800">
                    <span className="text-[10px] text-slate-400 font-bold tracking-widest">ITEMS</span>
                  </div>
                  <div className="flex-1 flex overflow-x-auto scrollbar-none">
                    {TEAMS.map(team => {
                      const getTeamColor = (t: string) => {
                        const colors: Record<string, string> = { Rojo: 'bg-red-500', Amarillo: 'bg-yellow-500', Azul: 'bg-blue-500', Verde: 'bg-green-500', Morado: 'bg-purple-500', Blanco: 'bg-slate-200' };
                        return colors[t] || 'bg-slate-500';
                      };
                      return (
                      <div key={team} className="w-10 flex-shrink-0 border-r border-slate-800 flex items-center justify-center p-1">
                        <div className={`w-3 h-3 rounded-full ${getTeamColor(team)} opacity-80 shadow-[0_0_8px_currentColor]`}></div>
                      </div>
                    )})}
                  </div>
                </div>

                {/* Table Body */}
                <div className="overflow-y-auto max-h-[60vh] scrollbar-thin scrollbar-thumb-cyan-900 scrollbar-track-transparent">
                  {Object.entries(categories).map(([catKey, items]: [string, ElementoItem[]]) => {
                    const isC1 = catKey === 'c1';
                    const isC2 = catKey === 'c2';
                    const displayName = isC1 ? catNames.c1 : (isC2 ? catNames.c2 : catNames.c3);
                    
                    return (
                    <div key={catKey}>
                      {/* Category Header */}
                      <div className={`text-xs font-bold uppercase p-2 sticky left-0 z-10 border-y border-slate-800 ${
                        isC1 ? 'bg-blue-950/40 text-blue-400' :
                        isC2 ? 'bg-emerald-950/40 text-emerald-400' :
                        'bg-red-950/40 text-red-400'
                      }`}>
                        {displayName}
                      </div>
                      
                      {/* Items Rows */}
                      {items.map((item: ElementoItem) => {
                        const rowName = (!isC1 && !isC2 && item.motif) ? item.motif : item.name;
                        
                        return (
                        <div key={item.name} className="flex border-b border-slate-800/50 hover:bg-slate-900/50 transition-colors">
                          <div className="w-32 flex-shrink-0 p-2 border-r border-slate-800 flex items-center gap-2 overflow-hidden bg-slate-950">
                            <div className="p-1 rounded-md border border-slate-800 bg-slate-900 flex-shrink-0">
                              {item.avatar}
                            </div>
                            <span className="text-[10px] text-slate-300 leading-tight truncate w-full" title={rowName}>{rowName}</span>
                          </div>
                          <div className="flex-1 flex overflow-x-auto scrollbar-none">
                            {TEAMS.map(team => {
                              const state = matrix[`${rowName}-${team}`] || 0;
                              return (
                                <button
                                  key={team}
                                  onClick={() => handleCellClick(rowName, team)}
                                  className={`w-10 h-10 flex-shrink-0 border-r border-slate-800 flex items-center justify-center transition-colors ${
                                    state === 2 ? 'bg-red-950/20' : state === 1 ? 'bg-orange-950/10' : 'bg-transparent'
                                  }`}
                                >
                                  {renderCellIcon(state)}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )})}
                    </div>
                  )})}
                </div>
              </div>
            </motion.div>
          )}

          {/* NOTES TAB */}
          {activeTab === "notes" && (
            <motion.div 
              key="notes"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="p-4 pb-24 h-full flex flex-col"
            >
              <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-xl p-1 relative overflow-hidden">
                <div className="absolute top-0 left-8 bottom-0 w-[1px] bg-red-900/30 z-0"></div>
                <textarea 
                  className="w-full h-full bg-transparent resize-none p-4 pl-12 text-sm text-cyan-200 focus:outline-none z-10 relative font-mono leading-[32px] placeholder:text-slate-600"
                  style={{
                    backgroundImage: 'repeating-linear-gradient(transparent, transparent 31px, rgba(15, 23, 42, 0.8) 31px, rgba(15, 23, 42, 0.8) 32px)',
                    backgroundAttachment: 'local'
                  }}
                  placeholder="Inicia registro de análisis lógico..."
                  spellCheck="false"
                ></textarea>
              </div>
            </motion.div>
          )}

          {/* SUGGEST TAB */}
          {activeTab === "suggest" && (
            <motion.div 
              key="suggest"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="p-4 pb-24 flex flex-col gap-6"
            >
              <div className="bg-slate-900/80 border border-cyan-900/50 rounded-xl p-6 shadow-lg shadow-black flex flex-col gap-6">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div className="flex items-center gap-3">
                    <Cpu className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-sm font-bold tracking-widest uppercase text-emerald-400">Lanzar</h3>
                  </div>
                  <select 
                    value={suggestMode}
                    onChange={(e) => setSuggestMode(e.target.value)}
                    className="bg-slate-950 border border-cyan-900/50 rounded p-1 text-[10px] text-cyan-400 outline-none focus:border-cyan-500 font-bold uppercase tracking-widest"
                  >
                    <option value="hipotesis">Hipótesis</option>
                    <option value="acusacion">Acusación Final</option>
                  </select>
                </div>

                {/* 1. Selector de Espacios (C3) - CORREGIDO: Eliminados paréntesis triples */}
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] uppercase text-slate-500 flex items-center gap-2"><MapPin className="w-3 h-3"/> {catNames.c3} (Actual)</label>
                  <select 
                    value={selectedRoom}
                    onChange={(e) => setSelectedRoom(e.target.value)}
                    disabled={suggestMode === "hipotesis"}
                    className={`w-full bg-slate-900 border border-slate-800 focus:border-cyan-400 rounded-lg p-3 text-sm text-cyan-100 appearance-none outline-none focus:ring-1 focus:ring-cyan-500 transition-colors ${suggestMode === 'hipotesis' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <option value="" disabled>Selecciona...</option>
                    {/* SINTAXIS CORRECTA: (e: ElementoItem) => ... */}
                    {categories.c3.map((e: ElementoItem) => (
                      <option key={e.name} value={e.name}>{e.name}</option>
                    ))}
                  </select>
                </div>

                {/* 2. Selector de Sujetos (C1) - CORREGIDO: Cambiado 'any' por 'ElementoItem' */}
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] uppercase text-cyan-500 flex items-center gap-2"><User className="w-3 h-3"/> {catNames.c1}</label>
                  <select defaultValue="" className="w-full bg-slate-900 border border-cyan-800 focus:border-cyan-400 rounded-lg p-3 text-sm text-cyan-100 appearance-none outline-none focus:ring-1 focus:ring-cyan-500 transition-colors">
                    <option value="" disabled>Selecciona...</option>
                    {categories.c1.map((s: ElementoItem) => (
                      <option key={s.name} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                </div>

{/* 3. Selector de Objetos (C2) - CORREGIDO: Cambiado 'any' por 'ElementoItem' */}
<div className="flex flex-col gap-2">
  <label className="text-[10px] uppercase text-emerald-500 flex items-center gap-2"><Box className="w-3 h-3"/> {catNames.c2}</label>
  <select defaultValue="" className="w-full bg-slate-900 border border-emerald-800 focus:border-emerald-400 rounded-lg p-3 text-sm text-emerald-100 appearance-none outline-none focus:ring-1 focus:ring-emerald-500 transition-colors">
    <option value="" disabled>Selecciona...</option>
    {categories.c2.map((o: ElementoItem) => (
      <option key={o.name} value={o.name}>{o.name}</option>
    ))}
  </select>
</div>

                <button className={`w-full mt-4 text-slate-950 font-bold uppercase tracking-widest py-4 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 ${
                  suggestMode === "hipotesis" 
                    ? "bg-cyan-600 hover:bg-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.4)]" 
                    : "bg-red-600 hover:bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]"
                }`}>
                   {suggestMode === "hipotesis" ? "Lanzar Hipótesis" : "Realizar Acusación"}
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Bottom Navigation */}
      <div className="bg-slate-950 border-t border-cyan-900/50 flex justify-around p-2 pb-6 absolute bottom-0 w-full z-50 shadow-[0_-10px_30px_rgba(0,0,0,0.8)]">
        {[
          { id: "map", icon: MapIcon, label: "MAPA" },
          { id: "matrix", icon: Search, label: "MATRIZ" },
          { id: "notes", icon: FileText, label: "NOTAS" },
          { id: "suggest", icon: MessageSquare, label: "SUGERIR/ACUSAR" }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${
              activeTab === tab.id 
                ? "text-cyan-400 scale-110 drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]" 
                : "text-slate-600 hover:text-slate-400"
            }`}
          >
            <tab.icon className="w-6 h-6" strokeWidth={activeTab === tab.id ? 2.5 : 1.5} />
            <span className="text-[9px] font-bold tracking-widest uppercase">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

