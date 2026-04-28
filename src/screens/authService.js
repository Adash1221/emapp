import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebaseConfig";

export const signupUser = async (
  email,
  password,
  fullName,
  phone,
  role,
  extraData = {},
  isApproved = false,
) => {
  try {
    // 1. Create the user in Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password,
    );
    const user = userCredential.user;

    // 2. Determine collection name
    let collectionName = "patients";
    if (role === "hospital") {
      collectionName = "hospitals";
    } else if (role === "driver") {
      collectionName = "drivers";
    }

    // 3. Construct the base user profile
    const userData = {
      uid: user.uid,
      name: fullName,
      email: email,
      phone: phone,
      role: role || "patient",
      isVerified: isApproved,
      pushToken: extraData.pushToken || "",
      createdAt: new Date().toISOString(),
    };

    // 4. Add role-specific fields
    if (role === "patient") {
      userData.age = extraData.age || "N/A";
      userData.bloodType = extraData.bloodType || "N/A";
      userData.condition = extraData.condition || "None";
    }

    if (role === "driver") {
      userData.licensePlate = extraData.licensePlate || "N/A";
      userData.isOnline = false;
    }

    // 5. Save to Firestore
    await setDoc(doc(db, collectionName, user.uid), userData);

    return { success: true, user };
  } catch (error) {
    // ✅ FIX: No more console.error here! Just pass it to the UI modal.
    throw error;
  }
};
