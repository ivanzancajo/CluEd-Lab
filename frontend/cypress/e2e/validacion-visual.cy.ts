/// <reference types="cypress" />

type TeamColor = "ROJO" | "AZUL" | "VERDE" | "AMARILLO" | "MORADO" | "BLANCO";

function encodeBase64Url(value: string) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function createFakeAdminToken() {
  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encodeBase64Url(
    JSON.stringify({ role: "admin", username: "admin", exp: Math.floor(Date.now() / 1000) + 3600 })
  );
  return `${header}.${payload}.signature`;
}

const CENTER_IMAGE = encodeURI(
  'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="20" fill="#0f172a"/><circle cx="60" cy="60" r="34" fill="#22d3ee"/><path d="M42 60h36" stroke="#f8fafc" stroke-width="8" stroke-linecap="round"/></svg>'
);

function buildSpaces() {
  return [
    { id: "space-1", name: "Camara Anecoica", desc: "Sala de absorcion de ondas electromagneticas.", motif: "Sello roto" },
    { id: "space-2", name: "Sala Hedy Lamarr", desc: "Dedicada a la pionera de la comunicacion inalambrica.", motif: "Interferencia" },
    { id: "space-3", name: "Central de Conmutacion", desc: "Nucleo de la red de comunicaciones.", motif: "Registro alterado" },
    { id: "space-4", name: "Seminario Haykin", desc: "Sala de teoria de senales.", motif: "Cinta cortada" },
    { id: "space-5", name: "Club de radio", desc: "Espacio de radioaficionados.", motif: "Frecuencia perdida" },
    { id: "space-6", name: "Lab. Comunicaciones Opticas", desc: "Laboratorio de fibra optica.", motif: "Haz desviado" },
    { id: "space-7", name: "Seminario Torres Quevedo", desc: "Homenaje al inventor del dirigible.", motif: "Llave doblada" },
    { id: "space-8", name: "Lab. Electronica", desc: "Laboratorio de electronica y electricidad.", motif: "Panel abierto" },
    { id: "space-9", name: "Seminario Maxwell", desc: "Sala dedicada a las ecuaciones de Maxwell.", motif: "Nota de despedida" },
  ];
}

function buildActiveConfig() {
  return {
    id: "skin-visual-1",
    name: "Skin validacion visual",
    gameTitle: "Muerte de una ingenia",
    objective: "Validacion visual de motivos y tablero tematico.",
    duration: "60",
    centerImage: CENTER_IMAGE,
    cat1Name: "Sujetos",
    cat2Name: "Objetos",
    cat3Name: "Espacios",
    hasMotifs: true,
    subjects: Array.from({ length: 6 }, (_, i) => ({ id: `sujeto-${i + 1}`, name: `Sujeto ${i + 1}`, desc: "" })),
    objects: Array.from({ length: 6 }, (_, i) => ({ id: `objeto-${i + 1}`, name: `Objeto ${i + 1}`, desc: "" })),
    spaces: buildSpaces(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function buildSession(activeConfig: ReturnType<typeof buildActiveConfig>) {
  return {
    id: "session-visual-1",
    accessCode: "VIS001",
    status: "EN_CURSO",
    startedAt: "2026-05-17T10:00:00.000Z",
    durationSeconds: 3600,
    remainingSeconds: 3300,
    skin: activeConfig,
    turn: {
      currentTeamId: "team-rojo",
      currentTeamName: "Equipo Rojo",
      currentTeamColor: "ROJO" as TeamColor,
      startedAt: "2026-05-17T10:00:00.000Z",
      dice: null,
      remainingMoves: null,
      hasMoved: false,
    },
    teams: [
      {
        id: "team-rojo",
        name: "Equipo Rojo",
        color: "ROJO" as TeamColor,
        positionX: 64.97,
        positionY: 10.03,
        falseAccusation: false,
      },
      {
        id: "team-azul",
        name: "Equipo Azul",
        color: "AZUL" as TeamColor,
        positionX: 10.03,
        positionY: 70.05,
        falseAccusation: false,
      },
    ],
    activeSuggestion: null,
    winnerTeam: null,
    resolution: null,
    publicCards: [],
  };
}

describe("SCRUM-110 validacion visual — tablero tematico, botones M y modal de motivo", () => {
  it("tablero tematico con botones M visibles en la terminal (captura visual)", () => {
    const activeConfig = buildActiveConfig();
    const session = buildSession(activeConfig);

    cy.intercept("GET", `**/api/game/sessions/VIS001/teams/team-rojo/state`, {
      statusCode: 200,
      body: { item: { session, team: session.teams[0], hand: [], pendingSuggestion: null } },
    }).as("getTeamState");

    cy.visit("/terminal", {
      onBeforeLoad(window) {
        window.localStorage.setItem("sessionId", session.id);
        window.localStorage.setItem("sessionCode", session.accessCode);
        window.localStorage.setItem("sessionStatus", session.status);
        window.localStorage.setItem("teamId", session.teams[0].id);
        window.localStorage.setItem("teamColor", session.teams[0].color);
        window.localStorage.setItem("teamName", session.teams[0].name);
        window.localStorage.setItem("activeConfig", JSON.stringify(activeConfig));
        window.localStorage.setItem("centerImage", activeConfig.centerImage);
        window.localStorage.removeItem("boardDebugMode");
      },
    });

    cy.wait("@getTeamState");
    cy.get('[data-cy="terminal-themed-board"]').should("be.visible");
    cy.get('[data-cy="board-space-motif-1"]').should("be.visible");
    cy.get('[data-cy="board-space-motif-6"]').should("be.visible");
    cy.screenshot("01-tablero-con-botones-M");
  });

  it("modal de motivo abierto muestra nombre, motivo y descripcion (captura visual)", () => {
    const activeConfig = buildActiveConfig();
    const session = buildSession(activeConfig);

    cy.intercept("GET", `**/api/game/sessions/VIS001/teams/team-rojo/state`, {
      statusCode: 200,
      body: { item: { session, team: session.teams[0], hand: [], pendingSuggestion: null } },
    }).as("getTeamState");

    cy.visit("/terminal", {
      onBeforeLoad(window) {
        window.localStorage.setItem("sessionId", session.id);
        window.localStorage.setItem("sessionCode", session.accessCode);
        window.localStorage.setItem("sessionStatus", session.status);
        window.localStorage.setItem("teamId", session.teams[0].id);
        window.localStorage.setItem("teamColor", session.teams[0].color);
        window.localStorage.setItem("teamName", session.teams[0].name);
        window.localStorage.setItem("activeConfig", JSON.stringify(activeConfig));
        window.localStorage.setItem("centerImage", activeConfig.centerImage);
        window.localStorage.removeItem("boardDebugMode");
      },
    });

    cy.wait("@getTeamState");
    cy.get('[data-cy="board-space-motif-1"]').click({ force: true });
    cy.get('[data-cy="space-motif-modal"]').should("be.visible");
    cy.get('[data-cy="space-motif-modal"]').should("contain", "Camara Anecoica");
    cy.get('[data-cy="space-motif-modal"]').should("contain", "Sello roto");
    cy.screenshot("02-modal-motivo-abierto");
  });

  it("panel de dado forzado visible en modo debug (captura visual)", () => {
    const activeConfig = buildActiveConfig();
    const session = buildSession(activeConfig);

    cy.intercept("GET", `**/api/game/sessions/VIS001/teams/team-rojo/state`, {
      statusCode: 200,
      body: { item: { session, team: session.teams[0], hand: [], pendingSuggestion: null } },
    }).as("getTeamState");

    cy.visit("/terminal", {
      onBeforeLoad(window) {
        window.localStorage.setItem("sessionId", session.id);
        window.localStorage.setItem("sessionCode", session.accessCode);
        window.localStorage.setItem("sessionStatus", session.status);
        window.localStorage.setItem("teamId", session.teams[0].id);
        window.localStorage.setItem("teamColor", session.teams[0].color);
        window.localStorage.setItem("teamName", session.teams[0].name);
        window.localStorage.setItem("activeConfig", JSON.stringify(activeConfig));
        window.localStorage.setItem("centerImage", activeConfig.centerImage);
        window.localStorage.removeItem("boardDebugMode");
      },
    });

    cy.wait("@getTeamState");
    cy.get('[data-cy="terminal-board-debug-forced-dice-toggle"]').click();
    cy.get('[data-cy="debug-forced-dice-panel"]').should("be.visible");
    cy.screenshot("03-panel-dado-forzado");
  });

  it("tablero del host (BoardView) con botones M sobre las salas (captura visual)", () => {
    const activeConfig = buildActiveConfig();
    const session = buildSession(activeConfig);

    cy.intercept("GET", "**/api/auth/session", { statusCode: 200, body: { ok: true } }).as("authSession");
    cy.intercept("GET", `**/api/game/sessions/VIS001`, {
      statusCode: 200,
      body: { item: session },
    }).as("getSession");

    cy.visit("/board", {
      onBeforeLoad(window) {
        window.localStorage.setItem("adminToken", createFakeAdminToken());
        window.localStorage.setItem("sessionId", session.id);
        window.localStorage.setItem("sessionCode", session.accessCode);
        window.localStorage.setItem("activeConfig", JSON.stringify(activeConfig));
        window.localStorage.setItem("centerImage", activeConfig.centerImage);
        window.localStorage.setItem("sessionDurationSeconds", "3600");
      },
    });

    cy.wait("@authSession");
    cy.get('[data-cy="board-space-motif-1"]').should("be.visible");
    cy.screenshot("04-boardview-host-con-botones-M");
  });

  it("modal de motivo en BoardView del host (captura visual)", () => {
    const activeConfig = buildActiveConfig();
    const session = buildSession(activeConfig);

    cy.intercept("GET", "**/api/auth/session", { statusCode: 200, body: { ok: true } }).as("authSession");

    cy.visit("/board", {
      onBeforeLoad(window) {
        window.localStorage.setItem("adminToken", createFakeAdminToken());
        window.localStorage.setItem("sessionId", session.id);
        window.localStorage.setItem("sessionCode", session.accessCode);
        window.localStorage.setItem("activeConfig", JSON.stringify(activeConfig));
        window.localStorage.setItem("centerImage", activeConfig.centerImage);
        window.localStorage.setItem("sessionDurationSeconds", "3600");
      },
    });

    cy.wait("@authSession");
    cy.get('[data-cy="board-space-motif-2"]').click({ force: true });
    cy.get('[data-cy="space-motif-modal"]').should("be.visible");
    cy.get('[data-cy="space-motif-modal"]').should("contain", "Sala Hedy Lamarr");
    cy.screenshot("05-boardview-host-modal-motivo");
  });
});
