# Android tester execution ledger

Task1 start: native8a1daba on newbranch, current073 imported from existing local owner objects read-only. Merge-tree predicts App/Nav/Courses conflicts; resolve intent, never whole-file overwrite. Existing25a binaries preserved.

Ruling: execute plan inline under explicit parent instruction, no new approval pause. Reuse isolated checkout and installed dependencies; no npm install. Preserve evidence/workspace for acceptance.

Confirmed defect candidate: Courses.getMediaUrl uses relative /api/get-course-media-url while native SessionPlayer uses apiUrl. Existing course media handler lacks native preflight support. Reproduce before fixing. PDF iframe/download behavior requires Android qualification, no assumed PDF support.

Baseline: route/signin/nativeAuthURL/identity/DAPguide/payment/courseAPI/lint PASS. Browser28 cases26PASS/2FAIL: inherited webtest stubs window.Capacitor but realcore overwrites isNativePlatform from bridge detection, so fixture never entered native mode. Correct fixture via existing Androidbridge presence and assert nativeApp /dap->/premium redirect. No product change for this harness mismatch. Missing guessed native-auth.check filename corrected to existing src/lib/nativeAuthUrl.test.mjs.

Task2 tests prepared before fixes: dedicated nativeCourses remoteAPI browser assertion and origin/preflight API Node assertion.

Task1 baseline reconciliation checks:26/28 course/offer/accessibility initiallyPASS; corrected actualnative bridgefixture makes10/10 inherited offer checksPASS. Native-origin browsertest now RED for intendedwrongorigin(localhost versus regulatedapp.co); nativepreflightNodeRED405vs200 proves currentservercontract. No deployed changes.

Ruling: qualify existing CapacitorHttp direct native caller for course POST instead of changing deployed CORS. Native HTTP is already installed/core SDK and retains server Bearer/grant checks; no global interception/securitysettings/newplugin/library or backend activation. Web retains fetch. The preflightRED is retained as a diagnostic, not an assertion that workingweb must acquire a native CORS deployment.

Task2 RED reproduced allthreeintendedfailures: nativecourse request localhostURL, Android PDFiframe present, lateaccountA progress falselycompletesB lesson. Minimalfixes use existingCapacitorHttp.post with currentBearer/fixedremoteAPI/JSON/no redirects/timeouts, preservewebfetch andserverhandlerbyteidentity; Android retains Download action through existingCapacitor externalintent and avoids unsupportedinlineiframe/prefetch; completion+media responses fenced by account/course/request, duplicatecompletionstatus23505retained. InitialGREEN31PASS withfourbillingharness failures because corefixture omitted newly-used CapacitorHttp export; fixed harness with rejecting stub since billingdoesnotcallcoursemedia. Fullsuite next.

Publicnativeconfiguration recoveredonlyfromcurrentpublicHTML/JS. Decodedexistingpublickeyroleanon and exactprojectmatch; no servicekey/newcredential/value logging. .env.native.local ignored/0600, billingfalse.

Independent whole-candidate review of8c found one P2: a pending or failed completion on lessonA could disable or show an error on lessonB. Added two regression cases; both failed before the fix. Pending/error state now belongs to each captured lesson, while account/course/unmount fences remain. All19 affected course/routing/native cases PASS after the fix; lint and diff checks PASS. Full source8c suite previously170PASS/6deployment-only skips. Final commit/build/full suite and actual emulator qualification follow.

Interim8c APK built offline, assets matched18dist files, installed on owned headless Regulated_API_36. Actual Android WebView origin https://localhost/platformandroid/nativeHTTP plugin present. Production nativeHTTP no-bearer request returned401, proving transport and auth refusal without hosted writes. Public production anon config recovered from public JS only, ignored0600local env, billingfalse. Interim APK is not final client-ready delivery.

M3 same0c4 exactAPK:8 synthetic WebView expiry/retry/background/account/look checks passed; resource403 causes native MediaError4 and no app alert. Existing explicit retry obtained freshURL and played. Two browser regressions reproduced missing resource-error feedback for audio/video (2RED). Minimal onError now uses existing approved mediaError copy and only updates the same playback state object, preserving stale-response/account fences; all21 course/routing/native cases PASS. PDF external handoff reached Chrome first-run Terms, no acceptance/permissions and0localPDFGET; valid1pagePDF used. OriginalCDPpagewaitedonexternalnavigation onreturn, so original lessonreturn NOTqualified, cleanupnormalstoredsessionabsence/appstopPASS. Public assessmenttools path verified; no new feature/copy. New source build/fullsuite/runtime acceptance follows.
