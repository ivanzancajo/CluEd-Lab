/// <reference types="cypress" />

type SessionStatus = "LOBBY" | "EN_CURSO";
type TeamColor = "ROJO" | "AZUL" | "VERDE" | "AMARILLO" | "MORADO" | "BLANCO";

type LobbyTeam = {
  id: string;
  name: string;
  color: TeamColor;
  positionX: number;
  positionY: number;
  falseAccusation: boolean;
};

const COLOR_LABELS: Record<TeamColor, string> = {
  ROJO: "Equipo Rojo",
  AZUL: "Equipo Azul",
  VERDE: "Equipo Verde",
  AMARILLO: "Equipo Amarillo",
  MORADO: "Equipo Morado",
  BLANCO: "Equipo Blanco",
};

const PARTIAL_VALID_CASES = [
  { input: "A", expectedMessage: "Faltan 5 caracteres para validar la sesion." },
  { input: "AB", expectedMessage: "Faltan 4 caracteres para validar la sesion." },
  { input: "ABC", expectedMessage: "Faltan 3 caracteres para validar la sesion." },
  { input: "ABCD", expectedMessage: "Faltan 2 caracteres para validar la sesion." },
  { input: "ABCDE", expectedMessage: "Faltan 1 caracteres para validar la sesion." },
];

const PARTIAL_INVALID_CASES = [
  { input: "A-", expectedValue: "A", expectedMessage: "Faltan 5 caracteres para validar la sesion." },
  { input: "AB-", expectedValue: "AB", expectedMessage: "Faltan 4 caracteres para validar la sesion." },
  { input: "ABC-", expectedValue: "ABC", expectedMessage: "Faltan 3 caracteres para validar la sesion." },
  { input: "ABCD-", expectedValue: "ABCD", expectedMessage: "Faltan 2 caracteres para validar la sesion." },
  { input: "ABCDE-", expectedValue: "ABCDE", expectedMessage: "Faltan 1 caracteres para validar la sesion." },
];

function buildSession(options?: { status?: SessionStatus; occupiedColors?: TeamColor[]; accessCode?: string }) {
  const status = options?.status ?? "LOBBY";
  const accessCode = options?.accessCode ?? "ABC123";
  const occupiedColors = options?.occupiedColors ?? [];
  const teams: LobbyTeam[] = occupiedColors.map((color, index) => ({
    id: `team-${color.toLowerCase()}-${index}`,
    name: COLOR_LABELS[color],
    color,
    positionX: 0,
    positionY: 0,
    falseAccusation: false,
  }));

  return {
    id: `session-${accessCode.toLowerCase()}`,
    accessCode,
    status,
    startedAt: status === "EN_CURSO" ? "2026-04-23T10:00:00.000Z" : null,
    durationSeconds: 2700,
    remainingSeconds: status === "EN_CURSO" ? 1200 : 2700,
    teams,
    skin: {
      id: "skin-acceso-jugadores",
      name: "Skin Acceso",
      gameTitle: "Laboratorio de Acceso",
      objective: "Validar entrada de jugadores",
      duration: "45",
      centerImage: "",
      cat1Name: "Sujetos",
      cat2Name: "Objetos",
      cat3Name: "Espacios",
      hasMotifs: false,
      subjects: [],
      objects: [],
      spaces: [],
    },
  };
}

function buildJoinedSession(accessCode: string, color: TeamColor) {
  const session = buildSession({ accessCode, occupiedColors: [color] });
  const team = session.teams[0];

  return {
    session,
    team,
  };
}

function visitJoinPage() {
  cy.visit("/join");
}

describe("SCRUM-36 flujo de entrada de jugadores", () => {
  PARTIAL_VALID_CASES.forEach(({ input, expectedMessage }) => {
    it(`no consulta la sesion con ${input.length} caracteres validos`, () => {
      let requestCount = 0;

      cy.intercept("GET", "**/api/game/sessions/*", () => {
        requestCount += 1;
      }).as("getSessionRequest");

      visitJoinPage();
      cy.get('[data-cy="join-terminal-code-input"]').type(input, { delay: 0 });

      cy.get('[data-cy="join-terminal-code-status"]').should("contain", expectedMessage);
      cy.get('[data-cy="join-terminal-submit"]').should("be.disabled");
      cy.then(() => {
        expect(requestCount).to.eq(0);
      });
    });
  });

  PARTIAL_INVALID_CASES.forEach(({ input, expectedValue, expectedMessage }) => {
    it(`sanea la entrada no valida ${input} sin consultar la sesion`, () => {
      let requestCount = 0;

      cy.intercept("GET", "**/api/game/sessions/*", () => {
        requestCount += 1;
      }).as("getSessionRequest");

      visitJoinPage();
      cy.get('[data-cy="join-terminal-code-input"]').type(input, { delay: 0 }).should("have.value", expectedValue);

      cy.get('[data-cy="join-terminal-code-status"]').should("contain", expectedMessage);
      cy.then(() => {
        expect(requestCount).to.eq(0);
      });
    });
  });

  it("sanea una entrada de 6 caracteres no valida y no verifica la sesion hasta completar 6 caracteres reales", () => {
    let requestCount = 0;

    cy.intercept("GET", "**/api/game/sessions/*", () => {
      requestCount += 1;
    }).as("getSessionRequest");

    visitJoinPage();
    cy.get('[data-cy="join-terminal-code-input"]').type("ABC-12", { delay: 0 }).should("have.value", "ABC12");
    cy.get('[data-cy="join-terminal-code-status"]').should("contain", "Faltan 1 caracteres para validar la sesion.");
    cy.then(() => {
      expect(requestCount).to.eq(0);
    });
  });

  it("muestra error cuando el codigo de 6 caracteres no existe", () => {
    cy.intercept("GET", "**/api/game/sessions/NOPE01", {
      statusCode: 404,
      body: { error: "La sesión solicitada no existe." },
    }).as("getMissingSession");

    visitJoinPage();
    cy.get('[data-cy="join-terminal-code-input"]').type("nope01", { delay: 0 }).should("have.value", "NOPE01");

    cy.wait("@getMissingSession");
    cy.get('[data-cy="join-terminal-error"]').should("contain", "La sesión solicitada no existe.");
    cy.get('[data-cy="join-terminal-submit"]').should("be.disabled");
  });

  it("muestra colores ocupados y libres cuando el lobby esta abierto", () => {
    const session = buildSession({ accessCode: "OPEN01", occupiedColors: ["ROJO", "AZUL"] });

    cy.intercept("GET", "**/api/game/sessions/OPEN01", {
      statusCode: 200,
      body: { item: session },
    }).as("getOpenSession");

    visitJoinPage();
    cy.get('[data-cy="join-terminal-code-input"]').type("open01", { delay: 0 });

    cy.wait("@getOpenSession");
    cy.get('[data-cy="join-terminal-session-info"]').should("be.visible");
    cy.get('[data-cy="join-terminal-session-title"]').should("contain", "Laboratorio de Acceso");
    cy.get('[data-cy="join-terminal-session-status"]').should("contain", "Abierto");
    cy.get('[data-cy="join-terminal-available-colors"]').should("contain", "4 / 6");
    cy.get('[data-cy="join-terminal-team-button-rojo"]').should("be.disabled").within(() => {
      cy.get('[data-cy="join-terminal-team-status"]').should("contain", "Ocupado");
    });
    cy.get('[data-cy="join-terminal-team-button-verde"]').should("not.be.disabled").within(() => {
      cy.get('[data-cy="join-terminal-team-status"]').should("contain", "Libre");
    });
    cy.get('[data-cy="join-terminal-submit"]').should("be.disabled");
  });

  it("bloquea nuevas entradas cuando la partida ya ha empezado", () => {
    const session = buildSession({ accessCode: "START1", status: "EN_CURSO", occupiedColors: ["ROJO"] });

    cy.intercept("GET", "**/api/game/sessions/START1", {
      statusCode: 200,
      body: { item: session },
    }).as("getStartedSession");

    visitJoinPage();
    cy.get('[data-cy="join-terminal-code-input"]').type("start1", { delay: 0 });

    cy.wait("@getStartedSession");
    cy.get('[data-cy="join-terminal-code-status"]').should("contain", "Codigo reconocido, pero el lobby ya no admite nuevos equipos.");
    cy.get('[data-cy="join-terminal-error"]').should("contain", "La partida ya ha comenzado y el lobby esta cerrado para nuevos equipos.");
    cy.get('[data-cy="join-terminal-session-status"]').should("contain", "Cerrado");
    cy.get('[data-cy="join-terminal-team-button-verde"]').should("be.disabled").within(() => {
      cy.get('[data-cy="join-terminal-team-status"]').should("contain", "Cerrado");
    });
    cy.get('[data-cy="join-terminal-submit"]').should("be.disabled");
  });

  it("permite seleccionar un color libre y redirige al terminal tras unirse", () => {
    const session = buildSession({ accessCode: "JOIN01", occupiedColors: ["ROJO"] });
    const joinedSession = buildJoinedSession("JOIN01", "VERDE");

    cy.intercept("GET", "**/api/game/sessions/JOIN01", {
      statusCode: 200,
      body: { item: session },
    }).as("getJoinableSession");
    cy.intercept("POST", "**/api/game/sessions/JOIN01/join", (request) => {
      expect(request.body).to.deep.equal({ color: "VERDE" });
      request.reply({
        statusCode: 200,
        body: { item: joinedSession },
      });
    }).as("joinSessionRequest");

    visitJoinPage();
    cy.get('[data-cy="join-terminal-code-input"]').type("join01", { delay: 0 });

    cy.wait("@getJoinableSession");
    cy.get('[data-cy="join-terminal-team-button-rojo"]').should("be.disabled");
    cy.get('[data-cy="join-terminal-team-button-verde"]').click();
    cy.get('[data-cy="join-terminal-team-help"]').should("contain", "Equipo Verde");
    cy.get('[data-cy="join-terminal-submit"]').should("not.be.disabled").click();

    cy.wait("@joinSessionRequest");
    cy.location("pathname").should("eq", "/terminal");
    cy.window().then((window) => {
      expect(window.localStorage.getItem("sessionId")).to.eq(joinedSession.session.id);
      expect(window.localStorage.getItem("sessionCode")).to.eq(joinedSession.session.accessCode);
      expect(window.localStorage.getItem("teamId")).to.eq(joinedSession.team.id);
      expect(window.localStorage.getItem("teamColor")).to.eq("VERDE");
      expect(window.localStorage.getItem("teamName")).to.eq("Equipo Verde");
    });
  });
});