/// <reference types="cypress" />

type TeamColor = "ROJO" | "AZUL" | "VERDE" | "AMARILLO" | "MORADO" | "BLANCO";

const CENTER_IMAGE = encodeURI(
  'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="20" fill="#0f172a"/><circle cx="60" cy="60" r="34" fill="#22d3ee"/><path d="M42 60h36" stroke="#f8fafc" stroke-width="8" stroke-linecap="round"/></svg>'
);

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

function buildSpaces() {
  return [
    { id: "space-1", name: "Camara Anecoica", desc: "Espacio 1", motif: "Sello roto" },
    { id: "space-2", name: "Sala Hedy Lamarr", desc: "Espacio 2", motif: "Interferencia" },
    { id: "space-3", name: "Central de Conmutacion", desc: "Espacio 3", motif: "Registro alterado" },
    { id: "space-4", name: "Seminario Haykin", desc: "Espacio 4", motif: "Cinta cortada" },
    { id: "space-5", name: "Club de radio", desc: "Espacio 5", motif: "Frecuencia perdida" },
    { id: "space-6", name: "Laboratorio de Comunicaciones Opticas", desc: "Espacio 6", motif: "Haz desviado" },
    { id: "space-7", name: "Seminario Torres Quevedo", desc: "Espacio 7", motif: "Llave doblada" },
    { id: "space-8", name: "Lab. Electronica y Electricidad", desc: "Espacio 8", motif: "Panel abierto" },
    { id: "space-9", name: "Seminario Maxwell", desc: "Espacio 9", motif: "Nota de despedida" },
  ];
}

function buildItems(prefix: string, count: number) {
  return Array.from({ length: count }, (_value, index) => ({
    id: `${prefix.toLowerCase()}-${index + 1}`,
    name: `${prefix} ${index + 1}`,
    desc: `Descripcion ${prefix} ${index + 1}`,
  }));
}

function buildActiveConfig() {
  return {
    id: "skin-board-1",
    name: "Skin tablero dinamico",
    gameTitle: "Muerte de una ingenia",
    objective: "Comprobar el tablero tematico dinamico.",
    duration: "60",
    centerImage: CENTER_IMAGE,
    cat1Name: "Sujetos",
    cat2Name: "Objetos",
    cat3Name: "Espacios",
    hasMotifs: true,
    subjects: buildItems("Sujeto", 6),
    objects: buildItems("Objeto", 6),
    spaces: buildSpaces(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function buildSession(activeConfig: ReturnType<typeof buildActiveConfig>) {
  return {
    id: "session-board-1",
    accessCode: "BOARD1",
    status: "EN_CURSO",
    startedAt: "2026-05-04T10:00:00.000Z",
    durationSeconds: 3600,
    remainingSeconds: 3300,
    skin: activeConfig,
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
  };
}

describe("SCRUM-48 renderizado dinamico del tablero tematico", () => {
  it("renderiza nombres, motivos e imagen central en la terminal y posiciona los peones desde el snapshot", () => {
    const activeConfig = buildActiveConfig();
    const session = buildSession(activeConfig);

    cy.intercept("GET", "**/api/game/sessions/BOARD1/teams/team-rojo/state", {
      statusCode: 200,
      body: {
        item: {
          session,
          team: session.teams[0],
          hand: [],
        },
      },
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
      },
    });

    cy.wait("@getTeamState");
    cy.get('[data-cy="terminal-themed-board"]').should("be.visible");
    cy.get('[data-cy="board-space-1"]').should("contain", "Camara Anecoica");
    cy.get('[data-cy="board-space-motif-1"]').should("be.visible").and("contain.text", "M").and("have.attr", "title", "Sello roto");
    cy.get('[data-cy="board-space-6"]').should("contain", "Laboratorio de Comunicaciones Opticas");
    cy.get('[data-cy="board-space-motif-6"]').should("have.attr", "title", "Haz desviado");
    cy.get('[data-cy="board-space-8"]').should("contain", "Lab. Electronica y Electricidad");
    cy.get('[data-cy="board-space-motif-8"]').should("have.attr", "title", "Panel abierto");
    cy.get('[data-cy="board-space-9"]').should("contain", "Seminario Maxwell");
    cy.get('[data-cy="board-space-motif-9"]').should("have.attr", "title", "Nota de despedida");
    cy.get('[data-cy="board-pawn-rojo"]').should("be.visible");
    cy.get('[data-cy="board-pawn-azul"]').should("not.exist");
    cy.get('img[alt="Imagen central del tablero"], img[alt="Imagen central de la skin"]').should("exist");
  });

  it("renderiza la skin activa en la pantalla central aunque el realtime no se conecte", () => {
    const activeConfig = buildActiveConfig();

    cy.intercept("GET", "**/api/auth/session", {
      statusCode: 200,
      body: { ok: true },
    }).as("authSession");

    cy.visit("/board", {
      onBeforeLoad(window) {
        window.localStorage.setItem("adminToken", createFakeAdminToken());
        window.localStorage.setItem("sessionId", "session-board-1");
        window.localStorage.setItem("sessionCode", "BOARD1");
        window.localStorage.setItem("activeConfig", JSON.stringify(activeConfig));
        window.localStorage.setItem("centerImage", activeConfig.centerImage);
        window.localStorage.setItem("sessionDurationSeconds", "3600");
      },
    });

    cy.wait("@authSession");
    cy.get('[data-cy="board-space-2"]').should("contain", "Sala Hedy Lamarr");
    cy.get('[data-cy="board-space-motif-2"]').should("have.attr", "title", "Interferencia");
    cy.get('[data-cy="board-space-6"]').should("contain", "Laboratorio de Comunicaciones Opticas");
    cy.get('[data-cy="board-space-motif-6"]').should("have.attr", "title", "Haz desviado");
    cy.get('[data-cy="board-space-7"]').should("contain", "Seminario Torres Quevedo");
    cy.get('[data-cy="board-space-motif-7"]').should("have.attr", "title", "Llave doblada");
  });
});