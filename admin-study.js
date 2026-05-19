import { db, auth } from "./firebase.js";
import {
  collection,
  getDocs,
  doc,
  deleteDoc,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

if (sessionStorage.getItem("isAdmin") !== "true") {
  alert("관리자만 접근할 수 있습니다.");
  location.href = "login.html";
}

const totalStudyEl  = document.getElementById("totalStudy");
const openStudyEl   = document.getElementById("openStudy");
const closedStudyEl = document.getElementById("closedStudy");
const studyTableBody = document.getElementById("studyTableBody");
const adminLogoutBtn = document.getElementById("adminLogoutBtn");

function formatDate(timestamp) {
  if (!timestamp) return "-";

  if (timestamp.seconds) {
    const date = new Date(timestamp.seconds * 1000);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  if (timestamp.toDate) {
    const date = timestamp.toDate();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  return "-";
}

function getStudyStatus(data) {
  const currentMembers = data.studyInfo?.currentMembers || 1;
  const maxMembers     = data.studyInfo?.maxMembers || 1;
  const studyStatus    = String(data.studyInfo?.status || "").trim();
  const status         = String(data.status || "").toLowerCase();
  const recruitStatus  = String(data.recruitStatus || "").toLowerCase();

  const isClosed =
    currentMembers >= maxMembers ||
    studyStatus === "마감" ||
    status === "closed" ||
    recruitStatus === "closed" ||
    data.isClosed === true;

  return isClosed
    ? { text: "모집 마감", className: "status-closed" }
    : { text: "모집중",   className: "status-open" };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function loadStudy() {
  try {
    const postsQuery = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    const snapshot   = await getDocs(postsQuery);

    let totalStudy  = 0;
    let openStudy   = 0;
    let closedStudy = 0;
    let html        = "";

    snapshot.forEach((docSnap) => {
      const data     = docSnap.data();
      const postId   = docSnap.id;
      const category = String(data.category || "").toLowerCase();

      // 스터디 모집 글만 처리
      const isStudy = category === "study" || category.includes("스터디");
      if (!isStudy) return;

      totalStudy++;

      const statusInfo     = getStudyStatus(data);
      const currentMembers = data.studyInfo?.currentMembers || 1;
      const maxMembers     = data.studyInfo?.maxMembers || 1;

      if (statusInfo.text === "모집중") openStudy++;
      else closedStudy++;

      html += `
        <tr>
          <td>
            <div class="post-title">${escapeHtml(data.title || "제목 없음")}</div>
            <div class="post-content">${escapeHtml(data.content || "")}</div>
          </td>
          <td>${escapeHtml(data.author || data.writer || data.nickname || "알 수 없음")}</td>
          <td>${escapeHtml(formatDate(data.createdAt))}</td>
          <td>${currentMembers} / ${maxMembers} 명</td>
          <td class="${statusInfo.className}">${statusInfo.text}</td>
          <td>
            <button
              class="delete-btn"
              data-post-id="${postId}"
              data-title="${escapeHtml(data.title || "제목 없음")}"
            >
              삭제
            </button>
          </td>
        </tr>
      `;
    });

    totalStudyEl.textContent  = String(totalStudy);
    openStudyEl.textContent   = String(openStudy);
    closedStudyEl.textContent = String(closedStudy);
    studyTableBody.innerHTML  = html || "<tr><td colspan='6' class='empty-message'>스터디 모집 글이 없습니다.</td></tr>";

  } catch (error) {
    console.error("스터디 목록 불러오기 실패:", error);
    totalStudyEl.textContent  = "오류";
    openStudyEl.textContent   = "오류";
    closedStudyEl.textContent = "오류";
    studyTableBody.innerHTML  = "<tr><td colspan='6' class='empty-message'>데이터를 불러오지 못했습니다.</td></tr>";
  }
}

async function deletePost(postId, title) {
  const ok = confirm(`"${title}" 글을 삭제하시겠습니까?`);
  if (!ok) return;

  try {
    await deleteDoc(doc(db, "posts", postId));
    alert("게시글이 삭제되었습니다.");
    await loadStudy();
  } catch (error) {
    console.error("삭제 실패:", error);
    alert("삭제 실패: " + error.message);
  }
}

document.addEventListener("click", async (e) => {
  if (!e.target.classList.contains("delete-btn")) return;

  const postId = e.target.dataset.postId;
  const title  = e.target.dataset.title || "제목 없음";

  await deletePost(postId, title);
});

adminLogoutBtn.addEventListener("click", async () => {
  try {
    sessionStorage.removeItem("isAdmin");
    sessionStorage.removeItem("adminEmail");
    await signOut(auth);
    alert("관리자 로그아웃 되었습니다.");
    location.href = "login.html";
  } catch (error) {
    console.error("로그아웃 실패:", error);
    alert("로그아웃 중 오류가 발생했습니다.");
  }
});

loadStudy();