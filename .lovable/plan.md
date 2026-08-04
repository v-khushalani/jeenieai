# Play Store Launch Plan for JEEnie AI

## Current state
- App is already a Capacitor native app (`capacitor.config.ts` + `@capacitor/android`).
- Android platform dependency is installed.
- To go live on Play Store, we only need to build the Android bundle and upload it.

## Can a non-technical person do it?
Yes, mostly. Steps 1-4 are one-time setup; Step 5 is just clicking "Create release" and uploading a file every update.

## Exact steps (short)

1. **Create Google Play Developer account**
   - Go to [play.google.com/console](https://play.google.com/console).
   - Pay one-time $25 fee.
   - Use your business Gmail / Google account.

2. **Prepare app identity**
   - App name: JEEnie AI.
   - Short & full description.
   - Screenshots (phone + tablet).
   - App icon (512x512 PNG).
   - Feature graphic (1024x500 PNG).
   - Privacy policy URL (we already have `/privacy-policy`).

3. **Build Android App Bundle (AAB)**
   - In Android Studio, open the `android/` folder.
   - Go to Build → Generate Signed App Bundle / APK.
   - Create a keystore file (save password safely — lost = no future updates).
   - Select `release` → it creates `.aab` file.

4. **Upload first release**
   - In Play Console, create app → fill details.
   - Go to Production → Create new release.
   - Upload the `.aab` file.
   - Set countries, content rating, pricing (free/paid).
   - Submit for review (usually 1-3 days).

5. **Future updates**
   - Just rebuild `.aab` with higher version number and upload again.

## What we should do before publishing
- Remove the `server.url` hot-reload config so app works offline/standalone.
- Test on a real Android phone.
- Add splash screen + app icons properly.
- Set version code/name in `android/app/build.gradle`.

## Recommendation
Yes, we can proceed. I can prepare the Android build files and a checklist; you only need to create the Play Console account and upload the file.
