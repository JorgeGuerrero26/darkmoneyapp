const fs = require("fs");
const path = require("path");
const {
  AndroidConfig,
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withMainApplication,
} = require("@expo/config-plugins");

const { getMainApplicationOrThrow } = AndroidConfig.Manifest;

const MODULE_PACKAGE = "com.darkmoney.app.notificationdetection";

function addPermission(manifest, permission) {
  manifest.manifest["uses-permission"] = manifest.manifest["uses-permission"] ?? [];
  const exists = manifest.manifest["uses-permission"].some((item) => item.$?.["android:name"] === permission);
  if (!exists) manifest.manifest["uses-permission"].push({ $: { "android:name": permission } });
}

function upsertApplicationChild(application, tag, androidName, value) {
  application[tag] = application[tag] ?? [];
  const existing = application[tag].find((item) => item.$?.["android:name"] === androidName);
  if (existing) {
    existing.$ = { ...existing.$, ...value.$ };
    if (value["intent-filter"]) existing["intent-filter"] = value["intent-filter"];
    return;
  }
  application[tag].push(value);
}

function withNotificationDetectionManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    addPermission(manifest, "android.permission.POST_NOTIFICATIONS");
    addPermission(manifest, "android.permission.SYSTEM_ALERT_WINDOW");
    addPermission(manifest, "android.permission.WAKE_LOCK");
    addPermission(manifest, "android.permission.RECEIVE_BOOT_COMPLETED");
    addPermission(manifest, "android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS");

    const application = getMainApplicationOrThrow(manifest);

    upsertApplicationChild(application, "service", ".notificationdetection.DarkMoneyNotificationListenerService", {
      $: {
        "android:name": ".notificationdetection.DarkMoneyNotificationListenerService",
        "android:label": "@string/notification_detection_service_name",
        "android:exported": "false",
        "android:stopWithTask": "false",
        "android:permission": "android.permission.BIND_NOTIFICATION_LISTENER_SERVICE",
      },
      "intent-filter": [{ action: [{ $: { "android:name": "android.service.notification.NotificationListenerService" } }] }],
    });
    upsertApplicationChild(application, "receiver", ".notificationdetection.BootCompletedReceiver", {
      $: {
        "android:name": ".notificationdetection.BootCompletedReceiver",
        "android:exported": "false",
      },
      "intent-filter": [{ action: [
        { $: { "android:name": "android.intent.action.BOOT_COMPLETED" } },
        { $: { "android:name": "android.intent.action.QUICKBOOT_POWERON" } },
      ]}],
    });
    upsertApplicationChild(application, "service", ".notificationdetection.NotificationDetectionSaveTaskService", {
      $: {
        "android:name": ".notificationdetection.NotificationDetectionSaveTaskService",
        "android:exported": "false",
      },
    });
    upsertApplicationChild(application, "receiver", ".notificationdetection.NotificationDetectionActionReceiver", {
      $: {
        "android:name": ".notificationdetection.NotificationDetectionActionReceiver",
        "android:exported": "false",
      },
    });
    upsertApplicationChild(application, "activity", ".notificationdetection.QuickMovementDialogActivity", {
      $: {
        "android:name": ".notificationdetection.QuickMovementDialogActivity",
        "android:theme": "@style/Theme.DarkMoney.QuickMovementDialog",
        "android:excludeFromRecents": "true",
        "android:finishOnTaskLaunch": "true",
        "android:launchMode": "singleInstance",
        "android:noHistory": "true",
        "android:exported": "false",
        // taskAffinity vacío + singleInstance evita que al lanzar el overlay desde la
        // notificación, Android traiga al frente la task de MainActivity (lo cual abría
        // visiblemente la app DarkMoney detrás del overlay).
        "android:taskAffinity": "",
      },
    });
    return config;
  });
}

function withNotificationDetectionSources(config) {
  return withDangerousMod(config, ["android", async (config) => {
    const projectRoot = config.modRequest.projectRoot;
    const sourceRoot = path.join(__dirname, "native-src", "notificationdetection");
    const targetRoot = path.join(projectRoot, "android", "app", "src", "main", "java", "com", "darkmoney", "app", "notificationdetection");
    fs.mkdirSync(targetRoot, { recursive: true });
    for (const file of fs.readdirSync(sourceRoot)) {
      fs.copyFileSync(path.join(sourceRoot, file), path.join(targetRoot, file));
    }

    const drawableRoot = path.join(projectRoot, "android", "app", "src", "main", "res", "drawable");
    fs.mkdirSync(drawableRoot, { recursive: true });
    for (const file of fs.readdirSync(path.join(__dirname, "drawable"))) {
      fs.copyFileSync(path.join(__dirname, "drawable", file), path.join(drawableRoot, file));
    }

    const stringsPath = path.join(projectRoot, "android", "app", "src", "main", "res", "values", "strings.xml");
    if (fs.existsSync(stringsPath)) {
      let strings = fs.readFileSync(stringsPath, "utf8");
      if (!strings.includes("notification_detection_service_name")) {
        strings = strings.replace("</resources>", "  <string name=\"notification_detection_service_name\">Detección automática DarkMoney</string>\n</resources>");
        fs.writeFileSync(stringsPath, strings);
      }
    }

    const stylesPath = path.join(projectRoot, "android", "app", "src", "main", "res", "values", "styles.xml");
    if (fs.existsSync(stylesPath)) {
      let styles = fs.readFileSync(stylesPath, "utf8");
      if (!styles.includes("Theme.DarkMoney.QuickMovementDialog")) {
        styles = styles.replace("</resources>", `  <style name="Theme.DarkMoney.QuickMovementDialog" parent="@android:style/Theme.Material.Dialog.NoActionBar">
    <item name="android:windowMinWidthMajor">88%</item>
    <item name="android:windowMinWidthMinor">88%</item>
    <item name="android:windowIsTranslucent">true</item>
    <item name="android:windowIsFloating">true</item>
    <item name="android:windowNoTitle">true</item>
    <item name="android:windowBackground">@android:color/transparent</item>
    <item name="android:backgroundDimEnabled">true</item>
    <item name="android:backgroundDimAmount">0.42</item>
    <item name="android:windowAnimationStyle">@null</item>
    <item name="android:colorAccent">#6BE4C5</item>
  </style>
</resources>`);
        fs.writeFileSync(stylesPath, styles);
      }
    }

    return config;
  }]);
}

// EncryptedSharedPreferences (NotificationDetectionStore) requiere androidx security-crypto.
const SECURITY_CRYPTO_DEPENDENCY = 'implementation("androidx.security:security-crypto:1.1.0-alpha06")';

function withNotificationDetectionGradleDeps(config) {
  return withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;
    if (!contents.includes("androidx.security:security-crypto")) {
      contents = contents.replace(
        /dependencies \{/,
        `dependencies {\n    ${SECURITY_CRYPTO_DEPENDENCY}`,
      );
      config.modResults.contents = contents;
    }
    return config;
  });
}

function withNotificationDetectionPackage(config) {
  return withMainApplication(config, (config) => {
    let contents = config.modResults.contents;
    if (!contents.includes(`${MODULE_PACKAGE}.NotificationDetectionPackage`)) {
      contents = contents.replace(
        "import com.facebook.react.defaults.DefaultReactNativeHost",
        `import com.facebook.react.defaults.DefaultReactNativeHost\nimport ${MODULE_PACKAGE}.NotificationDetectionPackage`,
      );
    }
    if (!contents.includes("add(NotificationDetectionPackage())")) {
      contents = contents.replace(
        "PackageList(this).packages.apply {",
        "PackageList(this).packages.apply {\n              add(NotificationDetectionPackage())",
      );
    }
    config.modResults.contents = contents;
    return config;
  });
}

module.exports = function withNotificationDetection(config) {
  config = withNotificationDetectionManifest(config);
  config = withNotificationDetectionSources(config);
  config = withNotificationDetectionGradleDeps(config);
  config = withNotificationDetectionPackage(config);
  return config;
};
