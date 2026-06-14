/// <reference types="cypress" />

import { io, type Socket } from "socket.io-client";

type TeamColor = "ROJO" | "AZUL" | "VERDE" | "AMARILLO" | "MORADO" | "BLANCO";
type ResolutionMode = "DIRECT_REVEAL" | "FINAL_CHANCE";

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
};

type TeamState = {
  session: {
    id: string;
    accessCode: string;
    status: "EN_CURSO" | "FINALIZADA";
    skin: {
      subjects: SkinItem[];
      objects: SkinItem[];
      spaces: SkinItem[];
    };
    resolution: {
      phase: "ESPERANDO_RESOLUCION" | "MOSTRANDO_SOLUCION";
      mode: ResolutionMode;
      submittedTeamIds: string[];
      eligibleTeamIds: string[];
      solution: {
        subject: SkinItem;
        object: SkinItem;
        space: SkinItem;
      } | null;
    } | null;
  };
  team: JoinedTeam;
};

type SessionStateResponse = {
  item: {
    id: string;
    status: "EN_CURSO" | "FINALIZADA";
    resolution: {
      phase: "ESPERANDO_RESOLUCION" | "MOSTRANDO_SOLUCION";
      mode: ResolutionMode;
      submittedTeamIds: string[];
      eligibleTeamIds: string[];
      solution: {
        subject: SkinItem;
        object: SkinItem;
        space: SkinItem;
      } | null;
    } | null;
  };
};

type LobbySubscribeAck =
  | {
      ok: true;
      state: unknown;
    }
  | {
      ok: false;
      error: string;
    };

type GameTriggerResolutionAck =
  | {
      ok: true;
      payload: {
        session: TeamState["session"];
      };
    }
  | {
      ok: false;
      error: string;
    };

type GameFinalChanceAck =
  | {
      ok: true;
      payload: {
        session: TeamState["session"];
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

function buildCardImageDataUrl(title: string, accentStart: string, accentEnd: string, badge: string) {
  const safeTitle = escapeSvgText(title);
  const safeBadge = escapeSvgText(badge);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 800" fill="none">
      <defs>
        <linearGradient id="bg" x1="64" y1="40" x2="576" y2="760" gradientUnits="userSpaceOnUse">
          <stop stop-color="${accentStart}" />
          <stop offset="1" stop-color="${accentEnd}" />
        </linearGradient>
      </defs>
      <rect width="640" height="800" rx="42" fill="url(#bg)" />
      <rect x="40" y="40" width="560" height="720" rx="34" fill="rgba(2,6,23,0.18)" stroke="rgba(255,255,255,0.18)" />
      <circle cx="510" cy="152" r="118" fill="rgba(255,255,255,0.08)" />
      <circle cx="160" cy="620" r="154" fill="rgba(255,255,255,0.06)" />
      <rect x="76" y="82" width="184" height="54" rx="27" fill="rgba(2,6,23,0.32)" stroke="rgba(255,255,255,0.16)" />
      <text x="168" y="116" fill="white" font-size="22" font-family="monospace" letter-spacing="4" text-anchor="middle">${safeBadge}</text>
      <text x="76" y="594" fill="white" font-size="58" font-weight="800" font-family="system-ui, sans-serif">${safeTitle}</text>
      <text x="76" y="650" fill="rgba(255,255,255,0.76)" font-size="24" font-family="monospace">Resolución final</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escapeSvgText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildItems(prefix: string, count: number) {
  const [accentStart, accentEnd, badge] =
    prefix === "Sujeto"
      ? ["#0891b2", "#0f172a", "SUJETO"]
      : ["#059669", "#0f172a", "OBJETO"];

  return Array.from({ length: count }, (_value, index) => ({
    name: `${prefix} ${index + 1}`,
    desc: `Descripcion de ${prefix} ${index + 1}`,
    imageUrl: buildCardImageDataUrl(`${prefix} ${index + 1}`, accentStart, accentEnd, badge),
  }));
}

function buildSpaces() {
  return [
    { name: "Camara Anecoica", desc: "Espacio 1" },
    { name: "Sala Hedy Lamarr", desc: "Espacio 2" },
    { name: "Central de Conmutacion", desc: "Espacio 3" },
    { name: "Seminario Haykin", desc: "Espacio 4" },
    { name: "Club de radio", desc: "Espacio 5" },
    { name: "Laboratorio de Comunicaciones Opticas", desc: "Espacio 6" },
    { name: "Lab. Electronica y Electricidad", desc: "Espacio 7" },
    { name: "Seminario Maxwell", desc: "Espacio 8" },
    { name: "Seminario Torres Quevedo", desc: "Espacio 9" },
  ].map((space) => ({
    ...space,
    imageUrl: buildCardImageDataUrl(space.name, "#e11d48", "#0f172a", "ESPACIO"),
  }));
}

function buildSkinPayload(name: string) {
  return {
    name,
    gameTitle: "Resolucion realtime",
    objective: "Validar el cierre y la resolución desde board y terminal.",
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

function fetchSession(accessCode: string) {
  return cy
    .request<SessionStateResponse>(`http://localhost:4000/api/game/sessions/${accessCode}`)
    .its("body.item");
}

function visitBoard(session: CreatedSession, token: string, skinPayload: ReturnType<typeof buildSkinPayload>) {
  cy.visit("/board", {
    onBeforeLoad(window) {
      window.localStorage.setItem("adminToken", token);
      window.localStorage.setItem("sessionId", session.id);
      window.localStorage.setItem("sessionCode", session.accessCode);
      window.localStorage.setItem("sessionStatus", "EN_CURSO");
      window.localStorage.setItem("activeConfig", JSON.stringify(skinPayload));
      window.localStorage.setItem("centerImage", skinPayload.centerImage);
    },
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
        (response: LobbySubscribeAck) => {
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

function emitTriggerResolution(socket: Socket, sessionId: string, mode: ResolutionMode) {
  return new Cypress.Promise<GameTriggerResolutionAck>((resolve) => {
    socket.emit("game:trigger-resolution", { sessionId, mode }, resolve);
  });
}

function emitFinalChance(socket: Socket, payload: { subjectElementId: string; objectElementId: string; spaceElementId: string }) {
  return new Cypress.Promise<GameFinalChanceAck>((resolve) => {
    socket.emit("game:submit-final-chance", payload, resolve);
  });
}

function buildAccusationPayload(teamState: TeamState, itemIndex: number) {
  return {
    subjectElementId: teamState.session.skin.subjects[itemIndex]?.id ?? teamState.session.skin.subjects[0].id,
    objectElementId: teamState.session.skin.objects[itemIndex]?.id ?? teamState.session.skin.objects[0].id,
    spaceElementId: teamState.session.skin.spaces[itemIndex]?.id ?? teamState.session.skin.spaces[0].id,
  };
}

describe("SCRUM-93/99 resolución y cierre frontend", () => {
  let adminSocket: Socket | null = null;
  let redSocket: Socket | null = null;
  let blueSocket: Socket | null = null;
  let greenSocket: Socket | null = null;

  afterEach(() => {
    adminSocket?.disconnect();
    redSocket?.disconnect();
    blueSocket?.disconnect();
    greenSocket?.disconnect();
    adminSocket = null;
    redSocket = null;
    blueSocket = null;
    greenSocket = null;
  });

  it("permite al host revelar directamente la solución y refleja el cierre en el tablero", () => {
    const skinName = `e2e-resolution-direct-${Date.now()}`;
    const skinPayload = buildSkinPayload(skinName);

    loginAsAdmin().then((token) => {
      createSkin(token, skinName).then((skin) => {
        createSession(token, skin.id).then((session) => {
          joinTeam(session.accessCode, "ROJO");
          joinTeam(session.accessCode, "AZUL");
          joinTeam(session.accessCode, "VERDE");

          startSession(token, session.accessCode).then(() => {
            visitBoard(session, token, skinPayload);

            cy.get('[data-cy="board-resolution-open"]').should("not.be.disabled").click();
            cy.get('[data-cy="board-resolution-dialog"]').should("be.visible");
            cy.get('[data-cy="board-resolution-direct"]').click();

            cy.get('[data-cy="board-resolution-summary"]').should("be.visible");
            cy.get('[data-cy="board-solution-reveal"]').should("be.visible");
            cy.get('[data-cy="board-solution-session-status"]').should("contain", "Sesión cerrada").and("contain", "FINALIZADA");
            cy.get('[data-cy="board-solution-card-space"]').should("be.visible");
            cy.get('[data-cy="board-solution-card-image-subject"]').should("be.visible");
            cy.get('[data-cy="board-solution-card-image-object"]').should("be.visible");
            cy.get('[data-cy="board-solution-card-image-space"]').should("be.visible");
            cy.get('[data-cy="board-resolution-phase"]').should("contain", "Solución proyectada");
            cy.get('[data-cy="board-resolution-detail"]').should("contain", "Revelado directo completado");
            cy.get('[data-cy="board-resolution-solution-subject"]').invoke("text").should("match", /Sujeto\s+\d+/);
            cy.get('[data-cy="board-resolution-solution-object"]').invoke("text").should("match", /Objeto\s+\d+/);
            cy.get('[data-cy="board-resolution-solution-space"]').invoke("text").should("not.be.empty");
            cy.get("body").find('[data-cy="board-resolution-open"]').should("be.disabled");
            cy.window().then((window) => {
              expect(window.localStorage.getItem("sessionStatus")).to.eq("FINALIZADA");
            });

            fetchSession(session.accessCode).then((updatedSession) => {
              expect(updatedSession.status).to.eq("FINALIZADA");
              expect(updatedSession.finishedAt).to.not.eq(null);
              expect(updatedSession.resolution?.phase).to.eq("MOSTRANDO_SOLUCION");
              expect(updatedSession.resolution?.mode).to.eq("DIRECT_REVEAL");
              expect(updatedSession.resolution?.solution).to.not.eq(null);
            });
          });
        });
      });
    });
  });

  it("actualiza la pantalla central durante la última oportunidad hasta mostrar la solución final", () => {
    const skinName = `e2e-resolution-board-final-${Date.now()}`;
    const skinPayload = buildSkinPayload(skinName);

    loginAsAdmin().then((token) => {
      createSkin(token, skinName).then((skin) => {
        createSession(token, skin.id).then((session) => {
          joinTeam(session.accessCode, "ROJO").then((redTeam) => {
            joinTeam(session.accessCode, "AZUL").then((blueTeam) => {
              joinTeam(session.accessCode, "VERDE").then((greenTeam) => {
              startSession(token, session.accessCode).then(() => {
                fetchTeamState(session.accessCode, redTeam.id).then((redState) => {
                  fetchTeamState(session.accessCode, blueTeam.id).then((blueState) => {
                  fetchTeamState(session.accessCode, greenTeam.id).then((greenState) => {
                    cy.then(() => connectTeamSocket(session.id, redTeam.id)).then((socket) => {
                      redSocket = socket;
                    });
                    cy.then(() => connectTeamSocket(session.id, blueTeam.id)).then((socket) => {
                      blueSocket = socket;
                    });
                    cy.then(() => connectTeamSocket(session.id, greenTeam.id)).then((socket) => {
                      greenSocket = socket;
                    });

                    visitBoard(session, token, skinPayload);

                    cy.get('[data-cy="board-resolution-open"]').click();
                    cy.get('[data-cy="board-resolution-final-chance"]').click();
                    cy.get('[data-cy="board-resolution-phase"]').should("contain", "Resolución en curso");
                    cy.get('[data-cy="board-resolution-detail"]').should("contain", "0/3 acusaciones recibidas");
                    cy.get('[data-cy="board-resolution-countdown"]').invoke("text").should("match", /\d{2}:\d{2}/);

                    cy.then(() => emitFinalChance(redSocket as Socket, buildAccusationPayload(redState, 0))).then((response) => {
                      expect(response.ok).to.eq(true);
                    });
                    cy.get('[data-cy="board-resolution-detail"]').should("contain", "1/3 acusaciones recibidas");

                    cy.then(() => emitFinalChance(blueSocket as Socket, buildAccusationPayload(blueState, 1))).then((response) => {
                      expect(response.ok).to.eq(true);
                    });
                    cy.get('[data-cy="board-resolution-detail"]').should("contain", "2/3 acusaciones recibidas");

                    cy.then(() => emitFinalChance(greenSocket as Socket, buildAccusationPayload(greenState, 2))).then((response) => {
                      expect(response.ok).to.eq(true);
                    });

                    cy.get('[data-cy="board-solution-reveal"]').should("be.visible");
                    cy.get('[data-cy="board-solution-session-status"]').should("contain", "FINALIZADA");
                    cy.get('[data-cy="board-solution-card-space"]').should("be.visible");
                    cy.get('[data-cy="board-solution-card-image-subject"]').should("be.visible");
                    cy.get('[data-cy="board-solution-card-image-object"]').should("be.visible");
                    cy.get('[data-cy="board-solution-card-image-space"]').should("be.visible");
                    cy.get('[data-cy="board-resolution-phase"]').should("contain", "Solución proyectada");
                    cy.get('[data-cy="board-resolution-detail"]').should("contain", "completada");
                    cy.get('[data-cy="board-resolution-solution-subject"]').invoke("text").should("match", /Sujeto\s+\d+/);
                    cy.get('[data-cy="board-resolution-solution-object"]').invoke("text").should("match", /Objeto\s+\d+/);
                    cy.get('[data-cy="board-resolution-solution-space"]').invoke("text").should("not.be.empty");
                    cy.window().then((window) => {
                      expect(window.localStorage.getItem("sessionStatus")).to.eq("FINALIZADA");
                    });

                    fetchSession(session.accessCode).then((updatedSession) => {
                      expect(updatedSession.status).to.eq("FINALIZADA");
                      expect(updatedSession.finishedAt).to.not.eq(null);
                      expect(updatedSession.resolution?.phase).to.eq("MOSTRANDO_SOLUCION");
                      expect(updatedSession.resolution?.mode).to.eq("FINAL_CHANCE");
                      expect(updatedSession.resolution?.submittedTeamIds).to.have.length(3);
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
  });

  it("fuerza el modal de última oportunidad en el terminal y proyecta la solución al cerrarse la fase", () => {
    const skinName = `e2e-resolution-terminal-${Date.now()}`;
    const skinPayload = buildSkinPayload(skinName);

    loginAsAdmin().then((token) => {
      createSkin(token, skinName).then((skin) => {
        createSession(token, skin.id).then((session) => {
          joinTeam(session.accessCode, "ROJO").then((redTeam) => {
            joinTeam(session.accessCode, "AZUL").then((blueTeam) => {
              joinTeam(session.accessCode, "VERDE").then((greenTeam) => {
              startSession(token, session.accessCode).then(() => {
                fetchTeamState(session.accessCode, redTeam.id).then((redState) => {
                  fetchTeamState(session.accessCode, blueTeam.id).then((blueState) => {
                  fetchTeamState(session.accessCode, greenTeam.id).then((greenState) => {
                    cy.then(() => connectAdminSocket(token)).then((socket) => {
                      adminSocket = socket;
                    });
                    cy.then(() => connectTeamSocket(session.id, blueTeam.id)).then((socket) => {
                      blueSocket = socket;
                    });
                    cy.then(() => connectTeamSocket(session.id, greenTeam.id)).then((socket) => {
                      greenSocket = socket;
                    });

                    visitTerminal(session, redTeam, skinPayload);

                    cy.then(() => emitTriggerResolution(adminSocket as Socket, session.id, "FINAL_CHANCE")).then((response) => {
                      expect(response.ok).to.eq(true);
                    });

                    cy.get('[data-cy="terminal-final-chance-modal"]').should("be.visible");
                    cy.get('[data-cy="terminal-final-chance-countdown"]').invoke("text").should("match", /\d{2}:\d{2}/);
                    cy.get('[data-cy="terminal-final-chance-submit"]').should("be.disabled");
                    cy.get('[data-cy="terminal-final-chance-space"]').select(redState.session.skin.spaces[0].name);
                    cy.get('[data-cy="terminal-final-chance-subject"]').select(redState.session.skin.subjects[0].name);
                    cy.get('[data-cy="terminal-final-chance-object"]').select(redState.session.skin.objects[0].name);
                    cy.get('[data-cy="terminal-final-chance-submit"]').should("not.be.disabled").click();
                    cy.get('[data-cy="terminal-final-chance-modal"]').should("contain", "Esperando al resto de equipos");

                    cy.then(() => emitFinalChance(blueSocket as Socket, buildAccusationPayload(blueState, 1))).then((response) => {
                      expect(response.ok).to.eq(true);
                    });
                    cy.then(() => emitFinalChance(greenSocket as Socket, buildAccusationPayload(greenState, 2))).then((response) => {
                      expect(response.ok).to.eq(true);
                    });

                    // Al cerrarse la fase, el terminal proyecta la solución en el modal de cierre.
                    cy.contains("Partida finalizada").should("be.visible");
                    cy.contains("Solución del caso").should("be.visible");
                    cy.contains(/Sujeto\s+\d+/).should("be.visible");
                    cy.contains(/Objeto\s+\d+/).should("be.visible");

                    fetchSession(session.accessCode).then((updatedSession) => {
                      expect(updatedSession.status).to.eq("FINALIZADA");
                      expect(updatedSession.resolution?.phase).to.eq("MOSTRANDO_SOLUCION");
                      expect(updatedSession.resolution?.mode).to.eq("FINAL_CHANCE");
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
  });
});