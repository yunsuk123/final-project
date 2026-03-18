import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const loginForm = document.getElementById("loginForm");
const resendBtn = document.getElementById("resendBtn");
const message = document.getElementById("message");

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  message.textContent = "";

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    await user.reload();

    if (!user.emailVerified) {
      message.textContent = "이메일 인증이 완료되지 않았습니다. 메일함에서 인증 링크를 클릭해주세요.";
      return;
    }

    await updateDoc(doc(db, "users", user.uid), {
      emailVerified: true
    });

    message.textContent = "로그인 성공!";
    window.location.href = "index.html";
  } catch (error) {
    console.error(error);

    if (error.code === "auth/invalid-credential") {
      message.textContent = "이메일 또는 비밀번호가 올바르지 않습니다.";
    } else if (error.code === "auth/user-not-found") {
      message.textContent = "존재하지 않는 계정입니다.";
    } else if (error.code === "auth/wrong-password") {
      message.textContent = "비밀번호가 올바르지 않습니다.";
    } else {
      message.textContent = "로그인 중 오류가 발생했습니다.";
    }
  }
});

resendBtn.addEventListener("click", async () => {
  const user = auth.currentUser;

  if (!user) {
    message.textContent = "먼저 로그인 버튼을 눌러 계정 인증 상태를 확인해주세요.";
    return;
  }

  try {
    await sendEmailVerification(user);
    message.textContent = "인증 메일을 다시 보냈습니다. 메일함을 확인해주세요.";
  } catch (error) {
    console.error(error);
    message.textContent = "인증 메일 재발송 중 오류가 발생했습니다.";
  }
});