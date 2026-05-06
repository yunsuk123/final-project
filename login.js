import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const resendBtn = document.getElementById("resendBtn");
const message = document.getElementById("message");


const ADMIN_EMAIL = "admin@studycafe.com";

function showMessage(text, color = "#444") {
  message.textContent = text;
  message.style.color = color;
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value.trim();

  showMessage("");

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    
    try {
      await updateDoc(doc(db, "users", user.uid), {
        emailVerified: user.emailVerified
      });
    } catch (updateError) {
      console.error("emailVerified 업데이트 실패:", updateError);
    }

    
    if (user.email === ADMIN_EMAIL) {
      sessionStorage.setItem("isAdmin", "true");
      sessionStorage.setItem("adminEmail", user.email);

      alert("관리자 로그인 성공");
      location.href = "admin.html";
      return;
    }

    
    sessionStorage.removeItem("isAdmin");
    sessionStorage.removeItem("adminEmail");

    
    if (!user.emailVerified) {
      showMessage("이메일 인증이 완료되지 않았습니다. 인증 후 다시 로그인해주세요.", "crimson");
      await signOut(auth);
      return;
    }

    showMessage("로그인 성공", "green");
    alert("로그인 성공");
    location.href = "index.html";
  } catch (error) {
    console.error("로그인 오류:", error);

    switch (error.code) {
      case "auth/invalid-email":
        showMessage("이메일 형식이 올바르지 않습니다.", "crimson");
        break;
      case "auth/user-not-found":
        showMessage("존재하지 않는 계정입니다.", "crimson");
        break;
      case "auth/wrong-password":
        showMessage("비밀번호가 올바르지 않습니다.", "crimson");
        break;
      case "auth/invalid-credential":
        showMessage("이메일 또는 비밀번호가 올바르지 않습니다.", "crimson");
        break;
      case "auth/too-many-requests":
        showMessage("로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.", "crimson");
        break;
      default:
        showMessage("로그인 중 오류가 발생했습니다.", "crimson");
        break;
    }
  }
});

resendBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value.trim();

  showMessage("");

  if (!email || !password) {
    showMessage("이메일과 비밀번호를 먼저 입력해주세요.", "crimson");
    return;
  }

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // 관리자 계정은 인증 메일 제외
    if (user.email === ADMIN_EMAIL) {
      showMessage("관리자 계정은 인증 메일 기능을 사용하지 않습니다.", "crimson");
      await signOut(auth);
      return;
    }

    if (user.emailVerified) {
      try {
        await updateDoc(doc(db, "users", user.uid), {
          emailVerified: true
        });
      } catch (updateError) {
        console.error("인증 상태 업데이트 실패:", updateError);
      }

      showMessage("이미 이메일 인증이 완료된 계정입니다.", "green");
      await signOut(auth);
      return;
    }

    await sendEmailVerification(user);
    showMessage("인증 메일을 다시 보냈습니다. 이메일을 확인해주세요.", "green");
    await signOut(auth);
  } catch (error) {
    console.error("인증 메일 재전송 오류:", error);

    switch (error.code) {
      case "auth/invalid-email":
        showMessage("이메일 형식이 올바르지 않습니다.", "crimson");
        break;
      case "auth/user-not-found":
        showMessage("존재하지 않는 계정입니다.", "crimson");
        break;
      case "auth/wrong-password":
      case "auth/invalid-credential":
        showMessage("비밀번호가 올바르지 않습니다.", "crimson");
        break;
      default:
        showMessage("인증 메일 재전송 중 오류가 발생했습니다.", "crimson");
        break;
    }
  }
});