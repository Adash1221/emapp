import {
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function SelectionScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.container}>
      {/* Ensures the top status bar (time/battery) is visible and dark */}
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.headerTitle}>Emergency Network</Text>
        <Text style={styles.subtitle}>
          Choose your registration type to continue
        </Text>

        {/* Signup Cards */}
        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.card, styles.patientCard]}
          onPress={() => navigation.navigate("Signup", { role: "patient" })}
        >
          <Text style={styles.cardTitle}>Patient</Text>
          <Text style={styles.cardDesc}>
            Request emergency help and track ambulances in real-time.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.card, styles.hospitalCard]}
          onPress={() => navigation.navigate("Signup", { role: "hospital" })}
        >
          <Text style={styles.cardTitle}>Hospital</Text>
          <Text style={styles.cardDesc}>
            Manage emergency alerts, view health data, and dispatch teams.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.card, styles.driverCard]}
          onPress={() => navigation.navigate("Signup", { role: "driver" })}
        >
          <Text style={styles.cardTitle}>Ambulance Driver</Text>
          <Text style={styles.cardDesc}>
            Accept missions, navigate to locations, and save lives.
          </Text>
        </TouchableOpacity>

        {/* Footer Section */}
        <View style={styles.footer}>
          <Text style={styles.alreadyText}>Already have an account?</Text>

          <View style={styles.loginLinksRow}>
            <TouchableOpacity
              onPress={() => navigation.navigate("Login", { role: "patient" })}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 5 }}
            >
              <Text style={styles.loginLinkText}>Patient</Text>
            </TouchableOpacity>

            <Text style={styles.divider}>|</Text>

            <TouchableOpacity
              onPress={() => navigation.navigate("Login", { role: "hospital" })}
              hitSlop={{ top: 10, bottom: 10, left: 5, right: 5 }}
            >
              <Text style={styles.loginLinkText}>Hospital</Text>
            </TouchableOpacity>

            <Text style={styles.divider}>|</Text>

            <TouchableOpacity
              onPress={() => navigation.navigate("Login", { role: "driver" })}
              hitSlop={{ top: 10, bottom: 10, left: 5, right: 10 }}
            >
              <Text style={styles.loginLinkText}>Driver</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    padding: 25,
    justifyContent: "center",
    flexGrow: 1,
    // Add extra padding at the top for Android to avoid the notch if not using SafeAreaView properly
    paddingTop: Platform.OS === "android" ? 20 : 0,
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: "800",
    color: "#dc2626",
    textAlign: "center",
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: "#64748b",
    textAlign: "center",
    marginBottom: 40,
    paddingHorizontal: 20,
  },
  card: {
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 16,
    // Native Shadow for Android
    elevation: 3,
    // Native Shadow for iOS
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  patientCard: {
    backgroundColor: "#fff1f2",
    borderColor: "#fecdd3",
  },
  hospitalCard: {
    backgroundColor: "#f0f9ff",
    borderColor: "#bae6fd",
  },
  driverCard: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1e293b",
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 15,
    color: "#475569",
    lineHeight: 20,
  },
  footer: {
    marginTop: 40,
    alignItems: "center",
    paddingBottom: 20,
  },
  alreadyText: {
    color: "#94a3b8",
    fontSize: 14,
    marginBottom: 12,
  },
  loginLinksRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  loginLinkText: {
    color: "#dc2626",
    fontWeight: "bold",
    fontSize: 16,
    paddingHorizontal: 4,
  },
  divider: {
    marginHorizontal: 8,
    color: "#e2e8f0",
    fontSize: 18,
    fontWeight: "300",
  },
});
