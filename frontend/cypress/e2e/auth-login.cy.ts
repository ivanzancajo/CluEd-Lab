/// <reference types="cypress" />

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

function mockSuccessfulAdminAccess() {
  const token = createFakeAdminToken();

  cy.intercept("POST", "**/api/auth/login", (request) => {
    expect(request.body).to.deep.equal({ username: "admin", password: "cluedo2026" });
    request.reply({ statusCode: 200, body: { token } });
  }).as("loginRequest");

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

  cy.intercept("GET", "**/api/config/skins", {
    statusCode: 200,
    body: { items: [] },
  }).as("listSkinsRequest");

  return token;
}

function openProtectedLogin(target: "config" | "host") {
  cy.visit("/");
  cy.get(
    target === "config"
      ? '[data-cy="landing-admin-config-button"]'
      : '[data-cy="landing-admin-create-session-button"]'
  ).click();
  cy.get('[data-cy="landing-login-modal"]').should("be.visible");
}

function submitAdminCredentials() {
  cy.get('[data-cy="landing-login-username-input"]').type("admin");
  cy.get('[data-cy="landing-login-password-input"]').type("cluedo2026");
  cy.get('[data-cy="landing-login-submit-button"]').click();
}

describe("CU00 autenticacion de Game Master", () => {
  it("redirige a configuracion tras un login valido", () => {
    const token = mockSuccessfulAdminAccess();

    openProtectedLogin("config");
    submitAdminCredentials();

    cy.wait("@loginRequest");
    cy.wait("@sessionRequest");
    cy.wait("@listSkinsRequest");
    cy.url().should("include", "/config");
    cy.window().then((window) => {
      expect(window.localStorage.getItem("adminToken")).to.eq(token);
    });
  });

  it("redirige a crear sesion tras un login valido", () => {
    const token = mockSuccessfulAdminAccess();

    openProtectedLogin("host");
    submitAdminCredentials();

    cy.wait("@loginRequest");
    cy.wait("@sessionRequest");
    cy.wait("@listSkinsRequest");
    cy.url().should("include", "/host");
    cy.contains("Habilitar Partida").should("be.visible");
    cy.window().then((window) => {
      expect(window.localStorage.getItem("adminToken")).to.eq(token);
    });
  });

  it("muestra el error renderizado cuando las credenciales son incorrectas", () => {
    cy.intercept("POST", "**/api/auth/login", {
      statusCode: 401,
      body: {
        error: "Credenciales incorrectas",
      },
    }).as("loginRequest");

    openProtectedLogin("config");
    submitAdminCredentials();

    cy.wait("@loginRequest");
    cy.get('[data-cy="landing-login-error"]').should("be.visible").and("contain", "Credenciales incorrectas");
    cy.url().should("match", /\/$/);
    cy.window().then((window) => {
      expect(window.localStorage.getItem("adminToken")).to.eq(null);
    });
  });
});