import { useNavigation } from "@react-navigation/native";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import {
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView } from "react-native-webview";

export default function MapScreen() {
  const navigation = useNavigation();
  const [location, setLocation] = useState(null);
  const [gpsError, setGpsError] = useState(null);
  const webViewRef = useRef(null);

  // --- LEAFLET HTML ---
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
        // 1. Initialize Map (Starts at 0,0 but will move instantly)
        var map = L.map('map').setView([0,0], 3);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(map);

        var userMarker = null;
        var firstLock = true;

        // 2. Custom Blue Dot Icon (Google Maps Style)
        var dotIcon = L.divIcon({
            className: 'custom-div-icon',
            html: "<div style='background-color:#4285F4; width: 15px; height: 15px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.5);'></div>",
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });

        // 3. Function called by React Native
        function updateLocation(lat, lng) {
          if (!userMarker) {
            userMarker = L.marker([lat, lng], {icon: dotIcon}).addTo(map).bindPopup("You are here");
            map.setView([lat, lng], 16); // Zoom in close (Street View level)
          } else {
            userMarker.setLatLng([lat, lng]);
            // Force the map to follow the user
            map.flyTo([lat, lng], map.getZoom()); 
          }
        }
      </script>
    </body>
    </html>
  `;

  useEffect(() => {
    (async () => {
      // 1. Check Permissions
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setGpsError("Permission Denied");
        return;
      }

      // 2. Start Live Tracking (Not just one-time)
      await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 5, // Update every 5 meters
          timeInterval: 1000, // Update every 1 second
        },
        (loc) => {
          setLocation(loc.coords);
          // Send to Map
          if (webViewRef.current) {
            webViewRef.current.injectJavaScript(
              `updateLocation(${loc.coords.latitude}, ${loc.coords.longitude});`,
            );
          }
        },
      );
    })();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: "white" }}>
      <StatusBar barStyle="dark-content" />

      {/* DEBUG PANEL: Shows you exactly what the phone sees */}
      <View style={styles.debugPanel}>
        <Text style={styles.debugText}>
          {location
            ? `Lat: ${location.latitude.toFixed(5)} | Lng: ${location.longitude.toFixed(5)}`
            : "Searching for GPS..."}
        </Text>
        {gpsError && <Text style={{ color: "red" }}>{gpsError}</Text>}
      </View>

      <WebView
        ref={webViewRef}
        originWhitelist={["*"]}
        source={{ html: leafletHtml }}
        style={{ flex: 1 }}
      />

      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => navigation.goBack()}
      >
        <Text style={{ fontWeight: "bold" }}>Back</Text>
      </TouchableOpacity>

      {/* RE-CENTER BUTTON */}
      <TouchableOpacity
        style={styles.centerBtn}
        onPress={() => {
          if (location && webViewRef.current) {
            webViewRef.current.injectJavaScript(
              `map.setView([${location.latitude}, ${location.longitude}], 18);`,
            );
          }
        }}
      >
        <Text style={{ fontWeight: "bold", color: "white" }}>Find Me</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  debugPanel: {
    position: "absolute",
    top: 90,
    width: "90%",
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    padding: 10,
    borderRadius: 10,
    zIndex: 20,
    alignItems: "center",
  },
  debugText: { color: "white", fontWeight: "bold" },
  backBtn: {
    position: "absolute",
    top: 40,
    left: 20,
    backgroundColor: "white",
    padding: 12,
    borderRadius: 8,
    elevation: 5,
    zIndex: 20,
  },
  centerBtn: {
    position: "absolute",
    bottom: 40,
    right: 20,
    backgroundColor: "#2563eb",
    padding: 15,
    borderRadius: 30,
    elevation: 5,
    zIndex: 20,
  },
});
