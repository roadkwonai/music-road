# dmg 패키징

Road Music을 맥용 dmg로 만드는 절차입니다. 사용자는 dmg를 열고 `Road Music`을 `Applications`로 끌어 놓아 설치합니다. 개발 중에는 dmg 없이 `npm start`로 실행해도 됩니다.

소스를 수정해도 이미 설치된 앱의 `app.asar`에는 자동으로 반영되지 않습니다. 개발 실행은 재실행하고, 설치한 앱은 새 DMG의 앱으로 교체합니다. 같은 앱 ID와 데이터 경로를 사용하므로 기존 곡·엔진·설정은 유지됩니다.

## 목차

- [1. 요약](#toc-1)
- [2. 준비물](#toc-2)
- [3. 빌드 절차](#toc-3)
- [4. 설정 설명](#toc-4)
- [5. 만든 뒤 확인](#toc-5)
- [6. 버전 올리기](#toc-6)
- [7. 다른 사람에게 배포하기: 서명과 공증](#toc-7)
- [8. 아이콘 바꾸기](#toc-8)
- [9. 배포 전 확인 목록](#toc-9)
- [10. 문제 해결](#toc-10)

<a id="toc-1"></a>

## 1. 요약

```bash
npm ci --include=dev
npm run dist:mac
npm run dist:cli
# → dist/RoadMusic-1.4.0-mac-arm64.dmg (약 100MB)
# → dist/mac-arm64/Road Music.app (dmg에 들어가는 앱)
# → dist/RoadMusic-1.4.0-cli.zip (CLI 소스·잠금 파일·AI 지침·가이드)
```

- **도구:** electron-builder 26.15.3(`devDependencies`에 고정)
- **대상:** Apple Silicon(arm64)만. AI 엔진이 Apple Silicon에서만 돌기 때문입니다.
- **서명:** 애드혹 서명. 인증서 없이 이 맥에서 바로 열립니다. 다른 사람에게 배포하려면 7장의 서명·공증이 필요합니다.
- **ffmpeg와 AI 엔진은 dmg에 넣지 않습니다.** ffmpeg는 사용자가 Homebrew로 설치하고, 엔진은 앱이 첫 실행 때 받습니다.

<a id="toc-2"></a>

## 2. 준비물

| 항목 | 확인 |
|---|---|
| Apple Silicon 맥 | 빌드한 맥과 같은 아키텍처(arm64) 앱이 나옵니다 |
| Node.js와 npm | `node -v` (확인한 버전 24.21, npm 11.19) |
| 인터넷 | 첫 빌드 때 Electron 33.4.11 zip과 dmg 도구를 받습니다(이후 캐시 사용) |
| macOS 기본 도구 | `codesign`, `hdiutil`, `iconutil`, `sips`는 macOS에 들어 있습니다. 공증 결과를 확인하는 `xcrun stapler`만 Xcode Command Line Tools가 필요합니다(`xcode-select --install`) |

<a id="toc-3"></a>

## 3. 빌드 절차

1. **의존성 설치**
   ```bash
   cd music-road
   npm ci --include=dev # 잠금 파일의 Electron까지 설치
   ```
   `npm warn install-scripts … not yet covered by allowScripts` 경고가 나와도 됩니다. 확인한 npm 11.19에서는 Electron 설치 스크립트가 그대로 실행됩니다. `node_modules/electron/dist/Electron.app`이 생겼는지 보면 됩니다.
2. **버전 확인:** `package.json`의 `version`이 dmg 파일 이름과 앱 버전이 됩니다. 업데이트 알림도 이 값과 서버의 버전을 비교합니다.
3. **빌드**
   ```bash
   npm run dist:mac     # = electron-builder --mac dmg --arm64
   ```
   로그 끝에 `building target=DMG arch=arm64 file=dist/RoadMusic-1.4.0-mac-arm64.dmg`가 나오고 오류 없이 끝나면 성공입니다. 처음에는 1~2분, 그다음부터는 수십 초 걸립니다.
4. **결과물**

   | 경로 | 내용 |
   |---|---|
   | `dist/RoadMusic-<버전>-mac-arm64.dmg` | 배포 파일 |
   | `dist/mac-arm64/Road Music.app` | dmg에 들어간 앱. 바로 실행해 볼 수 있습니다 |
   | `dist/RoadMusic-<버전>-cli.zip` | `npm run dist:cli`로 만드는 CLI 설치용 소스 키트 |
   | `dist/builder-debug.yml` | 빌드 설정 기록(배포하지 않음) |

   `dist/`는 `.gitignore`에 들어 있습니다.

<a id="toc-4"></a>

## 4. 설정 설명

설정은 모두 `package.json`의 `build` 필드에 있습니다.

```json
"build": {
  "appId": "dev.roadkwon.roadmusic",
  "files": ["cli/**", "electron/**", "renderer/**", "python/**", "!python/__pycache__/**", "build/icon.png", "LICENSE"],
  "asarUnpack": ["python/**", "electron/spectrum-worker.js", "electron/spectrum-analysis.js"],
  "mac": { "category": "public.app-category.music", "icon": "build/icon.icns", "identity": "-", "hardenedRuntime": false },
  "dmg": { "artifactName": "RoadMusic-${version}-mac-${arch}.${ext}", "writeUpdateInfo": false },
  "publish": null
}
```

| 항목 | 왜 이렇게 했나 |
|---|---|
| `appId` | 번들 ID입니다. 배포한 뒤에는 바꾸지 마세요. 애드혹 서명에서는 마이크 같은 macOS 권한이 번들 ID가 아니라 빌드마다 바뀌는 서명에 묶이므로, 새로 빌드하면 권한을 다시 물을 수 있습니다. Developer ID로 서명하면 유지됩니다 |
| `files` | 앱에 필요한 폴더만 넣습니다. `assets/`(분석용 스크린샷), `prompts/`, `docs/`는 빠집니다. `build/icon.png`는 상단 로고, 프로그램 정보 화면, 창 아이콘이 실행 중에 읽습니다 |
| `asarUnpack` | 앱 파일은 `app.asar` 한 파일로 묶입니다. 그런데 외부 파이썬은 asar 안을 읽지 못하고, worker thread도 asar 안의 스크립트로 시작할 수 없습니다. 그래서 이 파일들은 `app.asar.unpacked/`에 풀어 둡니다. 코드도 패키징된 경우 이 경로를 씁니다(`electron/main.js`의 `unpacked()`, `electron/video.js`) |
| `mac.icon` | Dock·Finder용 아이콘입니다. 맥 아이콘 규격(1024 캔버스에 824px 둥근 사각형, 투명 여백, 그림자)으로 만든 `icon.icns`를 씁니다. `build/icon.png`는 앱 안 로고용 꽉 찬 정사각형이라 그대로 쓰면 Dock에서 다른 아이콘보다 크게 보입니다(8장) |
| `mac.identity: "-"` | 애드혹 서명입니다. Apple Silicon은 서명 없는 앱을 실행하지 않습니다. 이 값이 없으면 electron-builder는 키체인에서 인증서를 찾고, 없으면 서명을 건너뜁니다 |
| `mac.hardenedRuntime: false` | 애드혹 서명에 hardened runtime을 켜면, Electron 프레임워크 서명과 맞지 않아 실행에 실패할 수 있습니다. 공증할 때는 켜야 합니다(7장) |
| `dmg.writeUpdateInfo: false`, `publish: null` | electron-builder의 자동 업데이트(`latest-mac.yml`, blockmap)를 쓰지 않습니다. 앱은 GitHub Release API로 직접 업데이트를 확인하고 검증한 DMG를 설치합니다. [업데이트 설계](updates.md)를 참고하세요. 켜 두면 빌드 끝에 `Cannot read properties of null (reading 'channel')`로 실패합니다 |

마이크 권한 문구(`NSMicrophoneUsageDescription`)는 Electron 기본값("This app needs access to the microphone")이 들어갑니다. 한국어로 바꾸려면 `mac.extendInfo`에 넣습니다.

<a id="toc-5"></a>

## 5. 만든 뒤 확인

1.3.0 빌드에서 아래 항목을 확인했습니다(M1 Ultra, macOS 26). 마이크로 직접 녹음하는 것만 시험하지 못했습니다.

```bash
APP="dist/mac-arm64/Road Music.app"
codesign --verify --deep --strict "$APP" && echo 서명OK      # Signature=adhoc
find "$APP/Contents/Resources/app.asar.unpacked" -type f      # python/ 7개(.py 6 + LICENSE 1) + spectrum-*.js 2개
plutil -p "$APP/Contents/Info.plist" | grep -E "Identifier|ShortVersion|Microphone"
```

실행 확인은 Finder에서 연 것과 같은 조건(Homebrew가 없는 PATH)으로 했습니다.

```bash
env -i HOME=$HOME PATH=/usr/bin:/bin:/usr/sbin:/sbin "$APP/Contents/MacOS/Road Music"
```

| 확인 항목 | 1.3.0 결과 |
|---|---|
| dmg 마운트 → 앱 복사 → 실행 | 됨 |
| 엔진 화면: ACE-Step "설치됨", YuE2 "설치할 수 없음" | 됨 (개발 실행에서 설치한 엔진을 그대로 인식) |
| 곡 만들기 | 29초 곡, 모델 로딩 포함 83초. 워커가 `app.asar.unpacked/python/ace_worker.py`에서 실행됨 |
| 영상 미리보기 준비(스펙트럼 분석 worker thread, ffmpeg) | 됨. 870프레임, 막대 64개 |
| 영상 렌더링 `GPU (Apple)`·`CPU` | 됨. 10초 곡 GPU 5초, 3곡 89초 분량 CPU 40초. SSIM 0.993~0.995 |
| 커버, 녹음 파일로 곡 만들기 | 됨. 29초 커버 89초, 120초 곡 90초 |
| MP3·WAV·SRT 저장, 불러오기(FLAC), 앨범 내보내기 | 됨. 저장 대화상자는 테스트용으로 경로를 넘겨 확인 |
| `⌘Q`로 종료하면 엔진 프로세스도 종료 | 됨 |
| 창을 닫으면 앱 종료 | 됨. 창만 닫히고 다시 열 수 없는 채로 Dock에 남던 문제를 이번에 고침 |
| 마이크로 직접 녹음 | 시험하지 않음. 권한 창에 사람이 답해야 해서 자동 확인을 못 했습니다. 직접 `녹음으로`를 한 번 눌러 확인하세요 |
| 처음 받는 맥에서의 Gatekeeper | `spctl --assess` 결과 `rejected`(서명·공증이 없어서). 시작하기 2.3의 방법으로 열어야 함 |

새 버전을 낼 때는 적어도 다음을 확인합니다: 앱 실행, 엔진 화면, 짧은 곡 1개 생성, 미리보기 준비, 짧은 영상 1개, 녹음 1회, `⌘Q` 종료.

### 1.3.1 CLI 포함 재빌드 검증 (2026-10-15)

`npm run dist:mac`으로 최신 CLI 수정 사항을 포함해 재빌드했다. `hdiutil verify`로 DMG 체크섬을, `codesign --verify --deep --strict`로 앱의 애드혹 서명을 확인했다. ASAR의 CLI·메인·preload·renderer 코드와 외부 Python·스펙트럼 워커가 현재 소스와 일치하고 개인 세션 상태가 포함되지 않는 것도 확인했다.

DMG를 읽기 전용으로 마운트하고 앱을 임시 설치 폴더로 복사한 뒤, 별도 데이터 폴더에서 다음을 실제 실행했다. 사용자 앱과 기존 곡 라이브러리는 교체하거나 변경하지 않았다.

| 항목 | 결과 |
| --- | --- |
| 설치 앱의 CLI 서비스·버전·공개 명령 | 1.3.1, 111개 명령 확인 |
| 음원 가져오기·MP3·SRT 저장 | 통과 |
| 720p CPU·GPU MP4 | 두 경로 통과, ffprobe로 H.264·길이 확인 |
| 설치 앱의 ACE-Step 10초 연주곡 | 실제 생성 통과; `app.asar.unpacked/python/ace_worker.py` 사용 확인 |
| 서비스 종료·임시 데이터 정리 | 통과 |

`npm run dist:cli`는 GUI DMG와 별도로 CLI 소스 ZIP을 만든다. 설치·사용 지침과 `AGENTS.md`, `CLAUDE.md`, 작업 프롬프트가 포함되며, Node 의존성·모델·곡·개인 세션 상태는 포함하지 않는다. 설치 절차는 [CLI 설치](cli-install.md), AI 사용은 [AI CLI 운영](ai-cli.md)을 따른다.

CLI ZIP을 별도 임시 폴더에 풀고 `NODE_ENV=production npm ci --include=dev --offline --no-audit --no-fund`로 기존 캐시에서 의존성을 새로 설치했다. 그 키트의 Electron으로 `node scripts/verify-cli.js --gpu`를 실행해 자동 시작·음원 가져오기·MP3/앨범/SRT·CPU/GPU 영상·종료까지 통과했다. 온라인 첫 다운로드와 전역 `npm link` 설치는 이번 검증에서 실행하지 않았다.

실제 마이크와 Developer ID 서명·공증은 이번 재빌드에서 검증하지 않았다. 이 DMG는 애드혹 서명이므로 다른 맥에서 다운로드해 열 때 Gatekeeper 경고가 발생할 수 있다.

<a id="toc-6"></a>

## 6. 버전 올리기

### 1.4.0 업데이트 설치 검증 (2026-10-15)

새 DMG의 코드 서명·이미지 무결성 검사를 통과했다. 임시 1.3.1 앱을 새 DMG로 교체하는 도우미를 실행해 1.4.0 서비스 재시작, 기존 곡·모델·설정과 이전 앱 백업 보존을 확인했다. CLI·영상 스모크도 통과했다. 실제 사용자 앱은 교체하지 않았다. 상세 검증은 [검수 결과](cli-qa-report.md#140-github-업데이트-검증-2026-10-15)에 있다.

1. `package.json`의 `version`을 올립니다(예: `1.4.0`).
2. `npm run dist:mac` → `dist/RoadMusic-1.4.0-mac-arm64.dmg`가 나옵니다.
3. `npm run dist:cli`와 `npm run release:assets`로 CLI ZIP과 체크섬을 만듭니다. 같은 버전의 태그·Release에 DMG, ZIP, `SHA256SUMS.txt`를 게시합니다. 버전 태그를 push하면 GitHub Actions가 빌드·검증 후 Latest Release를 게시합니다. 노트 경로와 절차는 [업데이트 배포](updates.md#새-버전-배포)를 따릅니다.
4. 사용자가 새 dmg로 덮어 설치해도 곡과 엔진(`~/Library/Application Support/Road Music`)은 그대로 남습니다.

<a id="toc-7"></a>

## 7. 다른 사람에게 배포하기: 서명과 공증

> 이 장은 절차만 정리했습니다. 이 맥에는 Developer ID 인증서가 없어서 실행해 보지 않았습니다.

애드혹 서명 dmg를 인터넷이나 메신저로 받은 사용자는 처음 열 때 macOS 경고를 봅니다. 경고 없이 열리게 하려면 Apple의 Developer ID로 서명하고 공증해야 합니다.

1. **Apple Developer Program에 가입합니다**(연간 유료).
2. **인증서를 받습니다:** Xcode → Settings → Accounts에서 **Developer ID Application** 인증서를 만듭니다. 키체인에 들어갔는지 확인합니다.
   ```bash
   security find-identity -v -p codesigning   # "Developer ID Application: 이름 (TEAMID)"가 보여야 함
   ```
3. **권한 파일 `build/entitlements.mac.plist`를 만듭니다.** hardened runtime에서 Electron이 동작하는 데 필요한 권한과 마이크 권한을 넣습니다.
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
   <plist version="1.0">
   <dict>
     <key>com.apple.security.cs.allow-jit</key><true/>
     <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
     <key>com.apple.security.device.audio-input</key><true/>
   </dict>
   </plist>
   ```
4. **`package.json`의 `mac` 설정을 바꿉니다.**
   - `"identity": "-"` 줄을 지웁니다. 그러면 키체인의 Developer ID 인증서를 자동으로 씁니다.
   - `"hardenedRuntime": true`로 바꿉니다.
   - `"entitlements"`와 `"entitlementsInherit"`에 `"build/entitlements.mac.plist"`를 넣습니다.
5. **공증 계정을 환경 변수로 줍니다.** 셋 중 하나를 쓰고, electron-builder는 1번을 권장합니다.
   - App Store Connect API 키: `APPLE_API_KEY`(.p8 경로), `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`
   - Apple ID: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`(앱 암호), `APPLE_TEAM_ID`
   - 키체인 프로필: `APPLE_KEYCHAIN`, `APPLE_KEYCHAIN_PROFILE`
6. **빌드합니다.** `npm run dist:mac`을 실행하면 서명 → 공증 요청 → 결과 붙이기(staple)까지 진행됩니다. 공증은 보통 몇 분 걸립니다.
7. **확인합니다.**
   ```bash
   spctl --assess --type execute -vv "dist/mac-arm64/Road Music.app"   # accepted, source=Notarized Developer ID
   xcrun stapler validate "dist/RoadMusic-1.3.0-mac-arm64.dmg"
   ```

앱이 받아서 실행하는 `uv`, Python, 엔진 라이브러리는 앱 번들 밖(`~/Library/Application Support`)에 있습니다. 그래서 앱 서명에는 영향을 주지 않습니다. 다만 hardened runtime을 켠 빌드에서 엔진 설치와 곡 생성이 되는지는 아직 확인하지 않았습니다. 처음 서명 빌드를 만들면 5장의 확인 항목을 다시 돌려 보세요.

<a id="toc-8"></a>

## 8. 아이콘 바꾸기

지금 아이콘은 Road Music용으로 새로 만든 것입니다. 밤길 도로가 지평선의 이퀄라이저 막대로 이어지는 그림이며, 원본 ssok "S" 마크를 대신합니다. 그림은 ChatGPT 이미지 생성으로 만들었습니다. 같은 그림으로 다시 만들 때는 `build/icon.png`를 그대로 입력으로 쓰면 됩니다.

아이콘 파일은 두 개이고, 한 장의 그림에서 함께 만듭니다.

| 파일 | 쓰는 곳 | 모양 |
|---|---|---|
| `build/icon.png` | 앱 상단 로고(26px), 프로그램 정보(52px), Windows 창 아이콘 | 1024px 꽉 찬 정사각형. 모서리는 CSS가 둥글게 깎음 |
| `build/icon.icns` | Dock, Finder, dmg | 맥 아이콘 규격: 1024 캔버스에 824px 둥근 사각형, 투명 여백, 그림자. 16~1024px 10장 |

바꾸는 절차:
1. 그림을 준비합니다.
   - 정사각형, 1024px 이상
   - 가장자리까지 꽉 찬 그림(둥근 모서리, 테두리, 글자 없음)
   - 16~32px로 줄여도 형태가 보이도록 단순해야 합니다.
2. 스크립트로 두 파일을 만듭니다. Pillow는 `uv`가 임시로 받아 씁니다.
   ```bash
   uv run --no-project --with pillow python scripts/make-icon.py <그림.png>
   # → build/icon.png, build/icon.icns
   ```
3. 작은 크기에서 확인합니다.
   ```bash
   iconutil -c iconset build/icon.icns -o /tmp/check.iconset && open /tmp/check.iconset/icon_32x32.png
   ```
4. 다시 빌드합니다. Dock 아이콘이 예전 것으로 보이면 macOS 아이콘 캐시 때문이니 앱을 `Applications`에 다시 복사하세요.

<a id="toc-9"></a>

## 9. 배포 전 확인 목록

- [ ] `version`을 올렸다
- [ ] 아이콘이 의도한 것인지 확인했다(8장)
- [ ] `LICENSE`가 앱 안에 들어 있다. 원저작자 MIT 고지를 지우지 않는다
- [ ] 서명·공증을 했거나, 받는 사람에게 [시작하기 2.3](getting-started.md#23-처음-열-때-나오는-경고)을 안내한다
- [ ] 받는 사람에게 `brew install ffmpeg`를 안내한다
- [ ] GitHub 최신 정식 Release에 버전과 일치하는 DMG·CLI ZIP·SHA256SUMS.txt가 있다. 업데이트는 GitHub를 사용하며 공지·문의·설치 집계는 기존 `roadkwon.dev` API를 사용한다
- [ ] 상용 배포라면 YuE2(CC BY-NC 4.0)를 안내하거나 쓰지 않는다
- [ ] 5장의 확인 항목을 새 dmg로 돌렸다

<a id="toc-10"></a>

## 10. 문제 해결

| 증상 | 해결 |
|---|---|
| `Icon must be at least 512x512 pixels` | `mac.icon`이 `build/icon.icns`를 가리키는지 확인하거나, 512px 이상 PNG를 쓰세요(8장) |
| `Cannot read properties of null (reading 'channel')` | `dmg.writeUpdateInfo: false`와 `publish: null`이 있는지 확인하세요 |
| `Cannot detect repository by .git/config` 경고 | 자동 업데이트 게시용 경고라 무시해도 됩니다 |
| `skipped macOS notarization` | 공증 환경 변수가 없다는 뜻입니다. 애드혹 빌드에서는 정상입니다 |
| 실행하면 "손상되었기 때문에 열 수 없습니다" | 서명이 깨졌거나 격리 속성이 붙은 경우입니다. `codesign --verify --deep --strict`로 확인하고, 받은 파일이면 `xattr -dr com.apple.quarantine "/Applications/Road Music.app"` |
| 곡 생성 시 `ace_worker.py`를 찾지 못함 | `asarUnpack`에 `python/**`이 빠졌는지 확인하세요. `app.asar.unpacked/python/`에 파일이 있어야 합니다 |
| 미리보기 준비가 멈춤 | `asarUnpack`에 `electron/spectrum-worker.js`와 `spectrum-analysis.js`가 있는지 확인하세요 |
| 인텔 맥용이 필요함 | 지금 dmg는 arm64 전용이라 인텔 맥에서 열리지 않습니다. `npx electron-builder --mac dmg --x64`로 따로 만들 수 있지만, 인텔 맥에서는 AI 엔진을 설치할 수 없어 곡 불러오기와 영상 기능만 씁니다. 인텔용 ffmpeg는 `GPU (Apple)` 설정을 거부하므로 영상은 `CPU`로 만듭니다. 시험하지 않았습니다 |
