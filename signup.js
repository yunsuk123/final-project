import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const signupForm = document.getElementById("signupForm");
const message = document.getElementById("message");

signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  message.textContent = "";
  message.style.color = "red";

  if (!name || !email || !password || !confirmPassword) {
    message.textContent = "모든 항목을 입력해주세요.";
    return;
  }

  if (password !== confirmPassword) {
    message.textContent = "비밀번호가 일치하지 않습니다.";
    return;
  }

  if (password.length < 6) {
    message.textContent = "비밀번호는 6자 이상이어야 합니다.";
    return;
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    await setDoc(doc(db, "users", user.uid), {
      name: name,
      email: email,
      createdAt: serverTimestamp(),
      emailVerified: false
    });

    await sendEmailVerification(user);

    message.style.color = "green";
    message.textContent = "회원가입이 완료되었습니다. 이메일 인증 후 로그인해주세요.";

    signupForm.reset();
  } catch (error) {
    console.error("회원가입 오류:", error);

    if (error.code === "auth/email-already-in-use") {
      message.textContent = "이미 사용 중인 이메일입니다.";
    } else if (error.code === "auth/invalid-email") {
      message.textContent = "올바른 이메일 형식이 아닙니다.";
    } else if (error.code === "auth/weak-password") {
      message.textContent = "비밀번호가 너무 약합니다. 6자 이상 입력해주세요.";
    } else {
      message.textContent = "회원가입 중 오류가 발생했습니다.";
    }
  }
});