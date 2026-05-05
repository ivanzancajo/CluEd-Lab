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

describe("movimiento de peones en terminal", () => {
  it("muestra un mensaje cuando el destino no es válido y permite reintentar otro movimiento", () => {
    const activeConfig = buildActiveConfig();
    const initialSession = buildSession(activeConfig);
    const movedSession = {
      ...initialSession,
      teams: initialSession.teams.map((team) =>
        team.id === "team-rojo"
          ? { ...team, positionX: 78.6, positionY: 17.72 }
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

    cy.intercept("GET", "**/api/game/sessions/MOVE01/teams/team-rojo/moves?*", (req) => {
      const diceRoll = Number(req.query.diceRoll ?? 7);
      req.reply({
        statusCode: 200,
        body: {
          item: {
            diceRoll,
            currentNode: {
              id: "spawn-rojo",
              label: "Salida roja",
              positionX: 64.97,
              positionY: 10.03,
              kind: "spawn",
            },
            destinationNodes: [
              {
                id: "sala-superior-izquierda",
                label: "Sala superior izquierda",
                positionX: 21.66,
                positionY: 15.17,
                kind: "room",
              },
              {
                id: "pasillo-superior-derecho",
                label: "Cruce superior derecho",
                positionX: 64.97,
                positionY: 18.4,
                kind: "square",
              },
              {
                id: "sala-superior-derecha",
                label: "Sala superior derecha",
                positionX: 78.6,
                positionY: 17.72,
                kind: "room",
              },
            ],
          },
        },
      });
    }).as("getTeamMoves");

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
    cy.contains("button", "ESPERA").click();
    cy.contains("Tira los dados y luego pulsa directamente una casilla o una sala del tablero. La terminal te pedirá confirmar el movimiento.").should("be.visible");

    cy.get('[data-cy="terminal-dice-roll"]').click({ force: true });
    cy.wait("@getTeamMoves");

    cy.get('[data-cy="terminal-destination-select"]').should("not.exist");
    cy.contains("Posición: Salida roja").should("be.visible");
    cy.get('[data-cy="terminal-board-node-sala-superior-izquierda"]').click({ force: true });
    cy.get('[data-cy="terminal-move-confirm-dialog"]').should("be.visible");
    cy.contains("Vas a entrar en Sala superior izquierda.").should("be.visible");

    cy.intercept("POST", "**/api/game/sessions/MOVE01/teams/team-rojo/move", (req) => {
      expect(req.body).to.have.property("targetNodeId", "sala-superior-izquierda");
      expect(req.body).to.have.property("diceRoll");

      req.reply({
        statusCode: 409,
        body: {
          error: "El movimiento hacia Sala superior izquierda no es válido para la tirada actual. Prueba con otra casilla o sala.",
        },
      });
    }).as("moveTeamInvalid");

    cy.get('[data-cy="terminal-move-confirm"]').click({ force: true });
    cy.wait("@moveTeamInvalid");
    cy.contains("El movimiento hacia Sala superior izquierda no es válido para la tirada actual. Prueba con otra casilla o sala.").should("be.visible");

    cy.get('[data-cy="terminal-board-node-sala-superior-derecha"]').click({ force: true });
    cy.get('[data-cy="terminal-move-confirm-dialog"]').should("be.visible");
    cy.contains("El movimiento hacia Sala superior izquierda no es válido para la tirada actual. Prueba con otra casilla o sala.").should("not.exist");

    cy.intercept("POST", "**/api/game/sessions/MOVE01/teams/team-rojo/move", (req) => {
      expect(req.body).to.have.property("targetNodeId", "sala-superior-derecha");
      expect(req.body).to.have.property("diceRoll");

      req.reply({
        statusCode: 200,
        body: {
          item: {
            session: movedSession,
            diceRoll: req.body.diceRoll,
            currentNode: {
              id: "sala-superior-derecha",
              label: "Sala superior derecha",
              positionX: 78.6,
              positionY: 17.72,
              kind: "room",
            },
          },
        },
      });
    }).as("moveTeamValid");

    cy.get('[data-cy="terminal-move-confirm"]').click({ force: true });
    cy.wait("@moveTeamValid");

    cy.contains("Posición: Sala superior derecha").should("be.visible");
    cy.get('[data-cy="board-pawn-rojo"]')
      .should("have.attr", "style")
      .and("include", "top: 17.72%")
      .and("include", "left: 78.6%");
  });
});