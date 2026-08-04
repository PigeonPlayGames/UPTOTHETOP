// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBCpMKnBIS30boGuPGkQoYEphy_JWQSdqY",
  authDomain: "tribalwars-2.firebaseapp.com",
  databaseURL: "https://tribalwars-2-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "tribalwars-2",
  storageBucket: "tribalwars-2.firebasestorage.app",
  messagingSenderId: "649122676235",
  appId: "1:649122676235:web:1e5e61df4eaf141f6e510e",
  measurementId: "G-PV2HTW6T9J"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
