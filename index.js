import messaging from "@react-native-firebase/messaging";
import { AppRegistry, LogBox } from "react-native";
import App from "./App";
import { displayNotification } from "./src/services/notificationService";

// ⚠️ CRITICAL: Listen for messages when App is KILLED/CLOSED
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  console.log("💀 Background/Killed Message:", remoteMessage);

  // If it's our special "Data-Only" message, manually show the popup
  if (remoteMessage.data?.isNotifee === "true") {
    await displayNotification(
      remoteMessage.data.notifee_title,
      remoteMessage.data.notifee_body,
    );
  }
});

console.log("✅✅✅ INDEX.JS IS WORKING ✅✅✅");
LogBox.ignoreAllLogs();

// Registers the app (Keep "main" if that matches your setup)
AppRegistry.registerComponent("main", () => App);
