/// <reference types="cypress" />

type TeamColor = "ROJO" | "AZUL" | "VERDE" | "AMARILLO" | "MORADO" | "BLANCO";

const CENTER_IMAGE = encodeURI(
  'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="20" fill="#0f172a"/><circle cx="60" cy="60" r="34" fill="#22d3ee"/><path d="M42 60h36" stroke="#f8fafc" stroke-width="8" stroke-linecap="round"/></svg>'
);

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
    id: "skin-board-move-1",
    name: "Skin tablero dinamico",
    gameTitle: "Muerte de una ingenia",
    objective: "Comprobar el movimiento del peon en terminal.",
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
    id: "session-move-1",
    accessCode: "MOVE01",
    status: "EN_CURSO",
    startedAt: "2026-05-04T10:00:00.000Z",
    durationSeconds: 3600,
    remainingSeconds: 3300,
    skin: activeConfig,
    turn: {
      currentTeamId: "team-rojo",
      currentTeamName: "Equipo Rojo",
      currentTeamColor: "ROJO" as TeamColor,
      startedAt: "2026-05-04T10:00:00.000Z",
      dice: null,
      remainingMoves: null,
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
  };
}

function clickBoardPercent(dataCy: string, positionX: number, positionY: number) {
  cy.get(`[data-cy="${dataCy}"]`).then(($surface) => {
    const element = $surface[0];
    const { width, height } = element.getBoundingClientRect();

    cy.wrap($surface).click((width * positionX) / 100, (height * positionY) / 100, { force: true });
  });
}

describe("movimiento de peones en terminal", () => {
  it("activa el modo debug del tablero y registra una sonda visual sobre el mapa", () => {
    const activeConfig = buildActiveConfig();
    const initialSession = buildSession(activeConfig);

    cy.intercept("GET", "**/api/game/sessions/MOVE01/teams/team-rojo/state", {
      statusCode: 200,
      body: {
        item: {
          session: initialSession,
          team: initialSession.teams[0],
          hand: [],
        },
      },
    }).as("getTeamState");

    cy.visit("/terminal", {
      onBeforeLoad(window) {
        window.localStorage.setItem("sessionId", initialSession.id);
        window.localStorage.setItem("sessionCode", initialSession.accessCode);
        window.localStorage.setItem("sessionStatus", initialSession.status);
        window.localStorage.setItem("teamId", initialSession.teams[0].id);
        window.localStorage.setItem("teamColor", initialSession.teams[0].color);
        window.localStorage.setItem("teamName", initialSession.teams[0].name);
        window.localStorage.setItem("activeConfig", JSON.stringify(activeConfig));
        window.localStorage.setItem("centerImage", activeConfig.centerImage);
        window.localStorage.removeItem("boardDebugMode");
      },
    });

    cy.wait("@getTeamState");
    cy.get('[data-cy="board-debug-overlay"]').should("not.exist");

    cy.get('[data-cy="terminal-board-debug-toggle"]').click();
    cy.get('[data-cy="board-debug-overlay"]').should("be.visible");
    cy.get('[data-cy="board-debug-grid-col-10"]').should("be.visible");
    cy.get('[data-cy="board-debug-grid-row-12"]').should("be.visible");
    cy.get('[data-cy="board-debug-node-spawn-rojo"]').should("be.visible");

    clickBoardPercent("terminal-board-surface", 64.97, 10.03);

    cy.get('[data-cy="board-debug-probe-cell"]').should("be.visible");
    cy.get('[data-cy="board-debug-overlay"]').contains("spawn-rojo").should("be.visible");
  });

  it("permite seleccionar un destino final alcanzable y mover el peon en un solo movimiento", () => {
    const activeConfig = buildActiveConfig();
    const initialSession = buildSession(activeConfig);
    const rolledSession = {
      ...initialSession,
      turn: {
        ...initialSession.turn,
        dice: {
          valueOne: 1,
          valueTwo: 1,
          total: 2,
        },
        remainingMoves: 2,
      },
    };
    const movedSession = {
      ...initialSession,
      turn: {
        currentTeamId: "team-azul",
        currentTeamName: "Equipo Azul",
        currentTeamColor: "AZUL" as TeamColor,
        startedAt: "2026-05-04T10:00:25.000Z",
        dice: null,
        remainingMoves: null,
      },
      teams: initialSession.teams.map((team) =>
        team.id === "team-rojo"
          ? { ...team, positionX: 64.99, positionY: 23.17 }
          : team
      ),
    };

    cy.intercept("GET", "**/api/game/sessions/MOVE01/teams/team-rojo/state", {
      statusCode: 200,
      body: {
        item: {
          session: initialSession,
          team: initialSession.teams[0],
          hand: [],
        },
      },
    }).as("getTeamState");

    cy.intercept("GET", "**/api/game/sessions/MOVE01/teams/team-rojo/moves", {
      statusCode: 200,
      body: {
        item: {
          diceRoll: 2,
          remainingMoves: 2,
          currentNode: {
            id: "spawn-rojo",
            label: "Salida roja",
            positionX: 64.97,
            positionY: 10.03,
            kind: "spawn",
          },
          destinationNodes: [
            {
              id: "pasillo-superior-derecho",
              label: "Cruce superior derecho",
              positionX: 64.99,
              positionY: 23.17,
              kind: "square",
              gridPosition: { col: 15, row: 4 },
            },
          ],
        },
      },
    }).as("getTeamMoves");

    cy.intercept("POST", "**/api/game/sessions/MOVE01/teams/team-rojo/roll", (req) => {
      req.reply({
        statusCode: 200,
        body: {
          item: {
            session: rolledSession,
            dice: {
              valueOne: 1,
              valueTwo: 1,
              total: 2,
            },
            diceRoll: 2,
            remainingMoves: 2,
            currentNode: {
              id: "spawn-rojo",
              label: "Salida roja",
              positionX: 64.97,
              positionY: 10.03,
              kind: "spawn",
            },
            destinationNodes: [
              {
                id: "pasillo-superior-derecho",
                label: "Cruce superior derecho",
                positionX: 64.99,
                positionY: 23.17,
                kind: "square",
                gridPosition: { col: 15, row: 4 },
              },
            ],
            turnAdvanced: false,
          },
        },
      });
    }).as("rollTeamDice");

    cy.visit("/terminal", {
      onBeforeLoad(window) {
        window.localStorage.setItem("sessionId", initialSession.id);
        window.localStorage.setItem("sessionCode", initialSession.accessCode);
        window.localStorage.setItem("sessionStatus", initialSession.status);
        window.localStorage.setItem("teamId", initialSession.teams[0].id);
        window.localStorage.setItem("teamColor", initialSession.teams[0].color);
        window.localStorage.setItem("teamName", initialSession.teams[0].name);
        window.localStorage.setItem("activeConfig", JSON.stringify(activeConfig));
        window.localStorage.setItem("centerImage", activeConfig.centerImage);
      },
    });

    cy.wait("@getTeamState");
    cy.get('[data-cy="terminal-turn-indicator"]').should("contain.text", "MI TURNO");
    cy.get('[data-cy="board-space-1"]').should("not.exist");
    cy.get('[data-cy="board-pawn-rojo"]').should("exist");
    cy.get('[data-cy="board-pawn-azul"]').should("not.exist");
    cy.contains("Pulsa Tirar dados para registrar la tirada del turno actual y desbloquear los destinos válidos en el tablero.").should("be.visible");

    cy.get('[data-cy="terminal-dice-roll"]').click({ force: true });
    cy.wait("@rollTeamDice");
    cy.wait("@getTeamMoves");

    cy.get('[data-cy="terminal-destination-select"]').should("not.exist");
    cy.contains("Alcance de tirada: 2").should("be.visible");

    clickBoardPercent("terminal-board-surface", 64.99, 23.17);
    cy.get('[data-cy="terminal-move-confirm-dialog"]').should("be.visible");
    cy.contains("Vas a mover el peón hasta").should("be.visible");

    cy.intercept("POST", "**/api/game/sessions/MOVE01/teams/team-rojo/move", (req) => {
      expect(req.body).to.have.property("targetNodeId", "pasillo-superior-derecho");

      req.reply({
        statusCode: 200,
        body: {
          item: {
            session: movedSession,
            dice: {
              valueOne: 1,
              valueTwo: 1,
              total: 2,
            },
            diceRoll: 2,
            remainingMoves: null,
            currentNode: {
              id: "pasillo-superior-derecho",
              label: "Cruce superior derecho",
              positionX: 64.99,
              positionY: 23.17,
              kind: "square",
              gridPosition: { col: 15, row: 4 },
            },
            destinationNodes: [],
            turnAdvanced: true,
          },
        },
      });
    }).as("moveTeamValid");

    cy.get('[data-cy="terminal-move-confirm"]').click({ force: true });
    cy.wait("@moveTeamValid");

    cy.get('[data-cy="terminal-turn-indicator"]').should("contain.text", "ESPERA");
    cy.get('[data-cy="board-pawn-rojo"]')
      .should("have.attr", "style")
      .and("include", "top: 23.17%")
      .and("include", "left: 64.99%");
  });
});