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
  // Users whose installForUser_ threw outright. They are not in perUser (we
  // have no counts for them), but a user getting NO signature is at least as
  // alarming as a degraded one, so the alert has to know about them.
  var failedUsers = [];
  // Every user whose run was not a clean 'ok'.
  //
  // Keyed off the SAME status the Sheet records, deliberately, rather than
  // enumerating causes. Two rounds of review were spent adding a category at a
  // time -- primary-identity write failures, then scope denials on a
  // non-company address -- and each new cause was another silent hole. "Not ok"
  // is the condition that actually matches the claim the alert makes, and it
  // cannot fall behind the status logic because it IS the status logic.
  // (Codex, 2026-08-23.)
  var partialUsers = [];
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

      var status = runStatus_(counts);
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

      if (status !== 'ok') {
        partialUsers.push({ email: user.primaryEmail, detail: detail });
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
      failedUsers.push(user.primaryEmail);
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
      var g = degraded[d];
      // 'mixed' lands in both lists on purpose: part of what is missing is the
      // scope and part is not, and an operator told only about the scope will
      // grant it, see the count improve, and stop looking.
      if (g.cause === 'scope' || g.cause === 'mixed') byScope.push(formatRegression_(g));
      if (g.cause === 'other' || g.cause === 'mixed') byOther.push(formatRegression_(g));
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
        ' NOT explained by the scope (a user listed in both lines is missing ' +
        'signatures for BOTH reasons -- fixing the scope will not finish the ' +
        'job): ' +
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

  // A warning in Cloud Logging is only seen by someone who goes looking. This
  // is the delivery half: the same finding, pushed. Deliberately silent on a
  // clean run -- an alert that arrives nightly regardless is one nobody reads.
  var alert = runAlert_(degraded, failedUsers, users.length, partialUsers);
  if (alert) sendRunAlert_(alert.subject, alert.body);

  // After the check, never before: the baseline is what the check compares
  // against, so updating it first would compare this run to itself. And never
  // at all when the stored value could not be read -- see readSharedBaseline_.
  if (baselineRead.usable) {
    try {
      writeSharedBaseline_(nextSharedBaseline_(perUser, baseline));
    } catch (err) {
      // A property-quota or service error here must not cost the durable Sheet
      // record of a run whose signatures have already been written. Losing the
      // baseline update degrades the NEXT run's detection; losing the log loses
      // the evidence of THIS one. (Codex P2, 2026-08-23.)
      console.error('Could not persist SHARED_BASELINE, continuing: ' + err);
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
 * 'ok' or 'PARTIAL' for one user's counts. ('ERROR' is the caller's, for a run
 * that threw before producing counts at all.)
 *
 * PARTIAL is deliberately distinct from both. A run where every writable
 * identity was written but some were refused is neither a clean pass nor a
 * failure, and collapsing it into either is how a standing permissions gap
 * becomes invisible.
 *
 * Extracted so it can be tested. It looks trivial enough not to need it, and
 * that is exactly why: this one predicate decides both the Sheet's status
 * column AND whether the user reaches the alert, so a cause it fails to treat
 * as non-clean is a cause nobody is told about. A mutation of the inline
 * version went undetected by the whole suite, because the only tests that
 * touched this path fed runAlert_ directly.
 */
function runStatus_(counts) {
  if (counts.failures && counts.failures.length) return 'PARTIAL';
  if (counts.denied) return 'PARTIAL';
  return 'ok';
}

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
      var denied = r.denied || 0;
      // How many missing signatures the scope does NOT account for. A user can
      // hit both causes at once -- one identity 403s while another was deleted
      // -- and reporting only the scope would send the operator to grant a
      // permission that fixes part of the problem and then declare victory.
      // (Codex P2, 2026-08-23.)
      var unexplained = Math.max(0, expected - r.sharedWritten - denied);
      out.push({
        email: r.email,
        written: r.sharedWritten,
        expected: expected,
        denied: denied,
        unexplained: unexplained,
        cause: denied > 0 ? (unexplained > 0 ? 'mixed' : 'scope') : 'other',
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
 * Composes the alert for a run, or null if there is nothing worth sending.
 *
 * Pure, so the decision of WHEN to wake somebody up is unit-testable. The
 * sending itself (MailApp, script properties) is not, and is kept to the thin
 * sendRunAlert_ below.
 *
 * Silent on a clean run on purpose. A nightly "all fine" mail trains its
 * recipient to filter it, and then the one that matters is filtered too.
 */
function runAlert_(degraded, failedUsers, userCount, partialUsers) {
  degraded = degraded || [];
  failedUsers = failedUsers || [];
  partialUsers = partialUsers || [];
  if (!degraded.length && !failedUsers.length && !partialUsers.length) return null;

  var parts = [];
  if (failedUsers.length) parts.push(failedUsers.length + ' failed');
  if (partialUsers.length) parts.push(partialUsers.length + ' not clean');
  if (degraded.length) parts.push(degraded.length + ' degraded');
  var subject = '[DragonCandy signatures] ' + parts.join(', ') + ' of ' + userCount + ' users';

  var body = 'The nightly signature run needs attention.\n\n';

  if (failedUsers.length) {
    body +=
      'NO SIGNATURE WRITTEN AT ALL (' +
      failedUsers.length +
      '):\n  ' +
      failedUsers.join('\n  ') +
      '\n\nThese users threw before any identity was written. Their signatures ' +
      'are whatever they were before this run -- possibly stale, possibly absent.\n\n';
  }

  if (partialUsers.length) {
    body += 'RUNS THAT WERE NOT CLEAN (' + partialUsers.length + '):\n';
    for (var q = 0; q < partialUsers.length; q++) {
      body += '  ' + partialUsers[q].email + ' -- ' + partialUsers[q].detail + '\n';
    }
    body +=
      '\nThis covers anything short of a clean run, including a failed write on ' +
      "the user's OWN primary signature and a scope refusal on a non-company " +
      'address. Neither would show anywhere else in this mail.\n\n';
  }

  if (degraded.length) {
    body += 'SHARED SIGNATURES MISSING (' + degraded.length + '), as written/expected:\n';
    for (var i = 0; i < degraded.length; i++) {
      var g = degraded[i];
      body +=
        '  ' +
        formatRegression_(g) +
        '  cause: ' +
        g.cause +
        (g.cause === 'scope'
          ? ' (refused for lack of gmail.settings.sharing)'
          : g.cause === 'mixed'
            ? ' (PART scope, PART something else -- fixing the scope will not finish the job)'
            : ' (nothing was refused; the identities were likely deleted or set back to pending)') +
        '\n';
    }
    body +=
      '\n"Expected" is the larger of the identities present now and the ' +
      'SHARED_BASELINE high-water mark, so a DELETED identity still counts as ' +
      'missing rather than disappearing from the check.\n\n';
  }

  body +=
    'Full per-user detail is in the run log Sheet, and the reasoning behind ' +
    'each cause is in scripts/workspace/README.md.\n';

  return { subject: subject, body: body };
}

/** Reads ALERT_EMAIL: comma-separated, blanks ignored. */
function alertRecipients_() {
  var raw = PropertiesService.getScriptProperties().getProperty('ALERT_EMAIL');
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map(function (x) {
      return x.trim();
    })
    .filter(function (x) {
      // Not validation -- just refusing to hand MailApp obvious junk. A bad
      // address is the recipient's problem to notice; an empty string is ours.
      return x.length > 0 && x.indexOf('@') !== -1;
    });
}

/**
 * Best-effort. Failing to raise the alarm must never fail the run that raised
 * it -- the signatures are already written by this point, and losing the run
 * log to a mail error would trade a notification for the evidence.
 */
function sendRunAlert_(subject, body) {
  var to = alertRecipients_();
  if (!to.length) {
    console.warn(
      'ALERT_EMAIL is not set, so this run has a finding and nobody was told. ' +
        'Set it to a comma-separated address list in Script Properties. ' +
        'Subject would have been: ' +
        subject,
    );
    return false;
  }
  try {
    MailApp.sendEmail({ to: to.join(','), subject: subject, body: body });
    return true;
  } catch (err) {
    console.error('Could not send the alert email to ' + to.join(', ') + ': ' + err);
    return false;
  }
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

/**
 * Sends a test alert to whatever ALERT_EMAIL currently holds. Run it from the
 * editor after changing that property, after granting a new OAuth scope, or any
 * time you want to know the alarm still rings.
 *
 * WHY THIS IS PERMANENT rather than a throwaway. A clean run is silent by
 * design (see runAlert_), so the delivery path is exercised only by a run that
 * has a finding -- which, if everything else works, should be rare. That can
 * leave the path untested for months, and an alarm nobody has heard ring is
 * indistinguishable from one that does not work. This is how you hear it.
 *
 * WHY IT GOES THROUGH sendRunAlert_ instead of calling MailApp itself. A test
 * that builds its own send proves MailApp works, which was never in doubt. What
 * is in doubt is whether THIS script's authorization, THIS property and THIS
 * recipient list deliver -- so it has to be the same code the real alert uses.
 * If this function ever stops calling sendRunAlert_, it stops being a test.
 *
 * WHY IT THROWS where a real run only warns. installAllSignatures must not fail
 * over a notification -- its job is writing signatures, and they are already
 * written by the time the alert is attempted. This function's ONLY job is the
 * notification, so "nobody is configured" and "the send was refused" are failed
 * tests, not footnotes.
 *
 * WHAT A GREEN RUN DOES NOT PROVE, and this is the whole point: it proves the
 * send was ACCEPTED, not that anything arrived. Mail can still be filtered,
 * spam-foldered or ignored. The result of this test is the message showing up
 * somewhere you would notice -- so the console line below tells you to go and
 * look rather than declaring success. Treating a green execution as a pass
 * rebuilds the exact failure this alert exists to fix.
 *
 * Writes nothing else: no signature, no baseline, no row in the log Sheet.
 */
function sendTestAlert() {
  var to = alertRecipients_();
  if (!to.length) {
    throw new Error(
      'ALERT_EMAIL is unset or holds nothing usable, so there is nobody to ' +
        'test. Set it to a comma-separated address list in Project Settings > ' +
        'Script Properties. (Entries without an "@" are dropped -- see ' +
        'alertRecipients_.)',
    );
  }

  var sent = sendRunAlert_(
    '[TEST] DragonCandy signature alert -- no action needed',
    'This is a TEST of the signature-installer alert, sent by hand from the ' +
      'Apps Script editor. Nothing is wrong.\n\n' +
      'What it means: the alarm can reach this address. What it does NOT ' +
      'mean: that signatures are currently installing correctly -- the run ' +
      'log Sheet is the place for that.\n\n' +
      'A real alert never says TEST in the subject, and always names the ' +
      'users affected.\n\n' +
      'Sent to: ' +
      to.join(', ') +
      '\n',
  );

  // sendRunAlert_ swallows failures on purpose, so its false is the only
  // signal that the send was refused. Left unchecked, a broken mail path would
  // finish green and read as a pass.
  if (!sent) {
    throw new Error(
      'The test alert was NOT sent to ' +
        to.join(', ') +
        '. sendRunAlert_ logged the reason immediately above this error.',
    );
  }

  console.log(
    'Test alert accepted for delivery to ' +
      to.join(', ') +
      '. This is NOT the result: go and confirm it arrived somewhere you ' +
      'would actually notice. If it is not there, check spam before ' +
      'suspecting the script.',
  );
  return to;
}
