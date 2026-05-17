/// <reference types="cypress" />

import { io, type Socket } from "socket.io-client";

type TeamColor = "ROJO" | "AZUL" | "VERDE" | "AMARILLO" | "MORADO" | "BLANCO";
type TeamElementKind = "SUJETO" | "OBJETO" | "ESPACIO";

type CreatedSkin = { id: string };
type CreatedSession = { id: string; accessCode: string };
type JoinedTeam = { id: string; name: string; color: TeamColor };

type TeamHandCard = { id: string; kind: TeamElementKind; name: string; desc: string };

type StartGameAck =
  | { ok: true; payload: { session: { id: string; accessCode: string; status: "EN_CURSO" }; occurredAt: number } }
  | { ok: false; error: string };

type ConsultHiddenCardAck =
  | { ok: true; occurredAt: number }
  | { ok: false; error: string };

type GameHiddenCardDetailsPayload = {
  card: TeamHandCard;
  occurredAt: number;
};

type TeamSocketSubscribeAck =
  | { ok: true; state: unknown }
  | { ok: false; error: string };

const BACKEND_URL = "http://localhost:4000";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildItems(prefix: string, count: number) {
  return Array.from({ length: count }, (_, i) => ({
    name: `${prefix} ${i + 1}`,
    desc: `Desc ${prefix} ${i + 1}`,
    imageUrl: "",
  }));
}

function buildSkinPayload(name: string) {
  return {
    name,
    gameTitle: "SCRUM-104 Cartas Ocultas Test",
    objective: "Validar mecánica de cartas ocultas para 2 jugadores.",
    duration: 45,
    centerImage: "",
    cat1Name: "Sujetos",
    cat2Name: "Objetos",
    cat3Name: "Espacios",
    hasMotifs: false,
    subjects: buildItems("Sujeto", 6),
    objects: buildItems("Objeto", 6),
    spaces: buildItems("Espacio", 9),
  };
}

function loginAsAdmin() {
  return cy
    .request<{ token: string }>("POST", `${BACKEND_URL}/api/auth/login`, {
      username: "admin",
      password: "cluedo2026",
    })
    .its("body.token");
}

function createSkin(token: string, name: string) {
  return cy
    .request<{ item: CreatedSkin }>({
      method: "POST",
      url: `${BACKEND_URL}/api/config/skins`,
      headers: { Authorization: `Bearer ${token}` },
      body: buildSkinPayload(name),
    })
    .its("body.item");
}

function createSession(token: string, skinId: string) {
  return cy
    .request<{ item: CreatedSession }>({
      method: "POST",
      url: `${BACKEND_URL}/api/game/sessions`,
      headers: { Authorization: `Bearer ${token}` },
      body: { skinId },
    })
    .its("body.item");
}

function joinTeam(accessCode: string, color: TeamColor) {
  return cy
    .request<{ item: { team: JoinedTeam } }>({
      method: "POST",
      url: `${BACKEND_URL}/api/game/sessions/${accessCode}/join`,
      body: { color },
    })
    .its("body.item.team");
}

function connectAdminSocket(token: string) {
  return new Cypress.Promise<Socket>((resolve, reject) => {
    const socket = io(BACKEND_URL, {
      path: "/socket.io",
      transports: ["websocket"],
      autoConnect: false,
      auth: { token },
    });
    socket.once("connect_error", (error) => {
      socket.disconnect();
      reject(error instanceof Error ? error : new Error("Socket admin no se pudo conectar."));
    });
    socket.once("connect", () => resolve(socket));
    socket.connect();
  });
}

function connectTeamSocket(sessionId: string, teamId: string) {
  return new Cypress.Promise<Socket>((resolve, reject) => {
    const socket = io(BACKEND_URL, {
      path: "/socket.io",
      transports: ["websocket"],
      autoConnect: false,
    });
    socket.once("connect_error", (error) => {
      socket.disconnect();
      reject(error instanceof Error ? error : new Error("Socket equipo no se pudo conectar."));
    });
    socket.once("connect", () => {
      socket.emit("lobby:team-subscribe", { sessionId, teamId }, (ack: TeamSocketSubscribeAck) => {
        if (!ack.ok) {
          socket.disconnect();
          reject(new Error("lobby:team-subscribe falló."));
          return;
        }
        resolve(socket);
      });
    });
    socket.connect();
  });
}

function emitStartGame(socket: Socket, accessCode: string) {
  return new Cypress.Promise<StartGameAck>((resolve) => {
    socket.emit("startGame", { accessCode }, resolve);
  });
}

function emitConsultHiddenCard(socket: Socket, elementId: string) {
  return new Cypress.Promise<ConsultHiddenCardAck>((resolve) => {
    socket.emit("game:consult-hidden-card", { elementId }, resolve);
  });
}

function waitForSocketEvent<T>(socket: Socket, event: string) {
  return new Cypress.Promise<T>((resolve) => {
    socket.once(event, resolve);
  });
}

// ─── Escenarios ───────────────────────────────────────────────────────────────

describe("SCRUM-104 Cartas Ocultas — 2 jugadores", () => {
  let adminSocket: Socket | null = null;
  let teamSocket: Socket | null = null;

  afterEach(() => {
    adminSocket?.disconnect();
    adminSocket = null;
    teamSocket?.disconnect();
    teamSocket = null;
  });

  it("muestra 7 cartas en mano y el panel de cartas ocultas con 4 dorsos tras iniciar partida de 2 equipos", () => {
    // Skin 6+6+9=21 → 18 no-sol → 4 ocultas → 7/equipo
    const skinName = `Skin Ocultas-Panel ${Date.now()}`;

    loginAsAdmin().then((token) => {
      createSkin(token, skinName).then((skin) => {
        createSession(token, skin.id).then((session) => {
          joinTeam(session.accessCode, "ROJO").then((redTeam) => {
            joinTeam(session.accessCode, "AZUL").then(() => {
              cy.visit("/terminal", {
                onBeforeLoad(win) {
                  win.localStorage.setItem("sessionId", session.id);
                  win.localStorage.setItem("sessionCode", session.accessCode);
                  win.localStorage.setItem("sessionStatus", "LOBBY");
                  win.localStorage.setItem("teamId", redTeam.id);
                  win.localStorage.setItem("teamColor", redTeam.color);
                  win.localStorage.setItem("teamName", redTeam.name);
                },
              });

              cy.get('[data-cy="terminal-hand-state"]').should("contain", "Las cartas se repartirán automáticamente");

              cy.then(() => connectAdminSocket(token))
                .then((socket) => {
                  adminSocket = socket;
                  return emitStartGame(socket, session.accessCode);
                })
                .then((response) => {
                  expect(response.ok).to.eq(true);
                });

              // 7 cartas en mano (18 - 4 ocultas = 14, /2 = 7)
              cy.get('[data-cy="terminal-hand-list"]').should("be.visible");
              cy.get('[data-cy="terminal-hand-card"]').should("have.length", 7);

              // No hay sobrantes visibles en Evidencias Comunes
              cy.get('[data-cy="evidencias-comunes-panel"]').scrollIntoView().should("be.visible");
              cy.get('[data-cy="evidencias-comunes-empty"]').should("be.visible");
              cy.get('[data-cy="evidencias-comunes-card"]').should("not.exist");

              // Panel de cartas ocultas visible con 4 dorsos
              cy.get('[data-cy="cartas-ocultas-panel"]').scrollIntoView().should("be.visible");
              cy.get('[data-cy="carta-oculta"]').should("have.length", 4);
              cy.get('[data-cy="carta-oculta-consultar"]').should("have.length", 4);
            });
          });
        });
      });
    });
  });

  it("no muestra panel de cartas ocultas en partidas de 4 equipos (solo sobrantes visibles)", () => {
    // Skin 6+6+9=21 → 18 no-sol → 4 equipos → 4 c/u + 2 sobrantes visibles
    const skinName = `Skin Ocultas-Ausente ${Date.now()}`;

    loginAsAdmin().then((token) => {
      createSkin(token, skinName).then((skin) => {
        createSession(token, skin.id).then((session) => {
          joinTeam(session.accessCode, "ROJO").then((redTeam) => {
            joinTeam(session.accessCode, "AZUL").then(() => {
              joinTeam(session.accessCode, "VERDE").then(() => {
                joinTeam(session.accessCode, "AMARILLO").then(() => {
                  cy.visit("/terminal", {
                    onBeforeLoad(win) {
                      win.localStorage.setItem("sessionId", session.id);
                      win.localStorage.setItem("sessionCode", session.accessCode);
                      win.localStorage.setItem("sessionStatus", "LOBBY");
                      win.localStorage.setItem("teamId", redTeam.id);
                      win.localStorage.setItem("teamColor", redTeam.color);
                      win.localStorage.setItem("teamName", redTeam.name);
                    },
                  });

                  cy.then(() => connectAdminSocket(token))
                    .then((socket) => {
                      adminSocket = socket;
                      return emitStartGame(socket, session.accessCode);
                    })
                    .then((response) => {
                      expect(response.ok).to.eq(true);
                    });

                  cy.get('[data-cy="terminal-hand-list"]').should("be.visible");
                  cy.get('[data-cy="terminal-hand-card"]').should("have.length", 4);

                  // Panel de evidencias comunes con 2 sobrantes, sin cartas ocultas
                  cy.get('[data-cy="evidencias-comunes-card"]').should("have.length", 2);
                  cy.get('[data-cy="cartas-ocultas-panel"]').should("not.exist");
                });
              });
            });
          });
        });
      });
    });
  });

  it("consultar carta oculta muestra modal privado solo al equipo que consulta", () => {
    const skinName = `Skin Ocultas-Consulta ${Date.now()}`;

    loginAsAdmin().then((token) => {
      createSkin(token, skinName).then((skin) => {
        createSession(token, skin.id).then((session) => {
          joinTeam(session.accessCode, "ROJO").then((redTeam) => {
            joinTeam(session.accessCode, "AZUL").then((blueTeam) => {
              cy.visit("/terminal", {
                onBeforeLoad(win) {
                  win.localStorage.setItem("sessionId", session.id);
                  win.localStorage.setItem("sessionCode", session.accessCode);
                  win.localStorage.setItem("sessionStatus", "LOBBY");
                  win.localStorage.setItem("teamId", redTeam.id);
                  win.localStorage.setItem("teamColor", redTeam.color);
                  win.localStorage.setItem("teamName", redTeam.name);
                },
              });

              cy.then(() => connectAdminSocket(token))
                .then((socket) => {
                  adminSocket = socket;
                  return emitStartGame(socket, session.accessCode);
                })
                .then((response) => {
                  expect(response.ok).to.eq(true);
                });

              cy.get('[data-cy="cartas-ocultas-panel"]').scrollIntoView().should("be.visible");
              cy.get('[data-cy="carta-oculta"]').should("have.length", 4);

              // El modal no existe antes de consultar
              cy.get('[data-cy="carta-oculta-modal"]').should("not.exist");

              // Pulsar "Consultar en secreto" en la primera carta oculta
              cy.get('[data-cy="carta-oculta-consultar"]').first().scrollIntoView().click();

              // El modal de consulta secreta aparece con el nombre de la carta
              cy.get('[data-cy="carta-oculta-modal"]').should("be.visible");
              cy.get('[data-cy="carta-oculta-modal-name"]').should("not.be.empty");

              // Cerrar el modal tocando fuera
              cy.get('[data-cy="carta-oculta-modal"]').click({ force: true });
              cy.get('[data-cy="carta-oculta-modal"]').should("not.exist");

              // El equipo azul no debe recibir el evento (verificado vía socket externo)
              cy.then(() => connectTeamSocket(session.id, blueTeam.id)).then((blueSocket) => {
                teamSocket = blueSocket;
                // No hay evento pendiente para el equipo azul
                let received = false;
                blueSocket.on("game:hidden-card-details", () => { received = true; });

                // Esperar un momento para confirmar que no llega evento al equipo azul
                cy.wait(500).then(() => {
                  expect(received).to.eq(false);
                });
              });
            });
          });
        });
      });
    });
  });

  it("consulta oculta vía socket directo devuelve detalles de la carta al equipo solicitante", () => {
    const skinName = `Skin Ocultas-Socket ${Date.now()}`;

    loginAsAdmin().then((token) => {
      createSkin(token, skinName).then((skin) => {
        createSession(token, skin.id).then((session) => {
          joinTeam(session.accessCode, "ROJO").then((redTeam) => {
            joinTeam(session.accessCode, "AZUL").then(() => {
              // Iniciar la partida via HTTP para no necesitar el navegador abierto
              cy.request({
                method: "POST",
                url: `${BACKEND_URL}/api/game/sessions/${session.accessCode}/start`,
                headers: { Authorization: `Bearer ${token}` },
              });

              // Obtener el estado del equipo para saber el elementId de una carta oculta
              cy.request<{
                item: {
                  session: { hiddenCards: Array<{ id: string; name: string; kind: string }> };
                };
              }>(`${BACKEND_URL}/api/game/sessions/${session.accessCode}/teams/${redTeam.id}/state`)
                .its("body.item.session.hiddenCards")
                .then((hiddenCards) => {
                  expect(hiddenCards).to.have.length(4);

                  const targetId = hiddenCards[0]!.id;

                  cy.then(() => connectTeamSocket(session.id, redTeam.id)).then((redSocket) => {
                    teamSocket = redSocket;

                    const detailsPromise = waitForSocketEvent<GameHiddenCardDetailsPayload>(redSocket, "game:hidden-card-details");
                    const consultPromise = emitConsultHiddenCard(redSocket, targetId);

                    cy.then(() => Promise.all([detailsPromise, consultPromise])).then(([details, ack]) => {
                      expect(ack.ok).to.eq(true);
                      expect(details.card.id).to.eq(targetId);
                      expect(details.card.name).to.be.a("string").and.not.be.empty;
                      expect(["SUJETO", "OBJETO", "ESPACIO"]).to.include(details.card.kind);
                    });
                  });
                });
            });
          });
        });
      });
    });
  });

  it("consulta oculta con elementId inválido devuelve error en el acknowledge", () => {
    const skinName = `Skin Ocultas-Error ${Date.now()}`;

    loginAsAdmin().then((token) => {
      createSkin(token, skinName).then((skin) => {
        createSession(token, skin.id).then((session) => {
          joinTeam(session.accessCode, "ROJO").then((redTeam) => {
            joinTeam(session.accessCode, "AZUL").then(() => {
              cy.request({
                method: "POST",
                url: `${BACKEND_URL}/api/game/sessions/${session.accessCode}/start`,
                headers: { Authorization: `Bearer ${token}` },
              });

              cy.then(() => connectTeamSocket(session.id, redTeam.id)).then((redSocket) => {
                teamSocket = redSocket;

                // UUID válido pero que no corresponde a ninguna carta oculta
                const fakeId = "00000000-0000-0000-0000-000000000001";
                const consultPromise = emitConsultHiddenCard(redSocket, fakeId);

                cy.then(() => consultPromise).then((ack) => {
                  expect(ack.ok).to.eq(false);
                  expect((ack as { ok: false; error: string }).error).to.be.a("string").and.not.be.empty;
                });
              });
            });
          });
        });
      });
    });
  });
});

describe("SCRUM-104 Cartas Ocultas — snapshot hiddenCards en lobby:presence-updated", () => {
  let adminSocket: Socket | null = null;

  afterEach(() => {
    adminSocket?.disconnect();
    adminSocket = null;
  });

  it("el snapshot de presencia incluye 4 hiddenCards y 0 publicCards para 2 equipos", () => {
    const skinName = `Skin Ocultas-Presence ${Date.now()}`;

    loginAsAdmin().then((token) => {
      createSkin(token, skinName).then((skin) => {
        createSession(token, skin.id).then((session) => {
          joinTeam(session.accessCode, "ROJO").then(() => {
            joinTeam(session.accessCode, "AZUL").then(() => {
              cy.then(() => connectAdminSocket(token)).then((socket) => {
                adminSocket = socket;

                socket.emit("lobby:host-subscribe", { sessionId: session.id }, () => {});

                const presencePromise = waitForSocketEvent<{
                  hiddenCards: unknown[];
                  publicCards: unknown[];
                }>(socket, "lobby:presence-updated");

                emitStartGame(socket, session.accessCode).then((ack) => {
                  expect(ack.ok).to.eq(true);
                });

                cy.then(() => presencePromise).then((presence) => {
                  expect(presence.hiddenCards).to.have.length(4);
                  expect(presence.publicCards).to.have.length(0);
                });
              });
            });
          });
        });
      });
    });
  });
});
