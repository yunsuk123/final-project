import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDbKxl2V628QvKZRSnCGuyrUUkexHOrlz0",
  authDomain: "final-project-17108.firebaseapp.com",
  projectId: "final-project-17108",
  storageBucket: "final-project-17108.firebasestorage.app",
  messagingSenderId: "443501302569",
  appId: "1:443501302569:web:10e9acf11c7a9125895d38",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };