# Apple app icon checkpoint

The prepared navy, cream and amber Regulated R icon now replaces the Capacitor placeholder in the existing Apple asset catalog. The source is copied without resizing or redrawing. It is a 1024 by 1024 opaque PNG.

The old asset is preserved under `.audit/backups/apple-icon-20260927-222618/`. The source, destination, backup and hashes are in `apple-icon-receipt.json`. Both the copy and backup were hash-verified.

An unsigned iOS Simulator build passed with the existing Xcode project and derived-data directory. Evidence is in `apple-icon-build.log`. The initial sandboxed attempt could not reach simulator services or run package resolution; the explicitly escalated build succeeded. No security settings were changed.

The compiled app's Info.plist references AppIcon for both iPhone and iPad. The generated 120px iPhone and 152px iPad PNGs exist. The compiled iPad image was visually inspected and matches the source design.

No simulator installation, physical-device test, signing, store upload or production deployment occurred. Android launcher assets still need replacing. Screenshots and the Google feature graphic remain open work.
