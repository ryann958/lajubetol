# Laju Betol MVP

A clean-room, mock-backed Flutter Android MVP based on the static analysis notes in the parent workspace `prd.md`. It is not a copy of the original application's source, credentials, signing keys, assets, or backend.

## Included flows

- Mock email/password sign-in.
- Bottom navigation for Home, Explore, Orders, Travel, and Profile.
- Merchant/item search with mock catalog data.
- Cart and mock order placement.
- Map/travel route preview with mock fare and duration.
- Profile screen with mock location permission state.
- Mock support chat dialog.
- Android ARM64 release configuration with SDK 26 minimum, SDK 36 target, and version `3.0.0+3001`.

## Run

```powershell
flutter pub get
flutter run
```

## Validate

```powershell
flutter analyze
flutter test
flutter build apk --release --target-platform android-arm64 --build-name 3.0.0 --build-number 3001
```

The generated APK is written to `build/app/outputs/flutter-apk/app-release.apk`. Integrations such as Firebase, payment gateways, Agora, maps, and production authentication are intentionally mocked until approved backend contracts and credentials are available.
