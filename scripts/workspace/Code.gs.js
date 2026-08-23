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
  var perUser = [];
  var totalSharedSeen = 0;
  var totalDenied = 0;
  // Read before the loop: the Sheet's written/expected column uses the same
  // expectation as the warning, and both must survive an identity being
  // removed. See sharedExpectation_.
  var baselineRead = readSharedBaseline_();
  var baseline = baselineRead.values;

  for (var i = 0; i < users.length; i++) {
    var user = users[i];
    try {
      var counts = installForUser_(user);
      totalSharedSeen += counts.sharedSeen;
      totalDenied += counts.denied;
      var record = {
        email: user.primaryEmail,
        sharedWritten: counts.shared,
        sharedSeen: counts.sharedSeen,
        // Per user AND shared-only. A 403 on someone else's account, or on this
        // user's non-company sendAs, must not decide the remedy printed for
        // their shared signatures. (Codex P2 x2, 2026-08-23.)
        denied: counts.sharedDenied,
      };
      perUser.push(record);
      var sharedExpected = sharedExpectation_(record, baseline);

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
        // written/expected, not a bare count, and expected comes from the same
        // rule the warning uses -- including the baseline. "0 shared" is
        // correct for a user who never had any and alarming for a user who
        // had three, and the Sheet is the DURABLE record: if it collapsed
        // those two into the same string, the warning's 0/3 would be the only
        // trace, and warnings scroll away. (Codex P2, 2026-08-23.)
        sharedExpected ? counts.shared + '/' + sharedExpected + ' shared' : '0 shared',
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

  // The scope-fix message is the same wherever it is needed, so build it once.
  var SCOPE_FIX =
    ' Those identities exist and are verified -- we lack ' +
    SCOPE_SHARING +
    ', which Gmail requires to modify any NON-PRIMARY sendAs. FIXING THIS ' +
    'TAKES TWO STEPS AND THE ORDER MATTERS: (1) add that scope to the ' +
    'domain-wide delegation in the admin console, alongside ' +
    'gmail.settings.basic; THEN (2) set the script property ' +
    'SHARING_SCOPE_ENABLED=true so the impersonation JWT actually asks for ' +
    'it. Step 1 alone changes nothing -- the token still comes back without ' +
    'the scope and you get this same 403. Step 2 before step 1 breaks every ' +
    'signature with unauthorized_client. NOTE the consequence before doing ' +
    'either: that scope also lets this service account set who may send as ' +
    'what, for every user in the domain.';

  // Two mutually exclusive states, most alarming first.
  //
  // This used to key off the domain aggregate (totalSharedInstalled === 0),
  // which equals a per-user check only while exactly ONE account holds shared
  // identities. With two, a user could lose every shared signature and the run
  // would stay silent because somebody else still installed one -- the warning
  // would have gone quiet precisely as the feature grew. Codex, 2026-08-23.
  var degraded = sharedRegressions_(perUser, baseline);

  if (degraded.length) {
    // Partition by CAUSE, because the two have different fixes and printing
    // the scope remedy for a user whose failure had nothing to do with the
    // scope sends the operator to the wrong place.
    var byScope = [];
    var byOther = [];
    for (var d = 0; d < degraded.length; d++) {
      (degraded[d].denied > 0 ? byScope : byOther).push(formatRegression_(degraded[d]));
    }

    var msg =
      'installAllSignatures: shared-mailbox signatures are MISSING for ' +
      degraded.length +
      ' user(s), shown as written/expected. Expected counts come from the ' +
      'identities present now AND from SHARED_BASELINE, so a removed identity ' +
      'still counts as missing rather than vanishing from the check.';
    if (byScope.length) {
      msg += ' REFUSED FOR LACK OF SCOPE: ' + byScope.join(', ') + '.' + SCOPE_FIX;
    }
    if (byOther.length) {
      msg +=
        ' NOT explained by the scope (nothing 403d for these users): ' +
        byOther.join(', ') +
        '. Check the run log for per-identity failures, and check whether the ' +
        'send-as identities were deleted or reverted to pending verification. ' +
        'If the removal was deliberate, clear those users from the ' +
        'SHARED_BASELINE script property or this will warn every night.';
    }
    console.warn(msg);
  } else if (totalSharedSeen === 0) {
    // Nobody has a shared send-as identity at all. Correct and non-alarming on
    // a fresh domain, and the state here until 2026-08-21: these addresses are
    // ALIASES, and an alias is not a send-as identity.
    console.warn(
      'installAllSignatures: no shared address is a send-as identity on any ' +
        'of the ' +
        users.length +
        ' user account(s), so 0 shared-mailbox signatures were installed. ' +
        'SHARED_IDENTITIES (support@, sales@, founders@, ...) are ALIASES, ' +
        'and an alias does not appear in settings/sendAs; it only makes mail ' +
        'arrive. The account holder adds it in Gmail Settings -> Accounts ' +
        'and Import -> Send mail as (or the script creates it via ' +
        'settings/sendAs POST). Either route ALSO needs ' +
        'gmail.settings.sharing to write the signature afterwards -- proven ' +
        '2026-08-21, do not assume the manual route is permission-free. ' +
        'Converting these to Google Groups would NOT help: a Group is not a ' +
        'send-as identity either.' +
        (totalDenied > 0
          ? ' NOTE: ' +
            totalDenied +
            ' non-primary identity/identities WERE refused with a ' +
            'missing-scope 403 despite none being a recognised shared ' +
            'address -- somebody has a non-primary sendAs outside ' +
            'SHARED_IDENTITIES.' +
            SCOPE_FIX
          : ''),
    );
  }

  // After the check, never before: the baseline is what the check compares
  // against, so updating it first would compare this run to itself. And never
  // at all when the stored value could not be read -- see readSharedBaseline_.
  if (baselineRead.usable) {
    writeSharedBaseline_(nextSharedBaseline_(perUser, baseline));
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
  var sharedSeen = 0;
  var denied = 0;
  // Denials on SHARED identities only. counts.denied includes any non-primary
  // sendAs, and a user can hold one that is not a company address -- letting
  // that decide the remedy would announce "REFUSED FOR LACK OF SCOPE" about
  // shared signatures that were actually deleted. (Codex P2, 2026-08-23.)
  var sharedDenied = 0;
  var failures = [];

  for (var i = 0; i < identities.length; i++) {
    var identity = identities[i];
    if (identity.verificationStatus === 'pending') continue;

    var shared = isSharedIdentity_(identity.sendAsEmail);
    // sharedSeen is the DENOMINATOR the regression check needs: how many shared
    // identities we actually attempted. Counted after the pending skip, because
    // a pending identity is not writable and its absence is not a regression.
    // (Consequence worth knowing: if a live identity flips back to pending, both
    // numerator and denominator drop and no regression is reported. The log
    // Sheet's identity count still moves, so it is visible, just not warned on.)
    if (shared) sharedSeen++;
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
        if (shared) sharedDenied++;
      } else {
        failures.push(identity.sendAsEmail + ': ' + err);
      }
    }
  }

  return {
    total: written,
    shared: sharedWritten,
    sharedSeen: sharedSeen,
    denied: denied,
    sharedDenied: sharedDenied,
    failures: failures,
  };
}

/**
 * Which users had shared identities that did NOT all get a signature.
 *
 * Split out and kept pure for two reasons. It is the only part of the run
 * that vitest can reach -- installAllSignatures needs AdminDirectory and a
 * live impersonation token, so the decision logic would otherwise be
 * untested. And the bug it exists to fix was a scoping error, not a
 * computation error, which is exactly the kind a unit test pins cheaply.
 *
 * The bug: the zero-shared warning used to fire on the DOMAIN AGGREGATE
 * (totalSharedInstalled === 0). With one shared-identity holder that happens
 * to be equivalent to a per-user check. With two it is not -- one user could
 * lose every shared signature and the run would stay silent because the other
 * still installed one. Found by Codex 2026-08-23.
 *
 * @param {Array<{email: string, sharedWritten: number, sharedSeen: number}>} perUser
 * @return {Array<string>} "user@ (written/seen)" for each degraded user
 */
/**
 * How many shared signatures this user SHOULD have.
 *
 * The larger of what is on their account right now and what they have ever
 * successfully had. Both the warning and the run log call this, so the two can
 * never disagree about what "expected" means -- they did briefly, and the Sheet
 * (the durable record) was the one telling the smaller truth.
 */
function sharedExpectation_(record, baseline) {
  return Math.max(record.sharedSeen || 0, (baseline || {})[record.email] || 0);
}

function sharedRegressions_(perUser, baseline) {
  baseline = baseline || {};
  var out = [];
  for (var i = 0; i < perUser.length; i++) {
    var r = perUser[i];
    // The denominator must NOT come only from what we can see right now.
    // Deriving it from the current sendAs list makes the check blind to the
    // worst case: delete a user's shared identities and sharedSeen falls to 0
    // alongside sharedWritten, so nothing looks wrong. The high-water baseline
    // is what remembers those signatures used to exist. (Codex P1, 2026-08-23
    // -- the first version of this function shipped with exactly that hole,
    // and a comment cheerfully describing it.)
    var expected = sharedExpectation_(r, baseline);
    if (expected > 0 && r.sharedWritten < expected) {
      out.push({
        email: r.email,
        written: r.sharedWritten,
        expected: expected,
        denied: r.denied || 0,
      });
    }
  }
  return out;
}

/** "user@ (1/3)" -- the shape the warning and the tests both want. */
function formatRegression_(r) {
  return r.email + ' (' + r.written + '/' + r.expected + ')';
}

/**
 * High-water mark of shared signatures successfully installed per user.
 *
 * Never decreases on its own. A drop IS the signal, so letting the baseline
 * follow it down would erase the evidence one run later and turn a standing
 * regression into a single warning nobody was awake for. To accept a
 * deliberate removal, edit or delete the SHARED_BASELINE script property.
 *
 * Users absent from this run (their installForUser_ threw) keep their entry,
 * so an outage cannot quietly reset expectations either.
 */
function nextSharedBaseline_(perUser, baseline) {
  var out = {};
  var source = baseline || {};
  for (var k in source) {
    if (Object.prototype.hasOwnProperty.call(source, k)) out[k] = source[k];
  }
  for (var i = 0; i < perUser.length; i++) {
    var r = perUser[i];
    out[r.email] = Math.max(out[r.email] || 0, r.sharedWritten);
  }
  return out;
}

/**
 * Returns { values, usable }.
 *
 * `usable` false means the stored property could not be parsed. The caller must
 * then NOT write a new baseline: overwriting an unreadable one with this run's
 * counts would silently discard every high-water mark, and if identities are
 * already missing their expectations would be erased permanently -- the run
 * after next would go quiet and look healthy. Failing to read costs detection
 * for one run; failing to preserve costs it forever. (Codex P2, 2026-08-23.)
 */
function readSharedBaseline_() {
  var raw = PropertiesService.getScriptProperties().getProperty('SHARED_BASELINE');
  if (!raw) return { values: {}, usable: true };
  try {
    var parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { values: parsed, usable: true };
    }
    console.warn(
      'SHARED_BASELINE parsed but is not an object (got ' +
        (Array.isArray(parsed) ? 'an array' : typeof parsed) +
        '). Leaving it untouched; regression detection is off until it is repaired.',
    );
    return { values: {}, usable: false };
  } catch (err) {
    // Fail open rather than throw -- a corrupt baseline must not stop
    // signatures installing -- but refuse to overwrite it.
    console.warn(
      'SHARED_BASELINE is not valid JSON, so regression detection is off until ' +
        'it is repaired. It will NOT be overwritten. Error: ' +
        err,
    );
    return { values: {}, usable: false };
  }
}

function writeSharedBaseline_(next) {
  PropertiesService.getScriptProperties().setProperty('SHARED_BASELINE', JSON.stringify(next));
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
var SCOPE_BASIC = 'https://www.googleapis.com/auth/gmail.settings.basic';
var SCOPE_SHARING = 'https://www.googleapis.com/auth/gmail.settings.sharing';

/**
 * Scopes to request in the impersonation JWT.
 *
 * Granting a scope in the admin console is only half of it — the JWT has to ASK
 * for it too, or the token comes back without it and every non-primary sendAs
 * patch still 403s with no clue why. (Codex P1, 2026-08-22. The warning text in
 * this file previously told an operator to add the scope in the console and
 * stop there, which would have produced an identical failure and a very bad
 * afternoon.)
 *
 * It is NOT safe to simply request both always. Google rejects the whole token
 * exchange with `unauthorized_client` if the JWT asks for a scope the
 * delegation does not carry — so hardcoding both would break every signature,
 * including the personal ones that work today, until an admin catches up.
 *
 * Hence the switch, and hence its default. Order of operations is: add the
 * scope in the admin console FIRST, then set SHARING_SCOPE_ENABLED=true. Doing
 * it the other way round takes the whole installer down.
 */
function requestedScopes_() {
  var enabled = PropertiesService.getScriptProperties().getProperty('SHARING_SCOPE_ENABLED');
  return String(enabled).toLowerCase() === 'true'
    ? SCOPE_BASIC + ' ' + SCOPE_SHARING
    : SCOPE_BASIC;
}

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
      scope: requestedScopes_(),
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
    var hint = '';
    if (
      response.getContentText().indexOf('unauthorized_client') !== -1 &&
      requestedScopes_().indexOf(SCOPE_SHARING) !== -1
    ) {
      hint =
        ' — LIKELY CAUSE: SHARING_SCOPE_ENABLED is true but ' +
        SCOPE_SHARING +
        ' has not been added to the domain-wide delegation in the admin ' +
        'console. Add it there, or set SHARING_SCOPE_ENABLED=false to restore ' +
        'the previous working state.';
    }
    throw new Error(
      'token exchange failed for ' + userEmail + ': ' + response.getContentText() + hint,
    );
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
