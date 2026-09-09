# 构建与发布

## Android 工具链

macOS，以下都不需要 sudo：

```bash
brew install openjdk@17 && brew install --cask android-commandlinetools
```

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
```

```bash
yes | sdkmanager --licenses
```

```bash
sdkmanager --install "platform-tools" "platforms;android-36" "build-tools;36.0.0" "emulator" "system-images;android-36;google_apis;arm64-v8a"
```

## 打 APK

```bash
npx expo prebuild -p android
```

```bash
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
```

`-PreactNativeArchitectures=arm64-v8a` 不能省：不加会打进四个 CPU 架构，
APK 从 62MB 涨到 130MB+，其中一半是模拟器才用的 x86 库。

## 签名

RN 模板默认用 **debug keystore** 签 release——能装，但那是公开密钥，任何人都能签一个
更新覆盖你的应用。

`plugins/withReleaseSigning.js` 是一个 Expo config plugin，每次 prebuild 时把真实
签名配置打进 `android/app/build.gradle`（写成插件是因为 `prebuild --clean` 会重新
生成整个 `android/` 目录）。

生成自己的密钥：

```bash
mkdir -p credentials && keytool -genkeypair -v -storetype PKCS12 \
  -keystore credentials/release.keystore -alias organiclab \
  -keyalg RSA -keysize 2048 -validity 10000
```

然后写 `credentials/keystore.properties`：

```
storeFile=release.keystore
storePassword=...
keyAlias=organiclab
keyPassword=...
```

`credentials/` 已在 `.gitignore` 中。**这个目录丢了就再也无法给已安装的应用发更新**
——Android 要求更新包与原包签名一致。

文件不存在时插件只警告并退回 debug 签名，克隆仓库的人能直接构建成功。

## 模拟器验证（发包前必做）

Node 上的检查覆盖不到 RDKit 真正运行的环境：release 构建是 Hermes 字节码，
WebView 不是浏览器。这个盲区造成过两次只在真机上出现的故障。

```bash
avdmanager create avd -n olab -k "system-images;android-36;google_apis;arm64-v8a" -d pixel_7
```

```bash
emulator -avd olab -no-window -no-audio -gpu swiftshader_indirect &
```

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

最低验收线：

1. 设置页底部「结构引擎（RDKit）」显示**已就绪**
2. 填入 API 信息后「测试连接并保存」能列出模型
3. 对话里问 `standardize this SMILES: C1=CC=CC=C1`，工具条显示「分子已标准化」
   （**不是**「RDKit 不可用」）
4. 逆合成任一目标，路线卡片有「结构通过」且每步下面有结构图
5. `adb shell am force-stop` 后重启，Key 和设置仍在

## 已知陷阱

**worklets 版本冲突。** npm 会解析出与 `expo-modules-core` 不兼容的
`react-native-worklets`，依赖树里标 `invalid` 却照装，直到 NDK 编译才炸。
`package.json` 已钉住版本，升 Expo SDK 时要一起对齐。

换过原生依赖版本后如果报 `libworklets.so ... missing`，是 prefab 缓存里固化了旧的
构建哈希：

```bash
find node_modules -maxdepth 4 -type d -name ".cxx" -exec rm -rf {} +
```

**只删 `.cxx`，不要删 `build/`**——codegen 产物在 `build/` 里。

**`@expo/vector-icons` 需要 `expo-font` 作为直接依赖。** Expo Go 自带，所以开发时
看不出来，正式打包才崩。发版前跑一次 `npx expo-doctor`。

**expo-router 的 typed routes 需要 Metro 跑一次**才会生成 `.expo/types/router.d.ts`。
新增页面后 `tsc` 报路由类型错误，先 `npx expo start` 让它重新生成。
