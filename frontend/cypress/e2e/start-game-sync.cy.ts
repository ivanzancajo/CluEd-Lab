/// <reference types="cypress" />

import { io, type Socket } from "socket.io-client";

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
  color: "ROJO" | "AZUL" | "VERDE" | "AMARILLO" | "MORADO" | "BLANCO";
};

type StartGameAck =
  | {
      ok: true;
      payload: {
        session: {
          id: string;
          accessCode: string;
          status: "EN_CURSO";
        };
        occurredAt: number;
      };
    }
  | {
      ok: false;
      error: string;
    };

type CollectionKey = "subjects" | "objects" | "spaces";

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
    gameTitle: "Inicio sincronizado",
    objective: "Validar inicio sincronizado de partida.",
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
    .request<{ token: string }>("POST", "http://localhost:4000/api/auth/login", {
      username: "admin",
      password: "cluedo2026",
    })
    .its("body.token");
}

function createSkin(token: string, name: string) {
  return cy
    .request<{ item: CreatedSkin }>({
      method: "POST",
      url: "http://localhost:4000/api/config/skins",
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
      url: "http://localhost:4000/api/game/sessions",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: { skinId },
    })
    .its("body.item");
}

function joinTeam(accessCode: string, color: JoinedTeam["color"]) {
  return cy
    .request<{ item: { team: JoinedTeam } }>({
      method: "POST",
      url: `http://localhost:4000/api/game/sessions/${accessCode}/join`,
      body: { color },
    })
    .its("body.item.team");
}

function connectAdminSocket(token: string) {
  return new Cypress.Promise<Socket>((resolve, reject) => {
    const socket = io("http://localhost:4000", {
      path: "/socket.io",
      transports: ["websocket"],
      autoConnect: false,
      auth: { token },
    });

    socket.once("connect_error", (error) => {
      socket.disconnect();
      reject(error instanceof Error ? error : new Error("No se pudo conectar el socket del admin."));
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

describe("SCRUM-42/43/44 inicio sincronizado de partida", () => {
  let adminSocket: Socket | null = null;

  afterEach(() => {
    adminSocket?.disconnect();
    adminSocket = null;
  });

  it("bloquea el inicio en el lobby cuando solo hay un equipo unido", () => {
    const testName = `Skin Start Block ${Date.now()}`;

    loginAsAdmin().then((token) => {
      createSkin(token, testName).then((skin) => {
        createSession(token, skin.id).then((session) => {
          joinTeam(session.accessCode, "ROJO");

          cy.visit("/lobby", {
            onBeforeLoad(window) {
              window.localStorage.setItem("adminToken", token);
              window.localStorage.setItem("sessionId", session.id);
              window.localStorage.setItem("sessionCode", session.accessCode);
            },
          });

          cy.get('[data-cy="lobby-session-code"]').should("contain", session.accessCode);
          cy.get('[data-cy="lobby-start-hint"]').should("contain", "Se necesitan al menos 2 equipos unidos para iniciar la partida");
          cy.get('[data-cy="lobby-start-button"]').should("be.disabled");
        });
      });
    });
  });

  it("inicia la partida desde el lobby por realtime y redirige al tablero", () => {
    const testName = `Skin Start Host ${Date.now()}`;

    loginAsAdmin().then((token) => {
      createSkin(token, testName).then((skin) => {
        createSession(token, skin.id).then((session) => {
          joinTeam(session.accessCode, "ROJO");
          joinTeam(session.accessCode, "AZUL");

          let restStartRequests = 0;
          cy.intercept("POST", "**/api/game/sessions/*/start", (request) => {
            restStartRequests += 1;
            request.continue();
          }).as("restStartGame");

          cy.visit("/lobby", {
            onBeforeLoad(window) {
              window.localStorage.setItem("adminToken", token);
              window.localStorage.setItem("sessionId", session.id);
              window.localStorage.setItem("sessionCode", session.accessCode);
            },
          });

          cy.get('[data-cy="lobby-start-button"]').should("not.be.disabled").click();
          cy.location("pathname").should("eq", "/board");
          cy.contains("PANTALLA CENTRAL").should("be.visible");
          cy.window().then((window) => {
            expect(window.localStorage.getItem("sessionStatus")).to.eq("EN_CURSO");
          });
          cy.then(() => {
            expect(restStartRequests).to.eq(0);
          });
        });
      });
    });
  });

  it("mantiene el terminal en /terminal y refresca la mano al recibir gameStarted", () => {
    const testName = `Skin Start Terminal ${Date.now()}`;

    loginAsAdmin().then((token) => {
      createSkin(token, testName).then((skin) => {
        createSession(token, skin.id).then((session) => {
          joinTeam(session.accessCode, "ROJO").then((redTeam) => {
            joinTeam(session.accessCode, "AZUL").then(() => {
              cy.visit("/terminal", {
                onBeforeLoad(window) {
                  window.localStorage.setItem("sessionId", session.id);
                  window.localStorage.setItem("sessionCode", session.accessCode);
                  window.localStorage.setItem("sessionStatus", "LOBBY");
                  window.localStorage.setItem("teamId", redTeam.id);
                  window.localStorage.setItem("teamColor", redTeam.color);
                  window.localStorage.setItem("teamName", redTeam.name);
                },
              });

              cy.get('[data-cy="terminal-lobby-status-banner"]').should("contain", "Esperando a que el Game Master inicie la partida.");
              cy.get('[data-cy="terminal-hand-state"]').should("contain", "Las cartas se repartirán automáticamente");

              cy.then(() => connectAdminSocket(token))
                .then((socket) => {
                  adminSocket = socket;
                  return emitStartGame(socket, session.accessCode);
                })
                .then((response) => {
                  expect(response.ok).to.eq(true);
                });

              cy.location("pathname").should("eq", "/terminal");
              cy.get('[data-cy="terminal-lobby-status-banner"]').should("contain", "Turno actual: Equipo Rojo.");
              cy.get('[data-cy="terminal-lobby-status-banner"]').should("contain", "Sin tirada activa.");
              cy.get('[data-cy="terminal-hand-list"]').should("be.visible");
              // 2 equipos: 18 no-solución − 4 ocultas = 14 / 2 = 7 cartas por equipo
              cy.get('[data-cy="terminal-hand-card"]').should("have.length", 7);
              cy.window().then((window) => {
                expect(window.localStorage.getItem("sessionStatus")).to.eq("EN_CURSO");
              });
            });
          });
        });
      });
    });
  });
});