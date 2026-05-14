/// <reference types="cypress" />

type TeamColor = "ROJO" | "AZUL" | "VERDE" | "AMARILLO" | "MORADO" | "BLANCO";
type TeamElementKind = "SUJETO" | "OBJETO" | "ESPACIO";

type SeededSkin = {
  skinId: string;
  skinName: string;
};

type CreatedSession = {
  id: string;
  accessCode: string;
};

type JoinedTeam = {
  id: string;
  name: string;
  color: TeamColor;
};

type TeamHandCard = {
  id: string;
  kind: TeamElementKind;
  name: string;
  desc: string;
};

type TeamState = {
  session: {
    id: string;
    accessCode: string;
    status: "EN_CURSO" | "FINALIZADA";
  };
  team: JoinedTeam;
  hand: TeamHandCard[];
};

type SessionStateResponse = {
  item: {
    id: string;
    status: "EN_CURSO" | "FINALIZADA";
    finishedAt: string | null;
    winnerTeam: {
      id: string;
      name: string;
    } | null;
    turn: {
      currentTeamId: string;
      currentTeamName: string;
    } | null;
  };
};

type CollectionKey = "subjects" | "objects" | "spaces";

type NamedItem = {
  name: string;
  desc: string;
  imageUrl: string;
};

type SuggestionPlan = {
  roomNodeId: string;
  subjectName: string;
  objectName: string;
};

type AccusationPlan = {
  subjectName: string;
  objectName: string;
  spaceName: string;
};

const ROOM_NODE_IDS_IN_SPACE_SLOT_ORDER = [
  "sala-superior-izquierda",
  "sala-superior-centro",
  "sala-superior-derecha",
  "sala-media-izquierda",
  "sala-media-izquierda-inferior",
  "sala-media-derecha",
  "sala-inferior-izquierda",
  "sala-inferior-centro",
  "sala-inferior-derecha",
] as const;

const REQUIRED_COUNTS: Record<CollectionKey, number> = {
  subjects: 6,
  objects: 6,
  spaces: 9,
};

function buildItems(prefix: string, count: number): NamedItem[] {
  return Array.from({ length: count }, (_value, index) => ({
    name: `${prefix} ${index + 1}`,
    desc: `Descripcion de ${prefix} ${index + 1}`,
    imageUrl: `https://example.com/${prefix.toLowerCase()}-${index + 1}.png`,
  }));
}

function buildSpaces() {
  return [
    { name: "Camara Anecoica", desc: "Espacio 1", imageUrl: "https://example.com/espacio-1.png" },
    { name: "Sala Hedy Lamarr", desc: "Espacio 2", imageUrl: "https://example.com/espacio-2.png" },
    { name: "Central de Conmutacion", desc: "Espacio 3", imageUrl: "https://example.com/espacio-3.png" },
    { name: "Seminario Haykin", desc: "Espacio 4", imageUrl: "https://example.com/espacio-4.png" },
    { name: "Club de radio", desc: "Espacio 5", imageUrl: "https://example.com/espacio-5.png" },
    { name: "Laboratorio de Comunicaciones Opticas", desc: "Espacio 6", imageUrl: "https://example.com/espacio-6.png" },
    { name: "Lab. Electronica y Electricidad", desc: "Espacio 7", imageUrl: "https://example.com/espacio-7.png" },
    { name: "Seminario Maxwell", desc: "Espacio 8", imageUrl: "https://example.com/espacio-8.png" },
    { name: "Seminario Torres Quevedo", desc: "Espacio 9", imageUrl: "https://example.com/espacio-9.png" },
  ];
}

function buildSkinPayload(name: string) {
  return {
    name,
    gameTitle: "Acusacion final realtime",
    objective: "Validar la acusacion final desde el terminal.",
    duration: 45,
    centerImage: "",
    cat1Name: "Sujetos",
    cat2Name: "Objetos",
    cat3Name: "Espacios",
    hasMotifs: false,
    subjects: buildItems("Sujeto", REQUIRED_COUNTS.subjects),
    objects: buildItems("Objeto", REQUIRED_COUNTS.objects),
    spaces: buildSpaces(),
  };
}

function loginAsAdmin() {
  return cy
    .request<{ token: string }>("POST", "http://localhost:4000/api/auth/login", {
      username: "admin",
      password: "cluedo2026",
    })
    .its("body.token");
}

function createSession(token: string, skinId: string) {
  return cy
    .request<{ item: CreatedSession }>({
      method: "POST",
      url: "http://localhost:4000/api/game/sessions",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: { skinId },
    })
    .its("body.item");
}

function seedSkin(name: string) {
  return cy
    .exec(`cd ../backend && SKIN_NAME=${name} npx tsx src/scripts/createE2ESkin.ts`, {
      failOnNonZeroExit: true,
    })
    .then(({ stdout }) => {
      const trimmedOutput = stdout.trim();
      const jsonStart = trimmedOutput.lastIndexOf("{");

      if (jsonStart === -1) {
        throw new Error(`No se ha encontrado una salida JSON valida al sembrar la skin E2E: ${trimmedOutput}`);
      }

      return JSON.parse(trimmedOutput.slice(jsonStart)) as SeededSkin;
    });
}

function joinTeam(accessCode: string, color: TeamColor) {
  return cy
    .request<{ item: { team: JoinedTeam } }>({
      method: "POST",
      url: `http://localhost:4000/api/game/sessions/${accessCode}/join`,
      body: { color },
    })
    .its("body.item.team");
}

function startSession(token: string, accessCode: string) {
  return cy.request({
    method: "POST",
    url: `http://localhost:4000/api/game/sessions/${accessCode}/start`,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

function fetchTeamState(accessCode: string, teamId: string) {
  return cy
    .request<{ item: TeamState }>(`http://localhost:4000/api/game/sessions/${accessCode}/teams/${teamId}/state`)
    .its("body.item");
}

function fetchSession(accessCode: string) {
  return cy
    .request<SessionStateResponse>(`http://localhost:4000/api/game/sessions/${accessCode}`)
    .its("body.item");
}

function setTeamRoomTurnState(sessionId: string, teamId: string, roomNodeId: string) {
  return cy.exec(
    `cd ../backend && SESSION_ID=${sessionId} TEAM_ID=${teamId} ROOM_NODE_ID=${roomNodeId} npx tsx src/scripts/setTeamRoomTurnState.ts`,
    { failOnNonZeroExit: true }
  );
}

function visitTerminal(session: CreatedSession, team: JoinedTeam, skinPayload: ReturnType<typeof buildSkinPayload>) {
  cy.visit("/terminal", {
    onBeforeLoad(window) {
      window.localStorage.setItem("sessionId", session.id);
      window.localStorage.setItem("sessionCode", session.accessCode);
      window.localStorage.setItem("sessionStatus", "EN_CURSO");
      window.localStorage.setItem("teamId", team.id);
      window.localStorage.setItem("teamColor", team.color);
      window.localStorage.setItem("teamName", team.name);
      window.localStorage.setItem("activeConfig", JSON.stringify(skinPayload));
      window.localStorage.setItem("centerImage", skinPayload.centerImage);
    },
  });
}

function openDeductionTab() {
  cy.contains("button", "SUGERIR/ACUSAR").click();
}

function openFinalAccusationPanel() {
  openDeductionTab();
  cy.get('[data-cy="terminal-suggest-mode-select"]').select("acusacion");
  cy.get('[data-cy="terminal-final-accusation-panel"]').should("be.visible");
}

function fillFinalAccusationForm(plan: AccusationPlan) {
  cy.get('[data-cy="terminal-final-accusation-space"]').select(plan.spaceName);
  cy.get('[data-cy="terminal-final-accusation-subject"]').select(plan.subjectName);
  cy.get('[data-cy="terminal-final-accusation-object"]').select(plan.objectName);
}

function chooseSuggestionPlan(hand: TeamHandCard[]): SuggestionPlan {
  const subjects = buildItems("Sujeto", REQUIRED_COUNTS.subjects);
  const objects = buildItems("Objeto", REQUIRED_COUNTS.objects);
  const spaces = buildSpaces();

  const matchingSubject = hand.find((card) => card.kind === "SUJETO");
  if (matchingSubject) {
    return {
      roomNodeId: ROOM_NODE_IDS_IN_SPACE_SLOT_ORDER[0],
      subjectName: matchingSubject.name,
      objectName: objects[0].name,
    };
  }

  const matchingObject = hand.find((card) => card.kind === "OBJETO");
  if (matchingObject) {
    return {
      roomNodeId: ROOM_NODE_IDS_IN_SPACE_SLOT_ORDER[0],
      subjectName: subjects[0].name,
      objectName: matchingObject.name,
    };
  }

  const matchingSpace = hand.find((card) => card.kind === "ESPACIO");
  if (!matchingSpace) {
    throw new Error("El equipo refutador no tiene ninguna carta util para el escenario.");
  }

  const spaceIndex = spaces.findIndex((space) => space.name === matchingSpace.name);
  if (spaceIndex === -1) {
    throw new Error(`No se ha podido mapear la carta de espacio ${matchingSpace.name} a una sala del tablero.`);
  }

  return {
    roomNodeId: ROOM_NODE_IDS_IN_SPACE_SLOT_ORDER[spaceIndex],
    subjectName: subjects[0].name,
    objectName: objects[0].name,
  };
}

function buildWrongAccusationPlan(hand: TeamHandCard[]): AccusationPlan {
  const subjects = buildItems("Sujeto", REQUIRED_COUNTS.subjects);
  const objects = buildItems("Objeto", REQUIRED_COUNTS.objects);
  const spaces = buildSpaces();

  const matchingSubject = hand.find((card) => card.kind === "SUJETO");
  if (matchingSubject) {
    return {
      subjectName: matchingSubject.name,
      objectName: objects[0].name,
      spaceName: spaces[0].name,
    };
  }

  const matchingObject = hand.find((card) => card.kind === "OBJETO");
  if (matchingObject) {
    return {
      subjectName: subjects[0].name,
      objectName: matchingObject.name,
      spaceName: spaces[0].name,
    };
  }

  const matchingSpace = hand.find((card) => card.kind === "ESPACIO");
  if (matchingSpace) {
    return {
      subjectName: subjects[0].name,
      objectName: objects[0].name,
      spaceName: matchingSpace.name,
    };
  }

  throw new Error("El equipo no tiene cartas suficientes para construir una acusacion final errónea.");
}

describe("SCRUM-89 terminal de acusacion final", () => {
  it("pasa el turno al siguiente equipo activo cuando el equipo en turno falla la acusacion final", () => {
    const skinName = `e2e-final-turn-${Date.now()}`;
    const skinPayload = buildSkinPayload(skinName);

    loginAsAdmin().then((token) => {
      seedSkin(skinName).then((skin) => {
        createSession(token, skin.skinId).then((session) => {
          joinTeam(session.accessCode, "ROJO").then((redTeam) => {
            joinTeam(session.accessCode, "AZUL").then((blueTeam) => {
              joinTeam(session.accessCode, "AMARILLO").then((yellowTeam) => {
                startSession(token, session.accessCode).then(() => {
                  fetchTeamState(session.accessCode, yellowTeam.id).then((yellowState) => {
                    const accusationPlan = buildWrongAccusationPlan(yellowState.hand);

                    setTeamRoomTurnState(session.id, yellowTeam.id, ROOM_NODE_IDS_IN_SPACE_SLOT_ORDER[0]).then(() => {
                      visitTerminal(session, yellowTeam, skinPayload);

                      cy.get('[data-cy="terminal-turn-indicator"]').should("contain", "MI TURNO");
                      openFinalAccusationPanel();
                      fillFinalAccusationForm(accusationPlan);
                      cy.get('[data-cy="terminal-final-accusation-submit"]').should("not.be.disabled").click();

                      cy.get('[data-cy="terminal-accusation-banner"]').should("contain", "tu equipo queda eliminado");
                      cy.get('[data-cy="terminal-turn-indicator"]').should("contain", "ESPERA");
                      cy.get('[data-cy="terminal-lobby-status-banner"]').should("contain", blueTeam.name);

                      cy.contains("button", "MAPA").click();
                      cy.contains("Tu equipo ha sido eliminado. El peon permanece donde quedo y ya no volvera a tener turno.").should("be.visible");
                      cy.get('[data-cy="terminal-board-surface"]').click("center");
                      cy.contains("Tu equipo ya ha sido eliminado y no puede volver a mover este peon.").should("be.visible");

                      cy.contains("button", "SUGERIR/ACUSAR").click();
                      cy.get('[data-cy="terminal-suggest-mode-select"]').select("hipotesis");
                      cy.contains("Tu equipo ha sido eliminado. Ya no puede sugerir ni acusar, pero debe mostrar una carta si la mesa le pide refutar y mantener la solucion en secreto.").should("be.visible");

                      fetchSession(session.accessCode).then((updatedSession) => {
                        expect(updatedSession.status).to.eq("EN_CURSO");
                        expect(updatedSession.turn?.currentTeamId).to.eq(blueTeam.id);
                        expect(updatedSession.winnerTeam).to.eq(null);
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });

  it("permite que un equipo eliminado siga refutando sugerencias cuando le corresponde", () => {
    const skinName = `e2e-final-eliminated-refute-${Date.now()}`;
    const skinPayload = buildSkinPayload(skinName);

    loginAsAdmin().then((token) => {
      seedSkin(skinName).then((skin) => {
        createSession(token, skin.skinId).then((session) => {
          joinTeam(session.accessCode, "AZUL").then((blueTeam) => {
            joinTeam(session.accessCode, "AMARILLO").then((yellowTeam) => {
              startSession(token, session.accessCode).then(() => {
                fetchTeamState(session.accessCode, yellowTeam.id).then((yellowState) => {
                  const accusationPlan = buildWrongAccusationPlan(yellowState.hand);
                  const suggestionPlan = chooseSuggestionPlan(yellowState.hand);

                  setTeamRoomTurnState(session.id, yellowTeam.id, ROOM_NODE_IDS_IN_SPACE_SLOT_ORDER[0]).then(() => {
                    visitTerminal(session, yellowTeam, skinPayload);
                    openFinalAccusationPanel();
                    fillFinalAccusationForm(accusationPlan);
                    cy.get('[data-cy="terminal-final-accusation-submit"]').click();

                    cy.get('[data-cy="terminal-accusation-banner"]').should("contain", "tu equipo queda eliminado");

                    setTeamRoomTurnState(session.id, blueTeam.id, suggestionPlan.roomNodeId).then(() => {
                      visitTerminal(session, blueTeam, skinPayload);
                      openDeductionTab();
                      cy.get('[data-cy="terminal-compose-suggestion"]').should("be.visible");
                      cy.contains('[data-cy="terminal-suggest-subject"]', suggestionPlan.subjectName).click();
                      cy.contains('[data-cy="terminal-suggest-object"]', suggestionPlan.objectName).click();
                      cy.get('[data-cy="terminal-suggest-submit"]').click();
                      cy.get('[data-cy="terminal-awaiting-refutation"]').should("be.visible");

                      visitTerminal(session, yellowTeam, skinPayload);
                      openDeductionTab();
                      cy.get('[data-cy="terminal-refute-panel"]').scrollIntoView().should("be.visible");
                      cy.get('[data-cy="terminal-eliminated-refute-note"]').should("contain", "debes mostrar una carta para refutar en privado");
                      cy.get('[data-cy="terminal-refute-submit"]').should("not.be.disabled").click();
                      cy.contains("Carta mostrada").should("be.visible");
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });

  it("finaliza la partida sin ganador cuando falla la acusacion final del ultimo equipo activo", () => {
    const skinName = `e2e-final-last-team-${Date.now()}`;
    const skinPayload = buildSkinPayload(skinName);

    loginAsAdmin().then((token) => {
      seedSkin(skinName).then((skin) => {
        createSession(token, skin.skinId).then((session) => {
          joinTeam(session.accessCode, "ROJO").then((redTeam) => {
            joinTeam(session.accessCode, "AZUL").then((blueTeam) => {
              startSession(token, session.accessCode).then(() => {
                fetchTeamState(session.accessCode, blueTeam.id).then((blueState) => {
                  fetchTeamState(session.accessCode, redTeam.id).then((redState) => {
                    const blueAccusationPlan = buildWrongAccusationPlan(blueState.hand);
                    const redAccusationPlan = buildWrongAccusationPlan(redState.hand);

                    setTeamRoomTurnState(session.id, blueTeam.id, ROOM_NODE_IDS_IN_SPACE_SLOT_ORDER[0]).then(() => {
                      visitTerminal(session, blueTeam, skinPayload);
                      openFinalAccusationPanel();
                      fillFinalAccusationForm(blueAccusationPlan);
                      cy.get('[data-cy="terminal-final-accusation-submit"]').click();

                      cy.get('[data-cy="terminal-accusation-banner"]').should("contain", "tu equipo queda eliminado");

                      fetchSession(session.accessCode).then((afterBlueAccusation) => {
                        expect(afterBlueAccusation.status).to.eq("EN_CURSO");
                        expect(afterBlueAccusation.turn?.currentTeamId).to.eq(redTeam.id);
                      });

                      visitTerminal(session, redTeam, skinPayload);
                      cy.get('[data-cy="terminal-turn-indicator"]').should("contain", "MI TURNO");
                      openFinalAccusationPanel();
                      fillFinalAccusationForm(redAccusationPlan);
                      cy.get('[data-cy="terminal-final-accusation-submit"]').click();

                      cy.get('[data-cy="terminal-accusation-banner"]').should("contain", "No quedan equipos activos");
                      cy.get('[data-cy="terminal-turn-indicator"]').should("contain", "ESPERA");
                      cy.get('[data-cy="terminal-status-line"]').should("contain", "PARTIDA FINALIZADA");
                      cy.get('[data-cy="terminal-lobby-status-banner"]').should("contain", "Partida finalizada. No quedan equipos activos.");

                      fetchSession(session.accessCode).then((finishedSession) => {
                        expect(finishedSession.status).to.eq("FINALIZADA");
                        expect(finishedSession.turn).to.eq(null);
                        expect(finishedSession.winnerTeam).to.eq(null);
                        expect(finishedSession.finishedAt).to.be.a("string").and.not.equal(null);
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });

  it("bloquea la acusacion final mientras hay una sugerencia pendiente de refutacion", () => {
    const skinName = `e2e-final-blocked-${Date.now()}`;
    const skinPayload = buildSkinPayload(skinName);

    loginAsAdmin().then((token) => {
      seedSkin(skinName).then((skin) => {
        createSession(token, skin.skinId).then((session) => {
          joinTeam(session.accessCode, "ROJO").then((redTeam) => {
            joinTeam(session.accessCode, "AZUL").then((blueTeam) => {
              startSession(token, session.accessCode).then(() => {
                fetchTeamState(session.accessCode, redTeam.id).then((redState) => {
                  fetchTeamState(session.accessCode, blueTeam.id).then((blueState) => {
                    const suggestionPlan = chooseSuggestionPlan(blueState.hand);
                    const accusationPlan = buildWrongAccusationPlan(redState.hand);

                    setTeamRoomTurnState(session.id, redTeam.id, suggestionPlan.roomNodeId).then(() => {
                      visitTerminal(session, redTeam, skinPayload);

                      openDeductionTab();
                      cy.get('[data-cy="terminal-compose-suggestion"]').should("be.visible");
                      cy.contains('[data-cy="terminal-suggest-subject"]', suggestionPlan.subjectName).click();
                      cy.contains('[data-cy="terminal-suggest-object"]', suggestionPlan.objectName).click();
                      cy.get('[data-cy="terminal-suggest-submit"]').click();
                      cy.get('[data-cy="terminal-awaiting-refutation"]').should("be.visible");

                      cy.get('[data-cy="terminal-suggest-mode-select"]').select("acusacion");
                      cy.get('[data-cy="terminal-final-accusation-panel"]').should("be.visible");
                      fillFinalAccusationForm(accusationPlan);

                      cy.get('[data-cy="terminal-final-accusation-guard"]').should("contain", "La mesa sigue resolviendo una sugerencia");
                      cy.get('[data-cy="terminal-final-accusation-submit"]').should("be.disabled");

                      fetchSession(session.accessCode).then((updatedSession) => {
                        expect(updatedSession.status).to.eq("EN_CURSO");
                        expect(updatedSession.turn?.currentTeamId).to.eq(redTeam.id);
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});