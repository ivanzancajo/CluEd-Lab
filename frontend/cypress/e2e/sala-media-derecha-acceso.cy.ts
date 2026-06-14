/// <reference types="cypress" />

type TeamColor = "ROJO" | "AZUL" | "VERDE" | "AMARILLO" | "MORADO" | "BLANCO";

const CENTER_IMAGE = encodeURI(
  'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="20" fill="#0f172a"/><circle cx="60" cy="60" r="34" fill="#22d3ee"/><path d="M42 60h36" stroke="#f8fafc" stroke-width="8" stroke-linecap="round"/></svg>'
);

// Posiciones porcentuales clave del tablero (col → BOARD_GRID_COLUMNS_PERCENT, row → BOARD_GRID_ROWS_PERCENT)
const POS = {
  // pasillo-derecho-superior (col 20, row 6)
  pasilloDerechoSuperior: { x: 81.56, y: 29.7, id: "pasillo-derecho-superior" },
  // Puerta norte de sala-media-derecha (col 16, row 9)
  puertaNorte: { x: 68.37, y: 39.82, id: "square:grid:16:9" },
  // Puerta lateral de sala-media-derecha (col 15, row 12)
  puertaLateral: { x: 64.99, y: 49.7, id: "square:grid:15:12" },
  // Casilla de corredor próxima a puerta lateral (col 14, row 12)
  squareGrid1412: { x: 61.67, y: 49.7, id: "square:grid:14:12" },
  // Posición del nodo eliminado pasillo-derecho-central (col 20, row 12)
  antiguoPasilloDerechoCentral: { x: 81.56, y: 49.7 },
};

function buildSpaces() {
  return [
    { id: "space-1", name: "Sala Hertz", desc: "Espacio 1", motif: "Sello roto" },
    { id: "space-2", name: "Sala Lovelace", desc: "Espacio 2", motif: "Interferencia" },
    { id: "space-3", name: "Sala Turing", desc: "Espacio 3", motif: "Frecuencia perdida" },
    { id: "space-4", name: "Sala Shannon", desc: "Espacio 4", motif: "Cinta cortada" },
    { id: "space-5", name: "Sala Babbage", desc: "Espacio 5", motif: "Haz desviado" },
    { id: "space-6", name: "Sala Hopper", desc: "Espacio 6", motif: "Registro alterado" },
    { id: "space-7", name: "Sala Maxwell", desc: "Espacio 7", motif: "Llave doblada" },
    { id: "space-8", name: "Sala Faraday", desc: "Espacio 8", motif: "Panel abierto" },
    { id: "space-9", name: "Sala Watt", desc: "Espacio 9", motif: "Nota de despedida" },
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
    id: "skin-sala-media-derecha-1",
    name: "Skin sala media derecha",
    gameTitle: "Acceso a sala central derecha",
    objective: "Comprobar entrada a sala-media-derecha.",
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

function buildSession(
  activeConfig: ReturnType<typeof buildActiveConfig>,
  teamPosition: { x: number; y: number }
) {
  return {
    id: "session-sala-derecha-1",
    accessCode: "SALA01",
    status: "EN_CURSO",
    startedAt: "2026-05-04T10:00:00.000Z",
    durationSeconds: 3600,
    remainingSeconds: 3300,
    skin: activeConfig,
    turn: {
      currentTeamId: "team-amarillo",
      currentTeamName: "Equipo Amarillo",
      currentTeamColor: "AMARILLO" as TeamColor,
      startedAt: "2026-05-04T10:00:00.000Z",
      dice: null,
      remainingMoves: null,
      hasMoved: false,
    },
    teams: [
      {
        id: "team-amarillo",
        name: "Equipo Amarillo",
        color: "AMARILLO" as TeamColor,
        positionX: teamPosition.x,
        positionY: teamPosition.y,
        falseAccusation: false,
      },
    ],
  };
}

function setupVisit(
  session: ReturnType<typeof buildSession>,
  activeConfig: ReturnType<typeof buildActiveConfig>
) {
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
}

function clickBoardPercent(dataCy: string, positionX: number, positionY: number) {
  cy.get(`[data-cy="${dataCy}"]`).then(($surface) => {
    const element = $surface[0];
    const { width, height } = element.getBoundingClientRect();
    cy.wrap($surface).click((width * positionX) / 100, (height * positionY) / 100, { force: true });
  });
}

describe("sala-media-derecha — acceso y topología post-corrección", () => {
  it("desde pasillo-derecho-superior, el peón puede entrar en sala-media-derecha por la puerta norte (16,9)", () => {
    const activeConfig = buildActiveConfig();
    const session = buildSession(activeConfig, POS.pasilloDerechoSuperior);

    const rolledSession = {
      ...session,
      turn: {
        ...session.turn,
        dice: { valueOne: 3, valueTwo: 2, total: 5 },
        remainingMoves: 5,
      },
    };

    const movedSession = {
      ...session,
      turn: {
        ...session.turn,
        currentTeamId: "team-amarillo",
        dice: null,
        remainingMoves: null,
        hasMoved: true,
      },
      teams: session.teams.map((team) => ({
        ...team,
        positionX: 76.6,
        positionY: 34.82,
      })),
    };

    cy.intercept("GET", "**/api/game/sessions/SALA01/teams/team-amarillo/state", {
      statusCode: 200,
      body: { item: { session, team: session.teams[0], hand: [] } },
    }).as("getTeamState");

    cy.intercept("GET", "**/api/game/sessions/SALA01/teams/team-amarillo/moves", {
      statusCode: 200,
      body: {
        item: {
          diceRoll: 5,
          remainingMoves: 5,
          currentNode: {
            id: POS.pasilloDerechoSuperior.id,
            label: "Cruce derecho superior",
            positionX: POS.pasilloDerechoSuperior.x,
            positionY: POS.pasilloDerechoSuperior.y,
            kind: "square",
          },
          destinationNodes: [
            {
              id: POS.puertaNorte.id,
              label: "Casilla 16,9",
              positionX: POS.puertaNorte.x,
              positionY: POS.puertaNorte.y,
              kind: "square",
              gridPosition: { col: 16, row: 9 },
            },
          ],
        },
      },
    }).as("getTeamMoves");

    cy.intercept("POST", "**/api/game/sessions/SALA01/teams/team-amarillo/roll", (req) => {
      req.reply({
        statusCode: 200,
        body: {
          item: {
            session: rolledSession,
            dice: { valueOne: 3, valueTwo: 2, total: 5 },
            diceRoll: 5,
            remainingMoves: 5,
            currentNode: {
              id: POS.pasilloDerechoSuperior.id,
              label: "Cruce derecho superior",
              positionX: POS.pasilloDerechoSuperior.x,
              positionY: POS.pasilloDerechoSuperior.y,
              kind: "square",
            },
            destinationNodes: [
              {
                id: POS.puertaNorte.id,
                label: "Casilla 16,9",
                positionX: POS.puertaNorte.x,
                positionY: POS.puertaNorte.y,
                kind: "square",
                gridPosition: { col: 16, row: 9 },
              },
            ],
            turnAdvanced: false,
          },
        },
      });
    }).as("rollTeamDice");

    setupVisit(session, activeConfig);
    cy.wait("@getTeamState");

    cy.get('[data-cy="terminal-dice-roll"]').should("not.be.disabled").click({ force: true });
    cy.wait("@rollTeamDice");
    cy.wait("@getTeamMoves");

    // La puerta norte (16,9) aparece como destino alcanzable
    cy.contains("Alcance de tirada: 5").should("be.visible");

    // Hacemos clic en la puerta norte
    clickBoardPercent("terminal-board-surface", POS.puertaNorte.x, POS.puertaNorte.y);
    cy.get('[data-cy="terminal-move-confirm-dialog"]').should("be.visible");

    // El frontend envía la casilla puerta; el backend la resuelve a sala-media-derecha.
    cy.intercept("POST", "**/api/game/sessions/SALA01/teams/team-amarillo/move", (req) => {
      expect(req.body).to.have.property("targetNodeId", POS.puertaNorte.id);
      req.reply({
        statusCode: 200,
        body: {
          item: {
            session: movedSession,
            dice: { valueOne: 3, valueTwo: 2, total: 5 },
            diceRoll: 5,
            remainingMoves: null,
            currentNode: {
              id: "sala-media-derecha",
              label: "Sala media derecha",
              positionX: 76.6,
              positionY: 34.82,
              kind: "room",
            },
            destinationNodes: [],
            turnAdvanced: true,
          },
        },
      });
    }).as("moveTeamToDoor");

    cy.get('[data-cy="terminal-move-confirm"]').click({ force: true });
    cy.wait("@moveTeamToDoor");
  });

  it("desde corredor central, el peón puede entrar en sala-media-derecha por la puerta lateral (15,12)", () => {
    const activeConfig = buildActiveConfig();
    const session = buildSession(activeConfig, POS.squareGrid1412);

    const rolledSession = {
      ...session,
      turn: {
        ...session.turn,
        dice: { valueOne: 1, valueTwo: 0, total: 1 },
        remainingMoves: 1,
      },
    };

    const movedSession = {
      ...session,
      turn: {
        ...session.turn,
        dice: null,
        remainingMoves: null,
        hasMoved: true,
      },
      teams: session.teams.map((team) => ({
        ...team,
        positionX: 76.6,
        positionY: 34.82,
      })),
    };

    cy.intercept("GET", "**/api/game/sessions/SALA01/teams/team-amarillo/state", {
      statusCode: 200,
      body: { item: { session, team: session.teams[0], hand: [] } },
    }).as("getTeamState");

    cy.intercept("GET", "**/api/game/sessions/SALA01/teams/team-amarillo/moves", {
      statusCode: 200,
      body: {
        item: {
          diceRoll: 1,
          remainingMoves: 1,
          currentNode: {
            id: POS.squareGrid1412.id,
            label: "Casilla 14,12",
            positionX: POS.squareGrid1412.x,
            positionY: POS.squareGrid1412.y,
            kind: "square",
          },
          destinationNodes: [
            {
              id: POS.puertaLateral.id,
              label: "Casilla 15,12",
              positionX: POS.puertaLateral.x,
              positionY: POS.puertaLateral.y,
              kind: "square",
              gridPosition: { col: 15, row: 12 },
            },
          ],
        },
      },
    }).as("getTeamMoves");

    cy.intercept("POST", "**/api/game/sessions/SALA01/teams/team-amarillo/roll", (req) => {
      req.reply({
        statusCode: 200,
        body: {
          item: {
            session: rolledSession,
            dice: { valueOne: 1, valueTwo: 0, total: 1 },
            diceRoll: 1,
            remainingMoves: 1,
            currentNode: {
              id: POS.squareGrid1412.id,
              label: "Casilla 14,12",
              positionX: POS.squareGrid1412.x,
              positionY: POS.squareGrid1412.y,
              kind: "square",
            },
            destinationNodes: [
              {
                id: POS.puertaLateral.id,
                label: "Casilla 15,12",
                positionX: POS.puertaLateral.x,
                positionY: POS.puertaLateral.y,
                kind: "square",
                gridPosition: { col: 15, row: 12 },
              },
            ],
            turnAdvanced: false,
          },
        },
      });
    }).as("rollTeamDice");

    setupVisit(session, activeConfig);
    cy.wait("@getTeamState");

    cy.get('[data-cy="terminal-dice-roll"]').should("not.be.disabled").click({ force: true });
    cy.wait("@rollTeamDice");
    cy.wait("@getTeamMoves");

    cy.contains("Alcance de tirada: 1").should("be.visible");

    clickBoardPercent("terminal-board-surface", POS.puertaLateral.x, POS.puertaLateral.y);
    cy.get('[data-cy="terminal-move-confirm-dialog"]').should("be.visible");

    cy.intercept("POST", "**/api/game/sessions/SALA01/teams/team-amarillo/move", (req) => {
      expect(req.body).to.have.property("targetNodeId", POS.puertaLateral.id);
      req.reply({
        statusCode: 200,
        body: {
          item: {
            session: movedSession,
            dice: { valueOne: 1, valueTwo: 0, total: 1 },
            diceRoll: 1,
            remainingMoves: null,
            currentNode: {
              id: "sala-media-derecha",
              label: "Sala media derecha",
              positionX: 76.6,
              positionY: 34.82,
              kind: "room",
            },
            destinationNodes: [],
            turnAdvanced: true,
          },
        },
      });
    }).as("moveTeamToSalaLateral");

    cy.get('[data-cy="terminal-move-confirm"]').click({ force: true });
    cy.wait("@moveTeamToSalaLateral");
  });

  it("el modo debug no muestra ningún nodo en la posición del antiguo pasillo-derecho-central (81.56%, 49.7%)", () => {
    const activeConfig = buildActiveConfig();
    const session = buildSession(activeConfig, POS.pasilloDerechoSuperior);

    cy.intercept("GET", "**/api/game/sessions/SALA01/teams/team-amarillo/state", {
      statusCode: 200,
      body: { item: { session, team: session.teams[0], hand: [] } },
    }).as("getTeamState");

    setupVisit(session, activeConfig);
    cy.wait("@getTeamState");

    cy.get('[data-cy="terminal-board-debug-toggle"]').click();
    cy.get('[data-cy="board-debug-overlay"]').should("be.visible");

    // No debe existir ningún nodo debug en la posición del nodo eliminado
    cy.get('[data-cy="board-debug-node-pasillo-derecho-central"]').should("not.exist");
    cy.get('[data-cy="board-debug-node-centro-este"]').should("not.exist");
  });

  it("desde pasillo-derecho-superior con tirada 6, no se ofrecen destinos en la posición del antiguo pasillo-derecho-central", () => {
    const activeConfig = buildActiveConfig();
    const session = buildSession(activeConfig, POS.pasilloDerechoSuperior);

    const rolledSession = {
      ...session,
      turn: {
        ...session.turn,
        dice: { valueOne: 3, valueTwo: 3, total: 6 },
        remainingMoves: 6,
      },
    };

    cy.intercept("GET", "**/api/game/sessions/SALA01/teams/team-amarillo/state", {
      statusCode: 200,
      body: { item: { session, team: session.teams[0], hand: [] } },
    }).as("getTeamState");

    cy.intercept("GET", "**/api/game/sessions/SALA01/teams/team-amarillo/moves", {
      statusCode: 200,
      body: {
        item: {
          diceRoll: 6,
          remainingMoves: 6,
          currentNode: {
            id: POS.pasilloDerechoSuperior.id,
            label: "Cruce derecho superior",
            positionX: POS.pasilloDerechoSuperior.x,
            positionY: POS.pasilloDerechoSuperior.y,
            kind: "square",
          },
          // Sin destinationNodes en posición del nodo eliminado
          destinationNodes: [
            {
              id: "square:grid:20:8",
              label: "Casilla 20,8",
              positionX: 81.56,
              positionY: 36.5,
              kind: "square",
              gridPosition: { col: 20, row: 8 },
            },
          ],
        },
      },
    }).as("getTeamMoves");

    cy.intercept("POST", "**/api/game/sessions/SALA01/teams/team-amarillo/roll", (req) => {
      req.reply({
        statusCode: 200,
        body: {
          item: {
            session: rolledSession,
            dice: { valueOne: 3, valueTwo: 3, total: 6 },
            diceRoll: 6,
            remainingMoves: 6,
            currentNode: {
              id: POS.pasilloDerechoSuperior.id,
              label: "Cruce derecho superior",
              positionX: POS.pasilloDerechoSuperior.x,
              positionY: POS.pasilloDerechoSuperior.y,
              kind: "square",
            },
            destinationNodes: [
              {
                id: "square:grid:20:8",
                label: "Casilla 20,8",
                positionX: 81.56,
                positionY: 36.5,
                kind: "square",
                gridPosition: { col: 20, row: 8 },
              },
            ],
            turnAdvanced: false,
          },
        },
      });
    }).as("rollTeamDice");

    setupVisit(session, activeConfig);
    cy.wait("@getTeamState");

    cy.get('[data-cy="terminal-dice-roll"]').should("not.be.disabled").click({ force: true });
    cy.wait("@rollTeamDice");
    cy.wait("@getTeamMoves");

    // Ningún destino resaltado en la posición del antiguo pasillo-derecho-central
    clickBoardPercent(
      "terminal-board-surface",
      POS.antiguoPasilloDerechoCentral.x,
      POS.antiguoPasilloDerechoCentral.y
    );

    // El dialog de confirmación NO debe aparecer (no hay destino ahí)
    cy.get('[data-cy="terminal-move-confirm-dialog"]').should("not.exist");
  });
});
