import { db, auth } from "./firebase.js";
import {
  collection,
  getDocs,
  doc,
  deleteDoc,
  query,
  orderBy,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

if (sessionStorage.getItem("isAdmin") !== "true") {
  alert("관리자만 접근할 수 있습니다.");
  location.href = "login.html";
}

const totalPostsEl = document.getElementById("totalPosts");
const openStudyPostsEl = document.getElementById("openStudyPosts");
const todayPostsEl = document.getElementById("todayPosts");
const postTableBody = document.getElementById("postTableBody");
const adminLogoutBtn = document.getElementById("adminLogoutBtn");

const noticeTitle = document.getElementById("noticeTitle");
const noticeContent = document.getElementById("noticeContent");
const createNoticeBtn = document.getElementById("createNoticeBtn");

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

  if (typeof timestamp === "string") {
    return timestamp;
  }

  return "-";
}

function getTodayDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function isToday(timestamp) {
  if (!timestamp) return false;

  let date = null;

  if (timestamp.seconds) {
    date = new Date(timestamp.seconds * 1000);
  } else if (timestamp.toDate) {
    date = timestamp.toDate();
  } else {
    return false;
  }

  const target = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return target === getTodayDateString();
}

function getCategoryLabel(category) {
  if (!category) return "일반";

  const value = String(category).toLowerCase();

  if (value === "free" || value.includes("자유")) return "자유게시판";
  if (value === "study" || value.includes("스터디")) return "스터디 모집";
  if (value === "review" || value.includes("후기")) return "후기 게시판";
  if (value === "notice" || value.includes("공지")) return "공지사항";

  return category;
}

function getCategoryClass(category) {
  if (!category) return "";

  const value = String(category).toLowerCase();

  if (value === "study" || value.includes("스터디")) return "category-study";
  if (value === "review" || value.includes("후기")) return "category-review";
  if (value === "notice" || value.includes("공지")) return "category-notice";

  return "";
}

function getPostStatus(data) {
  const category = String(data.category || "").toLowerCase();

  const isStudy =
    category === "study" ||
    category.includes("스터디");

  if (!isStudy) {
    return {
      text: "-",
      className: ""
    };
  }

  const currentMembers = data.studyInfo?.currentMembers || 1;
  const maxMembers = data.studyInfo?.maxMembers || 1;
  const studyStatus = String(data.studyInfo?.status || "").trim();

  const status = String(data.status || "").toLowerCase();
  const recruitStatus = String(data.recruitStatus || "").toLowerCase();

  const isClosed =
    currentMembers >= maxMembers ||
    studyStatus === "마감" ||
    status === "closed" ||
    recruitStatus === "closed" ||
    data.isClosed === true;

  if (isClosed) {
    return {
      text: "모집 마감",
      className: "status-closed"
    };
  }

  return {
    text: "모집중",
    className: "status-open"
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function createNotice() {
  const title = noticeTitle.value.trim();
  const content = noticeContent.value.trim();

  if (!title) {
    alert("공지 제목을 입력하세요.");
    noticeTitle.focus();
    return;
  }

  if (!content) {
    alert("공지 내용을 입력하세요.");
    noticeContent.focus();
    return;
  }

  try {
    createNoticeBtn.disabled = true;
    createNoticeBtn.textContent = "등록 중...";

    await addDoc(collection(db, "posts"), {
      category: "notice",
      title: title,
      content: content,
      author: "관리자",
      authorUid: "admin",
      authorEmail: "admin",
      commentCount: 0,
      createdAt: serverTimestamp()
    });

    alert("공지사항이 등록되었습니다.");

    noticeTitle.value = "";
    noticeContent.value = "";

    await loadPosts();
  } catch (error) {
    console.error("공지사항 등록 실패:", error);
    alert("공지사항 등록 중 오류가 발생했습니다.");
  } finally {
    createNoticeBtn.disabled = false;
    createNoticeBtn.textContent = "공지 등록";
  }
}

async function loadPosts() {
  try {
    const postsRef = collection(db, "posts");
    const postsQuery = query(postsRef, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(postsQuery);

    let totalPosts = 0;
    let openStudyPosts = 0;
    let todayPosts = 0;
    let html = "";

    if (snapshot.empty) {
      totalPostsEl.textContent = "0";
      openStudyPostsEl.textContent = "0";
      todayPostsEl.textContent = "0";
      postTableBody.innerHTML = "<tr><td colspan='6' class='empty-message'>게시글 데이터가 없습니다.</td></tr>";
      return;
    }

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const postId = docSnap.id;

      totalPosts++;

      if (isToday(data.createdAt)) {
        todayPosts++;
      }

      const statusInfo = getPostStatus(data);
      const categoryText = getCategoryLabel(data.category);
      const categoryClass = getCategoryClass(data.category);

      if (categoryText === "스터디 모집" && statusInfo.text === "모집중") {
        openStudyPosts++;
      }

      html += `
        <tr>
          <td>
            <span class="category-badge ${categoryClass}">
              ${escapeHtml(categoryText)}
            </span>
          </td>
          <td>
            <div class="post-title">${escapeHtml(data.title || "제목 없음")}</div>
            <div class="post-content">${escapeHtml(data.content || "")}</div>
          </td>
          <td>${escapeHtml(data.author || data.writer || data.nickname || "알 수 없음")}</td>
          <td>${escapeHtml(formatDate(data.createdAt))}</td>
          <td class="${statusInfo.className}">${escapeHtml(statusInfo.text)}</td>
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

    totalPostsEl.textContent = String(totalPosts);
    openStudyPostsEl.textContent = String(openStudyPosts);
    todayPostsEl.textContent = String(todayPosts);
    postTableBody.innerHTML = html;
  } catch (error) {
    console.error("게시글 목록 불러오기 실패:", error);
    totalPostsEl.textContent = "오류";
    openStudyPostsEl.textContent = "오류";
    todayPostsEl.textContent = "오류";
    postTableBody.innerHTML = "<tr><td colspan='6' class='empty-message'>게시글 정보를 불러오지 못했습니다.</td></tr>";
  }
}

async function deletePost(postId, title) {
  const ok = confirm(`"${title}" 글을 삭제하시겠습니까?`);
  if (!ok) return;

  try {
    await deleteDoc(doc(db, "posts", postId));
    alert("게시글이 삭제되었습니다.");
    await loadPosts();
  } catch (error) {
    console.error("게시글 삭제 실패:", error);
    alert("삭제 실패: " + error.message);
  }
}

document.addEventListener("click", async (e) => {
  if (!e.target.classList.contains("delete-btn")) return;

  const postId = e.target.dataset.postId;
  const title = e.target.dataset.title || "제목 없음";

  await deletePost(postId, title);
});

if (createNoticeBtn) {
  createNoticeBtn.addEventListener("click", createNotice);
}

if (noticeContent) {
  noticeContent.addEventListener("keydown", function (e) {
    if (e.ctrlKey && e.key === "Enter") {
      createNotice();
    }
  });
}

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

loadPosts();