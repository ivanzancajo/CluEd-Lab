/// <reference types="cypress" />

import { io, type Socket } from "socket.io-client";
import { BOARD_MOVEMENT_NODES, BOARD_ROOM_NODE_IDS_IN_SPACE_SLOT_ORDER } from "../../src/lib/boardMovement";

type TeamColor = "ROJO" | "AZUL" | "VERDE" | "AMARILLO" | "MORADO" | "BLANCO";
type TeamElementKind = "SUJETO" | "OBJETO" | "ESPACIO";

type CreatedSkin = {
  id: string;
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

type SkinItem = {
  id: string;
  name: string;
  desc: string;
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
    skin: {
      id: string;
      name: string;
      gameTitle: string;
      objective: string;
      duration: string;
      centerImage: string;
      cat1Name: string;
      cat2Name: string;
      cat3Name: string;
      hasMotifs: boolean;
      subjects: SkinItem[];
      objects: SkinItem[];
      spaces: SkinItem[];
      createdAt: number;
      updatedAt: number;
    };
  };
  team: JoinedTeam;
  hand: TeamHandCard[];
  pendingSuggestion: unknown;
};

type TeamMoveState = {
  currentNode: {
    id: string;
    kind: "spawn" | "square" | "room";
    label: string;
  };
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

type SuggestionElement = {
  id: string;
  kind: TeamElementKind;
  name: string;
  desc: string;
};

type GameSuggestAck =
  | {
      ok: true;
      status: "waiting-refutation" | "resolved-without-refutation";
      occurredAt: number;
    }
  | {
      ok: false;
      error: string;
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

type GameRefuteRequestPayload = {
  suggestion: {
    eventId: string;
    emitterTeamId: string;
    emitterTeamName: string;
    receiverTeamId: string | null;
    receiverTeamName: string | null;
    subject: SuggestionElement;
    object: SuggestionElement;
    space: SuggestionElement;
  };
  matchingCards: SuggestionElement[];
  occurredAt: number;
};

type GameRefutationResultPayload = {
  suggestion: {
    eventId: string;
    emitterTeamId: string;
    emitterTeamName: string;
    subject: SuggestionElement;
    object: SuggestionElement;
    space: SuggestionElement;
  };
  outcome: "REFUTED" | "UNREFUTED";
  occurredAt: number;
  shownCard?: SuggestionElement;
  shownByTeamId?: string;
  shownByTeamName?: string;
};

type CollectionKey = "subjects" | "objects" | "spaces";

const API_BASE_URL = "http://localhost:4000/api";
const SOCKET_BASE_URL = "http://localhost:4000";

const REQUIRED_COUNTS: Record<CollectionKey, number> = {
  subjects: 6,
  objects: 6,
  spaces: 9,
};

function buildItems(prefix: string, count: number) {
  return Array.from({ length: count }, (_value, index) => ({
    name: `${prefix} ${index + 1}`,
    desc: `Descripcion de ${prefix} ${index + 1}`,
    imageUrl: `https://example.com/${prefix.toLowerCase()}-${index + 1}.png`,
  }));
}

function buildSkinPayload(name: string) {
  return {
    name,
    gameTitle: "SCRUM 84 frontend",
    objective: "Validar sugerencias, refutaciones y fin de turno en terminal.",
    duration: 45,
    centerImage: "",
    cat1Name: "Sujetos",
    cat2Name: "Objetos",
    cat3Name: "Espacios",
    hasMotifs: false,
    subjects: buildItems("Sujeto", REQUIRED_COUNTS.subjects),
    objects: buildItems("Objeto", REQUIRED_COUNTS.objects),
    spaces: buildItems("Espacio", REQUIRED_COUNTS.spaces),
  };
}

function loginAsAdmin() {
  return cy
    .request<{ token: string }>("POST", `${API_BASE_URL}/auth/login`, {
      username: "admin",
      password: "cluedo2026",
    })
    .its("body.token");
}

function createSkin(token: string, name: string) {
  return cy
    .request<{ item: CreatedSkin }>({
      method: "POST",
      url: `${API_BASE_URL}/config/skins`,
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: buildSkinPayload(name),
    })
    .its("body.item");
}

function createSession(token: string, skinId: string) {
  return cy
    .request<{ item: CreatedSession }>({
      method: "POST",
      url: `${API_BASE_URL}/game/sessions`,
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: { skinId },
    })
    .its("body.item");
}

function joinTeam(accessCode: string, color: TeamColor) {
  return cy
    .request<{ item: { team: JoinedTeam } }>({
      method: "POST",
      url: `${API_BASE_URL}/game/sessions/${accessCode}/join`,
      body: { color },
    })
    .its("body.item.team");
}

function startSession(token: string, accessCode: string) {
  return cy.request({
    method: "POST",
    url: `${API_BASE_URL}/game/sessions/${accessCode}/start`,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

function getTeamState(accessCode: string, teamId: string) {
  return cy
    .request<{ item: TeamState }>({
      method: "GET",
      url: `${API_BASE_URL}/game/sessions/${accessCode}/teams/${teamId}/state`,
    })
    .its("body.item");
}

function getTeamMoveState(accessCode: string, teamId: string) {
  return cy
    .request<{ item: TeamMoveState }>({
      method: "GET",
      url: `${API_BASE_URL}/game/sessions/${accessCode}/teams/${teamId}/moves`,
    })
    .its("body.item");
}

function connectTeamSocket(sessionId: string, teamId: string) {
  return new Cypress.Promise<Socket>((resolve, reject) => {
    const socket = io(SOCKET_BASE_URL, {
      path: "/socket.io",
      transports: ["websocket"],
      autoConnect: false,
    });

    socket.once("connect_error", (error) => {
      socket.disconnect();
      reject(error instanceof Error ? error : new Error("No se pudo conectar el socket del equipo."));
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

function emitSuggestion(
  socket: Socket,
  payload: { subjectElementId: string; objectElementId: string; spaceElementId: string }
) {
  return new Cypress.Promise<GameSuggestAck>((resolve) => {
    socket.emit("game:suggest", payload, resolve);
  });
}

function emitRefutation(socket: Socket, shownElementId: string) {
  return new Cypress.Promise<GameRefuteAck>((resolve) => {
    socket.emit("game:refute", { shownElementId }, resolve);
  });
}

function waitForSocketEvent<T>(socket: Socket, eventName: string) {
  return new Cypress.Promise<T>((resolve) => {
    socket.once(eventName, (payload: T) => resolve(payload));
  });
}

function visitTerminal(state: TeamState, team: JoinedTeam) {
  cy.visit("/terminal", {
    onBeforeLoad(window) {
      window.localStorage.setItem("sessionId", state.session.id);
      window.localStorage.setItem("sessionCode", state.session.accessCode);
      window.localStorage.setItem("sessionStatus", state.session.status);
      window.localStorage.setItem("teamId", team.id);
      window.localStorage.setItem("teamColor", team.color);
      window.localStorage.setItem("teamName", team.name);
      window.localStorage.setItem("activeConfig", JSON.stringify(state.session.skin));
      window.localStorage.setItem("centerImage", state.session.skin.centerImage || "");
    },
  });
}

function openSuggestTab() {
  cy.contains("button", "DEDUCIR").click();
  cy.get('[data-cy="terminal-suggest-panel"]').should("be.visible");
}

function openMapTab() {
  cy.contains("button", "MAPA").click();
  cy.get('[data-cy="terminal-themed-board"]').should("be.visible");
}

function waitForRoomMoveRequest(alias: string, roomNodeId: string) {
  cy.wait(alias).then((interception) => {
    const currentNode = interception.response?.body?.item?.currentNode as TeamMoveState["currentNode"] | undefined;

    expect(currentNode?.id).to.eq(roomNodeId);
    expect(currentNode?.kind).to.eq("room");
  });
}

function getRoomNodeIdForSpace(spaceId: string, state: TeamState) {
  const roomIndex = state.session.skin.spaces.findIndex((space) => space.id === spaceId);

  if (roomIndex < 0) {
    throw new Error(`No se ha encontrado la sala asociada al espacio ${spaceId}.`);
  }

  return BOARD_ROOM_NODE_IDS_IN_SPACE_SLOT_ORDER[roomIndex] as string;
}

function pickFirstItemOutsideSet(items: SkinItem[], excludedIds: Set<string>, errorMessage: string) {
  const item = items.find((candidate) => !excludedIds.has(candidate.id));

  if (!item) {
    throw new Error(errorMessage);
  }

  return item;
}

function seedTeamIntoRoom(sessionId: string, teamId: string, roomNodeId: string) {
  if (!BOARD_MOVEMENT_NODES[roomNodeId] || BOARD_MOVEMENT_NODES[roomNodeId]?.kind !== "room") {
    throw new Error(`La sala ${roomNodeId} no existe en el tablero.`);
  }

  const command = `cd /home/zancajoivan/Escritorio/TFG/backend && SESSION_ID=${JSON.stringify(sessionId)} TEAM_ID=${JSON.stringify(teamId)} ROOM_NODE_ID=${JSON.stringify(roomNodeId)} npx tsx src/scripts/setTeamRoomTurnState.ts`;

  return cy.exec(command, { timeout: 120000 });
}

describe("SCRUM-84 frontend sugerencia y refutacion", () => {
  const activeSockets: Socket[] = [];

  afterEach(() => {
    activeSockets.splice(0).forEach((socket) => socket.disconnect());
  });

  it("lanza una sugerencia desde la terminal y muestra el resultado privado cuando otro equipo la refuta", () => {
    const testName = `Skin Suggest Result ${Date.now()}`;

    loginAsAdmin().then((token) => {
      createSkin(token, testName).then((skin) => {
        createSession(token, skin.id).then((session) => {
          joinTeam(session.accessCode, "ROJO").then((redTeam) => {
            joinTeam(session.accessCode, "AZUL").then((blueTeam) => {
              startSession(token, session.accessCode).then(() => {
                getTeamState(session.accessCode, redTeam.id).then((redState) => {
                  getTeamState(session.accessCode, blueTeam.id).then((blueState) => {
                    const blueHandIds = new Set(blueState.hand.map((card) => card.id));
                    const blueSpaceCard = blueState.hand.find((card) => card.kind === "ESPACIO");

                    if (!blueSpaceCard) {
                      throw new Error("El equipo azul no tiene cartas de espacio para refutar la sugerencia de prueba.");
                    }

                    const roomNodeId = getRoomNodeIdForSpace(blueSpaceCard.id, redState);
                    const subject = pickFirstItemOutsideSet(
                      redState.session.skin.subjects,
                      blueHandIds,
                      "No se ha encontrado un sujeto fuera de la mano azul."
                    );
                    const object = pickFirstItemOutsideSet(
                      redState.session.skin.objects,
                      blueHandIds,
                      "No se ha encontrado un objeto fuera de la mano azul."
                    );

                    seedTeamIntoRoom(session.id, redTeam.id, roomNodeId);
                    getTeamMoveState(session.accessCode, redTeam.id).then((moveState) => {
                      expect(moveState.currentNode.id).to.eq(roomNodeId);
                      expect(moveState.currentNode.kind).to.eq("room");
                    });

                    let blueSocket: Socket | null = null;
                    let refuteRequestPromise: Cypress.Promise<GameRefuteRequestPayload> | null = null;

                    cy.then(() => connectTeamSocket(session.id, blueTeam.id)).then((socket) => {
                      blueSocket = socket;
                      activeSockets.push(socket);
                    });

                    visitTerminal(redState, redTeam);
                    cy.get('[data-cy="terminal-turn-indicator"]').should("contain.text", "MI TURNO");
                    cy.contains("CONECTADO").should("be.visible");
                    openSuggestTab();
                    cy.contains('[data-cy="terminal-suggest-subject"]', subject.name).click();
                    cy.contains('[data-cy="terminal-suggest-object"]', object.name).click();
                    cy.get('[data-cy="terminal-suggestion-preview"]').should("contain.text", blueSpaceCard.name);

                    cy.then(() => {
                      if (!blueSocket) {
                        throw new Error("El socket azul de prueba no está conectado.");
                      }

                      refuteRequestPromise = waitForSocketEvent<GameRefuteRequestPayload>(blueSocket, "game:refute-request");
                    });

                    cy.get('[data-cy="terminal-suggest-submit"]').click();
                    cy.get('[data-cy="terminal-awaiting-refutation"]').should("be.visible");
                    openMapTab();
                    cy.get('[data-cy="terminal-map-deduction-activity"]').should("contain.text", "Hipotesis");
                    cy.get('[data-cy="terminal-map-deduction-activity"]').should("contain.text", "En refutacion");
                    cy.get('[data-cy="terminal-map-deduction-focus"]').should("be.visible");
                    openSuggestTab();

                    cy.then(() => {
                      if (!refuteRequestPromise) {
                        throw new Error("No se ha preparado la espera de la solicitud de refutación.");
                      }
                    });

                    cy.then(() => {
                      if (!refuteRequestPromise || !blueSocket) {
                        throw new Error("No se ha preparado la espera de la solicitud de refutación.");
                      }

                      return refuteRequestPromise.then((payload) => {
                        expect(payload.matchingCards).to.have.length(1);
                        expect(payload.matchingCards[0]?.id).to.eq(blueSpaceCard.id);
                        return emitRefutation(blueSocket, blueSpaceCard.id);
                      });
                    }).then((ack) => {
                      expect(ack.ok).to.eq(true);
                    });

                    cy.get('[data-cy="terminal-refutation-result"]').scrollIntoView().should("be.visible");
                    cy.get('[data-cy="terminal-refutation-result"]').should("contain.text", "Tu sugerencia fue refutada");
                    cy.get('[data-cy="terminal-refutation-result"]').should("contain.text", blueSpaceCard.name);
                  });
                });
              });
            });
          });
        });
      });
    });
  });

  it("abre el panel de refutacion en la terminal y permite mostrar una carta privada", () => {
    const testName = `Skin Refute UI ${Date.now()}`;

    loginAsAdmin().then((token) => {
      createSkin(token, testName).then((skin) => {
        createSession(token, skin.id).then((session) => {
          joinTeam(session.accessCode, "ROJO").then((redTeam) => {
            joinTeam(session.accessCode, "AZUL").then((blueTeam) => {
              startSession(token, session.accessCode).then(() => {
                getTeamState(session.accessCode, redTeam.id).then((redState) => {
                  getTeamState(session.accessCode, blueTeam.id).then((blueState) => {
                    const blueHandIds = new Set(blueState.hand.map((card) => card.id));
                    const blueSpaceCard = blueState.hand.find((card) => card.kind === "ESPACIO");

                    if (!blueSpaceCard) {
                      throw new Error("El equipo azul no tiene cartas de espacio para la prueba de refutación UI.");
                    }

                    const subject = pickFirstItemOutsideSet(
                      redState.session.skin.subjects,
                      blueHandIds,
                      "No se ha encontrado un sujeto fuera de la mano azul."
                    );
                    const object = pickFirstItemOutsideSet(
                      redState.session.skin.objects,
                      blueHandIds,
                      "No se ha encontrado un objeto fuera de la mano azul."
                    );
                    const roomNodeId = getRoomNodeIdForSpace(blueSpaceCard.id, redState);

                    seedTeamIntoRoom(session.id, redTeam.id, roomNodeId);
                    getTeamMoveState(session.accessCode, redTeam.id).then((moveState) => {
                      expect(moveState.currentNode.id).to.eq(roomNodeId);
                      expect(moveState.currentNode.kind).to.eq("room");
                    });

                    let redSocket: Socket | null = null;
                    let refutationResultPromise: Cypress.Promise<GameRefutationResultPayload> | null = null;

                    cy.then(() => connectTeamSocket(session.id, redTeam.id)).then((socket) => {
                      redSocket = socket;
                      activeSockets.push(socket);
                    });

                    visitTerminal(blueState, blueTeam);
                    cy.get('[data-cy="terminal-turn-indicator"]').should("contain.text", "ESPERA");
                    cy.contains("CONECTADO").should("be.visible");

                    cy.then(() => {
                      if (!redSocket) {
                        throw new Error("El socket rojo no está conectado.");
                      }

                      refutationResultPromise = waitForSocketEvent<GameRefutationResultPayload>(redSocket, "game:refutation-result");
                      return emitSuggestion(redSocket, {
                        subjectElementId: subject.id,
                        objectElementId: object.id,
                        spaceElementId: blueSpaceCard.id,
                      });
                    }).then((ack) => {
                      expect(ack.ok).to.eq(true);
                      expect(ack.ok && ack.status).to.eq("waiting-refutation");
                    });

                    cy.get('[data-cy="terminal-refute-panel"]').scrollIntoView().should("be.visible");
                    openMapTab();
                    cy.get('[data-cy="terminal-map-deduction-activity"]').should("contain.text", "Refuta");
                    cy.get('[data-cy="terminal-map-deduction-activity"]').should("contain.text", blueSpaceCard.name);
                    cy.get('[data-cy="terminal-map-deduction-focus"]').should("be.visible");
                    openSuggestTab();
                    cy.get('[data-cy="terminal-refute-panel"]').scrollIntoView().should("be.visible");
                    cy.get('[data-cy="terminal-refute-card"]').should("have.length", 1);
                    cy.get('[data-cy="terminal-refute-card"]').should("contain.text", blueSpaceCard.name).click();
                    cy.get('[data-cy="terminal-refute-submit"]').click();

                    cy.then(() => {
                      if (!refutationResultPromise) {
                        throw new Error("No se ha preparado la espera del resultado de refutación." );
                      }

                      return refutationResultPromise;
                    }).then((payload) => {
                      expect(payload.outcome).to.eq("REFUTED");
                      expect(payload.shownCard?.id).to.eq(blueSpaceCard.id);
                    });

                    cy.get('[data-cy="terminal-refute-panel"]').should("not.exist");
                    cy.contains("Carta mostrada. Solo el equipo sugerente verá cuál ha sido.").should("be.visible");
                  });
                });
              });
            });
          });
        });
      });
    });
  });

  it("permite terminar el turno desde la sala sin lanzar una sugerencia", () => {
    const testName = `Skin End Turn ${Date.now()}`;

    loginAsAdmin().then((token) => {
      createSkin(token, testName).then((skin) => {
        createSession(token, skin.id).then((session) => {
          joinTeam(session.accessCode, "ROJO").then((redTeam) => {
            joinTeam(session.accessCode, "AZUL").then(() => {
              startSession(token, session.accessCode).then(() => {
                const roomNodeId = BOARD_ROOM_NODE_IDS_IN_SPACE_SLOT_ORDER[0] as string;
                seedTeamIntoRoom(session.id, redTeam.id, roomNodeId);
                getTeamMoveState(session.accessCode, redTeam.id).then((moveState) => {
                  expect(moveState.currentNode.id).to.eq(roomNodeId);
                  expect(moveState.currentNode.kind).to.eq("room");
                });

                cy.intercept("GET", `${API_BASE_URL}/game/sessions/${session.accessCode}/teams/${redTeam.id}/moves`).as("loadRedMoveStateEndTurn");
                getTeamState(session.accessCode, redTeam.id).then((seededRedState) => {
                  visitTerminal(seededRedState, redTeam);
                  waitForRoomMoveRequest("@loadRedMoveStateEndTurn", roomNodeId);
                  cy.get('[data-cy="terminal-turn-indicator"]').should("contain.text", "MI TURNO");
                  openSuggestTab();
                  cy.get('[data-cy="terminal-compose-suggestion"]').scrollIntoView().should("be.visible");
                  cy.get('[data-cy="terminal-end-turn-submit"]').click();

                  cy.get('[data-cy="terminal-turn-indicator"]').should("contain.text", "ESPERA");
                  cy.get('[data-cy="terminal-lobby-status-banner"]').should("contain.text", "Equipo Azul");
                  cy.contains("Turno cerrado sin lanzar sugerencia.").should("be.visible");
                });
              });
            });
          });
        });
      });
    });
  });

  it("muestra el resultado privado cuando nadie puede refutar la sugerencia", () => {
    const testName = `Skin Unrefuted ${Date.now()}`;

    loginAsAdmin().then((token) => {
      createSkin(token, testName).then((skin) => {
        createSession(token, skin.id).then((session) => {
          joinTeam(session.accessCode, "ROJO").then((redTeam) => {
            joinTeam(session.accessCode, "AZUL").then((blueTeam) => {
              startSession(token, session.accessCode).then(() => {
                getTeamState(session.accessCode, redTeam.id).then((redState) => {
                  getTeamState(session.accessCode, blueTeam.id).then((blueState) => {
                    const blueHandIds = new Set(blueState.hand.map((card) => card.id));
                    const subject = pickFirstItemOutsideSet(
                      redState.session.skin.subjects,
                      blueHandIds,
                      "No se ha encontrado un sujeto fuera de la mano azul."
                    );
                    const object = pickFirstItemOutsideSet(
                      redState.session.skin.objects,
                      blueHandIds,
                      "No se ha encontrado un objeto fuera de la mano azul."
                    );
                    const space = pickFirstItemOutsideSet(
                      redState.session.skin.spaces,
                      blueHandIds,
                      "No se ha encontrado un espacio fuera de la mano azul."
                    );
                    const roomNodeId = getRoomNodeIdForSpace(space.id, redState);

                    seedTeamIntoRoom(session.id, redTeam.id, roomNodeId);
                    getTeamMoveState(session.accessCode, redTeam.id).then((moveState) => {
                      expect(moveState.currentNode.id).to.eq(roomNodeId);
                      expect(moveState.currentNode.kind).to.eq("room");
                    });

                    cy.intercept("GET", `${API_BASE_URL}/game/sessions/${session.accessCode}/teams/${redTeam.id}/moves`).as("loadRedMoveStateUnrefuted");
                    getTeamState(session.accessCode, redTeam.id).then((seededRedState) => {
                      visitTerminal(seededRedState, redTeam);
                      waitForRoomMoveRequest("@loadRedMoveStateUnrefuted", roomNodeId);
                      cy.get('[data-cy="terminal-turn-indicator"]').should("contain.text", "MI TURNO");
                      openSuggestTab();
                      cy.get('[data-cy="terminal-suggest-panel"]').contains(space.name, { timeout: 10000 }).should("be.visible");
                      cy.get('[data-cy="terminal-compose-suggestion"]').scrollIntoView().should("be.visible");
                      cy.contains('[data-cy="terminal-suggest-subject"]', subject.name).click();
                      cy.contains('[data-cy="terminal-suggest-object"]', object.name).click();
                      cy.get('[data-cy="terminal-suggestion-preview"]').should("contain.text", space.name);
                      cy.get('[data-cy="terminal-suggest-submit"]').click();

                      cy.get('[data-cy="terminal-refutation-result"]').should("be.visible");
                      cy.get('[data-cy="terminal-refutation-result"]').should("contain.text", "Nadie pudo refutar tu sugerencia");
                      cy.get('[data-cy="terminal-awaiting-refutation"]').should("not.exist");
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