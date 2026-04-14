import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  doc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

if (sessionStorage.getItem("isAdmin") !== "true") {
  alert("관리자만 접근할 수 있습니다.");
  location.href = "login.html";
}

const totalUsersEl = document.getElementById("totalUsers");
const verifiedUsersEl = document.getElementById("verifiedUsers");
const unverifiedUsersEl = document.getElementById("unverifiedUsers");
const userTableBody = document.getElementById("userTableBody");
const adminLogoutBtn = document.getElementById("adminLogoutBtn");

function formatDate(timestamp) {
  if (!timestamp) return "-";

  if (timestamp.seconds) {
    const date = new Date(timestamp.seconds * 1000);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  return "-";
}

async function loadUsers() {
  try {
    const usersRef = collection(db, "users");
    const snapshot = await getDocs(usersRef);

    let totalUsers = 0;
    let verifiedUsers = 0;
    let unverifiedUsers = 0;
    let html = "";

    if (snapshot.empty) {
      totalUsersEl.textContent = "0";
      verifiedUsersEl.textContent = "0";
      unverifiedUsersEl.textContent = "0";
      userTableBody.innerHTML = "<tr><td colspan='5'>회원 데이터가 없습니다.</td></tr>";
      return;
    }

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const uid = docSnap.id;

      totalUsers++;

      if (data.emailVerified === true) {
        verifiedUsers++;
      } else {
        unverifiedUsers++;
      }

      html += `
        <tr>
          <td>${data.name || "-"}</td>
          <td>${data.email || "-"}</td>
          <td>${formatDate(data.createdAt)}</td>
          <td class="${data.emailVerified ? "status-active" : "status-stop"}">
            ${data.emailVerified ? "인증 완료" : "미인증"}
          </td>
          <td>
            <button class="delete-btn" data-uid="${uid}" data-name="${data.name || ""}">
              삭제
            </button>
          </td>
        </tr>
      `;
    });

    totalUsersEl.textContent = String(totalUsers);
    verifiedUsersEl.textContent = String(verifiedUsers);
    unverifiedUsersEl.textContent = String(unverifiedUsers);
    userTableBody.innerHTML = html;
  } catch (error) {
    console.error("회원 목록 불러오기 실패:", error);
    totalUsersEl.textContent = "오류";
    verifiedUsersEl.textContent = "오류";
    unverifiedUsersEl.textContent = "오류";
    userTableBody.innerHTML = "<tr><td colspan='5'>회원 정보를 불러오지 못했습니다.</td></tr>";
  }
}

async function deleteUserDoc(uid, name) {
  const ok = confirm(`${name || "해당 회원"} 삭제하시겠습니까?`);
  if (!ok) return;

  try {
    await deleteDoc(doc(db, "users", uid));
    alert("삭제되었습니다.");
    await loadUsers();
  } catch (error) {
    console.error("회원 삭제 실패:", error);
    alert("삭제에 실패했습니다.");
  }
}

document.addEventListener("click", async (e) => {
  if (!e.target.classList.contains("delete-btn")) return;

  const uid = e.target.dataset.uid;
  const name = e.target.dataset.name;

  await deleteUserDoc(uid, name);
});

adminLogoutBtn.addEventListener("click", () => {
  sessionStorage.removeItem("isAdmin");
  alert("관리자 로그아웃 되었습니다.");
  location.href = "login.html";
});

loadUsers();