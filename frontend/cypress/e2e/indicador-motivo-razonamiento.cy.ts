/// <reference types="cypress" />

type TeamColor = "ROJO" | "AZUL" | "VERDE" | "AMARILLO" | "MORADO" | "BLANCO";

const CENTER_IMAGE = encodeURI(
  'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="20" fill="#0f172a"/><circle cx="60" cy="60" r="34" fill="#22d3ee"/></svg>'
);

function buildSpaces() {
  return [
    { id: "space-1", name: "Camara Anecoica", desc: "Sala de absorcion.", motif: "Sello roto" },
    { id: "space-2", name: "Sala Hedy Lamarr", desc: "Pionera inalambrica.", motif: "Interferencia" },
    { id: "space-3", name: "Central de Conmutacion", desc: "", motif: "Registro alterado" },
    { id: "space-4", name: "Seminario Haykin", desc: "", motif: "Cinta cortada" },
    { id: "space-5", name: "Club de radio", desc: "", motif: "Frecuencia perdida" },
    { id: "space-6", name: "Lab. Opticas", desc: "Laboratorio optico.", motif: "Haz desviado" },
    { id: "space-7", name: "Seminario Torres Quevedo", desc: "", motif: "Llave doblada" },
    { id: "space-8", name: "Lab. Electronica", desc: "Lab electronica.", motif: "Panel abierto" },
    { id: "space-9", name: "Seminario Maxwell", desc: "", motif: "" },
  ];
}

function buildActiveConfig(hasMotifs: boolean) {
  return {
    id: "skin-razonamiento-test",
    name: "Skin razonamiento",
    gameTitle: "Test tabla razonamiento",
    objective: "Verificar indicador de motivo en tabla.",
    duration: "60",
    centerImage: CENTER_IMAGE,
    cat1Name: "Sujetos",
    cat2Name: "Objetos",
    cat3Name: "Espacios",
    hasMotifs,
    subjects: Array.from({ length: 6 }, (_, i) => ({ id: `sujeto-${i + 1}`, name: `Sujeto ${i + 1}`, desc: "" })),
    objects: Array.from({ length: 6 }, (_, i) => ({ id: `objeto-${i + 1}`, name: `Objeto ${i + 1}`, desc: "" })),
    spaces: buildSpaces(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function buildSession(activeConfig: ReturnType<typeof buildActiveConfig>) {
  return {
    id: "session-razonamiento-1",
    accessCode: "RAZON1",
    status: "EN_CURSO",
    startedAt: "2026-05-17T10:00:00.000Z",
    durationSeconds: 3600,
    remainingSeconds: 3300,
    skin: activeConfig,
    turn: {
      currentTeamId: "team-azul",
      currentTeamName: "Equipo Azul",
      currentTeamColor: "AZUL" as TeamColor,
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

function setupTerminal(session: ReturnType<typeof buildSession>, activeConfig: ReturnType<typeof buildActiveConfig>) {
  cy.intercept("GET", `**/api/game/sessions/RAZON1/teams/team-rojo/state`, {
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
    },
  });

  cy.wait("@getTeamState");
}

function openMatrixTab() {
  cy.contains("button", "MATRIZ").click();
}

describe("indicador de motivo en tabla de razonamiento", () => {
  describe("con motivos habilitados en la skin", () => {
    beforeEach(() => {
      const activeConfig = buildActiveConfig(true);
      const session = buildSession(activeConfig);
      setupTerminal(session, activeConfig);
      openMatrixTab();
    });

    it("muestra el nombre del espacio (no el motivo) como etiqueta de fila", () => {
      cy.contains("Camara Anecoica").should("be.visible");
      cy.contains("Sello roto").should("not.exist");
    });

    it("muestra el badge M en filas de espacio con motivo", () => {
      cy.get('[data-cy="matrix-space-motif-space-1"]').should("be.visible").and("contain.text", "M");
      cy.get('[data-cy="matrix-space-motif-space-2"]').should("be.visible");
      cy.get('[data-cy="matrix-space-motif-space-8"]').should("be.visible");
    });

    it("no muestra badge M en espacios sin motivo", () => {
      cy.get('[data-cy="matrix-space-motif-space-9"]').should("not.exist");
    });

    it("no muestra badge M en filas de sujetos", () => {
      cy.get('[data-cy^="matrix-space-motif-sujeto"]').should("not.exist");
    });

    it("no muestra badge M en filas de objetos", () => {
      cy.get('[data-cy^="matrix-space-motif-objeto"]').should("not.exist");
    });

    it("el badge M tiene el motivo como tooltip (title)", () => {
      cy.get('[data-cy="matrix-space-motif-space-1"]').should("have.attr", "title", "Sello roto");
      cy.get('[data-cy="matrix-space-motif-space-2"]').should("have.attr", "title", "Interferencia");
    });

    it("pulsar el badge M abre el modal de motivo con nombre y motivo correctos", () => {
      cy.get('[data-cy="space-motif-modal"]').should("not.exist");
      cy.get('[data-cy="matrix-space-motif-space-1"]').click();
      cy.get('[data-cy="space-motif-modal"]').should("be.visible");
      cy.get('[data-cy="space-motif-modal"]').within(() => {
        cy.contains("Camara Anecoica").should("be.visible");
        cy.contains("Sello roto").should("be.visible");
      });
    });

    it("pulsar el badge M de un espacio con descripcion la muestra en el modal", () => {
      cy.get('[data-cy="matrix-space-motif-space-1"]').click();
      cy.get('[data-cy="space-motif-modal"]').should("contain", "Sala de absorcion.");
    });

    it("cerrar el modal con la X vuelve a la tabla con el badge visible", () => {
      cy.get('[data-cy="matrix-space-motif-space-2"]').click();
      cy.get('[data-cy="space-motif-modal"]').should("be.visible");
      cy.get('[data-cy="space-motif-modal-close"]').click();
      cy.get('[data-cy="space-motif-modal"]').should("not.exist");
      cy.get('[data-cy="matrix-space-motif-space-2"]').should("be.visible");
    });
  });

  describe("sin motivos habilitados en la skin", () => {
    it("no muestra ningun badge M en la tabla aunque los espacios tengan motif en los datos", () => {
      const activeConfig = buildActiveConfig(false);
      const session = buildSession(activeConfig);
      setupTerminal(session, activeConfig);
      openMatrixTab();

      cy.get('[data-cy^="matrix-space-motif"]').should("not.exist");
    });
  });
});
