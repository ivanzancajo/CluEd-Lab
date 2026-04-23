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
};

type TeamSocketAck =
  | {
      ok: true;
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

function encodeBase64Url(value: string) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function createFakeAdminToken() {
  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encodeBase64Url(
    JSON.stringify({
      role: "admin",
      username: "admin",
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
    })
  );

  return `${header}.${payload}.signature`;
}

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
    gameTitle: "Realtime Lab",
    objective: "Validar la sincronizacion realtime del lobby.",
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

function joinTeam(accessCode: string) {
  return cy
    .request<{ item: { team: JoinedTeam } }>({
      method: "POST",
      url: `http://localhost:4000/api/game/sessions/${accessCode}/join`,
      body: { color: "ROJO" },
    })
    .its("body.item.team");
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
      reject(error instanceof Error ? error : new Error("No se pudo conectar el socket del equipo."));
    });

    socket.once("connect", () => {
      socket.emit(
        "lobby:team-subscribe",
        { sessionId, teamId },
        (response: TeamSocketAck & { state?: unknown }) => {
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

describe("SCRUM-34 sincronizacion realtime del lobby", () => {
  let teamSocket: Socket | null = null;

  afterEach(() => {
    teamSocket?.disconnect();
    teamSocket = null;
  });

  it("refleja en tiempo real la conexion y desconexion de un equipo en el lobby", () => {
    const testName = `Skin Realtime ${Date.now()}`;

    loginAsAdmin().then((token) => {
      createSkin(token, testName).then((skin) => {
        createSession(token, skin.id).then((session) => {
          joinTeam(session.accessCode).then((team) => {
            cy.visit("/lobby", {
              onBeforeLoad(window) {
                window.localStorage.setItem("adminToken", token);
                window.localStorage.setItem("sessionId", session.id);
                window.localStorage.setItem("sessionCode", session.accessCode);
              },
            });

            cy.get('[data-cy="lobby-session-code"]').should("contain", session.accessCode);
            cy.get('[data-cy="lobby-team-slot-rojo"]').within(() => {
              cy.get('[data-cy="lobby-team-slot-name"]').should("contain", team.name);
              cy.get('[data-cy="lobby-team-slot-status"]').should("contain", "Desconectado");
            });

            cy.then(() => connectTeamSocket(session.id, team.id)).then((socket) => {
              teamSocket = socket;
            });

            cy.get('[data-cy="lobby-team-slot-rojo"]').within(() => {
              cy.get('[data-cy="lobby-team-slot-status"]').should("contain", "Conectado");
              cy.get('[data-cy="lobby-team-slot-secondary"]').should("contain", "Senal");
            });
            cy.get('[data-cy="lobby-connected-count"]').should("contain", "1/1");
            cy.get('[data-cy="lobby-event-item"]').first().should("contain", `${team.name} se ha conectado`);

            cy.then(() => {
              teamSocket?.disconnect();
              teamSocket = null;
            });

            cy.get('[data-cy="lobby-team-slot-rojo"]').within(() => {
              cy.get('[data-cy="lobby-team-slot-status"]').should("contain", "Desconectado");
            });
            cy.get('[data-cy="lobby-connected-count"]').should("contain", "0/1");
            cy.get('[data-cy="lobby-event-item"]').first().should("contain", `${team.name} se ha desconectado`);
          });
        });
      });
    });
  });
});