import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "여기에 apiKey",
  authDomain: "여기에 authDomain",
  projectId: "여기에 projectId",
  storageBucket: "여기에 storageBucket",
  messagingSenderId: "여기에 messagingSenderId",
  appId: "여기에 appId"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };