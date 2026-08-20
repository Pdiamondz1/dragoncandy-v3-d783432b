/**
 * DragonCandy signature installer — runs in Google Apps Script.
 *
 * Reads every active user in the domain from the Admin SDK, renders their
 * signature with renderSignature() (Signature.gs), and writes it to every
 * send-as identity on their account via the Gmail API.
 *
 * WHY A SERVICE ACCOUNT: Apps Script's own credentials are per-user. A script
 * running as an admin still cannot write another user's Gmail settings. Only a
 * service account with domain-wide delegation can impersonate each user. See
 * README.md for the one-time setup, and for what that grant actually permits.
 *
 * WHY TITLES COME FROM THE DIRECTORY: so there is exactly one place a title
 * can be wrong. This repo has three copies of two stale titles right now --
 * that is the failure mode this avoids.
 *
 * NOT TESTED BY VITEST: everything here needs the GAS runtime. Kept thin on
 * purpose; all the fiddly logic lives in the tested renderer.
 */

var DOMAIN = 'dragoncandy.com';

/**
 * Send-as identities that represent the company rather than a person, and
 * therefore carry the registered postal address (spec decision 7).
 */
var SHARED_IDENTITIES = [
  'support@dragoncandy.com',
  'sales@dragoncandy.com',
  'info@dragoncandy.com',
  'admin@dragoncandy.com',
  'privacy@dragoncandy.com',
  'legal@dragoncandy.com',
  'appstore@dragoncandy.com',
];

function isSharedIdentity_(email) {
  return SHARED_IDENTITIES.indexOf(String(email).toLowerCase()) !== -1;
}

/** Entry point. This is the function the daily trigger calls. */
function installAllSignatures() {
  var users = listDomainUsers_();
  var results = [];

  for (var i = 0; i < users.length; i++) {
    var user = users[i];
    try {
      var count = installForUser_(user);
      results.push([new Date(), user.primaryEmail, user.title || '(no title)', 'ok', count + ' identities']);
    } catch (err) {
      results.push([new Date(), user.primaryEmail, user.title || '(no title)', 'ERROR', String(err)]);
    }
  }

  appendRunLog_(results);
  return results;
}

/** Active, non-suspended users in the domain, with their directory title. */
function listDomainUsers_() {
  var users = [];
  var pageToken = null;

  do {
    var page = AdminDirectory.Users.list({
      domain: DOMAIN,
      maxResults: 200,
      orderBy: 'email',
      pageToken: pageToken,
      projection: 'full',
    });
    (page.users || []).forEach(function (u) {
      if (u.suspended) return;
      users.push({
        primaryEmail: u.primaryEmail,
        name: u.name && u.name.fullName ? u.name.fullName : u.primaryEmail,
        title: u.organizations && u.organizations.length ? u.organizations[0].title : '',
      });
    });
    pageToken = page.nextPageToken;
  } while (pageToken);

  return users;
}

/** Writes a signature to every send-as identity on one user's account. */
function installForUser_(user) {
  if (!user.title) {
    throw new Error('no title set in the directory — refusing to write a signature without one');
  }

  var token = getImpersonatedToken_(user.primaryEmail);
  var identities = gmailApi_(token, 'settings/sendAs', 'get').sendAs || [];
  var written = 0;

  for (var i = 0; i < identities.length; i++) {
    var identity = identities[i];
    if (identity.verificationStatus === 'pending') continue;

    var shared = isSharedIdentity_(identity.sendAsEmail);
    var html = renderSignature({
      name: shared ? 'DragonCandy' : user.name,
      title: shared ? titleForShared_(identity.sendAsEmail) : user.title,
      email: identity.sendAsEmail,
      includeAddress: shared,
    });

    gmailApi_(
      token,
      'settings/sendAs/' + encodeURIComponent(identity.sendAsEmail),
      'patch',
      { signature: html },
    );
    written++;
  }

  return written;
}

function titleForShared_(email) {
  var local = String(email).split('@')[0];
  var labels = {
    support: 'Support',
    sales: 'Sales',
    info: 'General enquiries',
    admin: 'Accounts',
    privacy: 'Privacy',
    legal: 'Legal',
    appstore: 'App Store',
  };
  return labels[local] || local;
}

/** Gmail REST call as the impersonated user. */
function gmailApi_(token, path, method, body) {
  var options = {
    method: method,
    headers: { Authorization: 'Bearer ' + token },
    contentType: 'application/json',
    muteHttpExceptions: true,
  };
  if (body) options.payload = JSON.stringify(body);

  var response = UrlFetchApp.fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/' + path,
    options,
  );
  var code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('Gmail API ' + code + ': ' + response.getContentText());
  }
  return JSON.parse(response.getContentText() || '{}');
}

/**
 * Mints an access token for `userEmail` using the delegated service account.
 * Signed JWT -> Google token endpoint, the standard domain-wide-delegation flow.
 */
function getImpersonatedToken_(userEmail) {
  var props = PropertiesService.getScriptProperties();
  var clientEmail = props.getProperty('SA_CLIENT_EMAIL');
  var privateKey = props.getProperty('SA_PRIVATE_KEY');

  if (!clientEmail || !privateKey) {
    throw new Error('SA_CLIENT_EMAIL / SA_PRIVATE_KEY missing from script properties — see README.md');
  }
  privateKey = privateKey.replace(/\\n/g, '\n');

  var now = Math.floor(Date.now() / 1000);
  var encode = function (obj) {
    return Utilities.base64EncodeWebSafe(JSON.stringify(obj)).replace(/=+$/, '');
  };

  var unsigned =
    encode({ alg: 'RS256', typ: 'JWT' }) +
    '.' +
    encode({
      iss: clientEmail,
      sub: userEmail,
      scope: 'https://www.googleapis.com/auth/gmail.settings.basic',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    });

  var signature = Utilities.base64EncodeWebSafe(
    Utilities.computeRsaSha256Signature(unsigned, privateKey),
  ).replace(/=+$/, '');

  var response = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: unsigned + '.' + signature,
    },
    muteHttpExceptions: true,
  });

  var body = JSON.parse(response.getContentText());
  if (!body.access_token) {
    throw new Error('token exchange failed for ' + userEmail + ': ' + response.getContentText());
  }
  return body.access_token;
}

/** Appends this run to the log Sheet in 06 · Brand. */
function appendRunLog_(rows) {
  var id = PropertiesService.getScriptProperties().getProperty('LOG_SHEET_ID');
  if (!id) return;
  var sheet = SpreadsheetApp.openById(id).getSheets()[0];
  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
}

/** Run this by hand first. Reports what WOULD change, writes nothing. */
function dryRun() {
  var users = listDomainUsers_();
  users.forEach(function (u) {
    Logger.log(
      '%s | %s | %s',
      u.primaryEmail,
      u.title || '*** NO TITLE — would fail ***',
      u.name,
    );
  });
  return users;
}
