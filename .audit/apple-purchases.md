# Apple local purchase capability

28 September 2026. Added com.apple.InAppPurchase enabled=1 to the existing App target SystemCapabilities. This is local Xcode project configuration. It does not activate an Apple developer account, configure products, sign a build or make billing live.

RevenueCat requires this setting in its Capacitor installation instructions:
https://www.revenuecat.com/docs/getting-started/installation/capacitor

The original project file is backed up unchanged at .audit/backups/apple-purchases-20260928/project.pbxproj. Project plist validation, diff whitespace check and unsigned iOS simulator build passed. Build output is apple-purchases-build.log. No runtime purchase occurred. No extra entitlement, dependency or abstraction was added.

Next: active Apple membership, App ID/signing verification, store products and agreements, server activation and real sandbox purchase lifecycle tests.
