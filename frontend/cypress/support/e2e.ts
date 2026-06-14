import '@cypress/code-coverage/support';

beforeEach(() => {
  cy.clearCookies();
  cy.clearLocalStorage();
});