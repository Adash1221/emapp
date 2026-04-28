import * as Location from "expo-location";
import {
  collection,
  doc,
  increment,
  onSnapshot,
  query,
  runTransaction,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import MaterialIcons from "react-native-vector-icons/MaterialIcons";
import { WebView } from "react-native-webview";

import {
  displayNotification,
  sendPushNotification,
} from "../services/notificationService";
import { auth, db } from "./firebaseConfig";

export default function AmbulanceDriver({ navigation }) {
  const [activeMission, setActiveMission] = useState(null);
  const [myLocation, setMyLocation] = useState(null);

  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: "",
    message: "",
    type: "info",
    buttonText: "OK",
    onConfirm: null,
  });

  const activeMissionIdRef = useRef(null);
  const webViewRef = useRef(null);
  const ignoredAlertsRef = useRef([]);

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
        var map = L.map('map').setView([0, 0], 13);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        var driverMarker = null; var patientMarker = null; var routeLine = null;
        var redIcon = new L.Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41] });
        var blueIcon = new L.Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41] });

        function updateDriver(lat, lng) {
          if (driverMarker) { driverMarker.setLatLng([lat, lng]); } 
          else { driverMarker = L.marker([lat, lng], {icon: blueIcon}).addTo(map).bindPopup("<b>UNIT 1</b>").openPopup(); map.setView([lat, lng], 15); }
          updateRoute();
        }
        function setPatient(lat, lng) {
          if (patientMarker) map.removeLayer(patientMarker);
          patientMarker = L.marker([lat, lng], {icon: redIcon}).addTo(map).bindPopup("<b>PATIENT</b>").openPopup();
          updateRoute();
        }
        function updateRoute() {
          if (driverMarker && patientMarker) {
            var latlngs = [driverMarker.getLatLng(), patientMarker.getLatLng()];
            if (routeLine) map.removeLayer(routeLine);
            routeLine = L.polyline(latlngs, {color: '#2563eb', weight: 5, dashArray: '10, 10'}).addTo(map);
            map.fitBounds(routeLine.getBounds(), {padding: [50, 50]});
          }
        }
      </script>
    </body>
    </html>
  `;

  // 1. Force driver to be always online when the component mounts
  useEffect(() => {
    const setDriverOnline = async () => {
      const user = auth.currentUser;
      if (user) {
        try {
          await updateDoc(doc(db, "drivers", user.uid), { isOnline: true });
        } catch (e) {
          console.log("Error setting driver online:", e);
        }
      }
    };
    setDriverOnline();
  }, []);

  // 2. Listen for alerts and track location 24/7
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const q = query(
      collection(db, "alerts"),
      where("targetDriverId", "in", [user.uid, "broadcast_all"]),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const data = change.doc.data();
        if (change.doc.metadata.hasPendingWrites) return;

        if (
          change.type === "added" &&
          data.status === "pending" &&
          !activeMissionIdRef.current &&
          !ignoredAlertsRef.current.includes(change.doc.id)
        ) {
          displayNotification(
            "🚨 DISPATCH SIGNAL",
            `Emergency nearby: ${data.condition}`,
          );
        }
      });

      const mission = snapshot.docs.find((d) => {
        const status = d.data().status;
        return (
          (status === "pending" || status === "dispatched") &&
          !ignoredAlertsRef.current.includes(d.id)
        );
      });

      if (mission) {
        const data = { id: mission.id, ...mission.data() };
        setActiveMission(data);
        activeMissionIdRef.current = data.id;

        if (data.coords) {
          setTimeout(() => {
            webViewRef.current?.injectJavaScript(
              `setPatient(${data.coords.latitude}, ${data.coords.longitude});`,
            );
          }, 1000);
        }
      } else {
        setActiveMission(null);
        activeMissionIdRef.current = null;
      }
    });

    const startTracking = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 10 },
        (location) => {
          setMyLocation(location.coords);
          webViewRef.current?.injectJavaScript(
            `updateDriver(${location.coords.latitude}, ${location.coords.longitude});`,
          );

          if (activeMissionIdRef.current) {
            updateDoc(doc(db, "alerts", activeMissionIdRef.current), {
              driverCoords: {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
              },
            });
          }
          if (user) {
            updateDoc(doc(db, "drivers", user.uid), {
              coords: {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
              },
            });
          }
        },
      );
    };

    startTracking();
    return () => unsubscribe();
  }, []);

  const acceptMission = async () => {
    if (!activeMission) return;
    const alertRef = doc(db, "alerts", activeMission.id);
    const user = auth.currentUser;

    try {
      await runTransaction(db, async (transaction) => {
        const alertDoc = await transaction.get(alertRef);
        if (!alertDoc.exists()) throw new Error("Alert cancelled.");
        if (alertDoc.data().status !== "pending")
          throw new Error("ALREADY_ACCEPTED");

        transaction.update(alertRef, {
          status: "dispatched",
          assignedDriverId: user.uid,
          driverName: "Emergency Unit",
          driverPhone: "Active Number",
          licensePlate: "Dispatched",
        });
      });

      if (activeMission.fcmToken) {
        await sendPushNotification(
          activeMission.fcmToken,
          "🚑 UNIT EN ROUTE",
          "An ambulance has accepted your SOS and is moving towards you.",
        );
      }
    } catch (e) {
      if (e.message === "ALREADY_ACCEPTED") {
        showAlert(
          "Too Late",
          "Another unit already took this mission.",
          "warning",
          "OK",
        );
        setActiveMission(null);
      } else {
        showAlert(
          "Network Error",
          "Failed to accept mission.",
          "error",
          "Try Again",
        );
      }
    }
  };

  const rejectMission = async () => {
    if (!activeMission) return;

    ignoredAlertsRef.current.push(activeMission.id);
    const currentMissionId = activeMission.id;
    const wasManuallyAssigned =
      activeMission.targetDriverId === auth.currentUser?.uid;

    setActiveMission(null);
    activeMissionIdRef.current = null;

    if (wasManuallyAssigned) {
      try {
        await updateDoc(doc(db, "alerts", currentMissionId), {
          targetDriverId: "broadcast_all",
        });
      } catch (e) {
        console.log("Failed to re-broadcast");
      }
    }
  };

  const completeMission = async () => {
    if (!activeMission) return;
    try {
      await updateDoc(doc(db, "alerts", activeMission.id), {
        status: "completed",
      });
      setActiveMission(null);
      showAlert(
        "Mission Accomplished",
        "Emergency log closed safely.",
        "success",
        "Great Job",
      );
    } catch (error) {
      showAlert(
        "Error",
        "Could not finalize the mission.",
        "error",
        "Try Again",
      );
    }
  };

  // --- 🚀 NEW: DRIVER SIDE FAKE ALERT REPORTING ---
  const confirmFakeAlert = () => {
    Alert.alert(
      "Report Fake Alarm?",
      "Are you sure this is a fake emergency? This will close the mission and penalize the patient.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Report Fake", style: "destructive", onPress: markAsFake },
      ],
    );
  };

  const markAsFake = async () => {
    if (!activeMission) return;
    const missionId = activeMission.id;
    const patientId = activeMission.patientId;

    try {
      // 1. Mark alert as fake (Hospital is listening for this and will be notified automatically)
      await updateDoc(doc(db, "alerts", missionId), {
        status: "flagged_fake",
      });

      // 2. Safely add a strike to the patient's record
      if (patientId) {
        try {
          await updateDoc(doc(db, "patients", patientId), {
            falseAlarmCount: increment(1),
          });
        } catch (e) {
          console.log("Could not update patient strike count", e);
        }
      }

      // 3. Clear mission from driver screen
      setActiveMission(null);
      activeMissionIdRef.current = null;
      showAlert(
        "Reported",
        "The false alarm has been recorded and the hospital has been notified.",
        "success",
        "OK",
      );
    } catch (e) {
      showAlert("Error", "Could not report fake alarm.", "error", "OK");
    }
  };

  const handleCallPatient = async () => {
    const phoneNumber =
      activeMission?.patientPhone ||
      activeMission?.medicalData?.emergencyContact;
    if (!phoneNumber || phoneNumber === "N/A")
      return showAlert(
        "No Number",
        "Patient did not provide a phone number.",
        "warning",
        "OK",
      );

    const url = `tel:${phoneNumber}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        showAlert(
          "Emulator Detected",
          `Cannot open dialer on an emulator.\n\nPatient Number: ${phoneNumber}`,
          "info",
          "Got it",
        );
      }
    } catch (e) {
      showAlert("Error", "Could not open dialer.", "error", "OK");
    }
  };

  const handleNavigate = () => {
    if (!activeMission?.coords) return;
    const { latitude, longitude } = activeMission.coords;
    const url =
      Platform.OS === "ios"
        ? `maps:0,0?q=${latitude},${longitude}`
        : `google.navigation:q=${latitude},${longitude}`;
    Linking.openURL(url);
  };

  const handleLogout = async () => {
    const user = auth.currentUser;
    if (user) {
      try {
        await updateDoc(doc(db, "drivers", user.uid), { isOnline: false });
      } catch (e) {
        console.log("Error setting driver offline:", e);
      }
    }
    navigation.replace("Login");
  };

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent={true}
      />

      <View style={styles.mapContainer}>
        <WebView
          ref={webViewRef}
          originWhitelist={["*"]}
          source={{ html: leafletHtml }}
          style={styles.map}
        />
      </View>

      <View style={styles.topBar}>
        <View>
          <Text style={styles.panelTitle}>Unit Dispatch</Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              marginTop: 4,
            }}
          >
            <MaterialIcons
              name="fiber_manual_record"
              size={12}
              color="#10b981"
            />
            <Text
              style={{
                color: "#10b981",
                fontSize: 13,
                fontWeight: "bold",
                letterSpacing: 0.5,
              }}
            >
              STANDBY ACTIVE
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>LOGOUT</Text>
          <Ionicons name="log-out" size={20} color="#f87171" />
        </TouchableOpacity>
      </View>

      {activeMission ? (
        <View style={styles.bottomCard}>
          <View style={styles.pullTab} />
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.pName}>{activeMission.patientName}</Text>
              <Text style={styles.pSub}>
                Reported:{" "}
                <Text style={{ color: "#ef4444", fontWeight: "900" }}>
                  {activeMission.condition.toUpperCase()}
                </Text>
              </Text>

              {activeMission.medicalData && (
                <View style={styles.medicalBlock}>
                  <Text style={styles.medText}>
                    🩸 Blood:{" "}
                    <Text style={{ fontWeight: "bold", color: "#1e293b" }}>
                      {activeMission.medicalData.bloodType}
                    </Text>
                  </Text>
                  <Text style={styles.medText}>
                    ⚠️ Allergy:{" "}
                    <Text style={{ fontWeight: "bold", color: "#1e293b" }}>
                      {activeMission.medicalData.allergies}
                    </Text>
                  </Text>
                  <Text style={styles.medText}>
                    ⚕️ Notes:{" "}
                    <Text style={{ fontWeight: "bold", color: "#1e293b" }}>
                      {activeMission.medicalData.notes}
                    </Text>
                  </Text>
                </View>
              )}
            </View>
          </View>

          <TouchableOpacity
            style={styles.callActionBtn}
            onPress={handleCallPatient}
          >
            <Ionicons name="call" size={20} color="white" />
            <Text style={styles.callActionText}>CONTACT PATIENT</Text>
          </TouchableOpacity>

          {activeMission.status === "pending" ? (
            <View style={styles.btnRow}>
              <TouchableOpacity
                style={styles.rejectBtn}
                onPress={rejectMission}
              >
                <Ionicons name="close" size={22} color="white" />
                <Text style={styles.navText}>REJECT</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.acceptBtn}
                onPress={acceptMission}
              >
                <Ionicons name="checkmark" size={22} color="white" />
                <Text style={styles.navText}>ACCEPT</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <View style={styles.btnRow}>
                <TouchableOpacity
                  style={styles.navBtn}
                  onPress={handleNavigate}
                >
                  <Ionicons name="navigate" size={20} color="white" />
                  <Text style={styles.navText}>NAVIGATE</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.doneBtn}
                  onPress={completeMission}
                >
                  <Ionicons name="checkmark-done" size={22} color="white" />
                  <Text style={styles.navText}>COMPLETE</Text>
                </TouchableOpacity>
              </View>

              {/* 🚀 NEW FAKE ALARM BUTTON FOR DRIVERS EN ROUTE */}
              <TouchableOpacity
                style={styles.fakeBtn}
                onPress={confirmFakeAlert}
              >
                <Ionicons name="warning" size={20} color="white" />
                <Text style={styles.navText}>REPORT FAKE ALARM</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.bottomCard}>
          <View style={styles.pullTab} />
          <View style={{ alignItems: "center", marginBottom: 20 }}>
            <View style={styles.radarCircle}>
              <MaterialCommunityIcons name="radar" size={50} color="#2563eb" />
            </View>
            <Text style={styles.idleTitle}>Awaiting Dispatch</Text>
            <Text style={styles.idleSub}>Monitoring local SOS signals...</Text>
          </View>
        </View>
      )}

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
  mapContainer: { ...StyleSheet.absoluteFillObject },
  map: { flex: 1 },

  topBar: {
    paddingTop: 60,
    paddingHorizontal: 25,
    paddingBottom: 25,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#0f172a",
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    elevation: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    zIndex: 10,
  },
  panelTitle: {
    color: "white",
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  logoutText: {
    color: "#f87171",
    fontWeight: "bold",
    fontSize: 12,
    marginRight: 6,
    letterSpacing: 0.5,
  },

  bottomCard: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    backgroundColor: "white",
    paddingHorizontal: 30,
    paddingBottom: 40,
    paddingTop: 15,
    borderTopLeftRadius: 35,
    borderTopRightRadius: 35,
    elevation: 25,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
  },
  pullTab: {
    width: 40,
    height: 5,
    backgroundColor: "#cbd5e1",
    borderRadius: 3,
    alignSelf: "center",
    marginBottom: 20,
  },
  radarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#dbeafe",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
  },
  idleTitle: { fontSize: 24, fontWeight: "bold", color: "#1e293b" },
  idleSub: { color: "#64748b", marginTop: 5 },

  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 5,
  },
  pName: { fontSize: 28, fontWeight: "900", color: "#1e293b" },
  pSub: { fontSize: 14, color: "#64748b", marginTop: 2, letterSpacing: 0.5 },
  medicalBlock: {
    marginTop: 12,
    backgroundColor: "#f8fafc",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  medText: { fontSize: 13, color: "#64748b", marginBottom: 4 },

  callActionBtn: {
    backgroundColor: "#10b981",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 15,
    marginTop: 10,
    elevation: 4,
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  callActionText: {
    color: "white",
    fontWeight: "900",
    fontSize: 15,
    letterSpacing: 1,
    marginLeft: 8,
  },

  btnRow: { flexDirection: "row", gap: 12 },
  navBtn: {
    flex: 1,
    backgroundColor: "#1e293b",
    padding: 18,
    borderRadius: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  doneBtn: {
    flex: 1,
    backgroundColor: "#0284c7",
    padding: 18,
    borderRadius: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  rejectBtn: {
    flex: 1,
    backgroundColor: "#ef4444",
    padding: 18,
    borderRadius: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    elevation: 3,
  },
  acceptBtn: {
    flex: 1,
    backgroundColor: "#10b981",
    padding: 18,
    borderRadius: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    elevation: 3,
  },

  // 🚀 NEW STYLE FOR FAKE BUTTON
  fakeBtn: {
    backgroundColor: "#f59e0b",
    padding: 16,
    borderRadius: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
    gap: 8,
    elevation: 3,
  },

  navText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 14,
    letterSpacing: 0.5,
  },

  alertOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  alertBox: {
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
  alertTitleTxt: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#1e293b",
    marginBottom: 10,
    textAlign: "center",
  },
  alertMessage: {
    fontSize: 15,
    color: "#64748b",
    textAlign: "center",
    marginBottom: 30,
    lineHeight: 22,
  },
  alertButton: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: "#2563eb",
    alignItems: "center",
  },
  alertButtonText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
});
