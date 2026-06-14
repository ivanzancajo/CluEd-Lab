/// <reference types="cypress" />

type TeamColor = "ROJO" | "AZUL" | "VERDE" | "AMARILLO" | "MORADO" | "BLANCO";

const CENTER_IMAGE = encodeURI(
  'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="20" fill="#0f172a"/><circle cx="60" cy="60" r="34" fill="#22d3ee"/><path d="M42 60h36" stroke="#f8fafc" stroke-width="8" stroke-linecap="round"/></svg>'
);

function buildActiveConfig() {
  return {
    id: "skin-debug-1",
    name: "Skin debug dado",
    gameTitle: "Debug Test",
    objective: "Probar la inyección de tirada forzada.",
    duration: "60",
    centerImage: CENTER_IMAGE,
    cat1Name: "Sujetos",
    cat2Name: "Objetos",
    cat3Name: "Espacios",
    hasMotifs: false,
    subjects: Array.from({ length: 6 }, (_, i) => ({ id: `sujeto-${i + 1}`, name: `Sujeto ${i + 1}`, desc: "" })),
    objects: Array.from({ length: 6 }, (_, i) => ({ id: `objeto-${i + 1}`, name: `Objeto ${i + 1}`, desc: "" })),
    spaces: Array.from({ length: 9 }, (_, i) => ({ id: `espacio-${i + 1}`, name: `Espacio ${i + 1}`, desc: "" })),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function buildSession(activeConfig: ReturnType<typeof buildActiveConfig>) {
  return {
    id: "session-debug-1",
    accessCode: "DEBUG1",
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
    ],
    activeSuggestion: null,
    winnerTeam: null,
    resolution: null,
    publicCards: [],
  };
}

function setupTerminalVisit(session: ReturnType<typeof buildSession>, activeConfig: ReturnType<typeof buildActiveConfig>) {
  const teamId = session.teams[0].id;

  cy.intercept("GET", `**/api/game/sessions/${session.accessCode}/teams/${teamId}/state`, {
    statusCode: 200,
    body: {
      item: {
        session,
        team: session.teams[0],
        hand: [],
        pendingSuggestion: null,
      },
    },
  }).as("getTeamState");

  cy.visit("/terminal", {
    onBeforeLoad(window) {
      window.localStorage.setItem("sessionId", session.id);
      window.localStorage.setItem("sessionCode", session.accessCode);
      window.localStorage.setItem("sessionStatus", session.status);
      window.localStorage.setItem("teamId", teamId);
      window.localStorage.setItem("teamColor", session.teams[0].color);
      window.localStorage.setItem("teamName", session.teams[0].name);
      window.localStorage.setItem("activeConfig", JSON.stringify(activeConfig));
      window.localStorage.setItem("centerImage", activeConfig.centerImage);
      window.localStorage.removeItem("boardDebugMode");
    },
  });

  cy.wait("@getTeamState");
}

describe("SCRUM-107 panel de dado forzado en modo debug", () => {
  it("el toggle de debug es visible en entorno de desarrollo", () => {
    const activeConfig = buildActiveConfig();
    const session = buildSession(activeConfig);
    setupTerminalVisit(session, activeConfig);

    cy.get('[data-cy="terminal-board-debug-toggle"]').should("be.visible");
  });

  it("el panel de dado forzado no se muestra antes de activar debug", () => {
    const activeConfig = buildActiveConfig();
    const session = buildSession(activeConfig);
    setupTerminalVisit(session, activeConfig);

    cy.get('[data-cy="debug-forced-dice-panel"]').should("not.exist");
  });

  it("el panel de dado forzado aparece al activar debug cuando es el turno del equipo y el dado no ha sido tirado", () => {
    const activeConfig = buildActiveConfig();
    const session = buildSession(activeConfig);
    setupTerminalVisit(session, activeConfig);

    cy.get('[data-cy="terminal-board-debug-forced-dice-toggle"]').click();
    cy.get('[data-cy="debug-forced-dice-panel"]').should("be.visible");
  });

  it("el dropdown tiene las opciones aleatorio y valores del 2 al 12", () => {
    const activeConfig = buildActiveConfig();
    const session = buildSession(activeConfig);
    setupTerminalVisit(session, activeConfig);

    cy.get('[data-cy="terminal-board-debug-forced-dice-toggle"]').click();
    cy.get('[data-cy="debug-forced-dice-select"]').should("be.visible");
    cy.get('[data-cy="debug-forced-dice-select"] option').should("have.length", 12);
    cy.get('[data-cy="debug-forced-dice-select"] option').first().should("have.value", "");
    cy.get('[data-cy="debug-forced-dice-select"] option[value="2"]').should("exist");
    cy.get('[data-cy="debug-forced-dice-select"] option[value="7"]').should("exist");
    cy.get('[data-cy="debug-forced-dice-select"] option[value="12"]').should("exist");
  });

  it("desactivar debug oculta el panel de dado forzado", () => {
    const activeConfig = buildActiveConfig();
    const session = buildSession(activeConfig);
    setupTerminalVisit(session, activeConfig);

    cy.get('[data-cy="terminal-board-debug-forced-dice-toggle"]').click();
    cy.get('[data-cy="debug-forced-dice-panel"]').should("be.visible");

    cy.get('[data-cy="terminal-board-debug-forced-dice-toggle"]').click();
    cy.get('[data-cy="debug-forced-dice-panel"]').should("not.exist");
  });

  it("envía forcedTotal en el cuerpo de la petición cuando se selecciona un valor del dropdown", () => {
    const activeConfig = buildActiveConfig();
    const session = buildSession(activeConfig);
    setupTerminalVisit(session, activeConfig);

    cy.intercept("POST", `**/api/game/sessions/${session.accessCode}/teams/team-rojo/roll`, (req) => {
      expect(req.body).to.deep.equal({ forcedTotal: 7 });
      req.reply({
        statusCode: 200,
        body: {
          item: {
            session: { ...session, turn: { ...session.turn, dice: { valueOne: 4, valueTwo: 3, total: 7 }, remainingMoves: 7 } },
            dice: { valueOne: 4, valueTwo: 3, total: 7 },
            diceRoll: 7,
            remainingMoves: 7,
            currentNode: { id: "spawn-rojo", label: "Salida roja", positionX: 64.97, positionY: 10.03, kind: "spawn" },
            destinationNodes: [],
            turnAdvanced: false,
          },
        },
      });
    }).as("rollForzado");

    cy.get('[data-cy="terminal-board-debug-forced-dice-toggle"]').click();
    cy.get('[data-cy="debug-forced-dice-select"]').select("7");
    cy.get('[data-cy="debug-forced-dice-confirm"]').click();
    cy.wait("@rollForzado");
  });

  it("envía cuerpo vacío cuando la opción seleccionada es aleatorio", () => {
    const activeConfig = buildActiveConfig();
    const session = buildSession(activeConfig);
    setupTerminalVisit(session, activeConfig);

    cy.intercept("POST", `**/api/game/sessions/${session.accessCode}/teams/team-rojo/roll`, (req) => {
      expect(req.body).to.deep.equal({});
      req.reply({
        statusCode: 200,
        body: {
          item: {
            session: { ...session, turn: { ...session.turn, dice: { valueOne: 3, valueTwo: 2, total: 5 }, remainingMoves: 5 } },
            dice: { valueOne: 3, valueTwo: 2, total: 5 },
            diceRoll: 5,
            remainingMoves: 5,
            currentNode: { id: "spawn-rojo", label: "Salida roja", positionX: 64.97, positionY: 10.03, kind: "spawn" },
            destinationNodes: [],
            turnAdvanced: false,
          },
        },
      });
    }).as("rollAleatorio");

    // Sin forzar el dado (modo aleatorio), la tirada normal envía un cuerpo vacío.
    cy.get('[data-cy="terminal-dice-roll"]').click({ force: true });
    cy.wait("@rollAleatorio");
  });

  it("el panel desaparece cuando el dado ya ha sido tirado (dice no es null)", () => {
    const activeConfig = buildActiveConfig();
    const session = buildSession(activeConfig);
    const sessionConDado = {
      ...session,
      turn: {
        ...session.turn,
        dice: { valueOne: 2, valueTwo: 3, total: 5 },
        remainingMoves: 5,
      },
    };

    cy.intercept("GET", `**/api/game/sessions/${session.accessCode}/teams/team-rojo/state`, {
      statusCode: 200,
      body: {
        item: {
          session: sessionConDado,
          team: session.teams[0],
          hand: [],
          pendingSuggestion: null,
        },
      },
    }).as("getTeamStateConDado");

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

    cy.wait("@getTeamStateConDado");
    // Con el dado ya tirado, ni el toggle de dado forzado ni su panel deben existir.
    cy.get('[data-cy="terminal-board-debug-forced-dice-toggle"]').should("not.exist");
    cy.get('[data-cy="debug-forced-dice-panel"]').should("not.exist");
  });
});
