import { AppRegistry } from "react-native";

import { notificationDetectionHeadlessTask } from "./lib/notification-detection-headless";
import "expo-router/entry";

AppRegistry.registerHeadlessTask(
  "NotificationDetectionSaveTask",
  () => notificationDetectionHeadlessTask,
);
