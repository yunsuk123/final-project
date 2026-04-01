import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const userName = document.getElementById("userName");
const userEmail = document.getElementById("userEmail");
const userCreatedAt = document.getElementById("userCreatedAt");
const userVerified = document.getElementById("userVerified");

function formatDate(value) {
  if (!value) return "-";

  if (value.seconds) {
    const date = new Date(value.seconds * 1000);
    return date.toLocaleDateString("ko-KR");
  }

  return value;
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    alert("로그인이 필요합니다.");
    location.href = "login.html";
    return;
  }
  

  try {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const data = userSnap.data();

      userName.textContent = data.name || "이름 없음";
      userEmail.textContent = data.email || user.email || "이메일 없음";
      userCreatedAt.textContent = formatDate(data.createdAt);
    } else {
      userName.textContent = "이름 없음";
      userEmail.textContent = user.email || "이메일 없음";
      userCreatedAt.textContent = "-";
    }

    userVerified.textContent = user.emailVerified ? "인증 완료" : "미인증";
    userVerified.style.color = user.emailVerified ? "green" : "red";

  } catch (error) {
    console.error("마이페이지 정보 불러오기 오류:", error);
    userName.textContent = "오류";
    userEmail.textContent = "오류";
    userCreatedAt.textContent = "오류";
    userVerified.textContent = "오류";
  }
});

window.changePassword = async function (event) {
  event.preventDefault();

  const currentPassword = document.getElementById("currentPassword").value;
  const newPassword = document.getElementById("newPassword").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  if (!currentPassword || !newPassword || !confirmPassword) {
    alert("모든 항목을 입력해주세요.");
    return;
  }

  if (newPassword.length < 6) {
    alert("새 비밀번호는 6자 이상이어야 합니다.");
    return;
  }

  if (newPassword !== confirmPassword) {
    alert("새 비밀번호와 비밀번호 확인이 일치하지 않습니다.");
    return;
  }

  try {
    const user = auth.currentUser;

    if (!user || !user.email) {
      alert("로그인 정보를 확인할 수 없습니다.");
      return;
    }

    const credential = EmailAuthProvider.credential(user.email, currentPassword);

    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);

    alert("비밀번호가 성공적으로 변경되었습니다.");

    document.getElementById("currentPassword").value = "";
    document.getElementById("newPassword").value = "";
    document.getElementById("confirmPassword").value = "";

  } catch (error) {
    console.error("비밀번호 변경 오류:", error);

    if (error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") {
      alert("현재 비밀번호가 올바르지 않습니다.");
    } else if (error.code === "auth/weak-password") {
      alert("새 비밀번호가 너무 약합니다. 6자 이상 입력해주세요.");
    } else {
      alert("비밀번호 변경 중 오류가 발생했습니다.");
    }
  }
};