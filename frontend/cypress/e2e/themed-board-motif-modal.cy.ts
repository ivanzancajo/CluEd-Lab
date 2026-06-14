/// <reference types="cypress" />

type TeamColor = "ROJO" | "AZUL" | "VERDE" | "AMARILLO" | "MORADO" | "BLANCO";

const CENTER_IMAGE = encodeURI(
  'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="20" fill="#0f172a"/><circle cx="60" cy="60" r="34" fill="#22d3ee"/></svg>'
);

function buildSpacesWithMotifs() {
  return [
    { id: "space-1", name: "Camara Anecoica", desc: "Descripcion extendida de la camara anecoica.", motif: "Sello roto" },
    { id: "space-2", name: "Sala Hedy Lamarr", desc: "Descripcion extendida de la sala Hedy.", motif: "Interferencia" },
    { id: "space-3", name: "Central de Conmutacion", desc: "", motif: "Registro alterado" },
    { id: "space-4", name: "Seminario Haykin", desc: "Descripcion seminario.", motif: "Cinta cortada" },
    { id: "space-5", name: "Club de radio", desc: "", motif: "Frecuencia perdida" },
    { id: "space-6", name: "Lab. Opticas", desc: "Laboratorio de comunicaciones opticas.", motif: "Haz desviado" },
    { id: "space-7", name: "Seminario Torres Quevedo", desc: "", motif: "Llave doblada" },
    { id: "space-8", name: "Lab. Electronica", desc: "Laboratorio de electronica.", motif: "Panel abierto" },
    { id: "space-9", name: "Seminario Maxwell", desc: "", motif: "" },
  ];
}

function buildSpacesWithoutMotifs() {
  return buildSpacesWithMotifs().map((s) => ({ ...s, motif: "" }));
}

function buildItems(prefix: string, count: number) {
  return Array.from({ length: count }, (_v, i) => ({
    id: `${prefix.toLowerCase()}-${i + 1}`,
    name: `${prefix} ${i + 1}`,
    desc: `Descripcion ${prefix} ${i + 1}`,
  }));
}

function buildActiveConfig(hasMotifs: boolean) {
  return {
    id: "skin-modal-test",
    name: "Skin test modal motivo",
    gameTitle: "Test modal motivo",
    objective: "Verificar el modal de motivo.",
    duration: "60",
    centerImage: CENTER_IMAGE,
    cat1Name: "Sujetos",
    cat2Name: "Objetos",
    cat3Name: "Espacios",
    hasMotifs,
    subjects: buildItems("Sujeto", 6),
    objects: buildItems("Objeto", 6),
    spaces: hasMotifs ? buildSpacesWithMotifs() : buildSpacesWithoutMotifs(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function buildSession(activeConfig: ReturnType<typeof buildActiveConfig>) {
  return {
    id: "session-modal-1",
    accessCode: "MODAL1",
    status: "EN_CURSO",
    startedAt: "2026-05-17T10:00:00.000Z",
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
    ],
  };
}

function mountTerminalView(
  session: ReturnType<typeof buildSession>,
  activeConfig: ReturnType<typeof buildActiveConfig>
) {
  cy.intercept("GET", "**/api/game/sessions/MODAL1/teams/team-rojo/state", {
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
      window.localStorage.setItem("activeConfig", JSON.stringify(activeConfig));
    },
  });

  cy.wait("@getTeamState");
}

describe("SCRUM-108/SCRUM-110: marcador M y modal de motivo en el tablero", () => {
  describe("con motivos habilitados", () => {
    beforeEach(() => {
      const activeConfig = buildActiveConfig(true);
      const session = buildSession(activeConfig);
      mountTerminalView(session, activeConfig);
    });

    it("muestra el botón M en las salas que tienen motivo", () => {
      cy.get('[data-cy="board-space-motif-1"]').should("be.visible").and("contain.text", "M");
      cy.get('[data-cy="board-space-motif-2"]').should("be.visible");
    });

    it("no muestra el botón M en salas sin motivo (último espacio vacío)", () => {
      cy.get('[data-cy="board-space-motif-9"]').should("not.exist");
    });

    it("abre el modal al pulsar el botón M y muestra nombre y motivo", () => {
      cy.get('[data-cy="space-motif-modal"]').should("not.exist");
      cy.get('[data-cy="board-space-motif-1"]').click({ force: true });
      cy.get('[data-cy="space-motif-modal"]').should("be.visible");
      cy.get('[data-cy="space-motif-modal"]').within(() => {
        cy.contains("Camara Anecoica").should("be.visible");
        cy.contains("Sello roto").should("be.visible");
      });
    });

    it("muestra la descripcion extendida cuando existe", () => {
      cy.get('[data-cy="board-space-motif-1"]').click({ force: true });
      cy.get('[data-cy="space-motif-modal"]').within(() => {
        cy.contains("Descripcion extendida de la camara anecoica.").should("be.visible");
      });
    });

    it("cierra el modal al pulsar el botón de cierre", () => {
      cy.get('[data-cy="board-space-motif-1"]').click({ force: true });
      cy.get('[data-cy="space-motif-modal"]').should("be.visible");
      cy.get('[data-cy="space-motif-modal-close"]').click();
      cy.get('[data-cy="space-motif-modal"]').should("not.exist");
    });

    it("cierra el modal al hacer clic en el overlay exterior", () => {
      cy.get('[data-cy="board-space-motif-1"]').click({ force: true });
      cy.get('[data-cy="space-motif-modal"]').should("be.visible");
      cy.get('[data-cy="space-motif-modal-overlay"]').click({ force: true });
      cy.get('[data-cy="space-motif-modal"]').should("not.exist");
    });

    it("permite abrir el modal de otra sala tras cerrar el primero", () => {
      cy.get('[data-cy="board-space-motif-1"]').click({ force: true });
      cy.get('[data-cy="space-motif-modal-close"]').click();
      cy.get('[data-cy="board-space-motif-2"]').click({ force: true });
      cy.get('[data-cy="space-motif-modal"]').within(() => {
        cy.contains("Sala Hedy Lamarr").should("be.visible");
        cy.contains("Interferencia").should("be.visible");
      });
    });
  });

  describe("sin motivos habilitados", () => {
    beforeEach(() => {
      const activeConfig = buildActiveConfig(false);
      const session = buildSession(activeConfig);
      mountTerminalView(session, activeConfig);
    });

    it("no muestra ningún botón M cuando hasMotifs es false", () => {
      cy.get('[data-cy^="board-space-motif-"]').should("not.exist");
    });
  });
});
