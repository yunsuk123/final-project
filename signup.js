import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const allowedDomains = ["gmail.com", "naver.com", "daum.net", "kakao.com"];

async function isBlockedEmail(email) {
  const blockedSnap = await getDoc(doc(db, "blockedEmails", email));
  return blockedSnap.exists();
}

function showMessage(elId, text, isSuccess = false) {
  const el = document.getElementById(elId);
  el.textContent = text;
  el.className = "message" + (isSuccess ? " success" : "");
}

// ── 일반 사용자 가입 ──
document.getElementById("userSignupForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const name     = document.getElementById("userName").value.trim();
  const email    = document.getElementById("userEmail").value.trim().toLowerCase();
  const password = document.getElementById("userPassword").value;
  const confirm  = document.getElementById("userConfirmPassword").value;
  const sido     = document.getElementById("sido").value.trim();
  const sigungu  = document.getElementById("sigungu").value.trim();
  const dong     = document.getElementById("dong").value.trim();

  showMessage("userMessage", "");

  if (!name || !email || !password || !confirm || !sido || !sigungu || !dong) {
    return showMessage("userMessage", "모든 항목을 입력해주세요.");
  }
  if (!emailRegex.test(email) || !allowedDomains.includes(email.split("@")[1])) {
    return showMessage("userMessage", "올바른 이메일 형식이 아닙니다.");
  }
  if (password !== confirm) {
    return showMessage("userMessage", "비밀번호가 일치하지 않습니다.");
  }
  if (password.length < 6) {
    return showMessage("userMessage", "비밀번호는 6자 이상이어야 합니다.");
  }

  try {
    if (await isBlockedEmail(email)) {
      return showMessage("userMessage", "관리자에 의해 제한된 이메일입니다.");
    }

    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    await sendEmailVerification(user);
    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid, name, email,
      sido, sigungu, dong,
      region: `${sido} ${sigungu} ${dong}`,
      role: "user",
      emailVerified: false,
      createdAt: serverTimestamp()
    });
    await signOut(auth);

    showMessage("userMessage", "회원가입 완료! 이메일 인증 후 로그인하세요.", true);
    document.getElementById("userSignupForm").reset();
    const sigunguSelect = document.getElementById("sigungu");
    sigunguSelect.innerHTML = '<option value="">시/군/구 선택</option>';
    sigunguSelect.disabled = true;

  } catch (error) {
    const msg = {
      "auth/email-already-in-use": "이미 사용중인 이메일입니다.",
      "auth/invalid-email": "올바른 이메일 형식이 아닙니다.",
      "auth/weak-password": "비밀번호는 6자 이상이어야 합니다."
    }[error.code] || "회원가입 중 오류가 발생했습니다.";
    showMessage("userMessage", msg);
  }
});

// ── 관리자 가입 ──
document.getElementById("adminSignupForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const name     = document.getElementById("adminName").value.trim();
  const email    = document.getElementById("adminEmail").value.trim().toLowerCase();
  const password = document.getElementById("adminPassword").value;
  const confirm  = document.getElementById("adminConfirmPassword").value;

  showMessage("adminMessage", "");

  if (!name || !email || !password || !confirm) {
    return showMessage("adminMessage", "모든 항목을 입력해주세요.");
  }
  if (!emailRegex.test(email) || !allowedDomains.includes(email.split("@")[1])) {
    return showMessage("adminMessage", "올바른 이메일 형식이 아닙니다.");
  }
  if (password !== confirm) {
    return showMessage("adminMessage", "비밀번호가 일치하지 않습니다.");
  }
  if (password.length < 6) {
    return showMessage("adminMessage", "비밀번호는 6자 이상이어야 합니다.");
  }

  try {
    if (await isBlockedEmail(email)) {
      return showMessage("adminMessage", "관리자에 의해 제한된 이메일입니다.");
    }

    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    await sendEmailVerification(user);
    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid, name, email,
      role: "admin",
      emailVerified: false,
      createdAt: serverTimestamp()
    });
    await signOut(auth);

    showMessage("adminMessage", "관리자 가입 완료! 이메일 인증 후 로그인하세요.", true);
    document.getElementById("adminSignupForm").reset();

  } catch (error) {
    const msg = {
      "auth/email-already-in-use": "이미 사용중인 이메일입니다.",
      "auth/invalid-email": "올바른 이메일 형식이 아닙니다.",
      "auth/weak-password": "비밀번호는 6자 이상이어야 합니다."
    }[error.code] || "회원가입 중 오류가 발생했습니다.";
    showMessage("adminMessage", msg);
  }
});