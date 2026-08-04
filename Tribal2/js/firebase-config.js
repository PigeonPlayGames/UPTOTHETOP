// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBCpMKnBIS30boGuPGkQoYEphy_JWQSdqY",
  authDomain: "tribalwars-2.firebaseapp.com",
  databaseURL: "https://tribalwars-2-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "tribalwars-2",
  storageBucket: "tribalwars-2.firebasestorage.app",
  messagingSenderId: "649122676235",
  appId: "1:649122676235:web:1e5e61df4eaf141f6e510e",
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();
