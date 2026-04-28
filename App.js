import messaging from "@react-native-firebase/messaging";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useEffect } from "react";

// Import Screens
import AmbulanceDriver from "./src/screens/AmbulanceDriver";
import HospitalDashboard from "./src/screens/HospitalDashboard";
import LoginScreen from "./src/screens/LoginScreen";
import PatientDashboard from "./src/screens/PatientDashboard";
import SelectionScreen from "./src/screens/SelectionScreen";
import SignupScreen from "./src/screens/SignupScreen";
import WelcomeScreen from "./src/screens/WelcomeScreen";

// Import Service
import {
  displayNotification,
  requestUserPermission,
} from "./src/services/notificationService";

const Stack = createNativeStackNavigator();

export default function App() {
  useEffect(() => {
    requestUserPermission();

    // 🕵️ SPY LISTENER: Prints everything it hears
    const unsubscribe = messaging().onMessage(async (remoteMessage) => {
      console.log("\n🕵️ SPY REPORT: Message Received!");
      console.log("👉 FULL DATA:", JSON.stringify(remoteMessage, null, 2));

      // 1. Check for Data-Only (Our New Method)
      if (remoteMessage.data?.isNotifee === "true") {
        console.log("✅ Data-Only detected. Displaying Popup...");
        await displayNotification(
          remoteMessage.data.notifee_title,
          remoteMessage.data.notifee_body,
        );
      }
      // 2. Check for Standard Notification (Fallback)
      else if (remoteMessage.notification) {
        console.log("✅ Standard Notification detected.");
        await displayNotification(
          remoteMessage.notification.title,
          remoteMessage.notification.body,
        );
      }
      // 3. Unknown Format
      else {
        console.log("❌ Message format unknown. No 'isNotifee' tag found.");
      }
    });

    return unsubscribe;
  }, []);

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="Selection" component={SelectionScreen} />
        <Stack.Screen name="Signup" component={SignupScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="PatientDashboard" component={PatientDashboard} />
        <Stack.Screen name="HospitalDashboard" component={HospitalDashboard} />
        <Stack.Screen name="AmbulanceDriver" component={AmbulanceDriver} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
