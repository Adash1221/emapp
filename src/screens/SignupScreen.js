import { Picker } from "@react-native-picker/picker";
import { signOut } from "firebase/auth";
import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { getFCMToken } from "../services/notificationService";
import { signupUser } from "./authService";
import { auth } from "./firebaseConfig";

export default function SignupScreen({ route, navigation }) {
  const { role = "patient" } = route.params || {};

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [age, setAge] = useState("25");
  const [bloodType, setBloodType] = useState("O+");
  const [condition, setCondition] = useState("");
  const [loading, setLoading] = useState(false);

  // 🚀 CUSTOM ALERT STATE (Added dynamic buttonText)
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: "",
    message: "",
    type: "error",
    buttonText: "OK",
    onConfirm: null,
  });

  const ages = Array.from({ length: 100 }, (_, i) => (i + 1).toString());
  const bloodTypes = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

  // Updated to accept buttonText
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

  const handleSignup = async () => {
    if (!name.trim() || !email.trim() || !password.trim() || !phone.trim()) {
      showAlert(
        "Missing Fields",
        "All required fields must be filled out.",
        "error",
        "Try Again",
      );
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showAlert(
        "Invalid Email",
        "Please enter a valid email address.",
        "error",
        "Try Again",
      );
      return;
    }

    setLoading(true);
    try {
      const isApproved = false; // Forces Admin Verification
      const token = await getFCMToken();

      await signupUser(
        email,
        password,
        name,
        phone,
        role,
        {
          age,
          bloodType,
          condition,
          licensePlate,
          pushToken: token || "",
        },
        isApproved,
      );

      // KICK THEM OUT IMMEDIATELY
      await signOut(auth);

      // Show beautiful success/warning modal with "Go to Login" button
      showAlert(
        "Application Sent",
        "Your account has been created successfully. Please wait for an Admin to review and approve your account before logging in.",
        "warning",
        "Go to Login", // 👈 Dynamic button text!
        () => navigation.replace("Login", { role }),
      );
    } catch (error) {
      let friendlyMessage = "An unexpected error occurred. Please try again.";

      if (error.code === "auth/email-already-in-use") {
        friendlyMessage =
          "This email is already registered. Please log in instead.";
      } else if (error.code === "auth/invalid-email") {
        friendlyMessage = "The email address is badly formatted.";
      } else if (error.code === "auth/weak-password") {
        friendlyMessage = "Your password must be at least 6 characters long.";
      } else if (error.code === "auth/network-request-failed") {
        friendlyMessage =
          "Network error. Please check your internet connection.";
      }

      showAlert("Registration Failed", friendlyMessage, "error", "Try Again");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>
          {role.charAt(0).toUpperCase() + role.slice(1)} Registration
        </Text>

        <TextInput
          placeholder="Full Name or Organization"
          value={name}
          onChangeText={setName}
          style={styles.input}
          placeholderTextColor="#94a3b8"
        />
        <TextInput
          placeholder="Email Address"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          style={styles.input}
          placeholderTextColor="#94a3b8"
        />
        <TextInput
          placeholder="Phone Number"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          style={styles.input}
          placeholderTextColor="#94a3b8"
        />

        {role === "driver" && (
          <TextInput
            placeholder="Ambulance ID / License Plate"
            value={licensePlate}
            onChangeText={setLicensePlate}
            style={styles.input}
            placeholderTextColor="#94a3b8"
          />
        )}

        {role === "patient" && (
          <>
            <Text style={styles.label}>Select Age</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={age}
                onValueChange={(itemValue) => setAge(itemValue)}
                style={styles.picker}
              >
                {ages.map((a) => (
                  <Picker.Item key={a} label={a} value={a} />
                ))}
              </Picker>
            </View>

            <Text style={styles.label}>Select Blood Type</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={bloodType}
                onValueChange={(itemValue) => setBloodType(itemValue)}
                style={styles.picker}
              >
                {bloodTypes.map((t) => (
                  <Picker.Item key={t} label={t} value={t} />
                ))}
              </Picker>
            </View>

            <TextInput
              placeholder="Medical Condition (Optional)"
              value={condition}
              onChangeText={setCondition}
              style={styles.input}
              placeholderTextColor="#94a3b8"
            />
          </>
        )}

        <TextInput
          placeholder="Create Password (min. 6 characters)"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={styles.input}
          placeholderTextColor="#94a3b8"
        />

        <TouchableOpacity
          style={[
            styles.button,
            role === "hospital" && { backgroundColor: "#2563eb" },
            role === "driver" && { backgroundColor: "#1e293b" },
            loading && { opacity: 0.7 },
          ]}
          onPress={handleSignup}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Submit Application</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ marginTop: 25, paddingBottom: 30 }}
        >
          <Text style={styles.backText}>← Return to Login</Text>
        </TouchableOpacity>
      </ScrollView>

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
              {/* 👈 Dynamic Text Renders Here! */}
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
    flexGrow: 1,
    padding: 25,
    justifyContent: "center",
    backgroundColor: "#fff",
    paddingTop: 60,
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    marginBottom: 35,
    textAlign: "center",
    color: "#1e293b",
  },
  label: {
    fontSize: 13,
    color: "#64748b",
    marginBottom: 6,
    marginLeft: 5,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: "#f8fafc",
    padding: 18,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    fontSize: 16,
    color: "#1e293b",
  },
  pickerContainer: {
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
  },
  picker: {
    width: "100%",
    color: "#1e293b",
    ...Platform.select({
      ios: {},
      android: { color: "#1e293b", fontSize: 16 },
    }),
  },
  button: {
    backgroundColor: "#dc2626",
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  buttonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  backText: {
    textAlign: "center",
    color: "#64748b",
    fontWeight: "700",
    fontSize: 15,
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
