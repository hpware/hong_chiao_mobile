# 管城市 (Expo)

Mobile port of [hong_chiao](https://github.com/hpware/hong_chiao). The web app runs a Next.js server
that proxies the school's YB2K portal. This app scrapes the portal **directly from the phone**
instead, so you don't need a server, Docker or `.env`. On first launch, pick a school (or
enter its YB2K URL) on the login screen.

## Run

```bash
npm install
npx expo start      # press i / a, or scan the QR code with Expo Go
```

Every native module the app uses ships in Expo Go, so you don't need a dev build.

## Native UI

The UI is built from platform components, not a copy of the web design. On iOS, screens are SwiftUI
`Form`s (via `@expo/ui/swift-ui`) with SF Symbols, native tabs, large titles, menus and alerts. On
Android, the same screens render with Jetpack Compose / Material 3 (via `@expo/ui`'s universal
components). Both implementations live in `src/components/native(.ios).tsx` behind one API.

## Captcha auto-fill

The login captcha is read on the device (`src/lib/captcha-ocr.ts`). The portal draws five digits at
fixed positions, so the reader keeps only the tinted digit pixels and matches each glyph against
templates (`captcha-templates.ts`) built from captchas the portal confirmed. It read 20 of 20 unseen
captchas correctly in testing. If the portal still rejects a code, the login screen fetches a new
captcha and retries automatically (up to 3 times). Wrong passwords are never retried: the portal (sw)
limits failed logins, so each password is sent to it only once.

## Features ported

| Web route | App screen |
| --- | --- |
| `/auth/login` | `login` (school picker, auto-filled captcha, login) |
| `/` | 首頁 tab: profile, quick access, 缺曠/操行, leave days, 公布欄 |
| `/tuition` | 學費 tab: per-semester amounts, 繳費 / 繳費證明 |
| `/tuition/bill`, `/tuition/bill-balance` | `bill` (`?kind=balance`, `?year=&semester=`) PDF preview + share |
| `/tuition/proof-of-payment/[id]` | `proof` |
| `/tuition/discount` | `discount` |
| `/credit-application`, `/apply/[id]` | 獎學金 tab, `scholarship/[id]`, `scholarship/document` |
| `/settings` (password) + sidebar theme toggle | 設定 tab (theme, logout), `change-password` |
| `/platform/about` | `about` |
| sidebar session renew (10 min) | `SessionKeepAlive` in `src/providers/session.tsx` |

| — (from [Agora-AI](https://github.com/alaner652/Agora-AI)) | 學業 tab: today's classes, `schedule`, `grades`, `absence`, `leaves`, `leave-new` |

Not ported: the AI sidebar / Agora's AI chat and their settings, and 獎懲 (the web app hides it
too; the reward schema is unknown).

## Legacy system (舊系統)

TPCU still serves 課表, 成績, 缺曠 and 請假 from its old system at `https://siw.tpcu.edu.tw/tsint`.
`src/lib/old/*` ports the Agora-AI backend's client and parsers to run on the phone:

- It logs in with the same student ID and password as YB2K. Unlike the portal, it has no captcha
  and no limit on failed logins, so the app tests passwords against siw freely (e.g. when the
  portal rejects a password, it checks whether that's the siw one) instead of spending portal tries. The password stays in
  memory only, so an expired legacy session is renewed silently while the app is open.
- The parsers are pure functions (`parsers.ts`) and were checked against real pages.
- Leave applications mirror the website's own `go_save()` form (single day, multipart upload,
  required attachment for 公假). Fixes over Agora: the form is opened by POST (a GET ignores the
  date), class periods are read from the form's `h_` inputs, leave types and 公假 reasons come
  from the form, and the login check avoids a GET that stalls and drops the session.
- Every siw menu function is listed under 學業 › 舊系統所有功能. 課表, 成績, 缺曠, 獎懲 and 請假 are
  native screens; the rest open in an in-app browser that shares the app's siw session (a small
  injected script replaces siw's frameset so its forms work standalone).
- On Android the legacy server's incomplete TLS certificate chain may be rejected (iOS fetches the
  missing intermediate itself).

## TPCU only

The app is fixed to 臺北城市科技大學 (`SCHOOL` in `src/lib/storage.ts`); there is no school picker.

## Scholarship applications

`src/lib/api/scholarship.ts` mirrors the portal's YSK11SDetail page: upload each document
(`UploadFile/UploadedFile`, 3 MB max), save a draft and send it (`YSK11_Save`). The web app never
had this; the protocol was read from the portal's own page script.

## Campus network

`src/lib/campus-network.ts` reports whether the phone is on TPCU's network: the device IP, or the
public IP from Cloudflare's `/cdn-cgi/trace`, is checked against TPCU's block 120.102.0.0/18
(TWNIC: T-TSINT.EDU.TW-NET) and 2001:288:2009::/48. Shown on 首頁 and in 設定.

## Layout

- `src/lib/http.ts`: replaces `chromeFetch`. The native HTTP stack keeps the cookies; redirects are followed by hand so the final URL is always known.
- `src/lib/api/*`: one-to-one ports of `components/px_items/*` and the tRPC procedure mappings.
- `src/components/native*.tsx`: the native form building blocks (rows, sections, fields, pickers).
- `src/providers/*`: session (auth gate + React Query) and the appearance setting.
- `src/app/*`: Expo Router screens.

## Building

```bash
node scripts/bump-version.js [version]   # bump the build number (and version) before each release build
npx expo prebuild                         # generates ios/ and android/ (gitignored)
```

## License

MIT © 2026 Yuan-Hau Wu — see [LICENSE](LICENSE).

- [hong_chiao](https://github.com/hpware/hong_chiao) (MIT, Yuan-Hau Wu): the web app this ports.
- [Agora-AI](https://github.com/alaner652/Agora-AI) by alaner652: the legacy-system (siw) client
  and parsers in `src/lib/old/` are ported from its backend. That project has no license file;
  its code remains its author's.
- The project started from the Expo app template (MIT, 650 Industries, Inc.).

The app lists every bundled open-source package and its license under 設定 › 關於 › 授權條款
(`node scripts/generate-licenses.js` regenerates the list after dependency changes).

