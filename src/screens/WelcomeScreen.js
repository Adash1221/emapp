// CHANGED: Use specific imports for CLI compatibility
import FontAwesome5 from "react-native-vector-icons/FontAwesome5";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";

import {
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function WelcomeScreen({ navigation }) {
  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <View style={styles.header}>
        <Text style={styles.title}>Emergency Network</Text>
        <Text style={styles.subtitle}>Choose your role to continue</Text>
      </View>

      <View style={styles.buttonContainer}>
        {/* PATIENT BUTTON */}
        <TouchableOpacity
          style={[styles.card, styles.patientCard]}
          onPress={() => navigation.navigate("Signup", { role: "patient" })}
          activeOpacity={0.7}
        >
          <FontAwesome5 name="user-injured" size={24} color="#dc2626" />
          <Text style={styles.cardTitle}>Patient</Text>
          <Text style={styles.cardDesc}>
            Request emergency help and track ambulances in real-time.
          </Text>
        </TouchableOpacity>

        {/* HOSPITAL BUTTON */}
        <TouchableOpacity
          style={[styles.card, styles.hospitalCard]}
          onPress={() => navigation.navigate("Signup", { role: "hospital" })}
          activeOpacity={0.7}
        >
          <FontAwesome5 name="hospital-alt" size={24} color="#2563eb" />
          <Text style={styles.cardTitle}>Hospital</Text>
          <Text style={styles.cardDesc}>
            Manage emergency alerts and dispatch teams.
          </Text>
        </TouchableOpacity>

        {/* DRIVER BUTTON */}
        <TouchableOpacity
          style={[styles.card, styles.driverCard]}
          onPress={() => navigation.navigate("Signup", { role: "driver" })}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="ambulance" size={28} color="#1e293b" />
          <Text style={styles.cardTitle}>Ambulance Driver</Text>
          <Text style={styles.cardDesc}>
            Receive missions and navigate to patients.
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Already have an account? Login as:
        </Text>
        <View style={styles.loginLinksRow}>
          <TouchableOpacity
            onPress={() => navigation.navigate("Login", { role: "patient" })}
          >
            <Text style={styles.loginAction}>Patient</Text>
          </TouchableOpacity>
          <Text style={styles.divider}>|</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate("Login", { role: "hospital" })}
          >
            <Text style={styles.loginAction}>Hospital</Text>
          </TouchableOpacity>
          <Text style={styles.divider}>|</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate("Login", { role: "driver" })}
          >
            <Text style={styles.loginAction}>Driver</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#fff",
    padding: 25,
    paddingTop: Platform.OS === "ios" ? 80 : 60,
    paddingBottom: 40,
  },
  header: { alignItems: "center", marginBottom: 40 },
  title: { fontSize: 32, fontWeight: "bold", color: "#dc2626" },
  subtitle: {
    fontSize: 16,
    color: "#64748b",
    textAlign: "center",
    marginTop: 10,
  },
  buttonContainer: {
    // Note: 'gap' works in RN 0.71+. If on older version, use marginBottom on cards instead.
    gap: 15,
    marginBottom: 30,
  },
  card: { padding: 22, borderRadius: 24, borderWidth: 1, elevation: 4 },
  patientCard: { backgroundColor: "#fef2f2", borderColor: "#fecaca" },
  hospitalCard: { backgroundColor: "#eff6ff", borderColor: "#bfdbfe" },
  driverCard: { backgroundColor: "#f8fafc", borderColor: "#e2e8f0" },
  cardTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1e293b",
    marginTop: 10,
    marginBottom: 5,
  },
  cardDesc: { fontSize: 14, color: "#475569" },
  footer: { alignItems: "center", marginTop: "auto" },
  footerText: { color: "#64748b", fontSize: 14, marginBottom: 12 },
  loginLinksRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  loginAction: {
    color: "#dc2626",
    fontWeight: "bold",
    fontSize: 15,
    paddingHorizontal: 5,
  },
  divider: { marginHorizontal: 5, color: "#cbd5e1", fontSize: 18 },
});
