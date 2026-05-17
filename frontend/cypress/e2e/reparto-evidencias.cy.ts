/// <reference types="cypress" />

import { io, type Socket } from "socket.io-client";

type TeamColor = "ROJO" | "AZUL" | "VERDE" | "AMARILLO" | "MORADO" | "BLANCO";

type CreatedSkin = { id: string };
type CreatedSession = { id: string; accessCode: string };
type JoinedTeam = { id: string; name: string; color: TeamColor };

type StartGameAck =
  | { ok: true; payload: { session: { id: string; accessCode: string; status: "EN_CURSO" }; occurredAt: number } }
  | { ok: false; error: string };

const BACKEND_URL = "http://localhost:4000";

function buildItems(prefix: string, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    name: `${prefix} ${index + 1}`,
    desc: `Desc ${prefix} ${index + 1}`,
    imageUrl: "",
  }));
}

function buildSkinPayload(name: string) {
  return {
    name,
    gameTitle: "SCRUM-100 Test",
    objective: "Validar reparto cíclico y evidencias comunes.",
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

function emitStartGame(socket: Socket, accessCode: string) {
  return new Cypress.Promise<StartGameAck>((resolve) => {
    socket.emit("startGame", { accessCode }, resolve);
  });
}

// ─── Scenarios ───────────────────────────────────────────────────────────────

describe("SCRUM-100 Evidencias Comunes en TerminalView", () => {
  let adminSocket: Socket | null = null;

  afterEach(() => {
    adminSocket?.disconnect();
    adminSocket = null;
  });

  it("muestra 7 cartas en mano y cartas ocultas sin sobrantes visibles (2 equipos, regla 4 ocultas)", () => {
    // 21 elementos − 3 solución = 18 no-solución; 18 − 4 ocultas = 14; 14 ÷ 2 = 7/equipo, 0 sobrantes visibles
    const skinName = `Skin EC-Empty ${Date.now()}`;

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

              cy.get('[data-cy="terminal-hand-list"]').should("be.visible");
              cy.get('[data-cy="terminal-hand-card"]').should("have.length", 7);

              // No hay sobrantes visibles en evidencias comunes
              cy.get('[data-cy="evidencias-comunes-panel"]').scrollIntoView().should("be.visible");
              cy.get('[data-cy="evidencias-comunes-empty"]').should("be.visible");
              cy.get('[data-cy="evidencias-comunes-card"]').should("not.exist");

              // Hay 4 cartas ocultas
              cy.get('[data-cy="cartas-ocultas-panel"]').should("be.visible");
              cy.get('[data-cy="carta-oculta"]').should("have.length", 4);
            });
          });
        });
      });
    });
  });

  it("muestra cartas sobrantes cuando el reparto no es exacto (4 equipos, 18 cartas → 2 sobrantes)", () => {
    // 21 elementos − 3 solución = 18 no-solución; 18 ÷ 4 = 4/equipo (16 repartidas), 2 sobrantes
    const skinName = `Skin EC-Sobrantes ${Date.now()}`;

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

                  cy.get('[data-cy="terminal-hand-state"]').should("contain", "Las cartas se repartirán automáticamente");

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

                  cy.get('[data-cy="evidencias-comunes-panel"]').scrollIntoView().should("be.visible");
                  cy.get('[data-cy="evidencias-comunes-card"]').should("have.length", 2);
                  cy.get('[data-cy="evidencias-comunes-empty"]').should("not.exist");
                });
              });
            });
          });
        });
      });
    });
  });
});

describe("SCRUM-103 Evidencias Comunes interactivas en TerminalView", () => {
  let adminSocket: Socket | null = null;

  afterEach(() => {
    adminSocket?.disconnect();
    adminSocket = null;
  });

  it("abre la modal de detalle al clicar una carta sobrante y cierra al clicar el fondo", () => {
    // 4 equipos → 2 sobrantes
    const skinName = `Skin EC-Interactive ${Date.now()}`;

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

                  cy.get('[data-cy="evidencias-comunes-card"]').should("have.length", 2);

                  // La modal no existe antes de clicar
                  cy.get('[data-cy="evidencias-comunes-modal"]').should("not.exist");

                  // Clicar la primera carta abre la modal con nombre y tipo
                  cy.get('[data-cy="evidencias-comunes-card"]').first().click();
                  cy.get('[data-cy="evidencias-comunes-modal"]').should("be.visible");
                  cy.get('[data-cy="evidencias-comunes-modal-name"]').should("not.be.empty");
                  cy.get('[data-cy="evidencias-comunes-modal-kind"]').should("not.be.empty");

                  // Clicar el fondo cierra la modal
                  cy.get('[data-cy="evidencias-comunes-modal"]').click({ force: true });
                  cy.get('[data-cy="evidencias-comunes-modal"]').should("not.exist");
                });
              });
            });
          });
        });
      });
    });
  });
});

describe("SCRUM-100 Evidencias Comunes en BoardView", () => {
  let adminSocket: Socket | null = null;

  afterEach(() => {
    adminSocket?.disconnect();
    adminSocket = null;
  });

  it("muestra cartas sobrantes en el panel lateral del tablero (4 equipos, 2 sobrantes)", () => {
    const skinName = `Skin Board EC ${Date.now()}`;

    loginAsAdmin().then((token) => {
      createSkin(token, skinName).then((skin) => {
        createSession(token, skin.id).then((session) => {
          joinTeam(session.accessCode, "ROJO").then(() => {
            joinTeam(session.accessCode, "AZUL").then(() => {
              joinTeam(session.accessCode, "VERDE").then(() => {
                joinTeam(session.accessCode, "AMARILLO").then(() => {
                  cy.visit("/lobby", {
                    onBeforeLoad(win) {
                      win.localStorage.setItem("adminToken", token);
                      win.localStorage.setItem("sessionId", session.id);
                      win.localStorage.setItem("sessionCode", session.accessCode);
                    },
                  });

                  cy.get('[data-cy="lobby-start-button"]').should("not.be.disabled").click();
                  cy.location("pathname").should("eq", "/board");
                  cy.contains("PANTALLA CENTRAL").should("be.visible");

                  cy.get('[data-cy="evidencias-comunes-panel"]').should("exist");
                  cy.get('[data-cy="evidencias-comunes-card"]').should("have.length", 2);
                });
              });
            });
          });
        });
      });
    });
  });

  it("no renderiza el panel de evidencias cuando no hay sobrantes (2 equipos)", () => {
    const skinName = `Skin Board EC Vacio ${Date.now()}`;

    loginAsAdmin().then((token) => {
      createSkin(token, skinName).then((skin) => {
        createSession(token, skin.id).then((session) => {
          joinTeam(session.accessCode, "ROJO").then(() => {
            joinTeam(session.accessCode, "AZUL").then(() => {
              cy.visit("/lobby", {
                onBeforeLoad(win) {
                  win.localStorage.setItem("adminToken", token);
                  win.localStorage.setItem("sessionId", session.id);
                  win.localStorage.setItem("sessionCode", session.accessCode);
                },
              });

              cy.get('[data-cy="lobby-start-button"]').should("not.be.disabled").click();
              cy.location("pathname").should("eq", "/board");
              cy.contains("PANTALLA CENTRAL").should("be.visible");

              // BoardView solo renderiza EvidenciasComunes si publicCards.length > 0
              cy.get('[data-cy="evidencias-comunes-panel"]').should("not.exist");
            });
          });
        });
      });
    });
  });
});
