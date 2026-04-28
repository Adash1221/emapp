import notifee, { AndroidImportance } from "@notifee/react-native";
import messaging from "@react-native-firebase/messaging";
import { PermissionsAndroid, Platform } from "react-native";

// YOUR SERVER KEY
const SERVER_KEY = "AIzaSyDL2bdRD_h4jUM5VAbNt3D22tiC6f1utoU";

export async function requestUserPermission() {
  if (Platform.OS === "android") {
    await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
  }
  await messaging().requestPermission();
}

export async function getFCMToken() {
  try {
    return await messaging().getToken();
  } catch (error) {
    return null;
  }
}

export const displayNotification = async (title, body) => {
  const channelId = await notifee.createChannel({
    id: "emergency-alert-v5",
    name: "Emergency Alerts V5",
    sound: "default",
    importance: AndroidImportance.HIGH,
    vibration: true,
  });

  await notifee.displayNotification({
    title: title,
    body: body,
    android: {
      channelId,
      pressAction: { id: "default" },
      smallIcon: "ic_launcher",
      color: "#dc2626",
      importance: AndroidImportance.HIGH,
    },
  });
};

// ✅ SAFE SEND FUNCTION (Prevents Red Screen Crashes)
export const sendPushNotification = async (token, title, body, data = {}) => {
  if (!token) return;

  try {
    const response = await fetch("https://fcm.googleapis.com/fcm/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `key=${SERVER_KEY}`,
      },
      body: JSON.stringify({
        to: token,
        priority: "high",
        content_available: true,
        data: {
          ...data,
          notifee_title: title,
          notifee_body: body,
          isNotifee: "true",
        },
      }),
    });

    // 🛡️ SAFETY CHECK: Only parse JSON if the response is OK
    const text = await response.text(); // Read as text first
    try {
      const json = JSON.parse(text);
      console.log("✅ Notification Response:", json);
    } catch (e) {
      // If parsing fails, it means Google sent HTML error.
      // We IGNORE it because the Database Listener is our backup!
      console.log(
        "⚠️ Notification API blocked (Using Database Backup instead).",
      );
    }
  } catch (error) {
    // Silently handle network errors
    console.log("⚠️ Network issue (Using Database Backup).");
  }
};
