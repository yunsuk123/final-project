import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  deleteDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

if (sessionStorage.getItem("isAdmin") !== "true") {
  alert("관리자만 접근할 수 있습니다.");
  location.href = "login.html";
}

const userTableBody = document.getElementById("userTableBody");
const adminLogoutBtn = document.getElementById("adminLogoutBtn");

function formatDate(timestamp) {
  if (!timestamp) return "-";

  if (timestamp.toDate) {
    const date = timestamp.toDate();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  if (timestamp.seconds) {
    const date = new Date(timestamp.seconds * 1000);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  return "-";
}

function getSuspendedDate(suspendedUntil) {
  if (!suspendedUntil) return null;

  if (suspendedUntil.toDate) {
    return suspendedUntil.toDate();
  }

  if (suspendedUntil.seconds) {
    return new Date(suspendedUntil.seconds * 1000);
  }

  return new Date(suspendedUntil);
}

function getUserName(data) {
  return (
    data.name ||
    data.nickname ||
    data.username ||
    data.userName ||
    "-"
  );
}

async function loadUsers() {
  try {
    const snapshot = await getDocs(collection(db, "users"));

    if (snapshot.empty) {
      userTableBody.innerHTML = `
        <tr>
          <td colspan="6">회원 데이터가 없습니다.</td>
        </tr>
      `;
      return;
    }

    let html = "";

    snapshot.forEach((docSnap) => {
      const uid = docSnap.id;
      const data = docSnap.data();

      const reportCount = data.reportCount || 0;

      const suspendedDate = getSuspendedDate(data.suspendedUntil);
      const isSuspended =
        suspendedDate &&
        !isNaN(suspendedDate.getTime()) &&
        suspendedDate > new Date();

      let statusText = "정상";
      let statusClass = "status-active";

      if (isSuspended) {
        statusText = `정지 중 (${formatDate(data.suspendedUntil)}까지)`;
        statusClass = "status-stop";
      }

      let manageHtml = `<span style="color:#999; font-weight:700;">삭제 불가</span>`;

      if (reportCount >= 30) {
        manageHtml = `
          <button
            type="button"
            class="delete-btn"
            data-uid="${uid}"
            data-name="${getUserName(data)}"
            data-email="${data.email || ""}"
          >
            삭제
          </button>
        `;
      }

      html += `
        <tr>
          <td>${getUserName(data)}</td>
          <td>${data.email || "-"}</td>
          <td>${formatDate(data.createdAt)}</td>
          <td>${reportCount}회</td>
          <td class="${statusClass}">${statusText}</td>
          <td>${manageHtml}</td>
        </tr>
      `;
    });

    userTableBody.innerHTML = html;
  } catch (error) {
    console.error("회원 목록 불러오기 실패:", error);
    userTableBody.innerHTML = `
      <tr>
        <td colspan="6">회원 정보를 불러오지 못했습니다.</td>
      </tr>
    `;
  }
}

async function deleteUserDoc(uid, name, email) {
  if (!uid) {
    alert("삭제할 회원 ID를 찾지 못했습니다.");
    return;
  }

  try {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      alert("회원 정보를 찾을 수 없습니다.");
      return;
    }

    const userData = userSnap.data();
    const reportCount = userData.reportCount || 0;

    if (reportCount < 30) {
      alert("신고 횟수가 30회 이상인 회원만 삭제할 수 있습니다.");
      return;
    }

    const ok = confirm(`${name || "해당 회원"} 삭제하시겠습니까?`);
    if (!ok) return;

    if (email) {
      const normalizedEmail = email.trim().toLowerCase();

      await setDoc(doc(db, "blockedEmails", normalizedEmail), {
        email: normalizedEmail,
        blockedAt: serverTimestamp(),
        blockedReason: "신고 30회 이상 관리자 삭제",
        uid,
        name: name || ""
      });
    }

    await deleteDoc(doc(db, "users", uid));

    alert("삭제되었습니다.");
    await loadUsers();
  } catch (error) {
    console.error("회원 삭제 실패:", error);
    alert("삭제에 실패했습니다.\n" + error.message);
  }
}

document.addEventListener("click", async (e) => {
  const deleteButton = e.target.closest(".delete-btn");
  if (!deleteButton) return;

  await deleteUserDoc(
    deleteButton.dataset.uid,
    deleteButton.dataset.name,
    deleteButton.dataset.email
  );
});

if (adminLogoutBtn) {
  adminLogoutBtn.addEventListener("click", () => {
    sessionStorage.removeItem("isAdmin");
    alert("관리자 로그아웃 되었습니다.");
    location.href = "login.html";
  });
}

loadUsers();