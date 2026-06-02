import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  setPersistence,
  browserSessionPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const resendBtn = document.getElementById("resendBtn");
const message = document.getElementById("message");

const SUPER_ADMIN_EMAIL = "admin@studycafe.com";

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
    await setPersistence(auth, browserLocalPersistence);
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    try {
      await updateDoc(doc(db, "users", user.uid), {
        emailVerified: user.emailVerified
      });
    } catch (updateError) {
      console.error("emailVerified 업데이트 실패:", updateError);
    }

    // 총 관리자
    if (user.email === SUPER_ADMIN_EMAIL) {
      // ✅ 수정: 두 번째 signInWithEmailAndPassword 제거
      sessionStorage.setItem("isAdmin", "true");
      sessionStorage.setItem("adminEmail", user.email);
      alert("총 관리자 로그인 성공");
      location.href = "admin.html";
      return;
    }

    if (!user.emailVerified) {
      showMessage("이메일 인증이 완료되지 않았습니다. 인증 후 다시 로그인해주세요.", "crimson");
      await signOut(auth);
      return;
    }

    const userDoc = await getDoc(doc(db, "users", user.uid));
    const role = userDoc.exists() ? userDoc.data().role : "user";

    // 업장 관리자
    if (role === "admin") {
      // ✅ 수정: 두 번째 signInWithEmailAndPassword 제거
      sessionStorage.setItem("userRole", "admin");
      sessionStorage.setItem("userUid", user.uid);
      alert("관리자 로그인 성공");
      location.href = "admin-cafe.html";
      return;
    }

    sessionStorage.removeItem("isAdmin");
    sessionStorage.setItem("userRole", "user");
    showMessage("로그인 성공", "green");
    alert("로그인 성공");
    location.href = "index.html";

  } catch (error) {
    console.error("로그인 오류:", error);
    switch (error.code) {
      case "auth/invalid-email":
        showMessage("이메일 형식이 올바르지 않습니다.", "crimson"); break;
      case "auth/user-not-found":
        showMessage("존재하지 않는 계정입니다.", "crimson"); break;
      case "auth/wrong-password":
        showMessage("비밀번호가 올바르지 않습니다.", "crimson"); break;
      case "auth/invalid-credential":
        showMessage("이메일 또는 비밀번호가 올바르지 않습니다.", "crimson"); break;
      case "auth/too-many-requests":
        showMessage("로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.", "crimson"); break;
      default:
        showMessage("로그인 중 오류가 발생했습니다.", "crimson"); break;
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
    await setPersistence(auth, browserSessionPersistence);
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    if (user.email === SUPER_ADMIN_EMAIL) {
      showMessage("관리자 계정은 인증 메일 기능을 사용하지 않습니다.", "crimson");
      await signOut(auth);
      return;
    }

    if (user.emailVerified) {
      try {
        await updateDoc(doc(db, "users", user.uid), { emailVerified: true });
      } catch (e) {
        console.error("인증 상태 업데이트 실패:", e);
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
        showMessage("이메일 형식이 올바르지 않습니다.", "crimson"); break;
      case "auth/user-not-found":
        showMessage("존재하지 않는 계정입니다.", "crimson"); break;
      case "auth/wrong-password":
      case "auth/invalid-credential":
        showMessage("비밀번호가 올바르지 않습니다.", "crimson"); break;
      default:
        showMessage("인증 메일 재전송 중 오류가 발생했습니다.", "crimson"); break;
    }
  }
});

// ── 아이디/비밀번호 찾기 ──
window.openFindModal = function() {
  document.getElementById("findModal").style.display = "flex";
};

window.closeFindModal = function() {
  document.getElementById("findModal").style.display = "none";
  document.getElementById("findName").value = "";
  document.getElementById("findSido").value = "";
  document.getElementById("findSigungu").value = "";
  document.getElementById("resetEmail").value = "";
  document.getElementById("idResult").textContent = "";
  document.getElementById("pwResult").textContent = "";
};

window.switchTab = function(tab) {
  document.querySelectorAll(".tab-btn").forEach((b, i) => {
    b.classList.toggle("active", tab === "id" ? i === 0 : i === 1);
  });
  document.getElementById("tab-id").classList.toggle("active", tab === "id");
  document.getElementById("tab-pw").classList.toggle("active", tab === "pw");
};

window.findId = async function() {
  const name    = document.getElementById("findName").value.trim();
  const sido    = document.getElementById("findSido").value.trim();
  const sigungu = document.getElementById("findSigungu").value.trim();
  const result  = document.getElementById("idResult");

  if (!name || !sido || !sigungu) {
    result.style.color = "crimson";
    result.textContent = "모든 항목을 입력해주세요.";
    return;
  }
  try {
    const q = query(
      collection(db, "users"),
      where("name", "==", name),
      where("sido", "==", sido),
      where("sigungu", "==", sigungu)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      result.style.color = "crimson";
      result.textContent = "일치하는 계정을 찾을 수 없습니다.";
      return;
    }
    const email = snap.docs[0].data().email;
    const [id, domain] = email.split("@");
    const masked = id.slice(0, 2) + "****@" + domain;
    result.style.color = "#4a6cf7";
    result.innerHTML = `찾은 아이디: <strong>${masked}</strong>`;
  } catch (e) {
    console.error("아이디 찾기 오류:", e);
    result.style.color = "crimson";
    result.textContent = "오류가 발생했습니다. 다시 시도해주세요.";
  }
};

window.sendReset = async function() {
  const email  = document.getElementById("resetEmail").value.trim().toLowerCase();
  const result = document.getElementById("pwResult");

  if (!email) {
    result.style.color = "crimson";
    result.textContent = "이메일을 입력해주세요.";
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    result.style.color = "green";
    result.textContent = "재설정 링크를 이메일로 보냈습니다. 메일함을 확인해주세요.";
  } catch (err) {
    result.style.color = "crimson";
    result.textContent = err.code === "auth/user-not-found"
      ? "가입된 이메일이 없습니다."
      : "오류가 발생했습니다. 다시 시도해주세요.";
  }
};