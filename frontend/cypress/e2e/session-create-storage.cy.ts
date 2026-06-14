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

function buildStoredConfig() {
  return {
    id: "stored-config-1",
    name: "Configuracion Cacheada",
    gameTitle: "Partida Cacheada",
    objective: "Objetivo cacheado",
    duration: "60",
    centerImage: "",
    cat1Name: "Sujetos",
    cat2Name: "Objetos",
    cat3Name: "Espacios",
    hasMotifs: false,
    subjects: Array.from({ length: 6 }, (_, index) => ({
      id: `subject-${index + 1}`,
      name: `Sujeto ${index + 1}`,
      desc: `Descripcion sujeto ${index + 1}`,
    })),
    objects: Array.from({ length: 6 }, (_, index) => ({
      id: `object-${index + 1}`,
      name: `Objeto ${index + 1}`,
      desc: `Descripcion objeto ${index + 1}`,
    })),
    spaces: Array.from({ length: 9 }, (_, index) => ({
      id: `space-${index + 1}`,
      name: `Espacio ${index + 1}`,
      desc: `Descripcion espacio ${index + 1}`,
    })),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe("SessionCreateView cache local", () => {
  it("carga la configuracion almacenada aunque fallen las peticiones remotas", () => {
    const storedConfig = buildStoredConfig();

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
      statusCode: 500,
      body: {
        error: "Fallo remoto",
      },
    }).as("listSkinsRequest");

    cy.intercept("GET", `**/api/config/skins/${storedConfig.id}`, {
      statusCode: 500,
      body: {
        error: "Fallo remoto",
      },
    }).as("detailRequest");

    cy.visit("/host", {
      onBeforeLoad(window) {
        window.localStorage.setItem("adminToken", createFakeAdminToken());
        window.localStorage.setItem("gameConfigs", JSON.stringify([storedConfig]));
        window.localStorage.setItem("activeConfig", JSON.stringify(storedConfig));
        window.localStorage.setItem("duration", storedConfig.duration);
        window.localStorage.setItem("gameTitle", storedConfig.gameTitle);
        window.localStorage.setItem("centerImage", storedConfig.centerImage);
      },
    });

    cy.wait("@sessionRequest");
    cy.wait("@listSkinsRequest");
    cy.wait("@detailRequest");

    cy.get("select").should("have.value", storedConfig.id);
    cy.contains(storedConfig.name).should("be.visible");
    cy.contains(storedConfig.gameTitle).should("be.visible");
    cy.contains(`${storedConfig.duration} min`).should("be.visible");
  });
});