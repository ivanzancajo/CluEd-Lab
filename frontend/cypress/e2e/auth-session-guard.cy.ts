/// <reference types="cypress" />

function encodeBase64Url(value: string) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function createFakeAdminToken(options?: { exp?: number; username?: string }) {
  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encodeBase64Url(
    JSON.stringify({
      role: "admin",
      username: options?.username ?? "admin",
      exp: options?.exp ?? Math.floor(Date.now() / 1000) + 60 * 60,
    })
  );

  return `${header}.${payload}.signature`;
}

function visitWithToken(path: "/config" | "/host", token: string) {
  cy.visit(path, {
    onBeforeLoad(window) {
      window.localStorage.setItem("adminToken", token);
    },
  });
}

function mockValidAdminSession() {
  cy.intercept("GET", "**/api/auth/session", {
    statusCode: 200,
    body: {
      authenticated: true,
      user: {
        role: "admin",
        username: "admin",
      },
    },
  }).as("sessionRequest");
}

describe("Proteccion de sesion del Game Master", () => {
  it("redirige a inicio al abrir configuracion sin una sesion almacenada", () => {
    cy.visit("/config");

    cy.location("pathname").should("eq", "/");
    cy.get('[data-cy="landing-admin-config-button"]').should("be.visible");
  });

  it("redirige a inicio al abrir crear sesion sin una sesion almacenada", () => {
    cy.visit("/host");

    cy.location("pathname").should("eq", "/");
    cy.get('[data-cy="landing-admin-create-session-button"]').should("be.visible");
  });

  it("redirige a inicio al abrir la sala de espera sin una sesion almacenada", () => {
    cy.visit("/lobby");

    cy.location("pathname").should("eq", "/");
    cy.get('[data-cy="landing-admin-create-session-button"]').should("be.visible");
  });

  it("redirige a inicio al abrir el tablero sin una sesion almacenada", () => {
    cy.visit("/board");

    cy.location("pathname").should("eq", "/");
    cy.get('[data-cy="landing-admin-config-button"]').should("be.visible");
  });

  it("descarta el token expirado antes de consultar la sesion del backend", () => {
    const expiredToken = createFakeAdminToken({ exp: Math.floor(Date.now() / 1000) - 60 });

    visitWithToken("/host", expiredToken);

    cy.location("pathname").should("eq", "/");
    cy.window().then((window) => {
      expect(window.localStorage.getItem("adminToken")).to.eq(null);
    });
  });

  it("descarta un token malformado sin consultar la sesion del backend", () => {
    visitWithToken("/config", "token-malformado");

    cy.location("pathname").should("eq", "/");
    cy.window().then((window) => {
      expect(window.localStorage.getItem("adminToken")).to.eq(null);
    });
  });

  it("descarta un token sin expiracion antes de permitir el acceso", () => {
    const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = encodeBase64Url(JSON.stringify({ role: "admin", username: "admin" }));

    visitWithToken("/host", `${header}.${payload}.signature`);

    cy.location("pathname").should("eq", "/");
    cy.window().then((window) => {
      expect(window.localStorage.getItem("adminToken")).to.eq(null);
    });
  });

  it("borra la sesion local cuando el backend rechaza el token almacenado", () => {
    const token = createFakeAdminToken();

    cy.intercept("GET", "**/api/auth/session", {
      statusCode: 403,
      body: {
        error: "Token inválido o expirado.",
      },
    }).as("sessionRequest");

    visitWithToken("/config", token);

    cy.wait("@sessionRequest");
    cy.location("pathname").should("eq", "/");
    cy.window().then((window) => {
      expect(window.localStorage.getItem("adminToken")).to.eq(null);
    });
  });

  it("permite cerrar sesion desde configuracion", () => {
    const token = createFakeAdminToken();

    mockValidAdminSession();
    cy.intercept("GET", "**/api/config/skins", {
      statusCode: 200,
      body: { items: [] },
    }).as("listSkinsRequest");

    visitWithToken("/config", token);

    cy.wait("@sessionRequest");
    cy.wait("@listSkinsRequest");
    cy.get('[data-cy="admin-config-logout-button"]').click();

    cy.location("pathname").should("eq", "/");
    cy.window().then((window) => {
      expect(window.localStorage.getItem("adminToken")).to.eq(null);
    });
  });

  it("permite cerrar sesion desde crear sesion", () => {
    const token = createFakeAdminToken();

    mockValidAdminSession();

    visitWithToken("/host", token);

    cy.wait("@sessionRequest");
    cy.get('[data-cy="session-create-logout-button"]').click();

    cy.location("pathname").should("eq", "/");
    cy.window().then((window) => {
      expect(window.localStorage.getItem("adminToken")).to.eq(null);
    });
  });

  it("usa la sesion almacenada para saltarse el modal de login desde la portada", () => {
    const token = createFakeAdminToken();

    mockValidAdminSession();
    cy.intercept("GET", "**/api/config/skins", {
      statusCode: 200,
      body: { items: [] },
    }).as("listSkinsRequest");

    cy.visit("/", {
      onBeforeLoad(window) {
        window.localStorage.setItem("adminToken", token);
      },
    });

    cy.get('[data-cy="landing-admin-config-button"]').click();

    cy.wait("@sessionRequest");
    cy.wait("@listSkinsRequest");
    cy.location("pathname").should("eq", "/config");
    cy.get('[data-cy="landing-login-modal"]').should("not.exist");
  });

  it("limpia un token invalido almacenado y abre el modal de login desde la portada", () => {
    cy.visit("/", {
      onBeforeLoad(window) {
        window.localStorage.setItem("adminToken", "token-malformado");
      },
    });

    cy.get('[data-cy="landing-admin-config-button"]').click();

    cy.get('[data-cy="landing-login-modal"]').should("be.visible");
    cy.window().then((window) => {
      expect(window.localStorage.getItem("adminToken")).to.eq(null);
    });
  });
});