import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  getDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const loginForm = document.getElementById("loginForm");
const resendBtn = document.getElementById("resendBtn");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const message = document.getElementById("message");

const userTab = document.getElementById("userTab");
const adminTab = document.getElementById("adminTab");
const loginTitle = document.getElementById("loginTitle");
const idLabel = document.getElementById("idLabel");
const signupArea = document.getElementById("signupArea");
const adminGuide = document.getElementById("adminGuide");

let lastUnverifiedUser = null;
let loginMode = "user";

function setUserMode() {
  loginMode = "user";

  userTab.classList.add("active");
  adminTab.classList.remove("active");

  loginTitle.textContent = "스터디카페 일반 회원 로그인";
  idLabel.textContent = "이메일";
  emailInput.placeholder = "이메일을 입력하세요";
  emailInput.type = "text";
  emailInput.value = "";
  passwordInput.value = "";

  resendBtn.style.display = "block";
  signupArea.style.display = "block";
  adminGuide.style.display = "none";

  message.textContent = "";
  message.style.color = "#444";
}

function setAdminMode() {
  loginMode = "admin";

  adminTab.classList.add("active");
  userTab.classList.remove("active");

  loginTitle.textContent = "스터디카페 관리자 로그인";
  idLabel.textContent = "아이디";
  emailInput.placeholder = "아이디를 입력하세요";
  emailInput.type = "text";
  emailInput.value = "";
  passwordInput.value = "";

  resendBtn.style.display = "none";
  signupArea.style.display = "none";
  adminGuide.style.display = "block";

  message.textContent = "";
  message.style.color = "#444";
}

userTab.addEventListener("click", setUserMode);
adminTab.addEventListener("click", setAdminMode);

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const idOrEmail = emailInput.value.trim();
  const password = passwordInput.value.trim();

  message.textContent = "";
  message.style.color = "#444";

  if (!idOrEmail || !password) {
    message.style.color = "red";
    message.textContent = "아이디(또는 이메일)와 비밀번호를 모두 입력하세요.";
    return;
  }

  // 관리자 로그인
  if (loginMode === "admin") {
    if (idOrEmail === "admin" && password === "1234") {
      sessionStorage.setItem("isAdmin", "true");
      message.style.color = "green";
      message.textContent = "관리자 로그인 성공!";
      window.location.href = "admin.html";
    } else {
      message.style.color = "red";
      message.textContent = "관리자 아이디 또는 비밀번호가 올바르지 않습니다.";
    }
    return;
  }

  // 일반 회원 로그인
  try {
    const userCredential = await signInWithEmailAndPassword(auth, idOrEmail, password);
    const user = userCredential.user;

    if (!user.emailVerified) {
      lastUnverifiedUser = user;
      message.style.color = "red";
      message.textContent = "이메일 인증이 완료되지 않았습니다. 인증 메일을 확인해주세요.";
      return;
    }

    try {
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        await updateDoc(userRef, {
          emailVerified: true
        });
      }
    } catch (firestoreError) {
      console.error("Firestore 업데이트 실패:", firestoreError);
    }

    message.style.color = "green";
    message.textContent = "로그인 성공!";
    window.location.href = "index.html";
  } catch (error) {
    console.error(error);

    if (error.code === "auth/invalid-credential") {
      message.style.color = "red";
      message.textContent = "이메일 또는 비밀번호가 올바르지 않습니다.";
    } else if (error.code === "auth/too-many-requests") {
      message.style.color = "red";
      message.textContent = "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.";
    } else {
      message.style.color = "red";
      message.textContent = "로그인 중 오류가 발생했습니다.";
    }
  }
});

resendBtn.addEventListener("click", async () => {
  if (loginMode === "admin") return;

  try {
    const user = lastUnverifiedUser || auth.currentUser;

    if (!user) {
      message.style.color = "red";
      message.textContent = "먼저 일반 회원 로그인을 시도한 뒤 다시 보내기를 눌러주세요.";
      return;
    }

    await sendEmailVerification(user);

    message.style.color = "green";
    message.textContent = "인증 메일을 다시 보냈습니다. 스팸함도 확인해주세요.";
  } catch (error) {
    console.error(error);
    message.style.color = "red";

    if (error.code === "auth/too-many-requests") {
      message.textContent = "너무 많이 요청했습니다. 잠시 후 다시 시도해주세요.";
    } else {
      message.textContent = "인증 메일 재전송 중 오류가 발생했습니다.";
    }
  }
});

// 페이지 처음 열릴 때 기본값
setUserMode();