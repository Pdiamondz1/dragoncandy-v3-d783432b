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
 * Addresses that represent the COMPANY rather than a person, and therefore
 * carry the registered postal address (spec decision 7).
 *
 * THIS IS A CLASSIFIER, NOT AN INVENTORY. It is only ever consulted for an
 * address that already appeared in somebody's sendAs list, so listing an
 * address that does not exist yet is inert. Listing one too few is not:
 * an unclassified company address is treated as PERSONAL, and would go out
 * with an individual's name and title and no registered address on it.
 *
 * The asymmetry decides the contents — when in doubt, include the address.
 * (Codex caught this: an earlier revision of this commit removed `legal@`
 * because the alias does not exist today, which would have mis-signed it the
 * day it was created.)
 *
 * Existing aliases on dame@, read from the admin console 2026-08-21: info,
 * support, appstore, sales, privacy, admin, founders. `legal@` is planned
 * rather than existing (spec Task 8) and is classified here in advance.
 * `founders@` was missing from this list entirely — that was a real bug.
 *
 * An entry here is necessary but NOT sufficient for a signature to install:
 * the address must also be a verified send-as identity in the individual's
 * Gmail, which an alias is not on its own. See scripts/workspace/README.md.
 */
var SHARED_IDENTITIES = [
  'support@dragoncandy.com',
  'sales@dragoncandy.com',
  'info@dragoncandy.com',
  'admin@dragoncandy.com',
  'privacy@dragoncandy.com',
  'legal@dragoncandy.com',
  'appstore@dragoncandy.com',
  'founders@dragoncandy.com',
];

function isSharedIdentity_(email) {
  return SHARED_IDENTITIES.indexOf(String(email).toLowerCase()) !== -1;
}

/** Entry point. This is the function the daily trigger calls. */
function installAllSignatures() {
  var users = listDomainUsers_();
  var results = [];
  var totalSharedInstalled = 0;
  var totalDenied = 0;

  for (var i = 0; i < users.length; i++) {
    var user = users[i];
    try {
      var counts = installForUser_(user);
      totalSharedInstalled += counts.shared;
      totalDenied += counts.denied;

      // PARTIAL is deliberately distinct from both ok and ERROR. A run where
      // every writable identity was written but some were refused is neither
      // a clean pass nor a failure, and collapsing it into either one is how
      // a standing permissions gap becomes invisible.
      var status = counts.failures.length ? 'PARTIAL' : counts.denied ? 'PARTIAL' : 'ok';
      var detail = counts.total + ' identities';
      if (counts.denied) {
        detail += ', ' + counts.denied + ' denied (needs gmail.settings.sharing)';
      }
      if (counts.failures.length) {
        detail += ', ' + counts.failures.length + ' failed: ' + counts.failures.join('; ');
        console.error(
          'installForUser_ partial for ' + user.primaryEmail + ': ' + counts.failures.join('; '),
        );
      }

      results.push([
        new Date(),
        user.primaryEmail,
        user.title || '(no title)',
        status,
        detail,
        counts.shared + ' shared',
      ]);
    } catch (err) {
      // The Sheet write below (appendRunLog_) silently no-ops when LOG_SHEET_ID
      // isn't set, and catching here already suppresses the failure email Apps
      // Script would otherwise send the trigger owner. console.error is what's
      // left: it lands in Apps Script Executions and Cloud Logging regardless
      // of whether the Sheet exists, so a bad run is never silent.
      console.error('installForUser_ failed for ' + user.primaryEmail + ': ' + err);
      results.push([new Date(), user.primaryEmail, user.title || '(no title)', 'ERROR', String(err), '']);
    }
  }

  // 0 shared is the EXPECTED state today, not a regression. SHARED_IDENTITIES
  // are aliases on dame@, and an alias is not a sendAs identity -- so this
  // branch matches nothing until someone completes the manual send-as step.
  // Confirmed on the first real run, 2026-08-21. An earlier version of this
  // comment blamed a future Google Groups conversion; that was the wrong
  // diagnosis and would have sent an operator looking in the wrong place.
  // Warn anyway: the day someone does the send-as step, this going quiet is
  // how they know it worked, and if it later returns to 0 that is a real
  // regression worth seeing.
  if (totalSharedInstalled === 0) {
    if (totalDenied > 0) {
      // The identities EXIST and we were refused. One cause, one fix.
      console.warn(
        'installAllSignatures: ' +
          totalDenied +
          ' send-as identity/identities were refused with 403 across ' +
          users.length +
          ' user(s), so 0 shared-mailbox signatures installed. The identities ' +
          'exist and are verified -- the delegation is missing the scope ' +
          'https://www.googleapis.com/auth/gmail.settings.sharing, which Gmail ' +
          'requires to modify any NON-PRIMARY sendAs. Add it to the ' +
          'domain-wide delegation next to gmail.settings.basic. NOTE the ' +
          'consequence before you do: that scope also lets this service ' +
          'account set who may send as what, for every user in the domain.',
      );
    } else {
      console.warn(
        'installAllSignatures: 0 shared-mailbox signatures installed across ' +
          users.length +
          ' user(s), and nothing was refused -- so no shared address is a ' +
          'send-as identity on any account. SHARED_IDENTITIES (support@, ' +
          'sales@, founders@, ...) are ALIASES, and an alias does not appear ' +
          'in settings/sendAs; it only makes mail arrive. The account holder ' +
          'adds it in Gmail Settings -> Accounts and Import -> Send mail as ' +
          '(or the script creates it via settings/sendAs POST). Either route ' +
          'ALSO needs gmail.settings.sharing to write the signature ' +
          'afterwards -- proven 2026-08-21, do not assume the manual route is ' +
          'permission-free. Converting these to Google Groups would NOT help: ' +
          'a Group is not a send-as identity either.',
      );
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
        title: primaryOrgTitle_(u.organizations),
      });
    });
    pageToken = page.nextPageToken;
  } while (pageToken);

  return users;
}

/**
 * The Admin SDK Directory API does not guarantee organizations[0] is the
 * user's primary organization -- a user with more than one entry can have
 * their primary listed second (or later). Pick the entry marked primary;
 * fall back to the first entry only when none is marked.
 */
function primaryOrgTitle_(organizations) {
  if (!organizations || !organizations.length) return '';
  for (var i = 0; i < organizations.length; i++) {
    if (organizations[i].primary) return organizations[i].title || '';
  }
  return organizations[0].title || '';
}

/** Writes a signature to every send-as identity on one user's account. */
function installForUser_(user) {
  if (!user.title) {
    throw new Error('no title set in the directory — refusing to write a signature without one');
  }

  var token = getImpersonatedToken_(user.primaryEmail);
  var identities = gmailApi_(token, 'settings/sendAs', 'get').sendAs || [];
  var written = 0;
  var sharedWritten = 0;
  var denied = 0;
  var failures = [];

  for (var i = 0; i < identities.length; i++) {
    var identity = identities[i];
    if (identity.verificationStatus === 'pending') continue;

    var shared = isSharedIdentity_(identity.sendAsEmail);
    // Shared mailboxes fold the mailbox's purpose into the name line
    // ("DragonCandy Support") and use a generic second line, with
    // showCompany:false so renderSignature doesn't append "&middot; DragonCandy"
    // a second time -- see signature.js and the note on renderSignature's
    // showCompany option. Personal signatures are unaffected: shared stays
    // false, showCompany defaults to true, output is byte-identical to before.
    var html = renderSignature({
      name: shared ? 'DragonCandy ' + titleForShared_(identity.sendAsEmail) : user.name,
      title: shared ? 'Shared mailbox' : user.title,
      email: identity.sendAsEmail,
      includeAddress: shared,
      showCompany: !shared,
    });

    // One unwritable identity must not cost this user their other signatures.
    // Observed 2026-08-21: adding shared send-as identities to dame@ made the
    // whole user throw, so his own primary signature stopped being refreshed
    // and the nightly run logged ERROR with no counts at all. Attempt every
    // identity, record what failed, and let the caller report it.
    try {
      gmailApi_(
        token,
        'settings/sendAs/' + encodeURIComponent(identity.sendAsEmail),
        'patch',
        { signature: html },
      );
      written++;
      if (shared) sharedWritten++;
    } catch (err) {
      if (isMissingSharingScope_(err)) {
        // Known, expected, and actionable — not a defect in this script.
        denied++;
      } else {
        failures.push(identity.sendAsEmail + ': ' + err);
      }
    }
  }

  return { total: written, shared: sharedWritten, denied: denied, failures: failures };
}

/**
 * Gmail refuses to patch a NON-PRIMARY sendAs with only gmail.settings.basic,
 * and says so in the message rather than in any distinguishable code.
 *
 * This is the correction that cost the most to learn. Google's reference lists
 * settings.sendAs.update as accepting `basic` OR `sharing`, which is true — of
 * the PRIMARY identity. It says nothing about the non-primary case. The repo
 * asserted twice, in writing, that adding the identity by hand needed no new
 * permissions; running it returned 403 PERMISSION_DENIED. Read the docs, then
 * run the thing.
 */
function isMissingSharingScope_(err) {
  return String(err).indexOf('gmail.settings.sharing') !== -1;
}

function titleForShared_(email) {
  var local = String(email).split('@')[0];
  // Every entry in SHARED_IDENTITIES needs a label here, including the ones
  // that do not exist yet. The fallback returns the raw local part, which
  // renders customer-facing as "DragonCandy founders" — lowercase, and visibly
  // wrong. A test in signature.test.js enforces the pairing.
  var labels = {
    support: 'Support',
    sales: 'Sales',
    info: 'General enquiries',
    admin: 'Accounts',
    privacy: 'Privacy',
    legal: 'Legal',
    appstore: 'App Store',
    founders: 'Founders',
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

/**
 * Run this by hand first. Checks that the Admin SDK Directory read works and
 * that every user has a title set. Writes nothing.
 *
 * What this does NOT check: it never mints an impersonation token, so it
 * cannot detect a missing, malformed or revoked service-account key -- that
 * only happens in installForUser_(), during a real install. A clean dryRun()
 * does not mean the Gmail API side of this is working.
 */
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
