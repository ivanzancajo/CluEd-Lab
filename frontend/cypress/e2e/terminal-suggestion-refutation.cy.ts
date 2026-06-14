/// <reference types="cypress" />

import { io, type Socket } from "socket.io-client";

type TeamColor = "ROJO" | "AZUL" | "VERDE" | "AMARILLO" | "MORADO" | "BLANCO";
type TeamElementKind = "SUJETO" | "OBJETO" | "ESPACIO";


type SeededSkin = {
  skinId: string;
  skinName: string;
};

type CreatedSession = {
  id: string;
  accessCode: string;
};

type JoinedTeam = {
  id: string;
  name: string;
  color: TeamColor;
};

type TeamHandCard = {
  id: string;
  kind: TeamElementKind;
  name: string;
  desc: string;
};

type TeamState = {
  session: {
    id: string;
    accessCode: string;
    status: "EN_CURSO";
  };
  team: JoinedTeam;
  hand: TeamHandCard[];
};

type TeamSocketSubscribeAck =
  | {
      ok: true;
      state: unknown;
    }
  | {
      ok: false;
      error: string;
    };

type GameRefuteRequestPayload = {
  matchingCards: TeamHandCard[];
};

type GameRefuteAck =
  | {
      ok: true;
      occurredAt: number;
    }
  | {
      ok: false;
      error: string;
    };

type CollectionKey = "subjects" | "objects" | "spaces";

type NamedItem = {
  name: string;
  desc: string;
  imageUrl: string;
};

const ROOM_NODE_IDS_IN_SPACE_SLOT_ORDER = [
  "sala-superior-izquierda",
  "sala-superior-centro",
  "sala-superior-derecha",
  "sala-media-izquierda",
  "sala-media-izquierda-inferior",
  "sala-media-derecha",
  "sala-inferior-izquierda",
  "sala-inferior-centro",
  "sala-inferior-derecha",
] as const;

const REQUIRED_COUNTS: Record<CollectionKey, number> = {
  subjects: 6,
  objects: 6,
  spaces: 9,
};

function buildItems(prefix: string, count: number): NamedItem[] {
  return Array.from({ length: count }, (_value, index) => ({
    name: `${prefix} ${index + 1}`,
    desc: `Descripcion de ${prefix} ${index + 1}`,
    imageUrl: `https://example.com/${prefix.toLowerCase()}-${index + 1}.png`,
  }));
}

function buildSpaces() {
  return [
    { name: "Camara Anecoica", desc: "Espacio 1", imageUrl: "https://example.com/espacio-1.png" },
    { name: "Sala Hedy Lamarr", desc: "Espacio 2", imageUrl: "https://example.com/espacio-2.png" },
    { name: "Central de Conmutacion", desc: "Espacio 3", imageUrl: "https://example.com/espacio-3.png" },
    { name: "Seminario Haykin", desc: "Espacio 4", imageUrl: "https://example.com/espacio-4.png" },
    { name: "Club de radio", desc: "Espacio 5", imageUrl: "https://example.com/espacio-5.png" },
    { name: "Laboratorio de Comunicaciones Opticas", desc: "Espacio 6", imageUrl: "https://example.com/espacio-6.png" },
    { name: "Lab. Electronica y Electricidad", desc: "Espacio 7", imageUrl: "https://example.com/espacio-7.png" },
    { name: "Seminario Maxwell", desc: "Espacio 8", imageUrl: "https://example.com/espacio-8.png" },
    { name: "Seminario Torres Quevedo", desc: "Espacio 9", imageUrl: "https://example.com/espacio-9.png" },
  ];
}

function buildSkinPayload(name: string) {
  return {
    name,
    gameTitle: "Deduccion realtime",
    objective: "Validar sugerencia, refutacion y cierre de turno desde el terminal.",
    duration: 45,
    centerImage: "",
    cat1Name: "Sujetos",
    cat2Name: "Objetos",
    cat3Name: "Espacios",
    hasMotifs: false,
    subjects: buildItems("Sujeto", REQUIRED_COUNTS.subjects),
    objects: buildItems("Objeto", REQUIRED_COUNTS.objects),
    spaces: buildSpaces(),
  };
}

function loginAsAdmin() {
  return cy
    .request<{ token: string }>("POST", "http://localhost:4000/api/auth/login", {
      username: "admin",
      password: "cluedo2026",
    })
    .its("body.token");
}

function createSession(token: string, skinId: string) {
  return cy
    .request<{ item: CreatedSession }>({
      method: "POST",
      url: "http://localhost:4000/api/game/sessions",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: { skinId },
    })
    .its("body.item");
}

function seedSkin(name: string) {
  return cy
    .exec(`cd ../backend && SKIN_NAME=${name} npx tsx src/scripts/createE2ESkin.ts`, {
      failOnNonZeroExit: true,
    })
    .then(({ stdout }) => {
      const trimmedOutput = stdout.trim();
      const jsonStart = trimmedOutput.lastIndexOf("{");

      if (jsonStart === -1) {
        throw new Error(`No se ha encontrado una salida JSON valida al sembrar la skin E2E: ${trimmedOutput}`);
      }

      return JSON.parse(trimmedOutput.slice(jsonStart)) as SeededSkin;
    });
}

function joinTeam(accessCode: string, color: TeamColor) {
  return cy
    .request<{ item: { team: JoinedTeam } }>({
      method: "POST",
      url: `http://localhost:4000/api/game/sessions/${accessCode}/join`,
      body: { color },
    })
    .its("body.item.team");
}

function startSession(token: string, accessCode: string) {
  return cy.request({
    method: "POST",
    url: `http://localhost:4000/api/game/sessions/${accessCode}/start`,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

function fetchTeamState(accessCode: string, teamId: string) {
  return cy
    .request<{ item: TeamState }>(`http://localhost:4000/api/game/sessions/${accessCode}/teams/${teamId}/state`)
    .its("body.item");
}

function setTeamRoomTurnState(sessionId: string, teamId: string, roomNodeId: string) {
  return cy.exec(
    `cd ../backend && SESSION_ID=${sessionId} TEAM_ID=${teamId} ROOM_NODE_ID=${roomNodeId} npx tsx src/scripts/setTeamRoomTurnState.ts`,
    { failOnNonZeroExit: true }
  );
}

function connectTeamSocket(sessionId: string, teamId: string) {
  return new Cypress.Promise<Socket>((resolve, reject) => {
    const socket = io("http://localhost:4000", {
      path: "/socket.io",
      transports: ["websocket"],
      autoConnect: false,
    });

    socket.once("connect_error", (error) => {
      socket.disconnect();
      reject(error instanceof Error ? error : new Error("No se pudo conectar el socket del equipo refutador."));
    });

    socket.once("connect", () => {
      socket.emit(
        "lobby:team-subscribe",
        { sessionId, teamId },
        (response: TeamSocketSubscribeAck) => {
          if (!response.ok) {
            socket.disconnect();
            reject(new Error(response.error));
            return;
          }

          resolve(socket);
        }
      );
    });

    socket.connect();
  });
}

function waitForRefuteRequest(socket: Socket) {
  return new Cypress.Promise<GameRefuteRequestPayload>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error("No ha llegado la peticion privada de refutacion."));
    }, 10000);

    socket.once("game:refute-request", (payload: GameRefuteRequestPayload) => {
      window.clearTimeout(timeoutId);
      resolve(payload);
    });
  });
}

function emitRefutation(socket: Socket, shownElementId: string) {
  return new Cypress.Promise<GameRefuteAck>((resolve) => {
    socket.emit("game:refute", { shownElementId }, resolve);
  });
}

function visitTerminal(session: CreatedSession, team: JoinedTeam, skinPayload: ReturnType<typeof buildSkinPayload>) {
  cy.visit("/terminal", {
    onBeforeLoad(window) {
      window.localStorage.setItem("sessionId", session.id);
      window.localStorage.setItem("sessionCode", session.accessCode);
      window.localStorage.setItem("sessionStatus", "EN_CURSO");
      window.localStorage.setItem("teamId", team.id);
      window.localStorage.setItem("teamColor", team.color);
      window.localStorage.setItem("teamName", team.name);
      window.localStorage.setItem("activeConfig", JSON.stringify(skinPayload));
      window.localStorage.setItem("centerImage", skinPayload.centerImage);
    },
  });
}

function openDeductionTab() {
  cy.contains("button", "SUGERIR/ACUSAR").click();
}

function chooseSuggestionPlan(hand: TeamHandCard[]) {
  const subjects = buildItems("Sujeto", REQUIRED_COUNTS.subjects);
  const objects = buildItems("Objeto", REQUIRED_COUNTS.objects);
  const spaces = buildSpaces();

  const matchingSubject = hand.find((card) => card.kind === "SUJETO");
  if (matchingSubject) {
    return {
      roomNodeId: ROOM_NODE_IDS_IN_SPACE_SLOT_ORDER[0],
      subjectName: matchingSubject.name,
      objectName: objects[0].name,
    };
  }

  const matchingObject = hand.find((card) => card.kind === "OBJETO");
  if (matchingObject) {
    return {
      roomNodeId: ROOM_NODE_IDS_IN_SPACE_SLOT_ORDER[0],
      subjectName: subjects[0].name,
      objectName: matchingObject.name,
    };
  }

  const matchingSpace = hand.find((card) => card.kind === "ESPACIO");
  if (!matchingSpace) {
    throw new Error("El equipo refutador no tiene ninguna carta util para el escenario.");
  }

  const spaceIndex = spaces.findIndex((space) => space.name === matchingSpace.name);
  if (spaceIndex === -1) {
    throw new Error(`No se ha podido mapear la carta de espacio ${matchingSpace.name} a una sala del tablero.`);
  }

  return {
    roomNodeId: ROOM_NODE_IDS_IN_SPACE_SLOT_ORDER[spaceIndex],
    subjectName: subjects[0].name,
    objectName: objects[0].name,
  };
}

describe("SCRUM-84 terminal de sugerencia y refutacion", () => {
  let refuterSocket: Socket | null = null;

  afterEach(() => {
    refuterSocket?.disconnect();
    refuterSocket = null;
  });

  it("permite terminar el turno desde una sala sin lanzar sugerencia", () => {
    const skinName = `e2e-end-turn-${Date.now()}`;
    const skinPayload = buildSkinPayload(skinName);

    loginAsAdmin().then((token) => {
      seedSkin(skinName).then((skin) => {
        createSession(token, skin.skinId).then((session) => {
          joinTeam(session.accessCode, "VERDE");
          joinTeam(session.accessCode, "ROJO").then((redTeam) => {
            joinTeam(session.accessCode, "AZUL").then((blueTeam) => {
              startSession(token, session.accessCode).then(() => {
                setTeamRoomTurnState(session.id, redTeam.id, ROOM_NODE_IDS_IN_SPACE_SLOT_ORDER[0]).then(() => {
                  visitTerminal(session, redTeam, skinPayload);

                  cy.get('[data-cy="terminal-turn-indicator"]').should("contain", "MI TURNO");
                  // El botón de terminar turno en sala está en la pestaña de mapa (vista por defecto).
                  cy.get('[data-cy="terminal-end-turn-submit"]').scrollIntoView();
                  cy.get('[data-cy="terminal-end-turn-submit"]').click({ force: true });

                  cy.get('[data-cy="terminal-turn-indicator"]').should("contain", "ESPERA");
                  cy.get('[data-cy="terminal-lobby-status-banner"]').should("contain", blueTeam.name);
                  openDeductionTab();
                  cy.get('[data-cy="terminal-suggest-blocked"]').should("contain", `Solo puedes sugerir en tu turno. Ahora juega ${blueTeam.name}.`);
                });
              });
            });
          });
        });
      });
    });
  });

  it("muestra la refutacion privada cuando otro equipo responde a la sugerencia", () => {
    const skinName = `e2e-suggest-${Date.now()}`;
    const skinPayload = buildSkinPayload(skinName);
    let refuteRequestPromise: Promise<GameRefuteRequestPayload> | null = null;

    loginAsAdmin().then((token) => {
      seedSkin(skinName).then((skin) => {
        createSession(token, skin.skinId).then((session) => {
          joinTeam(session.accessCode, "VERDE");
          joinTeam(session.accessCode, "ROJO").then((redTeam) => {
            joinTeam(session.accessCode, "AZUL").then((blueTeam) => {
              startSession(token, session.accessCode).then(() => {
                fetchTeamState(session.accessCode, blueTeam.id).then((blueState) => {
                  const suggestionPlan = chooseSuggestionPlan(blueState.hand);

                  setTeamRoomTurnState(session.id, redTeam.id, suggestionPlan.roomNodeId).then(() => {
                    cy.then(() => connectTeamSocket(session.id, blueTeam.id)).then((socket) => {
                      refuterSocket = socket;
                    });

                    visitTerminal(session, redTeam, skinPayload);
                    openDeductionTab();
                    cy.get('[data-cy="terminal-compose-suggestion"]').should("be.visible");
                    cy.get('[data-cy="terminal-suggest-subject"]').select(suggestionPlan.subjectName);
                    cy.get('[data-cy="terminal-suggest-object"]').select(suggestionPlan.objectName);
                    cy.get('[data-cy="terminal-suggestion-preview"]').should("contain", suggestionPlan.subjectName);
                    cy.get('[data-cy="terminal-suggestion-preview"]').should("contain", suggestionPlan.objectName);

                    cy.then(() => {
                      if (!refuterSocket) {
                        throw new Error("El socket del equipo refutador no esta conectado.");
                      }

                      refuteRequestPromise = waitForRefuteRequest(refuterSocket);
                    });

                    cy.get('[data-cy="terminal-suggest-submit"]').click();
                    cy.get('[data-cy="terminal-awaiting-refutation"]').should("be.visible");

                    cy.then(() => {
                      if (!refuteRequestPromise) {
                        throw new Error("No se ha registrado la espera de la peticion privada de refutacion.");
                      }

                      return refuteRequestPromise;
                    }).as("refuteRequest");

                    cy.get<GameRefuteRequestPayload>("@refuteRequest").then((payload) => {
                      const shownCard = payload.matchingCards[0];

                      expect(shownCard, "la peticion privada debe incluir cartas coincidentes").to.exist;
                      expect(refuterSocket, "el socket del equipo refutador debe seguir conectado").to.not.equal(null);

                      return emitRefutation(refuterSocket as Socket, shownCard.id).then((ack) => {
                        expect(ack.ok).to.eq(true);
                        return shownCard;
                      });
                    }).as("shownCard");

                    cy.get<TeamHandCard>("@shownCard").then((shownCard) => {
                      cy.get('[data-cy="terminal-refutation-result"]').should("be.visible");
                      cy.get('[data-cy="terminal-refutation-result"]').should("contain", "Tu sugerencia fue refutada");
                      cy.get('[data-cy="terminal-refutation-result"]').should("contain", shownCard.name);
                      cy.get('[data-cy="terminal-turn-indicator"]').should("contain", "ESPERA");
                      cy.get('[data-cy="terminal-lobby-status-banner"]').should("contain", blueTeam.name);
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});
