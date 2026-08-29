/**
 * Apps Script web entry point.
 * Implementation will stay minimal: render Index and expose include().
 */
function doGet(e) {
  if (e && e.parameter && (e.parameter.code || e.parameter.error)) {
    return renderDropboxOAuthCallback_(e.parameter);
  }
  return HtmlService
    .createTemplateFromFile('src/frontend/Index')
    .evaluate()
    .setTitle('Dong Engineering - Project Management Preview')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function renderDropboxOAuthCallback_(parameters) {
  var title = 'Dropbox Connection';
  try {
    var result = handleDropboxOAuthCallback_(parameters || {});
    return HtmlService.createHtmlOutput(
      '<!doctype html><html><head><base target="_top"><style>body{font-family:Arial,sans-serif;padding:24px;line-height:1.5}</style></head><body>' +
      '<h2>Dropbox connected</h2><p>Refresh token saved for ' + String(result.environment || '') + '.</p>' +
      '<p>You can close this tab and return to Project Management, then run Test Connection.</p></body></html>'
    ).setTitle(title);
  } catch (err) {
    return HtmlService.createHtmlOutput(
      '<!doctype html><html><head><base target="_top"><style>body{font-family:Arial,sans-serif;padding:24px;line-height:1.5;color:#991b1b}</style></head><body>' +
      '<h2>Dropbox connection failed</h2><p>' + String(err && err.message || err) + '</p>' +
      '<p>Return to Project Management, generate a fresh authorization link, or use Manual Authorization.</p></body></html>'
    ).setTitle(title);
  }
}
