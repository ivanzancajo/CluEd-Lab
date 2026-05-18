/// <reference types="cypress" />

type TeamColor = "ROJO" | "AZUL" | "VERDE" | "AMARILLO" | "MORADO" | "BLANCO";

const CENTER_IMAGE = encodeURI(
  'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="20" fill="#0f172a"/><circle cx="60" cy="60" r="34" fill="#22d3ee"/></svg>'
);

// sala-superior-izquierda: grid(2, 2, -0.06, -1.37)
// COLUMNS[2]=21.72 + (-0.06) = 21.66 | ROWS[2]=16.54 + (-1.37) = 15.17
const CORNER_ROOM_POSITION = { positionX: 21.66, positionY: 15.17 };

// Posición de spawn-rojo (no es sala, no tiene pasadizo)
const SPAWN_ROJO_POSITION = { positionX: 64.97, positionY: 10.03 };

function buildActiveConfig() {
  return {
    id: "skin-pasadizo-test",
    name: "Skin pasadizo",
    gameTitle: "Test pasadizo",
    objective: "Verificar lógica de pasadizo por turno.",
    duration: "60",
    centerImage: CENTER_IMAGE,
    cat1Name: "Sujetos",
    cat2Name: "Objetos",
    cat3Name: "Espacios",
    hasMotifs: false,
    subjects: Array.from({ length: 6 }, (_, i) => ({ id: `sujeto-${i + 1}`, name: `Sujeto ${i + 1}`, desc: "" })),
    objects: Array.from({ length: 6 }, (_, i) => ({ id: `objeto-${i + 1}`, name: `Objeto ${i + 1}`, desc: "" })),
    spaces: Array.from({ length: 9 }, (_, i) => ({ id: `space-${i + 1}`, name: `Espacio ${i + 1}`, desc: "", motif: "" })),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function buildTurn(hasMoved: boolean) {
  return {
    currentTeamId: "team-rojo",
    currentTeamName: "Equipo Rojo",
    currentTeamColor: "ROJO" as TeamColor,
    startedAt: "2026-05-18T10:00:00.000Z",
    dice: null,
    remainingMoves: null,
    hasMoved,
  };
}

function buildSession(position: { positionX: number; positionY: number }, hasMoved: boolean) {
  const activeConfig = buildActiveConfig();
  return {
    session: {
      id: "session-pasadizo-1",
      accessCode: "PASA01",
      status: "EN_CURSO",
      startedAt: "2026-05-18T10:00:00.000Z",
      durationSeconds: 3600,
      remainingSeconds: 3300,
      skin: activeConfig,
      turn: buildTurn(hasMoved),
      teams: [
        {
          id: "team-rojo",
          name: "Equipo Rojo",
          color: "ROJO" as TeamColor,
          ...position,
          falseAccusation: false,
        },
      ],
      activeSuggestion: null,
      winnerTeam: null,
      resolution: null,
      publicCards: [],
    },
    team: {
      id: "team-rojo",
      name: "Equipo Rojo",
      color: "ROJO" as TeamColor,
      ...position,
      falseAccusation: false,
    },
    hand: [],
    pendingSuggestion: null,
  };
}

function setupTerminal(position: { positionX: number; positionY: number }, hasMoved: boolean) {
  const { session, team, hand, pendingSuggestion } = buildSession(position, hasMoved);

  cy.intercept("GET", "**/api/game/sessions/PASA01/teams/team-rojo/state", {
    statusCode: 200,
    body: { item: { session, team, hand, pendingSuggestion } },
  }).as("getTeamState");

  cy.visit("/terminal", {
    onBeforeLoad(window) {
      window.localStorage.setItem("sessionId", session.id);
      window.localStorage.setItem("sessionCode", session.accessCode);
      window.localStorage.setItem("sessionStatus", session.status);
      window.localStorage.setItem("teamId", team.id);
      window.localStorage.setItem("teamColor", team.color);
      window.localStorage.setItem("teamName", team.name);
      window.localStorage.setItem("activeConfig", JSON.stringify(session.skin));
      window.localStorage.setItem("centerImage", session.skin.centerImage);
    },
  });

  cy.wait("@getTeamState");
}

describe("lógica de pasadizo según turno", () => {
  describe("turno de entrada en sala (hasMoved: true)", () => {
    it("no muestra el botón de pasadizo cuando el equipo acaba de entrar en sala este turno", () => {
      setupTerminal(CORNER_ROOM_POSITION, true);
      cy.get('[data-cy="terminal-secret-passage-emit"]').should("not.exist");
    });

    it("sí muestra opciones de turno (tablero visible) aunque no haya pasadizo disponible", () => {
      setupTerminal(CORNER_ROOM_POSITION, true);
      cy.get('[data-cy="terminal-themed-board"]').should("be.visible");
    });
  });

  describe("turno con sala desde el anterior (hasMoved: false)", () => {
    it("muestra el botón de pasadizo cuando el equipo estaba en sala desde el turno anterior", () => {
      setupTerminal(CORNER_ROOM_POSITION, false);
      cy.get('[data-cy="terminal-secret-passage-emit"]').should("exist");
    });

    it("el botón de pasadizo contiene la sala destino correcta", () => {
      setupTerminal(CORNER_ROOM_POSITION, false);
      cy.get('[data-cy="terminal-secret-passage-emit"]').should("contain.text", "Sala inferior derecha");
    });

    it("el botón de pasadizo está deshabilitado cuando no hay conexión realtime (sin backend en tests)", () => {
      setupTerminal(CORNER_ROOM_POSITION, false);
      cy.get('[data-cy="terminal-secret-passage-emit"]').should("be.disabled");
    });
  });

  describe("equipo fuera de sala (sin pasadizo posible)", () => {
    it("no muestra el botón de pasadizo cuando el equipo está en una casilla normal", () => {
      setupTerminal(SPAWN_ROJO_POSITION, false);
      cy.get('[data-cy="terminal-secret-passage-emit"]').should("not.exist");
    });

    it("no muestra el botón de pasadizo cuando el equipo está en spawn y hasMoved es false", () => {
      setupTerminal(SPAWN_ROJO_POSITION, false);
      cy.get('[data-cy="terminal-secret-passage-emit"]').should("not.exist");
    });
  });

  describe("relación entre hasMoved y la pestaña MATRIZ", () => {
    it("el tablero sigue visible en pestaña MAPA independientemente de hasMoved", () => {
      setupTerminal(CORNER_ROOM_POSITION, true);
      cy.get('[data-cy="terminal-themed-board"]').should("be.visible");
      setupTerminal(CORNER_ROOM_POSITION, false);
      cy.get('[data-cy="terminal-themed-board"]').should("be.visible");
    });
  });
});
