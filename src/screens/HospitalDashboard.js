import * as Location from "expo-location";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  query,
  runTransaction,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import MaterialIcons from "react-native-vector-icons/MaterialIcons";
import { WebView } from "react-native-webview";

import {
  displayNotification,
  sendPushNotification,
} from "../services/notificationService";
import { auth, db } from "./firebaseConfig";

// --- MATH FORMULA: CALCULATES EXACT GPS DISTANCE IN KM ---
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371; // Earth's radius in kilometers
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

const getAutoFirstAid = (condition) => {
  if (!condition)
    return "1. Keep patient calm.\n2. Ensure airway is clear.\n3. Wait for paramedics.";
  const cond = condition.toLowerCase();
  if (cond.includes("heart") || cond.includes("chest")) {
    return "1. Sit patient upright.\n2. Loosen tight clothing.\n3. Assist with nitroglycerin if prescribed.\n4. Be ready for CPR.";
  }
  if (cond.includes("accident") || cond.includes("bleed")) {
    return "1. Apply firm, direct pressure to the wound.\n2. Elevate the limb.\n3. Do not remove soaked bandages; add more on top.";
  }
  if (cond.includes("chok")) {
    return "1. Stand behind them.\n2. Give 5 sharp back blows.\n3. Perform 5 abdominal thrusts (Heimlich).";
  }
  return "1. Assess breathing.\n2. Keep patient warm.\n3. Stay on the line with dispatch.";
};

export default function HospitalDashboard({ navigation }) {
  const [alerts, setAlerts] = useState([]);
  const [availableDrivers, setAvailableDrivers] = useState([]);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [myLocation, setMyLocation] = useState(null);
  const webViewRef = useRef(null);

  const [showFirstAidModal, setShowFirstAidModal] = useState(false);
  const [firstAidText, setFirstAidText] = useState("");
  const [selectedAlertForAid, setSelectedAlertForAid] = useState(null);

  const [profileVisible, setProfileVisible] = useState(false);
  const [hospitalName, setHospitalName] = useState("");
  const [hospitalPhone, setHospitalPhone] = useState("");
  const [hospitalAddress, setHospitalAddress] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: "",
    message: "",
    type: "info",
    buttonText: "OK",
    onConfirm: null,
  });

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

  const loadHospitalProfile = async () => {
    setProfileVisible(true);
    if (auth.currentUser) {
      try {
        const docSnap = await getDoc(
          doc(db, "hospitals", auth.currentUser.uid),
        );
        if (docSnap.exists()) {
          const data = docSnap.data();
          setHospitalName(data.name || "");
          setHospitalPhone(data.phone || "");
          setHospitalAddress(data.location || data.address || "");
        }
      } catch (error) {}
    }
  };

  const openFirstAidModal = (alert) => {
    setSelectedAlertForAid(alert);
    const autoText = getAutoFirstAid(alert.condition);
    setFirstAidText(autoText);
    setShowFirstAidModal(true);
  };

  // --- FAKE ALERT HANDLER LOGIC ---
  const confirmFakeAlert = (alertItem) => {
    Alert.alert(
      "Flag as Fake Emergency?",
      "This will abort the dispatch and issue a strike to the patient. 3 strikes will permanently ban them from the SOS system.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Flag Fake",
          style: "destructive",
          onPress: () => markAsFake(alertItem),
        },
      ],
    );
  };

  const markAsFake = async (alertItem) => {
    try {
      await updateDoc(doc(db, "alerts", alertItem.id), {
        status: "flagged_fake",
      });

      if (alertItem.patientId) {
        try {
          await updateDoc(doc(db, "patients", alertItem.patientId), {
            falseAlarmCount: increment(1),
          });
        } catch (e) {
          console.log("Could not update patient strike count", e);
        }
      }

      showAlert(
        "Prank Flagged",
        "The alert has been removed and the patient received a strike.",
        "success",
        "OK",
      );
    } catch (error) {
      showAlert("Error", "Could not flag the alert.", "error", "OK");
    }
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
        var map = L.map('map').setView([9.0, 38.7], 6);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);

        var hospitalIcon = new L.Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41] });
        var redIcon = new L.Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41] });
        var greenIcon = new L.Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41] });

        var hospitalMarker = null;
        var alertsLayer = L.layerGroup().addTo(map);

        function updateHospitalLocation(lat, lng) {
          if (hospitalMarker) { hospitalMarker.setLatLng([lat, lng]); } 
          else { hospitalMarker = L.marker([lat, lng], {icon: hospitalIcon}).addTo(map).bindPopup("<b>Your Hospital</b>").openPopup(); map.setView([lat, lng], 13); }
        }

        function updateMapMarkers(alertsData) {
          alertsLayer.clearLayers();
          alertsData.forEach(function(alert) {
            if(alert.coords && alert.coords.latitude && alert.coords.longitude) {
               var pMarker = L.marker([alert.coords.latitude, alert.coords.longitude], {icon: redIcon}).bindPopup("<b>" + alert.patientName + "</b><br>Patient Location");
               alertsLayer.addLayer(pMarker);
            }
            if(alert.driverCoords && alert.driverCoords.latitude && alert.driverCoords.longitude) {
               var aMarker = L.marker([alert.driverCoords.latitude, alert.driverCoords.longitude], {icon: greenIcon}).bindPopup("<b>" + (alert.driverName || "Ambulance") + "</b><br>Responding Unit");
               alertsLayer.addLayer(aMarker);
            }
          });
        }
      </script>
    </body>
    </html>
  `;

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted")
        return showAlert(
          "Permission Denied",
          "Allow location services to see local emergencies.",
          "error",
          "Understood",
        );

      await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 10 },
        (loc) => {
          setMyLocation(loc.coords);
          webViewRef.current?.injectJavaScript(
            `updateHospitalLocation(${loc.coords.latitude}, ${loc.coords.longitude});`,
          );

          // Update hospital GPS in Firebase
          if (auth.currentUser) {
            updateDoc(doc(db, "hospitals", auth.currentUser.uid), {
              coords: {
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
              },
            }).catch((e) => console.log("Could not update hospital coords", e));
          }
        },
      );
    })();
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const q = query(
      collection(db, "alerts"),
      where("targetHospitalId", "in", [user.uid, "broadcast_all"]),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.doc.metadata.hasPendingWrites) return;
        const data = change.doc.data();
        if (change.type === "added" && data.status === "pending")
          displayNotification(
            "🚨 INCOMING PATIENT",
            `Expected arrival: ${data.condition || "Emergency"}`,
          );

        if (change.type === "modified" && data.status === "flagged_fake")
          showAlert(
            "Alert Cancelled",
            `An alert for ${data.patientName} was flagged as fake.`,
            "warning",
            "Dismiss",
          );
      });

      const newAlerts = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter(
          (alert) =>
            !["resolved", "completed", "flagged_fake"].includes(alert.status),
        )
        .sort(
          (a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0),
        );

      setAlerts(newAlerts);
      setLoading(false);

      if (webViewRef.current)
        webViewRef.current.injectJavaScript(
          `updateMapMarkers(${JSON.stringify(newAlerts)});`,
        );
    });

    return () => unsubscribe();
  }, []);

  const sendFirstAid = async () => {
    if (!firstAidText.trim() || !selectedAlertForAid) return;
    try {
      await updateDoc(doc(db, "alerts", selectedAlertForAid.id), {
        firstAidInstructions: firstAidText,
      });
      if (selectedAlertForAid.fcmToken) {
        await sendPushNotification(
          selectedAlertForAid.fcmToken,
          "⚕️ FIRST AID INSTRUCTIONS",
          "The hospital has sent you immediate instructions. Please read them now.",
        );
      }
      setShowFirstAidModal(false);
      setFirstAidText("");
      showAlert(
        "Sent",
        "Instructions have been transmitted to the patient.",
        "success",
        "OK",
      );
    } catch (e) {
      showAlert("Error", "Failed to send instructions.", "error", "Try Again");
    }
  };

  // --- DISTANCE CALCULATION FOR DRIVER MODAL ---
  const openDispatchModal = async (alert) => {
    setSelectedAlert(alert);
    try {
      const driverQuery = query(
        collection(db, "drivers"),
        where("isOnline", "==", true),
      );
      const snapshot = await getDocs(driverQuery);

      let driversList = [];

      snapshot.docs.forEach((doc) => {
        const dData = doc.data();
        let distance = Infinity;

        // Calculate distance between Patient and Driver
        if (dData.coords && alert.coords) {
          distance = calculateDistance(
            alert.coords.latitude,
            alert.coords.longitude,
            dData.coords.latitude,
            dData.coords.longitude,
          );
        }
        driversList.push({ id: doc.id, ...dData, distance });
      });

      // SORT DRIVERS BY CLOSEST DISTANCE
      driversList.sort((a, b) => a.distance - b.distance);

      setAvailableDrivers(driversList);
      setShowDriverModal(true);
    } catch (e) {
      showAlert(
        "Network Error",
        "Could not fetch online drivers.",
        "error",
        "Try Again",
      );
    }
  };

  // --- FAULT TOLERANT DISPATCH USING TRANSACTIONS ---
  const assignDriver = async (driver) => {
    if (!selectedAlert) return;
    const assignedName = driver.name || "Ambulance Unit";
    const alertRef = doc(db, "alerts", selectedAlert.id);

    try {
      await runTransaction(db, async (transaction) => {
        const alertDoc = await transaction.get(alertRef);
        if (!alertDoc.exists()) throw new Error("Alert no longer exists.");
        if (alertDoc.data().status !== "pending")
          throw new Error("ALREADY_ACCEPTED");

        // Claim the alert so it disappears from other hospitals
        transaction.update(alertRef, {
          status: "dispatched",
          targetHospitalId: auth.currentUser.uid,
          assignedDriverId: driver.uid || driver.id,
          driverName: assignedName,
          driverPhone: driver.phone || "",
          licensePlate: driver.licensePlate || "Emergency Vehicle",
        });
      });

      if (driver.fcmToken)
        await sendPushNotification(
          driver.fcmToken,
          "🚑 MANUAL DISPATCH",
          "Command center has manually assigned you to an emergency.",
          { alertId: selectedAlert.id },
        );
      setShowDriverModal(false);
      showAlert(
        "Dispatch Successful",
        `${assignedName} has been routed to the scene.`,
        "success",
        "Done",
      );
    } catch (e) {
      setShowDriverModal(false);
      if (e.message === "ALREADY_ACCEPTED") {
        showAlert(
          "Too Late",
          "Another facility has already responded to this emergency.",
          "warning",
          "Understood",
        );
      } else {
        showAlert(
          "Dispatch Failed",
          "Network error. Could not assign unit.",
          "error",
          "Try Again",
        );
      }
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent={true}
      />

      <View style={styles.topBar}>
        <View>
          <Text style={styles.panelTitle}>Command Center</Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              marginTop: 4,
            }}
          >
            <MaterialIcons
              name="fiber_manual_record"
              size={10}
              color="#22c55e"
            />
            <Text style={{ color: "#94a3b8", fontSize: 12, fontWeight: "600" }}>
              {myLocation ? "GPS Active" : "Locating..."}
            </Text>
          </View>
        </View>

        <View
          style={{ flexDirection: "column", gap: 12, alignItems: "flex-end" }}
        >
          <TouchableOpacity
            onPress={loadHospitalProfile}
            style={styles.visualProfileBtn}
          >
            <FontAwesome5 name="hospital-alt" size={14} color="white" />
            <Text style={styles.visualProfileText}>PROFILE</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.replace("Login", { role: "hospital" })}
            style={{ flexDirection: "row", alignItems: "center" }}
          >
            <Text
              style={{
                color: "#fca5a5",
                marginRight: 5,
                fontSize: 12,
                fontWeight: "bold",
              }}
            >
              LOGOUT
            </Text>
            <Ionicons name="log-out" size={18} color="#fca5a5" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.mapContainer}>
        <WebView
          ref={webViewRef}
          originWhitelist={["*"]}
          source={{ html: leafletHtml }}
          style={styles.map}
          onLoadEnd={() => {
            if (alerts.length > 0)
              webViewRef.current?.injectJavaScript(
                `updateMapMarkers(${JSON.stringify(alerts)});`,
              );
            if (myLocation)
              webViewRef.current?.injectJavaScript(
                `updateHospitalLocation(${myLocation.latitude}, ${myLocation.longitude});`,
              );
          }}
        />
      </View>

      <View style={styles.alertsPanel}>
        <Text style={styles.alertsTitle}>
          Incoming ER Patients ({alerts.length})
        </Text>
        {loading ? (
          <ActivityIndicator size="large" color="#2563eb" />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {alerts.length === 0 ? (
              <View style={{ alignItems: "center", marginTop: 30 }}>
                <FontAwesome5
                  name="clipboard-check"
                  size={50}
                  color="#cbd5e1"
                />
                <Text
                  style={{
                    color: "#64748b",
                    textAlign: "center",
                    marginTop: 15,
                    fontSize: 16,
                  }}
                >
                  No active emergencies routed here.
                </Text>
              </View>
            ) : (
              alerts.map((alert) => (
                <View
                  key={alert.id}
                  style={[
                    styles.alertCard,
                    alert.status === "dispatched" && styles.alertCardDispatched,
                  ]}
                >
                  <View style={styles.cardLeft}>
                    <View style={styles.iconBox}>
                      <MaterialCommunityIcons
                        name="ambulance"
                        size={24}
                        color={
                          alert.status === "dispatched" ? "#059669" : "#dc2626"
                        }
                      />
                    </View>
                    <View style={styles.patientInfo}>
                      <Text style={styles.patientName}>
                        {alert.patientName}
                      </Text>
                      <Text style={styles.condition}>{alert.condition}</Text>
                      {alert.medicalData && (
                        <View
                          style={{
                            marginTop: 8,
                            backgroundColor: "#f1f5f9",
                            padding: 8,
                            borderRadius: 8,
                          }}
                        >
                          <Text style={{ fontSize: 10, color: "#475569" }}>
                            🩸 Blood:{" "}
                            <Text style={{ fontWeight: "bold" }}>
                              {alert.medicalData.bloodType}
                            </Text>
                          </Text>
                          <Text style={{ fontSize: 10, color: "#475569" }}>
                            ⚠️ Allergies:{" "}
                            <Text style={{ fontWeight: "bold" }}>
                              {alert.medicalData.allergies}
                            </Text>
                          </Text>
                          <Text style={{ fontSize: 10, color: "#475569" }}>
                            ⚕️ Notes:{" "}
                            <Text style={{ fontWeight: "bold" }}>
                              {alert.medicalData.notes}
                            </Text>
                          </Text>
                          <Text style={{ fontSize: 10, color: "#475569" }}>
                            📞 Contact:{" "}
                            <Text style={{ fontWeight: "bold" }}>
                              {alert.medicalData.emergencyContact}
                            </Text>
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <View style={styles.cardRight}>
                    <TouchableOpacity
                      style={[
                        styles.respondBtn,
                        { backgroundColor: "#0284c7", marginBottom: 5 },
                      ]}
                      onPress={() => openFirstAidModal(alert)}
                    >
                      <Text style={styles.respondText}>FIRST AID</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.respondBtn,
                        { backgroundColor: "#f59e0b", marginBottom: 5 },
                      ]}
                      onPress={() => confirmFakeAlert(alert)}
                    >
                      <Text style={styles.respondText}>FLAG FAKE</Text>
                    </TouchableOpacity>

                    {alert.status === "dispatched" ? (
                      <View style={{ alignItems: "flex-end", marginTop: 5 }}>
                        <View style={styles.dispatchedBadge}>
                          <Text style={styles.dispatchedText}>EN ROUTE</Text>
                        </View>
                        <Text
                          style={{
                            fontSize: 10,
                            color: "#64748b",
                            marginTop: 4,
                          }}
                        >
                          {alert.driverName}
                        </Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[styles.respondBtn, { marginTop: 5 }]}
                        onPress={() => openDispatchModal(alert)}
                      >
                        <Text style={styles.respondText}>OVERRIDE UNIT</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        )}
      </View>

      <Modal
        visible={showFirstAidModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowFirstAidModal(false)}
      >
        <View style={styles.dispatchOverlay}>
          <View style={[styles.dispatchContent, { minHeight: 450 }]}>
            <View style={styles.dispatchHeader}>
              <TouchableOpacity
                onPress={() => setShowFirstAidModal(false)}
                style={styles.backAction}
              >
                <Ionicons name="arrow-back" size={24} color="#1e293b" />
                <Text style={styles.backText}>BACK</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Protocol</Text>
              <View style={{ width: 70 }} />
            </View>

            <Text style={styles.label}>Instructions for:</Text>
            <Text style={styles.conditionHighlight}>
              {selectedAlertForAid?.condition}
            </Text>

            <View style={{ flex: 1 }}>
              <TextInput
                style={styles.visibleInput}
                multiline
                placeholder="Type instructions here..."
                placeholderTextColor="#94a3b8"
                value={firstAidText}
                onChangeText={setFirstAidText}
                textAlignVertical="top"
              />
            </View>
            <TouchableOpacity style={styles.sendAidBtn} onPress={sendFirstAid}>
              <Text
                style={{ color: "white", fontWeight: "bold", fontSize: 16 }}
              >
                SEND TO PATIENT
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showDriverModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowDriverModal(false)}
      >
        <View style={styles.dispatchOverlay}>
          <View style={styles.dispatchContent}>
            <View style={styles.dispatchHeader}>
              <TouchableOpacity
                onPress={() => setShowDriverModal(false)}
                style={styles.backAction}
              >
                <Ionicons name="arrow-back" size={24} color="#1e293b" />
                <Text style={styles.backText}>BACK</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Unit Override</Text>
              <View style={{ width: 70 }} />
            </View>
            <Text style={{ color: "#64748b", marginBottom: 15, fontSize: 13 }}>
              Assign the closest available ambulance to the patient.
            </Text>

            {availableDrivers.length === 0 ? (
              <Text
                style={{ textAlign: "center", marginTop: 20, color: "#64748b" }}
              >
                No drivers currently online.
              </Text>
            ) : (
              availableDrivers.map((driver) => (
                <TouchableOpacity
                  key={driver.id}
                  style={styles.driverItem}
                  onPress={() => assignDriver(driver)}
                >
                  <FontAwesome5 name="ambulance" size={20} color="#2563eb" />

                  <View style={{ marginLeft: 15, flex: 1 }}>
                    <Text
                      style={{
                        fontWeight: "bold",
                        fontSize: 16,
                        color: "#1e293b",
                      }}
                    >
                      {driver.name}
                    </Text>
                    <Text style={{ fontSize: 12, color: "#64748b" }}>
                      {driver.licensePlate}
                    </Text>
                  </View>

                  <View
                    style={{
                      alignItems: "flex-end",
                      backgroundColor: "#e0f2fe",
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 8,
                    }}
                  >
                    <Text style={{ fontWeight: "900", color: "#0284c7" }}>
                      {driver.distance !== Infinity
                        ? `${driver.distance.toFixed(1)} km`
                        : "N/A"}
                    </Text>
                    <Text
                      style={{
                        fontSize: 10,
                        color: "#0369a1",
                        fontWeight: "bold",
                      }}
                    >
                      AWAY
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        </View>
      </Modal>

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
            <Text style={styles.modalTitle}>Facility Profile</Text>
            <View style={{ width: 70 }} />
          </View>

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          >
            <View style={styles.profileCard}>
              <View style={styles.profileAvatar}>
                <FontAwesome5 name="hospital-alt" size={40} color="white" />
              </View>
              <Text style={styles.pName}>
                {hospitalName || "Hospital Name"}
              </Text>
              <Text style={styles.pPhone}>Authorized Response Center</Text>
            </View>

            <View style={{ marginBottom: 40 }}>
              <Text style={styles.sectionTitle}>Facility Details</Text>
              <Text style={styles.subText}>
                This contact info helps drivers coordinate with the ER.
              </Text>
              <TextInput
                style={styles.inputSmall}
                placeholderTextColor="#94a3b8"
                placeholder="e.g., General Hospital"
                value={hospitalName}
                onChangeText={setHospitalName}
              />
              <TextInput
                style={styles.inputSmall}
                placeholderTextColor="#94a3b8"
                placeholder="Emergency Phone Number"
                keyboardType="phone-pad"
                value={hospitalPhone}
                onChangeText={setHospitalPhone}
              />
              <TextInput
                style={styles.inputSmall}
                placeholderTextColor="#94a3b8"
                placeholder="Physical Address"
                value={hospitalAddress}
                onChangeText={setHospitalAddress}
              />

              <TouchableOpacity
                style={styles.saveBtn}
                onPress={async () => {
                  if (!auth.currentUser) return;
                  setIsSavingProfile(true);
                  await updateDoc(doc(db, "hospitals", auth.currentUser.uid), {
                    name: hospitalName,
                    phone: hospitalPhone,
                    location: hospitalAddress,
                    coords: myLocation
                      ? {
                          latitude: myLocation.latitude,
                          longitude: myLocation.longitude,
                        }
                      : null,
                  });
                  setIsSavingProfile(false);
                  showAlert(
                    "Saved",
                    "Facility details updated successfully.",
                    "success",
                    "OK",
                  );
                }}
              >
                <Text style={styles.saveBtnText}>
                  {isSavingProfile ? "SAVING..." : "UPDATE FACILITY DATA"}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
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
  container: { flex: 1, backgroundColor: "white" },
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
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  visualProfileBtn: {
    backgroundColor: "rgba(255,255,255,0.15)",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  visualProfileText: {
    color: "white",
    fontWeight: "900",
    fontSize: 13,
    marginLeft: 8,
    letterSpacing: 1,
  },
  mapContainer: { flex: 1, marginBottom: "40%" },
  map: { flex: 1 },
  alertsPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "45%",
    backgroundColor: "white",
    borderTopLeftRadius: 35,
    borderTopRightRadius: 35,
    padding: 25,
    elevation: 25,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
  },
  alertsTitle: {
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 20,
    color: "#1e293b",
  },
  alertCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 18,
    padding: 18,
    marginBottom: 15,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    elevation: 2,
  },
  alertCardDispatched: {
    borderLeftWidth: 5,
    borderLeftColor: "#22c55e",
    backgroundColor: "#f0fdf4",
  },
  cardLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  cardRight: { flexDirection: "column", justifyContent: "center" },
  iconBox: {
    width: 50,
    height: 50,
    backgroundColor: "white",
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  patientInfo: { flex: 1 },
  patientName: { fontSize: 16, fontWeight: "bold", color: "#1e293b" },
  condition: {
    color: "#dc2626",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  respondBtn: {
    backgroundColor: "#1e293b",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
  },
  respondText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 11,
    textAlign: "center",
  },
  dispatchedBadge: {
    backgroundColor: "#dcfce7",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#86efac",
  },
  dispatchedText: { color: "#15803d", fontWeight: "bold", fontSize: 11 },
  dispatchOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "flex-end",
  },
  dispatchContent: {
    backgroundColor: "white",
    padding: 25,
    borderTopLeftRadius: 35,
    borderTopRightRadius: 35,
    minHeight: 300,
  },
  dispatchHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  dispatchTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "bold",
    color: "#1e293b",
  },
  driverItem: {
    flexDirection: "row",
    padding: 18,
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    marginBottom: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  backAction: { flexDirection: "row", alignItems: "center" },
  backText: { fontWeight: "bold", marginLeft: 5, color: "#1e293b" },
  label: { color: "#64748b", fontSize: 13 },
  conditionHighlight: {
    color: "#dc2626",
    fontWeight: "bold",
    fontSize: 18,
    marginBottom: 15,
  },
  visibleInput: {
    flex: 1,
    backgroundColor: "#f8fafc",
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 20,
    color: "#1e293b",
    fontSize: 16,
  },
  sendAidBtn: {
    backgroundColor: "#0284c7",
    padding: 18,
    borderRadius: 15,
    alignItems: "center",
    marginTop: 10,
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
    marginTop: 10,
    marginBottom: 30,
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
  pName: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    color: "#1e293b",
  },
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
