import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { getFCMToken } from "../services/notificationService";
import { auth, db } from "./firebaseConfig";

export default function LoginScreen({ route, navigation }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // 🚀 CUSTOM ALERT STATE (With dynamic buttonText)
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: "",
    message: "",
    type: "error",
    buttonText: "OK",
    onConfirm: null,
  });

  const { role } = route.params || { role: "patient" };

  const showAlert = (
    title,
    message,
    type = "error",
    buttonText = "OK",
    onConfirm = null,
  ) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      type,
      buttonText,
      onConfirm,
    });
  };

  const closeAlert = () => {
    const { onConfirm } = alertConfig;
    setAlertConfig({ ...alertConfig, visible: false });
    if (onConfirm) onConfirm();
  };

  const onLogin = async () => {
    if (!email.trim() || !password.trim()) {
      showAlert(
        "Missing Fields",
        "Please enter both your email and password.",
        "error",
        "Try Again",
      );
      return;
    }
    setLoading(true);

    try {
      // 1. Authenticate with Firebase Auth
      const res = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password,
      );

      // 2. Determine Collection based on Role
      let collectionName = "patients";
      let targetScreen = "PatientDashboard";

      if (role === "hospital") {
        collectionName = "hospitals";
        targetScreen = "HospitalDashboard";
      } else if (role === "driver") {
        collectionName = "drivers";
        targetScreen = "AmbulanceDriver";
      }

      // 3. Get User Profile from Firestore
      const userRef = doc(db, collectionName, res.user.uid);
      const userDoc = await getDoc(userRef);

      if (userDoc.exists()) {
        const data = userDoc.data();

        // 🚨 4. THE BOUNCER CHECK
        if (data.isVerified === false) {
          await signOut(auth); // Log them back out immediately
          showAlert(
            "Access Denied",
            "Your account is currently pending verification. Please wait for an Admin to approve your access.",
            "warning",
            "Understood",
          );
          setLoading(false);
          return;
        }

        // 5. Update FCM Token for Notifications
        const token = await getFCMToken();
        if (token) {
          await updateDoc(userRef, { fcmToken: token });
        }

        // 6. Navigate to Dashboard
        navigation.replace(targetScreen, {
          userData: { ...data, uid: res.user.uid, role: role },
        });
      } else {
        await signOut(auth);
        showAlert(
          "Profile Error",
          `No ${role} profile found for this email address. Please make sure you selected the correct role.`,
          "error",
          "Try Again",
        );
      }
    } catch (error) {
      // 🚨 FIREBASE ERROR TRANSLATOR FOR LOGIN
      let friendlyMessage = "An unexpected error occurred. Please try again.";

      if (
        error.code === "auth/invalid-credential" ||
        error.code === "auth/wrong-password" ||
        error.code === "auth/user-not-found"
      ) {
        friendlyMessage = "Incorrect email or password. Please try again.";
      } else if (error.code === "auth/too-many-requests") {
        friendlyMessage =
          "Too many failed login attempts. Please try again later.";
      } else if (error.code === "auth/invalid-email") {
        friendlyMessage = "The email address is badly formatted.";
      } else if (error.code === "auth/network-request-failed") {
        friendlyMessage =
          "Network error. Please check your internet connection.";
      }

      showAlert("Login Failed", friendlyMessage, "error", "Try Again");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {role ? role.charAt(0).toUpperCase() + role.slice(1) : "User"} Login
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Email Address"
        placeholderTextColor="#94a3b8"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#94a3b8"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity
        style={[
          styles.button,
          role === "hospital" && { backgroundColor: "#2563eb" },
          role === "driver" && { backgroundColor: "#1e293b" },
        ]}
        onPress={onLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Secure Login</Text>
        )}
      </TouchableOpacity>

      <View style={styles.footer}>
        <Text style={{ color: "#64748b" }}>Don't have an account? </Text>
        <TouchableOpacity
          onPress={() => navigation.navigate("Signup", { role })}
        >
          <Text
            style={[
              styles.linkText,
              role === "hospital" && { color: "#2563eb" },
            ]}
          >
            Register Here
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={{ marginTop: 30 }}
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.backText}>← Change Role</Text>
      </TouchableOpacity>

      {/* 🚀 CUSTOM ADVANCED MODAL */}
      <Modal transparent visible={alertConfig.visible} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View
              style={[
                styles.iconCircle,
                alertConfig.type === "success"
                  ? styles.iconGreen
                  : alertConfig.type === "warning"
                    ? styles.iconOrange
                    : styles.iconRed,
              ]}
            >
              <Text style={styles.iconText}>
                {alertConfig.type === "success"
                  ? "✓"
                  : alertConfig.type === "warning"
                    ? "!"
                    : "✕"}
              </Text>
            </View>
            <Text style={styles.modalTitle}>{alertConfig.title}</Text>
            <Text style={styles.modalMessage}>{alertConfig.message}</Text>
            <TouchableOpacity
              style={[
                styles.modalButton,
                alertConfig.type === "success"
                  ? styles.btnGreen
                  : alertConfig.type === "warning"
                    ? styles.btnOrange
                    : styles.btnRed,
              ]}
              onPress={closeAlert}
            >
              <Text style={styles.modalButtonText}>
                {alertConfig.buttonText}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 30,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 35,
    textAlign: "center",
    color: "#1e293b",
  },
  input: {
    backgroundColor: "#f8fafc",
    padding: 18,
    borderRadius: 16,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    color: "#1e293b",
    fontSize: 16,
  },
  button: {
    backgroundColor: "#dc2626",
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  buttonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: 25 },
  linkText: { color: "#dc2626", fontWeight: "bold" },
  backText: {
    color: "#64748b",
    textAlign: "center",
    fontSize: 15,
    fontWeight: "600",
  },

  // MODAL STYLES
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalBox: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 30,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  iconGreen: { backgroundColor: "#dcfce7" },
  iconOrange: { backgroundColor: "#fef3c7" },
  iconRed: { backgroundColor: "#fee2e2" },
  iconText: { fontSize: 28, fontWeight: "bold", color: "#fff" },
  modalTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#1e293b",
    marginBottom: 10,
    textAlign: "center",
  },
  modalMessage: {
    fontSize: 15,
    color: "#64748b",
    textAlign: "center",
    marginBottom: 30,
    lineHeight: 22,
  },
  modalButton: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  btnGreen: { backgroundColor: "#10b981" },
  btnOrange: { backgroundColor: "#f59e0b" },
  btnRed: { backgroundColor: "#ef4444" },
  modalButtonText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
});
