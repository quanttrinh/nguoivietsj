/**
 * Creates a custom menu when the spreadsheet opens
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Registration Service')
    .addItem('Configuration', 'openAdminUI')
    .addToUi();
}

export { onOpen };
