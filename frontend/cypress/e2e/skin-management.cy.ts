/// <reference types="cypress" />

type CollectionKey = "subjects" | "objects" | "spaces";

const REQUIRED_COUNTS: Record<CollectionKey, number> = {
  subjects: 6,
  objects: 6,
  spaces: 9,
};

const COLLECTION_LABELS: Record<CollectionKey, string> = {
  subjects: "Sujeto",
  objects: "Objeto",
  spaces: "Espacio",
};

const COLLECTION_TABS: Record<CollectionKey, string> = {
  subjects: '[data-cy="admin-config-tab-subjects"]',
  objects: '[data-cy="admin-config-tab-objects"]',
  spaces: '[data-cy="admin-config-tab-spaces"]',
};

const INCOMPLETE_COLLECTION_CASES: Array<{
  collectionKey: CollectionKey;
  counts: Record<CollectionKey, number>;
  expectedMessage: string;
}> = [
  {
    collectionKey: "subjects",
    counts: { subjects: 5, objects: 6, spaces: 9 },
    expectedMessage: "La skin debe tener entre 6 y 10 sujetos.",
  },
  {
    collectionKey: "objects",
    counts: { subjects: 6, objects: 5, spaces: 9 },
    expectedMessage: "La skin debe tener entre 6 y 10 objetos.",
  },
  {
    collectionKey: "spaces",
    counts: { subjects: 6, objects: 6, spaces: 8 },
    expectedMessage: "La skin debe tener exactamente 9 espacios.",
  },
];

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

function mockAdminSession() {
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

function visitAdminConfig() {
  cy.visit("/config", {
    onBeforeLoad(window) {
      window.localStorage.setItem("adminToken", createFakeAdminToken());
    },
  });
}

function openDraftEditor() {
  mockAdminSession();
  cy.intercept("GET", "**/api/config/skins", {
    statusCode: 200,
    body: { items: [] },
  }).as("listSkinsRequest");

  visitAdminConfig();

  cy.wait("@sessionRequest");
  cy.wait("@listSkinsRequest");
  cy.get('[data-cy="admin-config-create-button"]').click();
}

function buildSkinItems(prefix: string, count: number) {
  return Array.from({ length: count }, (_value, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    name: `${prefix} ${index + 1}`,
    desc: `Descripcion de ${prefix} ${index + 1}`,
  }));
}

function buildCreatedSkin(name: string) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name,
    gameTitle: "CluEd Lab",
    objective: "Evaluación de resolución de problemas lógicos en entornos técnicos.",
    duration: "60",
    centerImage: "",
    cat1Name: "Sujetos",
    cat2Name: "Objetos",
    cat3Name: "Espacios",
    hasMotifs: false,
    subjects: buildSkinItems("Sujeto", 6),
    objects: buildSkinItems("Objeto", 6),
    spaces: buildSkinItems("Espacio", 9),
    createdAt: 1713830400000,
    updatedAt: 1713830400000,
  };
}

function buildSkinSummary(config: ReturnType<typeof buildCreatedSkin>) {
  return {
    id: config.id,
    name: config.name,
    gameTitle: config.gameTitle,
    duration: config.duration,
    centerImage: config.centerImage,
    cat1Name: config.cat1Name,
    cat2Name: config.cat2Name,
    cat3Name: config.cat3Name,
    hasMotifs: config.hasMotifs,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
    subjectCount: config.subjects.length,
    objectCount: config.objects.length,
    spaceCount: config.spaces.length,
  };
}

function addCollectionItems(collectionKey: CollectionKey, label: string, count: number) {
  for (let index = 0; index < count; index += 1) {
    cy.get(`[data-cy="admin-config-${collectionKey}-add-button"]`).scrollIntoView().click();
    cy.get(`[data-cy="admin-config-${collectionKey}-name-input"]`).eq(index).type(`${label} ${index + 1}`, { delay: 0 });
    cy.get(`[data-cy="admin-config-${collectionKey}-desc-input"]`).eq(index).type(`Descripcion de ${label} ${index + 1}`, { delay: 0 });
  }
}

function fillDraftCollections(counts: Record<CollectionKey, number>) {
  (Object.keys(REQUIRED_COUNTS) as CollectionKey[]).forEach((collectionKey) => {
    cy.get(COLLECTION_TABS[collectionKey]).click();
    addCollectionItems(collectionKey, COLLECTION_LABELS[collectionKey], counts[collectionKey]);
  });
}

describe("Gestion de CluEdSkins", () => {
  beforeEach(() => {
    cy.viewport(1440, 1100);
  });

  INCOMPLETE_COLLECTION_CASES.forEach(({ collectionKey, counts, expectedMessage }) => {
    it(`impide guardar cuando ${collectionKey} no cumple el minimo requerido`, () => {
      let createRequestCount = 0;

      openDraftEditor();
      cy.intercept("POST", "**/api/config/skins", (req) => {
        createRequestCount += 1;
        req.reply({
          statusCode: 201,
          body: { item: buildCreatedSkin("No deberia guardarse") },
        });
      }).as("createSkinRequest");

      fillDraftCollections(counts);

      // Con la validación incompleta, el botón de guardar queda deshabilitado y el
      // resumen de validación expone el motivo; no se llega a lanzar la petición.
      cy.get('[data-cy="admin-config-save-button"]').scrollIntoView().should("be.disabled");
      cy.get('[data-cy="admin-config-validation-summary"]').should("contain", expectedMessage);
      cy.then(() => {
        expect(createRequestCount).to.eq(0);
      });
    });
  });

  it("SCRUM-31 renderiza y permite interactuar con el formulario de creacion de skins", () => {
    openDraftEditor();

    cy.get('[data-cy="admin-config-status-message"]').should("contain", "Borrador nuevo preparado");
    cy.get('[data-cy="admin-config-tab-general"]').should("be.visible");
    cy.get('[data-cy="admin-config-name-input"]').clear().type("Skin interactiva", { delay: 0 });
    cy.get('[data-cy="admin-config-objective-input"]').clear().type("Objetivo interactivo", { delay: 0 });

    cy.get('[data-cy="admin-config-tab-subjects"]').click();
    cy.get('[data-cy="admin-config-subjects-add-button"]').click();
    cy.get('[data-cy="admin-config-subjects-name-input"]').eq(0).type("Sujeto Alfa", { delay: 0 });
    cy.get('[data-cy="admin-config-subjects-desc-input"]').eq(0).type("Descripcion del sujeto alfa", { delay: 0 });

    cy.get('[data-cy="admin-config-tab-objects"]').click();
    cy.get('[data-cy="admin-config-objects-add-button"]').click();
    cy.get('[data-cy="admin-config-objects-name-input"]').eq(0).type("Objeto Alfa", { delay: 0 });
    cy.get('[data-cy="admin-config-objects-desc-input"]').eq(0).type("Descripcion del objeto alfa", { delay: 0 });

    cy.get('[data-cy="admin-config-tab-spaces"]').click();
    cy.get('[data-cy="admin-config-spaces-add-button"]').click();
    cy.get('[data-cy="admin-config-spaces-name-input"]').eq(0).type("Espacio Alfa", { delay: 0 });
    cy.get('[data-cy="admin-config-spaces-desc-input"]').eq(0).type("Descripcion del espacio alfa", { delay: 0 });

    cy.get('[data-cy="admin-config-tab-general"]').click();
    cy.get('[data-cy="admin-config-name-input"]').should("have.value", "Skin interactiva");
    cy.get('[data-cy="admin-config-objective-input"]').should("have.value", "Objetivo interactivo");
    cy.get('[data-cy="admin-config-validation-summary"]').should("contain", "Sujetos: 1/6");
    cy.get('[data-cy="admin-config-validation-summary"]').should("contain", "Objetos: 1/6");
    cy.get('[data-cy="admin-config-validation-summary"]').should("contain", "Espacios: 1/9");
  });

  it("SCRUM-32 refresca la lista del panel despues de crear una nueva skin", () => {
    const createdSkin = buildCreatedSkin("Skin recien creada");
    let listRequestCount = 0;

    mockAdminSession();
    cy.intercept("GET", "**/api/config/skins", (req) => {
      listRequestCount += 1;
      req.reply({
        statusCode: 200,
        body: {
          items: listRequestCount === 1 ? [] : [buildSkinSummary(createdSkin)],
        },
      });
    }).as("listSkinsRequest");
    cy.intercept("POST", "**/api/config/skins", (req) => {
      expect(req.body.name).to.eq(createdSkin.name);
      expect(req.body.subjects).to.have.length(6);
      expect(req.body.objects).to.have.length(6);
      expect(req.body.spaces).to.have.length(9);

      req.reply({
        statusCode: 201,
        body: { item: createdSkin },
      });
    }).as("createSkinRequest");
    cy.intercept("GET", `**/api/config/skins/${createdSkin.id}`, {
      statusCode: 200,
      body: { item: createdSkin },
    }).as("skinDetailRequest");

    visitAdminConfig();

    cy.wait("@sessionRequest");
    cy.wait("@listSkinsRequest");

    cy.get('[data-cy="admin-config-create-button"]').click();
    cy.get('[data-cy="admin-config-name-input"]').clear().type(createdSkin.name, { delay: 0 });
    fillDraftCollections(REQUIRED_COUNTS);
    cy.get('[data-cy="admin-config-save-button"]').scrollIntoView().click();

    cy.wait("@createSkinRequest");
    cy.wait("@listSkinsRequest");
    cy.wait("@skinDetailRequest");

    cy.get('[data-cy="admin-config-status-message"]').should("contain", `Configuración "${createdSkin.name}" guardada correctamente.`);
    cy.get('[data-cy="admin-config-list"]').within(() => {
      cy.contains('[data-cy="admin-config-card-title"]', createdSkin.name).should("be.visible");
    });
  });

  it("actualiza una skin existente desde el panel de administracion", () => {
    const existingSkin = buildCreatedSkin("Skin editable");
    const updatedSkin = {
      ...existingSkin,
      name: "Skin editada",
      objective: "Objetivo editado desde Cypress",
      updatedAt: 1713916800000,
    };
    let currentSkin = existingSkin;

    mockAdminSession();
    cy.intercept("GET", "**/api/config/skins", (req) => {
      req.reply({
        statusCode: 200,
        body: { items: [buildSkinSummary(currentSkin)] },
      });
    }).as("listSkinsRequest");
    cy.intercept("GET", `**/api/config/skins/${existingSkin.id}`, (req) => {
      req.reply({
        statusCode: 200,
        body: { item: currentSkin },
      });
    }).as("skinDetailRequest");
    cy.intercept("PUT", `**/api/config/skins/${existingSkin.id}`, (req) => {
      expect(req.body.name).to.eq(updatedSkin.name);
      expect(req.body.objective).to.eq(updatedSkin.objective);
      currentSkin = updatedSkin;
      req.reply({
        statusCode: 200,
        body: { item: updatedSkin },
      });
    }).as("updateSkinRequest");

    visitAdminConfig();

    cy.wait("@sessionRequest");
    cy.wait("@listSkinsRequest");
    cy.get('[data-cy="admin-config-card"]').first().click();
    cy.wait("@skinDetailRequest");

    cy.get('[data-cy="admin-config-name-input"]').clear().type(updatedSkin.name, { delay: 0 });
    cy.get('[data-cy="admin-config-objective-input"]').clear().type(updatedSkin.objective, { delay: 0 });
    cy.get('[data-cy="admin-config-save-button"]').scrollIntoView().click();

    cy.wait("@updateSkinRequest");
    cy.wait("@listSkinsRequest");
    cy.wait("@skinDetailRequest");

    cy.get('[data-cy="admin-config-status-message"]').should("contain", `Configuración "${updatedSkin.name}" guardada correctamente.`);
    cy.get('[data-cy="admin-config-list"]').within(() => {
      cy.contains('[data-cy="admin-config-card-title"]', updatedSkin.name).should("be.visible");
    });
  });

  it("elimina una skin existente desde el listado del panel", () => {
    const existingSkin = buildCreatedSkin("Skin eliminable");
    let currentItems = [buildSkinSummary(existingSkin)];

    mockAdminSession();
    cy.intercept("GET", "**/api/config/skins", (req) => {
      req.reply({
        statusCode: 200,
        body: { items: currentItems },
      });
    }).as("listSkinsRequest");
    cy.intercept("GET", `**/api/config/skins/${existingSkin.id}`, {
      statusCode: 200,
      body: { item: existingSkin },
    }).as("skinDetailRequest");
    cy.intercept("DELETE", `**/api/config/skins/${existingSkin.id}`, (req) => {
      currentItems = [];
      req.reply({
        statusCode: 204,
        body: "",
      });
    }).as("deleteSkinRequest");

    visitAdminConfig();

    cy.wait("@sessionRequest");
    cy.wait("@listSkinsRequest");
    cy.wait("@skinDetailRequest");
    cy.get('[data-cy="admin-config-card-delete-button"]').first().click();

    cy.wait("@deleteSkinRequest");
    cy.wait("@listSkinsRequest");

    cy.get('[data-cy="admin-config-status-message"]').should("contain", "Configuración eliminada correctamente.");
    cy.get('[data-cy="admin-config-empty-state"]').should("be.visible");
    cy.contains('[data-cy="admin-config-card-title"]', existingSkin.name).should("not.exist");
  });
});