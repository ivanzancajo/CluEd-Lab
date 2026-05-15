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
  emitTeamHeartbeat,
  emitTeamRefutation,
  emitTeamSecretPassage,
  emitTeamSuggestion,
  submitFinalChanceAccusation,
  subscribeTeamToLobby,
  type GameRefuteRequestPayload,
  type GameRefutationResultPayload,
  type GameResolutionPayload,
  type GameStatusChangedPayload,
  type GameStartedPayload,
  type LobbyEventMessage,
  type LobbySocketClient,
  type LobbyPresenceState,
} from "../../src/lib/lobbySocket";
import {
  findNearestBoardMovementNode,
  getBoardRoomSpaceSlotIndex,
  getRoomEntryNodeByDoorNodeId,
  getSecretPassageDestinationNodeByRoomNodeId,
  type BoardMovementNode,
} from "../../src/lib/boardMovement";
import { BOARD_CENTER_IMAGE_BOUNDS, BOARD_SPACE_SLOTS, mapBoardSpaces, readStoredBoardTheme, toBoardPercent, type StoredBoardTheme } from "../../src/lib/boardTheme";
import {
  type SuggestionSummary,
  type TeamPendingSuggestionState,
  type TeamTerminalState as SessionTerminalState,
} from "../../src/lib/sessionApi";
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
  accuseFinalSession,
  endTeamTurn,
  type FinalAccusationVerdict,
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
  id: string;
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

function resolveCurrentTeamBoardNode(teams: LobbySession["teams"], teamId: string | null): TeamMoveNode | null {
  if (!teamId) {
    return null;
  }

  const currentTeam = teams.find((team) => team.id === teamId);
  if (!currentTeam) {
    return null;
  }

  return findNearestBoardMovementNode(currentTeam.positionX, currentTeam.positionY);
}

function mergePublicCurrentMoveNode(
  previousNode: TeamMoveNode | null,
  teams: LobbySession["teams"],
  teamId: string | null
): TeamMoveNode | null {
  const resolvedNode = resolveCurrentTeamBoardNode(teams, teamId);
  const stablePreviousNode = previousNode as TeamMoveNode | null;

  if (stablePreviousNode?.kind === "room" && resolvedNode?.kind !== "room") {
    return stablePreviousNode;
  }

  return resolvedNode;
}

function buildSuggestionSentence(suggestion: SuggestionSummary) {
  return `${suggestion.subject.name} con ${suggestion.object.name} en ${suggestion.space.name}`;
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
  const [activeSuggestion, setActiveSuggestion] = useState<SuggestionSummary | null>(null);
  const [pendingSuggestion, setPendingSuggestion] = useState<TeamPendingSuggestionState | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [selectedObjectId, setSelectedObjectId] = useState("");
  const [selectedSpaceId, setSelectedSpaceId] = useState("");
  const [selectedRefuteCardId, setSelectedRefuteCardId] = useState("");
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [suggestionNotice, setSuggestionNotice] = useState<string | null>(null);
  const [isSubmittingSuggestion, setIsSubmittingSuggestion] = useState(false);
  const [isSubmittingRefutation, setIsSubmittingRefutation] = useState(false);
  const [isEndingTurn, setIsEndingTurn] = useState(false);
  const [isSubmittingAccusation, setIsSubmittingAccusation] = useState(false);
  const [accusationError, setAccusationError] = useState<string | null>(null);
  const [accusationFeedback, setAccusationFeedback] = useState<string | null>(null);
  const [latestAccusationVerdict, setLatestAccusationVerdict] = useState<FinalAccusationVerdict | null>(null);
  const [refutationResult, setRefutationResult] = useState<GameRefutationResultPayload | null>(null);
  const [resolutionState, setResolutionState] = useState<LobbySession["resolution"]>(null);
  const [resolutionNow, setResolutionNow] = useState(() => Date.now());
  
  const [categories, setCategories] = useState<{
    c1: ElementoItem[];
    c2: ElementoItem[];
    c3: ElementoItem[];
  }>({
    c1: CATEGORIES.sujetos.map(s => ({ id: s.name, ...s, desc: "Descripción", motif: "" })),
    c2: CATEGORIES.objetos.map(o => ({ id: o.name, ...o, desc: "Descripción", motif: "" })),
    c3: CATEGORIES.espacios.map(e => ({ id: e.name, ...e, desc: "Descripción", motif: "" }))
  });
  const [catNames, setCatNames] = useState({ c1: "Sujetos", c2: "Objetos", c3: "Espacios" });

  const storedTeamId = getStoredTeamId();
  const isMyTurn = sessionTurn?.currentTeamId === storedTeamId;
  const currentTurnRemainingMoves = sessionTurn?.remainingMoves ?? null;
  const currentTeamState = boardTeams.find((team) => team.id === storedTeamId) ?? null;
  const isTeamEliminated = Boolean(currentTeamState?.falseAccusation || currentTeamState?.eliminatedAt);
  const activeResolution = resolutionState;
  const isResolutionAwaitingInputs = activeResolution?.phase === "ESPERANDO_RESOLUCION";
  const isResolutionShowingSolution = activeResolution?.phase === "MOSTRANDO_SOLUCION";
  const isResolutionEligible = Boolean(storedTeamId && activeResolution?.eligibleTeamIds.includes(storedTeamId));
  const hasSubmittedResolution = Boolean(storedTeamId && activeResolution?.submittedTeamIds.includes(storedTeamId));
  const shouldForceFinalChanceModal = Boolean(activeResolution?.mode === "FINAL_CHANCE" && isResolutionAwaitingInputs);
  const isResolutionBlockingGameplay = Boolean(activeResolution);
  const resolutionCountdownSeconds = getResolutionCountdownSeconds(activeResolution?.deadlineAt, resolutionNow);
  const resolutionCountdownLabel = resolutionCountdownSeconds === null ? null : formatCountdownClock(resolutionCountdownSeconds);

  const [selectedCard, setSelectedCard] = useState<TerminalCard | null>(null);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [suggestMode, setSuggestMode] = useState("hipotesis");
  
  // Mock room for locking hypothesis
  const currentRoomMock = "Cámara Anecoica";

  React.useEffect(() => {
    const intervalId = window.setInterval(() => setResolutionNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const applyRealtimeSession = (session: LobbySession, currentTeam: LobbySession["teams"][number]) => {
    storeJoinedLobbySession({ session, team: currentTeam });
    setTeamName(currentTeam.name);
    setTeamColor(currentTeam.color);
    setSessionStatus(session.status);
    setBoardTeams(session.teams);
    setSessionTurn(session.turn);
    setActiveSuggestion(session.activeSuggestion);
    setResolutionState(session.resolution);
    setCurrentMoveNode((previousNode) => mergePublicCurrentMoveNode(previousNode, session.teams, currentTeam.id));
    setLobbyError(null);
  };

  const applyTerminalState = (state: SessionTerminalState) => {
    const sessionConfig = state.session.skin as unknown as GameConfig;

    storeJoinedLobbySession({ session: state.session, team: state.team });
    applyGameConfig(sessionConfig);
    setBoardTeams(state.session.teams);
    setTeamName(state.team.name);
    setTeamColor(state.team.color);
    setSessionStatus(state.session.status);
    setSessionTurn(state.session.turn);
    setActiveSuggestion(state.session.activeSuggestion);
    setResolutionState(state.session.resolution);
    setPendingSuggestion(state.pendingSuggestion);
    setCurrentMoveNode((previousNode) => mergePublicCurrentMoveNode(previousNode, state.session.teams, state.team.id));
    setTeamHand(state.hand.map((card) => mapHandCardToTerminalCard(card, sessionConfig)));
  };

  const refreshTerminalState = React.useEffectEvent(async () => {
    const accessCode = getStoredSessionCode();
    const teamId = getStoredTeamId();

    if (!accessCode || !teamId || sessionStatus === "LOBBY") {
      return null;
    }

    const state = await getTeamTerminalState(accessCode, teamId);
    applyTerminalState(state);
    return state;
  });

  const refreshMoveState = React.useEffectEvent(async () => {
    const accessCode = getStoredSessionCode();
    const teamId = getStoredTeamId();

    if (
      !accessCode ||
      !teamId ||
      sessionStatus !== "EN_CURSO" ||
      !isMyTurn ||
      activeSuggestion ||
      pendingSuggestion ||
      isResolutionBlockingGameplay
    ) {
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

    if (activeSuggestion || pendingSuggestion) {
      throw new Error("Hay una sugerencia pendiente de resolver antes de volver a mover el peón.");
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

    if (isTeamEliminated) {
      setMoveError(eliminatedMoveErrorMessage);
      return;
    }

    if (!isMyTurn) {
      setMoveError("Ahora mismo no puedes mover este peón porque no es tu turno.");
      return;
    }

    if (activeSuggestion || pendingSuggestion) {
      setMoveError("La partida está bloqueada hasta que se resuelva la sugerencia activa.");
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

    if (sessionStatus === "EN_CURSO" && isTeamEliminated) {
      setIsMoveConfirmOpen(false);
      setSelectedDestinationNodeId("");
      setMoveError(eliminatedMoveErrorMessage);
      return;
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

    if (isResolutionBlockingGameplay) {
      setMoveError("La partida está en fase de resolución y el movimiento queda bloqueado.");
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
    if (isResolutionBlockingGameplay) {
      setMoveError("La partida está en fase de resolución y el pasadizo queda bloqueado.");
      return;
    }

    const activeTerminalNode = currentMoveNode ?? resolveCurrentTeamBoardNode(boardTeams, storedTeamId);

    if (!activeTerminalNode || activeTerminalNode.kind !== "room") {
      return;
    }

    const destinationRoomNode = getSecretPassageDestinationNodeByRoomNodeId(activeTerminalNode.id);
    const socket = lobbySocketRef.current;

    if (!destinationRoomNode || !socket) {
      setMoveError("No se ha podido usar el pasadizo porque la conexión realtime no está disponible.");
      return;
    }

    setIsEmittingSecretPassage(true);

    try {
      const response = await emitTeamSecretPassage(socket, activeTerminalNode.id, destinationRoomNode.id);
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

  const handleSubmitSuggestion = async () => {
    if (isResolutionBlockingGameplay) {
      setSuggestionError("La fase de resolución bloquea temporalmente el canal de deducción.");
      return;
    }

    const socket = lobbySocketRef.current;
    const currentRoomNode = currentMoveNode ?? resolveCurrentTeamBoardNode(boardTeams, storedTeamId);

    if (!socket || !selectedSubjectId || !selectedObjectId || !currentRoomNode || currentRoomNode.kind !== "room") {
      return;
    }

    const roomSpaceSlotIndex = getBoardRoomSpaceSlotIndex(currentRoomNode.id);
    const currentRoomSpace = roomSpaceSlotIndex === null ? null : categories.c3[roomSpaceSlotIndex] ?? null;

    if (!currentRoomSpace) {
      setSuggestionError("No se ha podido identificar el espacio asociado a la sala actual.");
      return;
    }

    setSuggestionError(null);
    setSuggestionNotice(null);
    setRefutationResult(null);
    setIsSubmittingSuggestion(true);

    try {
      const response = await emitTeamSuggestion(socket, {
        subjectElementId: selectedSubjectId,
        objectElementId: selectedObjectId,
        spaceElementId: currentRoomSpace.id,
      });

      if (!response.ok) {
        setSuggestionError(response.error);
        return;
      }

      setSelectedSubjectId("");
      setSelectedObjectId("");
      setSuggestionNotice(
        response.status === "waiting-refutation"
          ? "Sugerencia registrada. Esperando la respuesta privada del equipo refutador."
          : "Sugerencia registrada. Nadie ha podido refutarla."
      );

      const refreshedState = await refreshTerminalState();
      if (refreshedState?.pendingSuggestion?.type === "AWAITING_REFUTATION") {
        setPendingSuggestion(refreshedState.pendingSuggestion);
      }
    } catch {
      setSuggestionError("No se ha podido registrar la sugerencia desde este terminal.");
    } finally {
      setIsSubmittingSuggestion(false);
    }
  };

  const handleSubmitRefutation = async () => {
    const socket = lobbySocketRef.current;

    if (!socket || !selectedRefuteCardId) {
      return;
    }

    setSuggestionError(null);
    setSuggestionNotice(null);
    setIsSubmittingRefutation(true);

    try {
      const response = await emitTeamRefutation(socket, selectedRefuteCardId);
      if (!response.ok) {
        setSuggestionError(response.error);
        return;
      }

      setPendingSuggestion(null);
      setSelectedRefuteCardId("");
      setSuggestionNotice("Carta mostrada. Solo el equipo sugerente verá cuál ha sido.");
      await refreshTerminalState();
    } catch {
      setSuggestionError("No se ha podido completar la refutación privada.");
    } finally {
      setIsSubmittingRefutation(false);
    }
  };

  const handleEndTurnFromRoom = async () => {
    const accessCode = getStoredSessionCode();
    const teamId = getStoredTeamId();

    if (!accessCode || !teamId) {
      return;
    }

    if (isResolutionBlockingGameplay) {
      setSuggestionError("La partida está en fase de resolución y no puedes cerrar turno manualmente.");
      return;
    }

    setSuggestionError(null);
    setSuggestionNotice(null);
    setIsEndingTurn(true);

    try {
      const result = await endTeamTurn(accessCode, teamId);
      const currentTeam = result.session.teams.find((team) => team.id === teamId);

      setPendingSuggestion(null);
      setActiveSuggestion(result.session.activeSuggestion);
      setDestinationNodes([]);
      setSelectedDestinationNodeId("");
      setDiceResetSignal((previousValue) => previousValue + 1);

      if (currentTeam) {
        applyRealtimeSession(result.session, currentTeam);
      }

      setSuggestionNotice("Turno cerrado sin lanzar sugerencia.");
    } catch (error) {
      setSuggestionError(getSessionErrorMessage(error, "No se ha podido cerrar el turno desde la sala actual."));
    } finally {
      setIsEndingTurn(false);
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
        id: item.id,
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

    refreshTerminalState()
      .then((state) => {
        if (!active || !state) {
          return;
        }
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

      setBoardTeams(state.teams.map((team) => team));
      setTeamName(currentTeam.name);
      setTeamColor(currentTeam.color);
      setSessionStatus(state.status);
      setSessionTurn(state.turn);
      setActiveSuggestion(state.activeSuggestion);
      setResolutionState(state.resolution);
      setCurrentMoveNode((previousNode) => mergePublicCurrentMoveNode(previousNode, state.teams, currentTeam.id));
      setLobbyConnectionStatus(currentTeam.connected ? "connected" : "disconnected");
    };

    const applyLobbyEvent = (event: LobbyEventMessage) => {
      if (event.type !== "final-accusation-verdict" || !event.accusationVerdict) {
        return;
      }

      setLatestAccusationVerdict(event.accusationVerdict);
      setAccusationFeedback(buildAccusationFeedback(event.accusationVerdict, teamId));
      setAccusationError(null);
    };

    const handleRefuteRequest = (payload: GameRefuteRequestPayload) => {
      setPendingSuggestion({
        type: "REFUTE_REQUEST",
        suggestion: payload.suggestion,
        matchingCards: payload.matchingCards,
      });
      setActiveSuggestion(payload.suggestion);
      setSelectedRefuteCardId(payload.matchingCards[0]?.id ?? "");
      setSuggestionError(null);
      setSuggestionNotice("Selecciona una carta para refutar en privado.");
      setRefutationResult(null);
      setActiveTab("suggest");
    };

    const handleRefutationResult = (payload: GameRefutationResultPayload) => {
      setPendingSuggestion(null);
      setActiveSuggestion(null);
      setRefutationResult(payload);
      setSuggestionError(null);
      setSuggestionNotice(
        payload.outcome === "REFUTED"
          ? `${payload.shownByTeamName ?? "Un equipo"} ha mostrado ${payload.shownCard?.name ?? "una carta"}.`
          : "Nadie ha podido refutar tu sugerencia."
      );
      setActiveTab("suggest");
      void refreshTerminalState();
    };

    const applyGameStatusChanged = (payload: GameStatusChangedPayload) => {
      const currentTeam = payload.session.teams.find((team) => team.id === teamId) ?? null;

      if (!currentTeam) {
        setLobbyConnectionStatus("error");
        setLobbyError("El equipo seleccionado ya no pertenece a la partida actual.");
        return;
      }

      applyRealtimeSession(payload.session, currentTeam);
      setLobbyConnectionStatus("connected");
      setMoveError(payload.status === "PAUSADA" ? "La partida esta pausada por el Game Master." : null);
    };

    const applyResolutionPayload = (payload: GameResolutionPayload) => {
      const currentTeam = payload.session.teams.find((team) => team.id === teamId) ?? null;

      if (!currentTeam) {
        setLobbyConnectionStatus("error");
        setLobbyError("El equipo seleccionado ya no pertenece a la partida actual.");
        return;
      }

      applyRealtimeSession(payload.session, currentTeam);
      setLobbyConnectionStatus("connected");
      setActiveTab("suggest");
      setSuggestMode("acusacion");
      setAccusationError(null);
      setAccusationFeedback(
        payload.resolution.phase === "ESPERANDO_RESOLUCION" && payload.resolution.submittedTeamIds.includes(teamId)
          ? "Esperando al resto de equipos..."
          : null
      );
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
    socket.on("lobby:event", applyLobbyEvent);
    socket.on("gameStarted", applyGameStarted);
    socket.on("game:status-changed", applyGameStatusChanged);
    socket.on("game:final-chance-start", applyResolutionPayload);
    socket.on("game:show-solution", applyResolutionPayload);
    socket.on("game:refute-request", handleRefuteRequest);
    socket.on("game:refutation-result", handleRefutationResult);
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
    if (
      !isMyTurn ||
      activeSuggestion ||
      pendingSuggestion ||
      isResolutionBlockingGameplay ||
      activeTab !== "map" ||
      sessionStatus !== "EN_CURSO"
    ) {
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
  }, [activeSuggestion, activeTab, destinationNodes.length, isLoadingMoves, isMyTurn, isResolutionBlockingGameplay, pendingSuggestion, sessionStatus, sessionTurn?.currentTeamId, sessionTurn?.dice]);

  // Carga la posición actual del equipo al inicio del turno (dado=null) para detectar sala esquina
  React.useEffect(() => {
    if (
      !isMyTurn ||
      activeSuggestion ||
      pendingSuggestion ||
      isResolutionBlockingGameplay ||
      sessionStatus !== "EN_CURSO" ||
      sessionTurn?.dice !== null
    ) {
      return;
    }
    void refreshMoveState();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSuggestion, isMyTurn, isResolutionBlockingGameplay, pendingSuggestion, sessionStatus, sessionTurn?.currentTeamId]);

  React.useEffect(() => {
    if (pendingSuggestion?.type === "REFUTE_REQUEST") {
      setSelectedRefuteCardId((currentValue) => {
        if (pendingSuggestion.matchingCards.some((card) => card.id === currentValue)) {
          return currentValue;
        }

        return pendingSuggestion.matchingCards[0]?.id ?? "";
      });
      return;
    }

    setSelectedRefuteCardId("");
  }, [pendingSuggestion]);

  React.useEffect(() => {
    if (selectedSubjectId && !categories.c1.some((item) => item.id === selectedSubjectId)) {
      setSelectedSubjectId("");
    }
  }, [categories.c1, selectedSubjectId]);

  React.useEffect(() => {
    if (selectedObjectId && !categories.c2.some((item) => item.id === selectedObjectId)) {
      setSelectedObjectId("");
    }
  }, [categories.c2, selectedObjectId]);

  const currentTeamMeta = teamColor ? getTeamMeta(teamColor) : null;
  const hasActiveTeams = boardTeams.some((team) => !team.falseAccusation && !team.eliminatedAt);
  const eliminatedMovementMessage = "Tu equipo ha sido eliminado. El peon permanece donde quedo y ya no volvera a tener turno. Si bloquea una puerta, seguira ocupandola.";
  const eliminatedMoveErrorMessage = "Tu equipo ya ha sido eliminado y no puede volver a mover este peon.";
  const eliminatedSuggestionMessage = "Tu equipo ha sido eliminado. Ya no puede sugerir ni acusar, pero debe mostrar una carta si la mesa le pide refutar y mantener la solucion en secreto.";
  const eliminatedRefuteMessage = "Aunque tu equipo este eliminado, debes mostrar una carta para refutar en privado y mantener la solucion del sobre en secreto.";
  const sessionStatusLabel =
    sessionStatus === "EN_CURSO"
      ? "PARTIDA EN CURSO"
      : sessionStatus === "PAUSADA"
      ? "PARTIDA PAUSADA"
      : sessionStatus === "FINALIZADA"
      ? "PARTIDA FINALIZADA"
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
  const resolvedCurrentMoveNode = currentMoveNode ?? resolveCurrentTeamBoardNode(boardTeams, storedTeamId);
  const secretPassageDestinationNode = resolvedCurrentMoveNode?.kind === "room"
    ? getSecretPassageDestinationNodeByRoomNodeId(resolvedCurrentMoveNode.id)
    : null;
  const canEmitSecretPassageEvent =
    sessionStatus === "EN_CURSO" &&
    isMyTurn &&
    !isTeamEliminated &&
    !isResolutionBlockingGameplay &&
    sessionTurn?.dice === null &&
    resolvedCurrentMoveNode?.kind === "room" &&
    !activeSuggestion &&
    !pendingSuggestion &&
    Boolean(secretPassageDestinationNode) &&
    lobbyConnectionStatus === "connected";
  const selectedDestinationRoomNode = resolvedCurrentMoveNode?.kind !== "room" && selectedDestinationNode
    ? getRoomEntryNodeByDoorNodeId(selectedDestinationNode.id)
    : null;
  const boardDebugHighlightedNodeIds = [resolvedCurrentMoveNode?.id, selectedDestinationNode?.id, selectedDestinationRoomNode?.id].filter(
    (nodeId): nodeId is string => Boolean(nodeId)
  );
  const currentTurnLabel = sessionTurn?.currentTeamName ?? "Sin turno activo";
  const currentTurnDiceLabel = sessionTurn?.dice
    ? `${sessionTurn.dice.valueOne} + ${sessionTurn.dice.valueTwo} = ${sessionTurn.dice.total}`
    : "Pendiente de lanzamiento";
  const currentTurnRemainingLabel = currentTurnRemainingMoves === null
    ? "Sin movimiento activo"
    : `Alcance de tirada: ${currentTurnRemainingMoves}`;
  const currentRoomLabel = resolvedCurrentMoveNode?.kind === "room" ? resolvedCurrentMoveNode.label : currentRoomMock;
  const currentRoomSpaceSlotIndex = resolvedCurrentMoveNode?.kind === "room"
    ? getBoardRoomSpaceSlotIndex(resolvedCurrentMoveNode.id)
    : null;
  const currentRoomSpace = currentRoomSpaceSlotIndex === null ? null : categories.c3[currentRoomSpaceSlotIndex] ?? null;
  const selectedSubject = categories.c1.find((item) => item.id === selectedSubjectId) ?? null;
  const selectedObject = categories.c2.find((item) => item.id === selectedObjectId) ?? null;
  const refuteRequest = pendingSuggestion?.type === "REFUTE_REQUEST" ? pendingSuggestion : null;
  const awaitingRefutation = pendingSuggestion?.type === "AWAITING_REFUTATION" ? pendingSuggestion : null;
  const selectedRefuteCard = refuteRequest?.matchingCards.find((card) => card.id === selectedRefuteCardId) ?? null;
  const canUseRealtimeSuggestion = lobbyConnectionStatus === "connected" && Boolean(lobbySocketRef.current);
  const canComposeSuggestion =
    suggestMode === "hipotesis" &&
    sessionStatus === "EN_CURSO" &&
    isMyTurn &&
    !isTeamEliminated &&
    !isResolutionBlockingGameplay &&
    resolvedCurrentMoveNode?.kind === "room" &&
    sessionTurn?.dice === null &&
    !activeSuggestion &&
    !pendingSuggestion;
  const suggestionPreview = currentRoomSpace && selectedSubject && selectedObject
    ? { subject: selectedSubject, object: selectedObject, space: currentRoomSpace }
    : null;
  const suggestionPanelMessage = refuteRequest
    ? isTeamEliminated
      ? eliminatedRefuteMessage
      : "Selecciona una carta para refutar en privado la sugerencia activa."
    : isResolutionAwaitingInputs
    ? hasSubmittedResolution
      ? "Tu acusación final ya se ha enviado. Esperando al resto de equipos."
      : isResolutionEligible
      ? "Última oportunidad activa. Debes enviar tu acusación final antes del cierre de la fase."
      : "Última oportunidad en curso. Tu equipo ya estaba eliminado y no participa en esta fase."
    : isResolutionShowingSolution
    ? "La solución ya ha sido revelada. La partida está cerrada."
    : isTeamEliminated
    ? eliminatedSuggestionMessage
    : activeSuggestion
    ? "La mesa está esperando a que termine la resolución de la sugerencia activa."
    : sessionStatus !== "EN_CURSO"
    ? "La deducción solo se habilita mientras la partida está en curso."
    : !isMyTurn
    ? `Solo puedes sugerir en tu turno. Ahora juega ${currentTurnLabel}.`
    : sessionTurn?.dice !== null
    ? "Completa el movimiento del peón antes de usar el canal de deducción."
    : resolvedCurrentMoveNode?.kind !== "room"
    ? "Debes terminar tu movimiento dentro de una sala para poder lanzar una sugerencia."
    : "La sala está lista. Puedes sugerir o cerrar el turno sin sugerencia.";
  const topStatusMessage = isResolutionAwaitingInputs
    ? hasSubmittedResolution
      ? `Última oportunidad activa. Tu acusación final ya está enviada y el terminal queda bloqueado hasta el cierre.${resolutionCountdownLabel ? ` Tiempo restante ${resolutionCountdownLabel}.` : ""}`
      : isResolutionEligible
      ? `Última oportunidad activa. Completa ahora tu acusación final, aunque no tengas el turno.${resolutionCountdownLabel ? ` Tiempo restante ${resolutionCountdownLabel}.` : ""}`
      : `Última oportunidad activa. Tu equipo no participa porque ya estaba eliminado.${resolutionCountdownLabel ? ` Tiempo restante ${resolutionCountdownLabel}.` : ""}`
    : isResolutionShowingSolution
    ? "La solución del crimen ha sido revelada. La partida ha terminado."
    : activeSuggestion
    ? `Sugerencia activa: ${buildSuggestionSentence(activeSuggestion)}.`
    : sessionStatus === "EN_CURSO"
    ? `Turno actual: ${currentTurnLabel}. ${sessionTurn?.dice ? `Dados ${currentTurnDiceLabel}. ${currentTurnRemainingLabel}.` : "Sin tirada activa."}`
    : sessionStatus === "PAUSADA"
    ? "Partida pausada por el Game Master. Esperando reanudacion."
    : sessionStatus === "FINALIZADA"
    ? hasActiveTeams
      ? "Partida finalizada. Ya no hay turnos activos."
      : "Partida finalizada. No quedan equipos activos."
    : "Esperando a que el Game Master inicie la partida.";
  const accusationBannerMessage = latestAccusationVerdict
    ? accusationFeedback ?? buildAccusationFeedback(latestAccusationVerdict, storedTeamId)
    : null;

  const handleFinalAccusation = async (options?: { resolutionMode?: boolean }) => {
    const accessCode = getStoredSessionCode();
    const teamId = getStoredTeamId();
    const socket = lobbySocketRef.current;
    const isResolutionMode = options?.resolutionMode ?? false;

    if (!accessCode || !teamId) {
      return;
    }

    if (sessionStatus !== "EN_CURSO") {
      setAccusationError("La acusación final solo está disponible mientras la partida sigue en curso.");
      return;
    }

    if (activeSuggestion || pendingSuggestion) {
      setAccusationError("No puedes realizar la acusación final mientras haya una sugerencia pendiente de resolución.");
      return;
    }

    if (!isResolutionMode && !isMyTurn) {
      setAccusationError("Solo puedes realizar la acusación final durante tu turno.");
      return;
    }

    if (!isResolutionMode && isTeamEliminated) {
      setAccusationError("Tu equipo ya está eliminado y no puede volver a acusar.");
      return;
    }

    if (isResolutionMode) {
      if (!activeResolution || activeResolution.mode !== "FINAL_CHANCE" || activeResolution.phase !== "ESPERANDO_RESOLUCION") {
        setAccusationError("La última oportunidad ya no está disponible para este terminal.");
        return;
      }

      if (!isResolutionEligible) {
        setAccusationError("Tu equipo no puede participar en la última oportunidad porque ya estaba eliminado.");
        return;
      }

      if (hasSubmittedResolution) {
        setAccusationError("Tu equipo ya ha enviado su acusación final y debe esperar al resto.");
        return;
      }

      if (!socket || !socket.connected) {
        setAccusationError("No hay conexión realtime para enviar la acusación final de resolución.");
        return;
      }
    }

    if (!selectedSubjectId || !selectedObjectId || !selectedSpaceId) {
      setAccusationError("Debes seleccionar un sujeto, un objeto y un espacio antes de acusar.");
      return;
    }

    setIsSubmittingAccusation(true);
    setAccusationError(null);

    try {
      if (isResolutionMode && socket) {
        const response = await submitFinalChanceAccusation(socket, {
          subjectElementId: selectedSubjectId,
          objectElementId: selectedObjectId,
          spaceElementId: selectedSpaceId,
        });

        if (!response.ok) {
          setAccusationError(response.error);
          return;
        }

        const currentTeam = response.payload.session.teams.find((team) => team.id === teamId) ?? null;

        if (currentTeam) {
          applyRealtimeSession(response.payload.session, currentTeam);
        }

        setResolutionState(response.payload.session.resolution);
        setAccusationFeedback(
          response.payload.resolution.phase === "ESPERANDO_RESOLUCION"
            ? "Esperando al resto de equipos..."
            : null
        );
        return;
      }

      const result = await accuseFinalSession(accessCode, teamId, {
        subjectElementId: selectedSubjectId,
        objectElementId: selectedObjectId,
        spaceElementId: selectedSpaceId,
      });
      const currentTeam = result.session.teams.find((team) => team.id === teamId) ?? null;

      if (currentTeam) {
        applyRealtimeSession(result.session, currentTeam);
      }

      setLatestAccusationVerdict(result.verdict);
      setAccusationFeedback(buildAccusationFeedback(result.verdict, teamId));
    } catch (error) {
      setAccusationError(
        getSessionErrorMessage(
          error,
          isResolutionMode
            ? "No se ha podido enviar la acusación final de resolución."
            : "No se ha podido resolver la acusación final."
        )
      );
    } finally {
      setIsSubmittingAccusation(false);
    }
  };

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
          <p data-cy="terminal-status-line" className={`text-[10px] mt-1 ${currentTeamMeta?.textClass ?? 'text-slate-500'}`}>
            {teamName.toUpperCase()} - {sessionStatusLabel} - {connectionLabel}
          </p>
        </div>
        <div className={`w-3 h-3 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse ${isMyTurn ? 'bg-emerald-500 shadow-emerald-500/80' : 'bg-red-500 shadow-red-500/80'}`}></div>
      </div>

      {!lobbyError ? (
        <div data-cy="terminal-lobby-status-banner" className="px-4 py-2 bg-cyan-950/30 border-b border-cyan-900/50 text-[11px] text-cyan-100 uppercase tracking-[0.22em]">
          {topStatusMessage}
        </div>
      ) : null}

      {lobbyError ? (
        <div className="px-4 py-2 bg-red-950/40 border-b border-red-900/60 text-[11px] text-red-100">
          {lobbyError}
        </div>
      ) : null}

      {accusationBannerMessage ? (
        <div
          data-cy="terminal-accusation-banner"
          className={`px-4 py-2 border-b text-[11px] ${
            latestAccusationVerdict?.outcome === "CORRECTA"
              ? "bg-emerald-950/40 border-emerald-900/60 text-emerald-100"
              : "bg-red-950/40 border-red-900/60 text-red-100"
          }`}
        >
          {accusationBannerMessage}
        </div>
      ) : null}

      <AlertDialog open={shouldForceFinalChanceModal} onOpenChange={() => undefined}>
        <AlertDialogContent data-cy="terminal-final-chance-modal" className="max-w-md border-amber-700/60 bg-slate-950 text-amber-50">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-black uppercase tracking-[0.18em] text-amber-300">
              {hasSubmittedResolution ? "Esperando al resto de equipos" : "Última oportunidad"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-amber-50/80">
              {hasSubmittedResolution
                ? "Tu acusación final ya está registrada. El terminal permanecerá bloqueado hasta que se cierre la fase de resolución."
                : isResolutionEligible
                ? "Todos los equipos activos deben enviar ahora una acusación final, aunque no tengan el turno."
                : "La fase de última oportunidad está en curso, pero tu equipo ya estaba eliminado y no participa en esta votación final."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {resolutionCountdownLabel ? (
            <div
              data-cy="terminal-final-chance-countdown"
              className={`rounded-2xl border px-4 py-4 ${
                resolutionCountdownSeconds === 0
                  ? "border-red-700/60 bg-red-950/25"
                  : "border-amber-700/60 bg-amber-950/20"
              }`}
            >
              <span className="block text-[10px] font-bold uppercase tracking-[0.22em] text-amber-200/90">
                Tiempo restante para la acusación final
              </span>
              <div className="mt-3 flex items-end justify-between gap-3">
                <p className="text-xs text-amber-100/80">
                  {resolutionCountdownSeconds === 0
                    ? "Cerrando la fase de resolución..."
                    : "El envío se cerrará automáticamente cuando el reloj llegue a cero."}
                </p>
                <span
                  className={`text-3xl font-black font-mono tracking-[0.18em] ${
                    resolutionCountdownSeconds === 0 ? "text-red-300" : "text-amber-50"
                  }`}
                >
                  {resolutionCountdownLabel}
                </span>
              </div>
            </div>
          ) : null}

          {isResolutionEligible && !hasSubmittedResolution ? (
            <div className="grid gap-3">
              <div className="rounded-2xl border border-rose-800/60 bg-slate-900/70 p-4">
                <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-rose-200">
                  <MapPin className="h-3.5 w-3.5" />
                  {catNames.c3}
                </label>
                <select
                  data-cy="terminal-final-chance-space"
                  value={selectedSpaceId}
                  onChange={(event) => setSelectedSpaceId(event.target.value)}
                  className="mt-3 w-full rounded-xl border border-rose-800/70 bg-slate-900/80 p-3 text-sm text-rose-100 outline-none focus:border-rose-400"
                >
                  <option value="" disabled>Selecciona...</option>
                  {BOARD_SPACE_SLOTS.map((slot, index) => {
                    const space = categories.c3[index];
                    const optionLabel = space?.name ?? `Sala ${index + 1}`;
                    const optionValue = space?.id ?? slot.id;

                    return (
                      <option key={optionValue} value={optionValue}>
                        {optionLabel}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="rounded-2xl border border-cyan-800/60 bg-slate-900/70 p-4">
                <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-200">
                  <User className="h-3.5 w-3.5" />
                  {catNames.c1}
                </label>
                <select
                  data-cy="terminal-final-chance-subject"
                  value={selectedSubjectId}
                  onChange={(event) => setSelectedSubjectId(event.target.value)}
                  className="mt-3 w-full rounded-xl border border-cyan-800/70 bg-slate-900/80 p-3 text-sm text-cyan-100 outline-none focus:border-cyan-400"
                >
                  <option value="" disabled>Selecciona...</option>
                  {categories.c1.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </div>

              <div className="rounded-2xl border border-emerald-800/60 bg-slate-900/70 p-4">
                <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-200">
                  <Box className="h-3.5 w-3.5" />
                  {catNames.c2}
                </label>
                <select
                  data-cy="terminal-final-chance-object"
                  value={selectedObjectId}
                  onChange={(event) => setSelectedObjectId(event.target.value)}
                  className="mt-3 w-full rounded-xl border border-emerald-800/70 bg-slate-900/80 p-3 text-sm text-emerald-100 outline-none focus:border-emerald-400"
                >
                  <option value="" disabled>Selecciona...</option>
                  {categories.c2.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </div>

              {accusationError ? (
                <div className="rounded-2xl border border-red-900/60 bg-red-950/20 px-4 py-3 text-[11px] text-red-100">
                  {accusationError}
                </div>
              ) : null}

              <button
                type="button"
                data-cy="terminal-final-chance-submit"
                onClick={() => void handleFinalAccusation({ resolutionMode: true })}
                disabled={isSubmittingAccusation || !selectedSubjectId || !selectedObjectId || !selectedSpaceId}
                className="w-full rounded-2xl bg-amber-500 px-4 py-4 text-sm font-black uppercase tracking-[0.22em] text-slate-950 shadow-[0_0_24px_rgba(245,158,11,0.35)] transition-all disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmittingAccusation ? "Enviando acusacion..." : "Enviar acusacion final"}
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-700/60 bg-amber-950/25 px-4 py-4 text-sm text-amber-50">
              {hasSubmittedResolution
                ? accusationFeedback ?? "Esperando al resto de equipos..."
                : "Permanece atento al revelado final de la solución."}
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel className="hidden" />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                   showSpaceLabels
                   spaceNameScale={0.88}
                   spaceMotifScale={0.72}
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
                          disabled={sessionStatus !== "EN_CURSO" || !isMyTurn || isResolutionBlockingGameplay || sessionTurn?.dice !== null || isLoadingMoves || isMovingPawn}
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
                        {currentMoveNode ? currentTurnRemainingLabel : ""}
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
                    ) : isTeamEliminated ? (
                      <p className="mt-3 text-[11px] text-slate-400">
                        {eliminatedMovementMessage}
                      </p>
                    ) : !isMyTurn ? (
                      <p className="mt-3 text-[11px] text-slate-400">
                        Ahora mismo juega {currentTurnLabel}. Se habilitará el lanzamiento de dados automáticamente cuando llegue tu turno.
                      </p>
                    ) : sessionTurn.dice === null ? (
                      <div className="mt-3 space-y-3">
                        <p className="text-[11px] text-slate-400">
                          Tira los dados para poder realizar un movimiento.
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
                          disabled={isEmittingSecretPassage || isResolutionBlockingGameplay}
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
                      disabled={isMovingPawn || isResolutionBlockingGameplay || !selectedDestinationNode}
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
              className="p-4 pb-24 flex flex-col gap-4 bg-[radial-gradient(circle_at_top,_rgba(6,182,212,0.16),_transparent_34%),linear-gradient(180deg,_rgba(8,47,73,0.18),_rgba(2,6,23,0.96)_72%)]"
            >
              <div data-cy="terminal-suggest-panel" className="relative overflow-hidden rounded-[28px] border border-cyan-900/50 bg-slate-950/75 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.18),_transparent_70%)]" />
                <div className="relative flex flex-col gap-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="inline-flex items-center gap-2 rounded-full border border-cyan-900/60 bg-cyan-950/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-200">
                        <MessageSquare className="h-3.5 w-3.5" />
                        Canal de deduccion
                      </div>
                      <h3 className="mt-3 text-lg font-black uppercase tracking-[0.2em] text-emerald-300">
                        Sugerencia y refutacion
                      </h3>
                    </div>

                    <div className="flex flex-col items-end gap-3">
                      <div className={`shrink-0 rounded-2xl border px-3 py-2 text-right text-[10px] font-bold uppercase tracking-[0.22em] ${
                        refuteRequest
                          ? "border-red-700/70 bg-red-950/40 text-red-100"
                          : awaitingRefutation || activeSuggestion
                          ? "border-amber-700/70 bg-amber-950/35 text-amber-100"
                          : isTeamEliminated
                          ? "border-red-700/70 bg-red-950/40 text-red-100"
                          : canComposeSuggestion
                          ? "border-emerald-700/70 bg-emerald-950/35 text-emerald-100"
                          : "border-slate-700 bg-slate-900/70 text-slate-400"
                      }`}>
                        {refuteRequest
                          ? "Refuta ahora"
                          : awaitingRefutation
                          ? "Esperando carta"
                          : activeSuggestion
                          ? "Mesa bloqueada"
                          : isTeamEliminated
                          ? "Equipo eliminado"
                          : canComposeSuggestion
                          ? "Sala lista"
                          : "Canal en espera"}
                      </div>

                      <select
                        data-cy="terminal-suggest-mode-select"
                        value={suggestMode}
                        onChange={(event) => setSuggestMode(event.target.value)}
                        className="rounded-xl border border-cyan-900/60 bg-slate-950/85 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-200 outline-none focus:border-cyan-500"
                      >
                        <option value="hipotesis">Hipotesis</option>
                        <option value="acusacion">Acusacion final</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-cyan-900/50 bg-cyan-950/20 p-3">
                      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300">
                        <MapPin className="h-3.5 w-3.5" />
                        Sala actual
                      </div>
                      <p className="mt-2 text-sm font-semibold text-white">{currentRoomSpace?.name ?? currentRoomLabel ?? "Sin sala activa"}</p>
                    </div>
                    <div className="rounded-2xl border border-emerald-900/50 bg-emerald-950/20 p-3">
                      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-300">
                        <Shield className="h-3.5 w-3.5" />
                        Turno
                      </div>
                      <p className="mt-2 text-sm font-semibold text-white">{isMyTurn ? "Control local" : currentTurnLabel}</p>
                    </div>
                  </div>

                  {suggestionError ? (
                    <div className="rounded-2xl border border-red-800/70 bg-red-950/30 px-4 py-3 text-sm text-red-100">
                      {suggestionError}
                    </div>
                  ) : null}

                  {suggestionNotice ? (
                    <div className="rounded-2xl border border-cyan-800/60 bg-cyan-950/25 px-4 py-3 text-sm text-cyan-100">
                      {suggestionNotice}
                    </div>
                  ) : null}

                  {suggestMode === "acusacion" ? (
                    <div data-cy="terminal-final-accusation-panel" className="rounded-[26px] border border-fuchsia-700/60 bg-[linear-gradient(145deg,rgba(88,28,135,0.25),rgba(15,23,42,0.95))] p-5 shadow-[0_12px_32px_rgba(88,28,135,0.16)]">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-fuchsia-200">Acusacion final</p>
                          <h4 className="mt-2 text-base font-black text-white">Resolucion definitiva del sobre</h4>
                        </div>
                        <div className="rounded-2xl border border-fuchsia-700/70 bg-fuchsia-950/35 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-fuchsia-100">
                          Riesgo maximo
                        </div>
                      </div>

                      <div data-cy="terminal-final-accusation-guard" className="mt-5 rounded-2xl border border-red-900/60 bg-red-950/15 px-4 py-3 text-[11px] text-red-100">
                        {isTeamEliminated
                          ? "Tu equipo ya ha sido eliminado y no puede realizar otra acusacion final."
                          : isResolutionAwaitingInputs
                          ? hasSubmittedResolution
                            ? "Tu acusación final ya está registrada. Debes esperar al resto de equipos."
                            : isResolutionEligible
                            ? "La última oportunidad está activa. Puedes acusar desde el modal aunque no tengas el turno."
                            : "Tu equipo ya estaba eliminado y no participa en la última oportunidad."
                          : activeSuggestion || pendingSuggestion
                          ? "La mesa sigue resolviendo una sugerencia. Espera a que termine la refutacion antes de acusar."
                          : !isMyTurn
                          ? `Solo puedes acusar durante tu turno. Ahora juega ${currentTurnLabel}.`
                          : "La acusacion final cierra tu turno. Si fallas, tu equipo queda eliminado."}
                      </div>

                      {accusationError ? (
                        <div className="mt-4 rounded-2xl border border-red-900/60 bg-red-950/20 px-4 py-3 text-[11px] text-red-100">
                          {accusationError}
                        </div>
                      ) : null}

                      <div className="mt-5 grid gap-3">
                        <div className="rounded-2xl border border-rose-800/60 bg-slate-950/45 p-4">
                          <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-rose-200">
                            <MapPin className="h-3.5 w-3.5" />
                            {catNames.c3}
                          </label>
                          <select
                            data-cy="terminal-final-accusation-space"
                            value={selectedSpaceId}
                            onChange={(event) => setSelectedSpaceId(event.target.value)}
                            className="mt-3 w-full rounded-xl border border-rose-800/70 bg-slate-900/80 p-3 text-sm text-rose-100 outline-none focus:border-rose-400"
                          >
                            <option value="" disabled>Selecciona...</option>
                            {BOARD_SPACE_SLOTS.map((slot, index) => {
                              const space = categories.c3[index];
                              const optionLabel = space?.name ?? `Sala ${index + 1}`;
                              const optionValue = space?.id ?? slot.id;

                              return (
                                <option key={optionValue} value={optionValue}>
                                  {optionLabel}
                                </option>
                              );
                            })}
                          </select>
                        </div>

                        <div className="rounded-2xl border border-cyan-800/60 bg-slate-950/45 p-4">
                          <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-200">
                            <User className="h-3.5 w-3.5" />
                            {catNames.c1}
                          </label>
                          <select
                            data-cy="terminal-final-accusation-subject"
                            value={selectedSubjectId}
                            onChange={(event) => setSelectedSubjectId(event.target.value)}
                            className="mt-3 w-full rounded-xl border border-cyan-800/70 bg-slate-900/80 p-3 text-sm text-cyan-100 outline-none focus:border-cyan-400"
                          >
                            <option value="" disabled>Selecciona...</option>
                            {categories.c1.map((item) => (
                              <option key={item.id} value={item.id}>{item.name}</option>
                            ))}
                          </select>
                        </div>

                        <div className="rounded-2xl border border-emerald-800/60 bg-slate-950/45 p-4">
                          <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-200">
                            <Box className="h-3.5 w-3.5" />
                            {catNames.c2}
                          </label>
                          <select
                            data-cy="terminal-final-accusation-object"
                            value={selectedObjectId}
                            onChange={(event) => setSelectedObjectId(event.target.value)}
                            className="mt-3 w-full rounded-xl border border-emerald-800/70 bg-slate-900/80 p-3 text-sm text-emerald-100 outline-none focus:border-emerald-400"
                          >
                            <option value="" disabled>Selecciona...</option>
                            {categories.c2.map((item) => (
                              <option key={item.id} value={item.id}>{item.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <button
                        data-cy="terminal-final-accusation-submit"
                        type="button"
                        onClick={() => void handleFinalAccusation()}
                        disabled={
                          isSubmittingAccusation ||
                          sessionStatus !== "EN_CURSO" ||
                          isResolutionBlockingGameplay ||
                          activeSuggestion !== null ||
                          pendingSuggestion !== null ||
                          !isMyTurn ||
                          isTeamEliminated ||
                          !selectedSubjectId ||
                          !selectedObjectId ||
                          !selectedSpaceId
                        }
                        className="mt-5 w-full rounded-2xl bg-red-600 px-4 py-4 text-sm font-black uppercase tracking-[0.24em] text-slate-950 shadow-[0_0_24px_rgba(239,68,68,0.35)] transition-all disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSubmittingAccusation ? "Resolviendo acusacion..." : "Realizar acusacion"}
                      </button>
                    </div>
                  ) : (
                    <>
                      {activeSuggestion ? (
                        <div data-cy="terminal-active-suggestion" className="rounded-[26px] border border-slate-700/80 bg-[linear-gradient(135deg,rgba(8,47,73,0.42),rgba(15,23,42,0.88))] p-5 shadow-[0_10px_30px_rgba(8,47,73,0.18)]">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-200">Sugerencia activa</p>
                              <h4 className="mt-2 text-base font-black text-white">{buildSuggestionSentence(activeSuggestion)}</h4>
                              <p className="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-300">
                                {activeSuggestion.emitterTeamName}
                                {activeSuggestion.receiverTeamName ? ` · Refuta ${activeSuggestion.receiverTeamName}` : " · En mesa"}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-cyan-800/70 bg-slate-950/60 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-200">
                              {activeSuggestion.receiverTeamName ? "En refutacion" : "Abierta"}
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 sm:grid-cols-3">
                            {[
                              { label: catNames.c1, element: activeSuggestion.subject, tone: "border-cyan-700/70 bg-cyan-950/30 text-cyan-100", icon: <User className="h-4 w-4 text-cyan-300" /> },
                              { label: catNames.c2, element: activeSuggestion.object, tone: "border-emerald-700/70 bg-emerald-950/30 text-emerald-100", icon: <Box className="h-4 w-4 text-emerald-300" /> },
                              { label: catNames.c3, element: activeSuggestion.space, tone: "border-rose-700/70 bg-rose-950/30 text-rose-100", icon: <MapPin className="h-4 w-4 text-rose-300" /> },
                            ].map((item) => (
                              <div key={item.label} className={`rounded-2xl border p-3 ${item.tone}`}>
                                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em]">
                                  {item.icon}
                                  {item.label}
                                </div>
                                <p className="mt-2 text-sm font-semibold">{item.element.name}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {refuteRequest ? (
                        <div data-cy="terminal-refute-panel" className="rounded-[26px] border border-red-800/70 bg-[linear-gradient(145deg,rgba(69,10,10,0.72),rgba(15,23,42,0.94))] p-5 shadow-[0_12px_32px_rgba(69,10,10,0.24)]">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-red-200">Solicitud privada de refutacion</p>
                              <h4 className="mt-2 text-base font-black text-white">Elige una carta para bloquear la sugerencia</h4>
                            </div>
                            <div className="rounded-2xl border border-red-700/80 bg-red-950/50 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-red-100">
                              Privado
                            </div>
                          </div>

                          {isTeamEliminated ? (
                            <div
                              data-cy="terminal-eliminated-refute-note"
                              className="mt-4 rounded-2xl border border-amber-700/70 bg-amber-950/25 px-4 py-3 text-[11px] text-amber-100"
                            >
                              {eliminatedRefuteMessage}
                            </div>
                          ) : null}

                          <div className="mt-5 grid gap-3">
                            {refuteRequest.matchingCards.map((card) => {
                              const isSelected = selectedRefuteCardId === card.id;
                              const tone = card.kind === "SUJETO"
                                ? "border-cyan-700/70 bg-cyan-950/25"
                                : card.kind === "OBJETO"
                                ? "border-emerald-700/70 bg-emerald-950/25"
                                : "border-rose-700/70 bg-rose-950/25";

                              return (
                                <button
                                  data-cy="terminal-refute-card"
                                  key={card.id}
                                  type="button"
                                  onClick={() => setSelectedRefuteCardId(card.id)}
                                  className={`rounded-2xl border p-4 text-left transition-all ${tone} ${isSelected ? "scale-[1.01] shadow-[0_0_0_1px_rgba(248,113,113,0.6),0_0_20px_rgba(127,29,29,0.28)]" : "opacity-90 hover:opacity-100"}`}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-2">
                                      {card.kind === "SUJETO" ? <User className="h-4 w-4 text-cyan-300" /> : card.kind === "OBJETO" ? <Box className="h-4 w-4 text-emerald-300" /> : <MapPin className="h-4 w-4 text-rose-300" />}
                                    </div>
                                    <div className="flex-1">
                                      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-300">{card.kind}</p>
                                      <p className="mt-1 text-sm font-semibold text-white">{card.name}</p>
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>

                          <button
                            data-cy="terminal-refute-submit"
                            type="button"
                            onClick={() => void handleSubmitRefutation()}
                            disabled={!selectedRefuteCard || isSubmittingRefutation || !canUseRealtimeSuggestion}
                            className="mt-5 w-full rounded-2xl bg-red-500 px-4 py-4 text-sm font-black uppercase tracking-[0.24em] text-slate-950 shadow-[0_0_24px_rgba(239,68,68,0.35)] transition-all disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isSubmittingRefutation ? "Mostrando carta..." : selectedRefuteCard ? `Mostrar ${selectedRefuteCard.name}` : "Selecciona una carta"}
                          </button>
                        </div>
                      ) : awaitingRefutation ? (
                        <div data-cy="terminal-awaiting-refutation" className="rounded-[26px] border border-amber-700/70 bg-[linear-gradient(145deg,rgba(120,53,15,0.42),rgba(15,23,42,0.94))] p-5 shadow-[0_12px_30px_rgba(120,53,15,0.18)]">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-200">Esperando refutacion</p>
                              <h4 className="mt-2 text-base font-black text-white">Tu sugerencia ya esta en mesa</h4>
                              <p className="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-amber-100/90">
                                {awaitingRefutation.suggestion.receiverTeamName
                                  ? `${awaitingRefutation.suggestion.receiverTeamName} eligiendo carta`
                                  : "Resolucion en curso"}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-amber-600/70 bg-amber-950/45 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-amber-100">
                              En curso
                            </div>
                          </div>
                        </div>
                      ) : refutationResult ? (
                        <div data-cy="terminal-refutation-result" className="rounded-[26px] border border-emerald-700/70 bg-[linear-gradient(145deg,rgba(6,78,59,0.46),rgba(15,23,42,0.94))] p-5 shadow-[0_12px_30px_rgba(6,78,59,0.2)]">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-200">Resultado privado</p>
                              <h4 className="mt-2 text-base font-black text-white">
                                {refutationResult.outcome === "REFUTED" ? "Tu sugerencia fue refutada" : "Nadie pudo refutar tu sugerencia"}
                              </h4>
                              <p className="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-emerald-100/90">
                                {refutationResult.outcome === "REFUTED"
                                  ? `${refutationResult.shownByTeamName ?? "Un equipo"} mostro una carta`
                                  : "Sin cartas coincidentes"}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-emerald-600/70 bg-emerald-950/45 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-100">
                              {refutationResult.outcome === "REFUTED" ? "Refutada" : "Sin refutar"}
                            </div>
                          </div>

                          {refutationResult.shownCard ? (
                            <div className="mt-4 rounded-2xl border border-emerald-700/60 bg-slate-950/55 p-4">
                              <div className="flex items-center gap-3">
                                <div className="rounded-xl border border-white/10 bg-slate-900/80 p-2">
                                  {refutationResult.shownCard.kind === "SUJETO" ? <User className="h-4 w-4 text-cyan-300" /> : refutationResult.shownCard.kind === "OBJETO" ? <Box className="h-4 w-4 text-emerald-300" /> : <MapPin className="h-4 w-4 text-rose-300" />}
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Carta revelada</p>
                                  <p className="mt-1 text-sm font-semibold text-white">{refutationResult.shownCard.name}</p>
                                  <p className="mt-1 text-xs text-slate-400">{refutationResult.shownCard.desc}</p>
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : canComposeSuggestion ? (
                        <div data-cy="terminal-compose-suggestion" className="rounded-[26px] border border-emerald-700/60 bg-[linear-gradient(145deg,rgba(6,95,70,0.28),rgba(15,23,42,0.94))] p-5 shadow-[0_12px_32px_rgba(6,95,70,0.16)]">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-200">Hipotesis operativa</p>
                              <h4 className="mt-2 text-base font-black text-white">Compone la sugerencia desde la sala actual</h4>
                            </div>
                            <div className="rounded-2xl border border-emerald-700/70 bg-emerald-950/45 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-100">
                              {currentRoomSpace?.name ?? "Sincronizando sala"}
                            </div>
                          </div>

                          <div className="mt-5 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-2xl border border-cyan-800/60 bg-slate-950/45 p-4">
                              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-200">
                                <User className="h-3.5 w-3.5" />
                                {catNames.c1}
                              </div>
                              <div className="mt-3 grid gap-2">
                                {categories.c1.map((item) => {
                                  const isSelected = selectedSubjectId === item.id;
                                  return (
                                    <button
                                      data-cy="terminal-suggest-subject"
                                      key={item.id}
                                      type="button"
                                      onClick={() => setSelectedSubjectId(item.id)}
                                      className={`rounded-xl border px-3 py-3 text-left transition-all ${isSelected ? "border-cyan-400 bg-cyan-950/40 shadow-[0_0_18px_rgba(34,211,238,0.18)]" : "border-slate-700 bg-slate-900/70 hover:border-cyan-700/60"}`}
                                    >
                                      <div className="flex items-center gap-3">
                                        <div className={`rounded-lg border p-2 ${item.color}`}>{item.avatar}</div>
                                        <p className="text-sm font-semibold text-white">{item.name}</p>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="rounded-2xl border border-emerald-800/60 bg-slate-950/45 p-4">
                              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-200">
                                <Box className="h-3.5 w-3.5" />
                                {catNames.c2}
                              </div>
                              <div className="mt-3 grid gap-2">
                                {categories.c2.map((item) => {
                                  const isSelected = selectedObjectId === item.id;
                                  return (
                                    <button
                                      data-cy="terminal-suggest-object"
                                      key={item.id}
                                      type="button"
                                      onClick={() => setSelectedObjectId(item.id)}
                                      className={`rounded-xl border px-3 py-3 text-left transition-all ${isSelected ? "border-emerald-400 bg-emerald-950/40 shadow-[0_0_18px_rgba(16,185,129,0.18)]" : "border-slate-700 bg-slate-900/70 hover:border-emerald-700/60"}`}
                                    >
                                      <div className="flex items-center gap-3">
                                        <div className={`rounded-lg border p-2 ${item.color}`}>{item.avatar}</div>
                                        <p className="text-sm font-semibold text-white">{item.name}</p>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          <div data-cy="terminal-suggestion-preview" className="mt-5 rounded-2xl border border-slate-700 bg-slate-950/65 p-4">
                            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Vista previa</p>
                            <p className="mt-2 text-sm text-white">
                              {suggestionPreview
                                ? `${suggestionPreview.subject.name} con ${suggestionPreview.object.name} en ${suggestionPreview.space.name}`
                                : "Selecciona un sujeto y un objeto para completar la hipotesis desde la sala actual."}
                            </p>
                          </div>

                          <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
                            <button
                              data-cy="terminal-suggest-submit"
                              type="button"
                              onClick={() => void handleSubmitSuggestion()}
                              disabled={!suggestionPreview || isSubmittingSuggestion || isResolutionBlockingGameplay || !canUseRealtimeSuggestion}
                              className="rounded-2xl bg-cyan-500 px-4 py-4 text-sm font-black uppercase tracking-[0.24em] text-slate-950 shadow-[0_0_24px_rgba(34,211,238,0.3)] transition-all disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isSubmittingSuggestion ? "Enviando sugerencia..." : "Lanzar sugerencia"}
                            </button>
                            <button
                              data-cy="terminal-end-turn-submit"
                              type="button"
                              onClick={() => void handleEndTurnFromRoom()}
                              disabled={isEndingTurn || isResolutionBlockingGameplay}
                              className="rounded-2xl border border-slate-600 bg-slate-900/75 px-4 py-4 text-sm font-black uppercase tracking-[0.24em] text-slate-200 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isEndingTurn ? "Cerrando..." : "Terminar turno"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div data-cy="terminal-suggest-blocked" className="rounded-[26px] border border-slate-700/80 bg-[linear-gradient(145deg,rgba(15,23,42,0.92),rgba(2,6,23,0.98))] p-5">
                          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Canal bloqueado</p>
                          <h4 className="mt-2 text-base font-black text-white">Todavia no puedes interactuar con la sugerencia</h4>
                          <p className="mt-3 text-sm leading-relaxed text-slate-300">{suggestionPanelMessage}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      <AnimatePresence>
        {isResolutionShowingSolution && activeResolution?.solution ? (
          <motion.div
            key="terminal-solution-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[70] flex flex-col items-center justify-center gap-6 bg-slate-950/95 px-6 text-center"
            data-cy="terminal-solution-reveal"
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="space-y-2"
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-amber-300">
                {activeResolution.mode === "FINAL_CHANCE" ? "Resolución final" : "Solución revelada"}
              </p>
              <h3 className="text-2xl font-black uppercase tracking-[0.14em] text-white">
                Caso cerrado
              </h3>
            </motion.div>

            <div className="grid w-full max-w-xl gap-4 sm:grid-cols-3">
              {[
                { key: "subject", label: catNames.c1, card: activeResolution.solution.subject, tone: "border-cyan-700/70 bg-cyan-950/25 text-cyan-100" },
                { key: "object", label: catNames.c2, card: activeResolution.solution.object, tone: "border-emerald-700/70 bg-emerald-950/25 text-emerald-100" },
                { key: "space", label: catNames.c3, card: activeResolution.solution.space, tone: "border-rose-700/70 bg-rose-950/25 text-rose-100" },
              ].map((item, index) => (
                <motion.div
                  key={item.key}
                  data-cy={`terminal-solution-${item.key}`}
                  initial={{ opacity: 0, rotateY: -90, scale: 0.85 }}
                  animate={{ opacity: 1, rotateY: 0, scale: 1 }}
                  transition={{ delay: index * 0.14, duration: 0.4, type: "spring" }}
                  className={`rounded-3xl border px-4 py-6 shadow-[0_10px_30px_rgba(15,23,42,0.45)] ${item.tone}`}
                >
                  <span className="block text-[10px] font-bold uppercase tracking-[0.22em] opacity-70">{item.label}</span>
                  <p className="mt-3 text-lg font-black text-white">{item.card.name}</p>
                </motion.div>
              ))}
            </div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45, duration: 0.3 }}
              className="max-w-lg rounded-3xl border border-amber-700/60 bg-amber-950/20 px-5 py-4 text-sm text-amber-50"
            >
              {activeResolution.winningTeams.length === 0
                ? "Ningún equipo ha acertado la solución en la fase final."
                : activeResolution.winningTeams.length === 1
                ? `Equipo ganador: ${activeResolution.winningTeams[0]?.name ?? "Sin determinar"}.`
                : `Equipos ganadores: ${activeResolution.winningTeams.map((team) => team.name).join(", ")}.`}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

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

function buildAccusationFeedback(verdict: FinalAccusationVerdict, ownTeamId: string | null) {
  const accusedCards = `${verdict.accusation.subject.name}, ${verdict.accusation.object.name} y ${verdict.accusation.space.name}`;
  const isOwnVerdict = verdict.accuserTeamId === ownTeamId;

  if (verdict.outcome === "CORRECTA") {
    return isOwnVerdict
      ? `Has resuelto el sobre con ${accusedCards}. La partida ha terminado.`
      : `${verdict.accuserTeamName} ha resuelto el sobre con ${accusedCards}. La partida ha terminado.`;
  }

  if (isOwnVerdict) {
    return verdict.sessionFinished
      ? `Has fallado la acusación con ${accusedCards}. No quedan equipos activos.`
      : `Has fallado la acusación con ${accusedCards} y tu equipo queda eliminado.`;
  }

  return verdict.sessionFinished
    ? `${verdict.accuserTeamName} ha fallado la acusación con ${accusedCards}. La partida termina sin equipos activos.`
    : `${verdict.accuserTeamName} ha fallado la acusación con ${accusedCards} y queda eliminado.`;
}

function getResolutionCountdownSeconds(deadlineAt: string | null | undefined, currentTimestamp: number) {
  if (!deadlineAt) {
    return null;
  }

  const deadlineTimestamp = new Date(deadlineAt).getTime();

  if (Number.isNaN(deadlineTimestamp)) {
    return null;
  }

  return Math.max(0, Math.ceil((deadlineTimestamp - currentTimestamp) / 1000));
}

function formatCountdownClock(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
}

