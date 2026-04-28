import * as Location from "expo-location";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import FontAwesome5 from "react-native-vector-icons/FontAwesome5";
import Ionicons from "react-native-vector-icons/Ionicons";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { WebView } from "react-native-webview";

import {
  getFCMToken,
  sendPushNotification,
} from "../services/notificationService";
import { auth, db } from "./firebaseConfig";

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export default function PatientDashboard({ route, navigation }) {
  const { userData } = route.params || {};

  const [location, setLocation] = useState(null);
  const [sosActive, setSosActive] = useState(false);
  const [currentAlertId, setCurrentAlertId] = useState(null);
  const [alertStatus, setAlertStatus] = useState(null);
  const [assignedDriver, setAssignedDriver] = useState(null);
  const [myToken, setMyToken] = useState(userData?.fcmToken || null);

  const [firstAidInstructions, setFirstAidInstructions] = useState(null);

  const [bloodType, setBloodType] = useState(userData?.bloodType || "");
  const [allergies, setAllergies] = useState(userData?.allergies || "");
  const [medicalNotes, setMedicalNotes] = useState(
    userData?.medicalNotes || "",
  );
  const [emergencyContact, setEmergencyContact] = useState(
    userData?.emergencyContact || "",
  );
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [sosModalVisible, setSosModalVisible] = useState(false);
  const [selectedCondition, setSelectedCondition] =
    useState("General Emergency");
  const [customCondition, setCustomCondition] = useState("");
  const [isDispatching, setIsDispatching] = useState(false);

  // --- FAKE ALERT HANDLER STATE ---
  const [isCountingDown, setIsCountingDown] = useState(false);
  const [countdown, setCountdown] = useState(10);

  const [profileVisible, setProfileVisible] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [alertHistory, setAlertHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: "",
    message: "",
    type: "info",
    buttonText: "OK",
    onConfirm: null,
  });

  const webViewRef = useRef(null);
  const conditions = ["Accident", "Heart Attack", "Fire", "Choking", "Other"];

  const showAlert = (
    title,
    message,
    type = "info",
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

  const leafletHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style> body { margin: 0; } #map { height: 100vh; width: 100vw; } </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map').setView([0, 0], 2);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        var userMarker = null;
        function updateUserLocation(lat, lng) {
          if (userMarker) { userMarker.setLatLng([lat, lng]); } 
          else {
            userMarker = L.marker([lat, lng]).addTo(map).bindPopup("You are here").openPopup();
            map.setView([lat, lng], 15);
          }
        }
      </script>
    </body>
    </html>
  `;

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 10 },
        (loc) => {
          setLocation(loc.coords);
          webViewRef.current?.injectJavaScript(
            `updateUserLocation(${loc.coords.latitude}, ${loc.coords.longitude});`,
          );
        },
      );
      const freshToken = await getFCMToken();
      if (freshToken) setMyToken(freshToken);
    })();
  }, []);

  // --- COUNTDOWN TIMER LOGIC ---
  useEffect(() => {
    let timer;
    if (isCountingDown && countdown > 0) {
      timer = setTimeout(() => setCountdown((prev) => prev - 1), 1000);
    } else if (isCountingDown && countdown === 0) {
      setIsCountingDown(false);
      executeDispatch(); // Auto-fire when timer hits 0
    }
    return () => clearTimeout(timer);
  }, [isCountingDown, countdown]);

  useEffect(() => {
    if (!currentAlertId) return;
    const alertRef = doc(db, "alerts", currentAlertId);

    const unsubscribe = onSnapshot(alertRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setAlertStatus(data.status);
        if (data.firstAidInstructions)
          setFirstAidInstructions(data.firstAidInstructions);
        if (data.assignedDriverId) {
          setAssignedDriver({
            name: data.driverName,
            plate: data.licensePlate,
            phone: data.driverPhone,
          });
        }
      } else {
        showAlert(
          "Mission Complete",
          "The emergency log was closed.",
          "success",
          "Great",
        );
        resetState();
      }
    });
    return () => unsubscribe();
  }, [currentAlertId]);

  const resetState = () => {
    setSosActive(false);
    setCurrentAlertId(null);
    setAlertStatus(null);
    setAssignedDriver(null);
    setFirstAidInstructions(null);
    setIsCountingDown(false);
    setCountdown(10);
  };

  const openSosModal = async () => {
    if (!location)
      return showAlert("Wait", "Acquiring GPS Signal...", "warning", "OK");

    // --- ANTI-PRANK BAN CHECK ---
    try {
      const patientRef = doc(db, "patients", auth.currentUser.uid);
      const patientSnap = await getDoc(patientRef);
      if (patientSnap.exists() && patientSnap.data().falseAlarmCount >= 3) {
        return showAlert(
          "Access Suspended",
          "Your SOS feature is permanently blocked due to multiple false alarm reports.",
          "error",
          "Understood",
        );
      }
    } catch (e) {
      console.log("Error checking ban status", e);
    }

    setSosModalVisible(true);
  };

  // Starts the 10-second grace period
  const startCountdown = () => {
    setSosModalVisible(false);
    setCountdown(10);
    setIsCountingDown(true);
  };

  // Cancels the grace period
  const abortCountdown = () => {
    setIsCountingDown(false);
    setCountdown(10);
    showAlert("Aborted", "Emergency alert cancelled securely.", "info", "OK");
  };

  // The actual Firebase Dispatch (Moved from confirmSOS)
  const executeDispatch = async () => {
    setIsDispatching(true);
    setSosActive(true);
    setAlertStatus("pending");

    const finalCondition =
      selectedCondition === "Other"
        ? customCondition || "Unknown Emergency"
        : selectedCondition;

    try {
      const hSnap = await getDocs(collection(db, "hospitals"));
      let nearestHospital = null;
      let minHDist = Infinity;
      hSnap.forEach((doc) => {
        const data = doc.data();
        if (data.coords && data.coords.latitude && data.coords.longitude) {
          const dist = calculateDistance(
            location.latitude,
            location.longitude,
            data.coords.latitude,
            data.coords.longitude,
          );
          if (dist < minHDist) {
            minHDist = dist;
            nearestHospital = { id: doc.id, ...data };
          }
        }
      });

      const dSnap = await getDocs(
        query(collection(db, "drivers"), where("isOnline", "==", true)),
      );
      let nearestDriver = null;
      let minDDist = Infinity;
      dSnap.forEach((doc) => {
        const data = doc.data();
        if (data.coords && data.coords.latitude && data.coords.longitude) {
          const dist = calculateDistance(
            location.latitude,
            location.longitude,
            data.coords.latitude,
            data.coords.longitude,
          );
          if (dist < minDDist) {
            minDDist = dist;
            nearestDriver = { id: doc.id, ...data };
          }
        }
      });

      const docRef = await addDoc(collection(db, "alerts"), {
        patientId: auth.currentUser?.uid,
        patientName: userData?.name || "Unknown",
        patientPhone: userData?.phone || "N/A",
        condition: finalCondition,
        status: "pending",
        timestamp: serverTimestamp(),
        coords: { latitude: location.latitude, longitude: location.longitude },
        fcmToken: myToken,
        targetHospitalId: nearestHospital?.id || "broadcast_all",
        targetDriverId: nearestDriver?.id || "broadcast_all",
        medicalData: {
          bloodType: bloodType || "Unknown",
          allergies: allergies || "None recorded",
          notes: medicalNotes || "None",
          emergencyContact: emergencyContact || "None",
        },
      });

      setCurrentAlertId(docRef.id);

      if (nearestDriver?.fcmToken)
        sendPushNotification(
          nearestDriver.fcmToken,
          "🚨 DISPATCH ASSIGNMENT",
          "You are the closest unit to an emergency.",
          { alertId: docRef.id },
        );
      if (nearestHospital?.fcmToken)
        sendPushNotification(
          nearestHospital.fcmToken,
          "🏥 INCOMING PATIENT",
          `Expected arrival from new SOS: ${finalCondition}`,
        );

      setIsDispatching(false);
      showAlert(
        "SOS Sent",
        nearestDriver
          ? `Notified nearest unit (${minDDist.toFixed(1)}km away).`
          : "Alert broadcasted to all units.",
        "success",
        "OK",
      );
    } catch (error) {
      resetState();
      setIsDispatching(false);
      showAlert(
        "Error",
        "Failed to calculate routes and dispatch.",
        "error",
        "Try Again",
      );
    }
  };

  const cancelSOS = async () => {
    if (currentAlertId) {
      try {
        await deleteDoc(doc(db, "alerts", currentAlertId));
      } catch (e) {}
    }
    resetState();
    showAlert("Cancelled", "Alert revoked safely.", "warning", "OK");
  };

  const loadHistory = async () => {
    setHistoryVisible(true);
    setLoadingHistory(true);
    try {
      const q = query(
        collection(db, "alerts"),
        where("patientId", "==", auth.currentUser?.uid),
      );
      const snap = await getDocs(q);
      const history = [];
      snap.forEach((doc) => history.push({ id: doc.id, ...doc.data() }));
      setAlertHistory(history.sort((a, b) => b.timestamp - a.timestamp));
    } catch (error) {}
    setLoadingHistory(false);
  };

  if (!location)
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#dc2626" />
        <Text>Locating...</Text>
      </View>
    );

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="transparent"
        translucent={true}
      />
      <WebView
        ref={webViewRef}
        originWhitelist={["*"]}
        source={{ html: leafletHtml }}
        style={styles.map}
      />

      {/* HEADER */}
      <SafeAreaView style={styles.headerContainer}>
        <View style={styles.glassHeader}>
          <TouchableOpacity
            onPress={() => navigation.replace("Login")}
            style={{ padding: 5 }}
          >
            <Ionicons name="log-out-outline" size={28} color="white" />
          </TouchableOpacity>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              onPress={loadHistory}
              style={styles.visualProfileBtn}
            >
              <MaterialCommunityIcons name="history" size={20} color="white" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setProfileVisible(true)}
              style={styles.visualProfileBtn}
            >
              <FontAwesome5 name="user-md" size={16} color="white" />
              <Text style={styles.visualProfileText}>MY PROFILE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      {/* MAIN ACTION AREA */}
      <View style={styles.bottomContainer}>
        {userData?.isBanned || userData?.falseAlarmCount >= 3 ? (
          <View
            style={[
              styles.sosButton,
              {
                backgroundColor: "#475569",
                borderColor: "rgba(71, 85, 105, 0.3)",
              },
            ]}
          >
            <MaterialCommunityIcons name="cancel" size={50} color="white" />
            <Text
              style={{
                color: "white",
                fontWeight: "bold",
                marginTop: 10,
                textAlign: "center",
              }}
            >
              BANNED
            </Text>
          </View>
        ) : isCountingDown ? (
          /* --- COUNTDOWN GRACE PERIOD UI --- */
          <View style={styles.countdownCard}>
            <Text style={styles.countdownWarning}>SENDING SOS IN</Text>
            <Text style={styles.countdownNumber}>{countdown}</Text>
            <TouchableOpacity
              style={styles.cancelCountdownBtn}
              onPress={abortCountdown}
            >
              <Text style={styles.cancelCountdownText}>CANCEL ALERT</Text>
            </TouchableOpacity>
          </View>
        ) : !sosActive ? (
          <TouchableOpacity
            style={styles.sosButton}
            activeOpacity={0.8}
            onPress={openSosModal}
          >
            <Text style={styles.sosText}>SOS</Text>
            <Text style={styles.sosSub}>PRESS FOR HELP</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.activeAlertCard}>
            <View style={styles.statusRow}>
              <ActivityIndicator
                color="#dc2626"
                animating={alertStatus === "pending" || isDispatching}
              />
              <Text style={styles.alertTitle}>
                {isDispatching
                  ? "ROUTING..."
                  : alertStatus === "dispatched"
                    ? "UNIT DISPATCHED"
                    : "HELP REQUESTED"}
              </Text>
            </View>
            <Text style={styles.alertSub}>
              {alertStatus === "dispatched"
                ? "Ambulance is on the way!"
                : "Waiting for driver acceptance..."}
            </Text>

            {firstAidInstructions && (
              <View style={styles.firstAidBox}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 5,
                  }}
                >
                  <MaterialCommunityIcons
                    name="medical-bag"
                    size={20}
                    color="#0284c7"
                  />
                  <Text style={styles.firstAidTitle}> DO THIS NOW:</Text>
                </View>
                <Text style={styles.firstAidText}>{firstAidInstructions}</Text>
              </View>
            )}

            {assignedDriver && (
              <View style={styles.driverBox}>
                <View style={styles.driverIcon}>
                  <FontAwesome5 name="ambulance" size={20} color="white" />
                </View>
                <View>
                  <Text style={styles.driverName}>{assignedDriver.name}</Text>
                  <Text style={styles.driverPlate}>{assignedDriver.plate}</Text>
                </View>
              </View>
            )}
            <TouchableOpacity style={styles.cancelBtn} onPress={cancelSOS}>
              <Text style={styles.cancelText}>CANCEL ALERT</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* EMERGENCY SELECTION MODAL */}
      <Modal
        visible={sosModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSosModalVisible(false)}
      >
        <View style={styles.bottomSheet}>
          <View style={styles.sheetContent}>
            <Text style={styles.sheetTitle}>What is the emergency?</Text>
            <View style={styles.chipContainer}>
              {conditions.map((cond) => (
                <TouchableOpacity
                  key={cond}
                  style={[
                    styles.chip,
                    selectedCondition === cond && styles.chipActive,
                  ]}
                  onPress={() => setSelectedCondition(cond)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selectedCondition === cond && styles.chipTextActive,
                    ]}
                  >
                    {cond}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {selectedCondition === "Other" && (
              <TextInput
                style={styles.input}
                placeholderTextColor="#94a3b8"
                placeholder="Describe the emergency..."
                value={customCondition}
                onChangeText={setCustomCondition}
              />
            )}
            <Text style={styles.warningText}>
              <Text style={{ fontWeight: "bold", color: "#dc2626" }}>
                WARNING:
              </Text>{" "}
              False emergency alerts will result in a permanent ban.
            </Text>
            <View style={styles.sheetButtons}>
              <TouchableOpacity
                style={styles.sheetBtnCancel}
                onPress={() => setSosModalVisible(false)}
              >
                <Text style={{ color: "#64748b", fontWeight: "bold" }}>
                  CANCEL
                </Text>
              </TouchableOpacity>

              {/* TRIGGER COUNTDOWN INSTEAD OF INSTANT DISPATCH */}
              <TouchableOpacity
                style={styles.sheetBtnConfirm}
                onPress={startCountdown}
              >
                <Text
                  style={{ color: "white", fontWeight: "bold", fontSize: 16 }}
                >
                  DISPATCH HELP
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* PROFILE MODAL */}
      <Modal
        visible={profileVisible}
        animationType="slide"
        onRequestClose={() => setProfileVisible(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: "#f8fafc" }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => setProfileVisible(false)}
              style={{ flexDirection: "row", alignItems: "center" }}
            >
              <Ionicons name="arrow-back" size={24} color="#1e293b" />
              <Text
                style={{ fontWeight: "bold", color: "#1e293b", marginLeft: 5 }}
              >
                BACK
              </Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Medical ID</Text>
            <View style={{ width: 70 }} />
          </View>

          <ScrollView>
            <View style={styles.profileCard}>
              <View style={styles.profileAvatar}>
                <Text
                  style={{ fontSize: 34, color: "white", fontWeight: "bold" }}
                >
                  {userData?.name?.charAt(0) || "U"}
                </Text>
              </View>
              <Text style={styles.pName}>{userData?.name || "Patient"}</Text>
              <Text style={styles.pPhone}>
                {userData?.phone || "No Phone Number"}
              </Text>
            </View>

            <View style={{ paddingHorizontal: 20, marginBottom: 40 }}>
              <Text style={styles.sectionTitle}>Emergency Medical Info</Text>
              <Text style={styles.subText}>
                This information will be sent to the hospital during an SOS.
              </Text>

              <TextInput
                style={styles.inputSmall}
                placeholderTextColor="#94a3b8"
                placeholder="Blood Type (e.g., O+)"
                value={bloodType}
                onChangeText={setBloodType}
              />
              <TextInput
                style={styles.inputSmall}
                placeholderTextColor="#94a3b8"
                placeholder="Allergies (e.g., Penicillin, Peanuts)"
                value={allergies}
                onChangeText={setAllergies}
              />
              <TextInput
                style={styles.inputSmall}
                placeholderTextColor="#94a3b8"
                placeholder="Chronic Illnesses (e.g., Asthma)"
                value={medicalNotes}
                onChangeText={setMedicalNotes}
              />
              <TextInput
                style={styles.inputSmall}
                placeholderTextColor="#94a3b8"
                placeholder="Emergency Contact Phone"
                keyboardType="phone-pad"
                value={emergencyContact}
                onChangeText={setEmergencyContact}
              />

              <TouchableOpacity
                style={styles.saveBtn}
                onPress={async () => {
                  if (!auth.currentUser) return;
                  setIsSavingProfile(true);
                  await updateDoc(doc(db, "patients", auth.currentUser.uid), {
                    bloodType,
                    allergies,
                    medicalNotes,
                    emergencyContact,
                  });
                  setIsSavingProfile(false);
                  showAlert(
                    "Saved",
                    "Medical ID securely updated.",
                    "success",
                    "OK",
                  );
                }}
              >
                <Text style={styles.saveBtnText}>
                  {isSavingProfile ? "SAVING..." : "SAVE MEDICAL ID"}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* HISTORY MODAL */}
      <Modal
        visible={historyVisible}
        animationType="slide"
        onRequestClose={() => setHistoryVisible(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: "#f8fafc" }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => setHistoryVisible(false)}
              style={{ flexDirection: "row", alignItems: "center" }}
            >
              <Ionicons name="arrow-back" size={24} color="#1e293b" />
              <Text
                style={{ fontWeight: "bold", color: "#1e293b", marginLeft: 5 }}
              >
                BACK
              </Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Alert History</Text>
            <View style={{ width: 70 }} />
          </View>

          <View style={{ flex: 1, paddingHorizontal: 20 }}>
            {loadingHistory ? (
              <View
                style={{
                  flex: 1,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <ActivityIndicator size="large" color="#0284c7" />
                <Text style={{ marginTop: 10, color: "#64748b" }}>
                  Loading records...
                </Text>
              </View>
            ) : (
              <FlatList
                data={alertHistory}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingTop: 10, paddingBottom: 40 }}
                ListEmptyComponent={
                  <View style={{ alignItems: "center", marginTop: 50 }}>
                    <MaterialCommunityIcons
                      name="history"
                      size={60}
                      color="#cbd5e1"
                    />
                    <Text
                      style={{ marginTop: 10, color: "#64748b", fontSize: 16 }}
                    >
                      No past emergencies recorded.
                    </Text>
                  </View>
                }
                renderItem={({ item }) => (
                  <View style={styles.historyCard}>
                    <View style={styles.historyCardLeft}>
                      <View
                        style={[
                          styles.historyDot,
                          {
                            backgroundColor:
                              item.status === "flagged_fake"
                                ? "#ef4444"
                                : "#22c55e",
                          },
                        ]}
                      />
                      <View>
                        <Text style={styles.hCondition}>{item.condition}</Text>
                        <Text style={styles.hDate}>
                          {item.timestamp
                            ? new Date(item.timestamp.toDate()).toLocaleString()
                            : "Recent"}
                        </Text>
                      </View>
                    </View>
                    <Text
                      style={[
                        styles.hStatus,
                        {
                          color:
                            item.status === "flagged_fake"
                              ? "#ef4444"
                              : "#22c55e",
                        },
                      ]}
                    >
                      {item.status.toUpperCase()}
                    </Text>
                  </View>
                )}
              />
            )}
          </View>
        </SafeAreaView>
      </Modal>

      <Modal transparent visible={alertConfig.visible} animationType="fade">
        <View style={styles.alertOverlay}>
          <View style={styles.alertBox}>
            <Text style={styles.alertTitleTxt}>{alertConfig.title}</Text>
            <Text style={styles.alertMessage}>{alertConfig.message}</Text>
            <TouchableOpacity style={styles.alertButton} onPress={closeAlert}>
              <Text style={styles.alertButtonText}>
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
  container: { flex: 1, backgroundColor: "#fff" },
  map: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },

  headerContainer: {
    position: "absolute",
    top: 0,
    width: "100%",
    alignItems: "center",
    zIndex: 999,
  },
  glassHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "92%",
    height: 75,
    marginTop: 45,
    backgroundColor: "#0284c7",
    borderRadius: 25,
    paddingHorizontal: 20,
    elevation: 15,
    shadowColor: "#0284c7",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  visualProfileBtn: {
    backgroundColor: "rgba(255,255,255,0.2)",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
  },
  visualProfileText: {
    color: "white",
    fontWeight: "900",
    fontSize: 14,
    marginLeft: 8,
    letterSpacing: 1,
  },

  bottomContainer: {
    position: "absolute",
    bottom: 50,
    width: "100%",
    alignItems: "center",
  },

  // --- NEW COUNTDOWN STYLES ---
  countdownCard: {
    backgroundColor: "rgba(220, 38, 38, 0.95)",
    width: "85%",
    paddingVertical: 35,
    paddingHorizontal: 20,
    borderRadius: 30,
    alignItems: "center",
    elevation: 15,
  },
  countdownWarning: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    letterSpacing: 2,
    marginBottom: 5,
  },
  countdownNumber: {
    color: "white",
    fontSize: 75,
    fontWeight: "900",
    marginBottom: 25,
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 10,
  },
  cancelCountdownBtn: {
    backgroundColor: "white",
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 25,
    elevation: 5,
  },
  cancelCountdownText: {
    color: "#dc2626",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 1,
  },

  sosButton: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "#dc2626",
    justifyContent: "center",
    alignItems: "center",
    elevation: 20,
    borderWidth: 8,
    borderColor: "rgba(220, 38, 38, 0.3)",
  },
  sosText: { fontSize: 40, fontWeight: "900", color: "white" },
  sosSub: {
    fontSize: 12,
    color: "rgba(255,255,255,0.8)",
    fontWeight: "bold",
    marginTop: 5,
  },

  activeAlertCard: {
    backgroundColor: "white",
    width: "90%",
    padding: 25,
    borderRadius: 25,
    alignItems: "center",
    elevation: 15,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 5,
  },
  alertTitle: { fontSize: 22, fontWeight: "bold", color: "#dc2626" },
  alertSub: { fontSize: 16, color: "#64748b", marginBottom: 20 },
  driverBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    width: "100%",
    padding: 15,
    borderRadius: 15,
    marginBottom: 20,
    gap: 15,
  },
  driverIcon: {
    width: 45,
    height: 45,
    borderRadius: 25,
    backgroundColor: "#2563eb",
    justifyContent: "center",
    alignItems: "center",
  },
  driverName: { fontWeight: "bold", fontSize: 16, color: "#1e293b" },
  driverPlate: { color: "#64748b", fontSize: 13 },
  cancelBtn: {
    backgroundColor: "#94a3b8",
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 15,
  },
  cancelText: { color: "white", fontWeight: "bold" },
  firstAidBox: {
    backgroundColor: "#e0f2fe",
    width: "100%",
    padding: 15,
    borderRadius: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#bae6fd",
  },
  firstAidTitle: { fontWeight: "bold", fontSize: 16, color: "#0369a1" },
  firstAidText: {
    fontSize: 14,
    color: "#0c4a6e",
    lineHeight: 20,
    marginTop: 5,
  },
  bottomSheet: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheetContent: {
    backgroundColor: "white",
    padding: 25,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1e293b",
    marginBottom: 20,
  },
  chipContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  chipActive: { backgroundColor: "#fee2e2", borderColor: "#dc2626" },
  chipText: { color: "#475569", fontWeight: "600" },
  chipTextActive: { color: "#dc2626", fontWeight: "bold" },
  input: {
    backgroundColor: "#f8fafc",
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 20,
    color: "#1e293b",
  },
  warningText: {
    fontSize: 12,
    color: "#64748b",
    textAlign: "center",
    marginBottom: 20,
    backgroundColor: "#fef2f2",
    padding: 10,
    borderRadius: 8,
  },
  sheetButtons: { flexDirection: "row", gap: 15 },
  sheetBtnCancel: {
    flex: 1,
    padding: 16,
    borderRadius: 15,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
  },
  sheetBtnConfirm: {
    flex: 2,
    padding: 16,
    borderRadius: 15,
    backgroundColor: "#dc2626",
    alignItems: "center",
  },

  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 20,
    alignItems: "center",
  },
  modalTitle: { fontSize: 20, fontWeight: "bold", color: "#1e293b" },
  profileCard: {
    backgroundColor: "white",
    margin: 20,
    padding: 30,
    borderRadius: 24,
    alignItems: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
  },
  profileAvatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#3b82f6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
    elevation: 5,
  },
  pName: { fontSize: 24, fontWeight: "bold", color: "#1e293b" },
  pPhone: { color: "#64748b", marginTop: 5, fontSize: 16 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1e293b",
    marginBottom: 5,
  },
  subText: { color: "#64748b", fontSize: 13, marginBottom: 20 },
  inputSmall: {
    backgroundColor: "#f1f5f9",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    color: "#1e293b",
    fontSize: 15,
  },
  saveBtn: {
    backgroundColor: "#1e293b",
    padding: 18,
    borderRadius: 15,
    alignItems: "center",
    marginTop: 10,
    elevation: 4,
  },
  saveBtnText: { color: "white", fontWeight: "bold", fontSize: 16 },

  historyCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "white",
    padding: 20,
    borderRadius: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  historyCardLeft: { flexDirection: "row", alignItems: "center", gap: 15 },
  historyDot: { width: 12, height: 12, borderRadius: 6 },
  hCondition: { fontSize: 17, fontWeight: "bold", color: "#1e293b" },
  hDate: { fontSize: 13, color: "#94a3b8", marginTop: 4 },
  hStatus: { fontSize: 12, fontWeight: "900", letterSpacing: 0.5 },

  alertOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "center",
    padding: 20,
  },
  alertBox: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 30,
    alignItems: "center",
  },
  alertTitleTxt: { fontSize: 22, fontWeight: "bold", marginBottom: 10 },
  alertMessage: {
    fontSize: 15,
    color: "#64748b",
    textAlign: "center",
    marginBottom: 30,
  },
  alertButton: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: "#2563eb",
    alignItems: "center",
  },
  alertButtonText: { color: "#fff", fontWeight: "bold" },
});
