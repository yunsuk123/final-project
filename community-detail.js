import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  doc,
  getDoc,
  deleteDoc,
  updateDoc,
  increment,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const userName = document.getElementById("userName");
const loginBtn = document.getElementById("loginBtn");

const loadingBox = document.getElementById("loadingBox");
const errorBox = document.getElementById("errorBox");
const detailCard = document.getElementById("detailCard");

const tagArea = document.getElementById("tagArea");
const postTitle = document.getElementById("postTitle");
const postAuthor = document.getElementById("postAuthor");
const postDate = document.getElementById("postDate");
const postViews = document.getElementById("postViews");
const postComments = document.getElementById("postComments");
const postContent = document.getElementById("postContent");

const studyBox = document.getElementById("studyBox");
const studyPlace = document.getElementById("studyPlace");
const studySchedule = document.getElementById("studySchedule");
const studyMembers = document.getElementById("studyMembers");
const studyStatus = document.getElementById("studyStatus");

const applicationBox = document.getElementById("applicationBox");
const applicationList = document.getElementById("applicationList");

const editBtn = document.getElementById("editBtn");
const deleteBtn = document.getElementById("deleteBtn");

// 댓글 관련 DOM
const commentInput = document.getElementById("commentInput");
const commentSubmitBtn = document.getElementById("commentSubmitBtn");
const commentList = document.getElementById("commentList");
const commentEmptyMessage = document.getElementById("commentEmptyMessage");

const params = new URLSearchParams(window.location.search);
const postId = params.get("id");

let unsubscribeComments = null;

function formatDate(value) {
  if (!value) return "-";

  if (value.seconds) {
    return new Date(value.seconds * 1000).toLocaleString("ko-KR");
  }

  if (value.toDate) {
    return value.toDate().toLocaleString("ko-KR");
  }

  return value;
}

function getCategoryText(category) {
  if (category === "free") return "자유게시판";
  if (category === "study") return "스터디 모집";
  if (category === "review") return "후기 게시판";
  if (category === "notice") return "공지사항";
  return "게시글";
}

function getCategoryClass(category) {
  if (category === "free") return "free";
  if (category === "study") return "study";
  if (category === "review") return "review";
  if (category === "notice") return "notice";
  return "";
}

async function updateHeaderUserInfo(user) {
  if (!loginBtn || !userName) return;

  if (!user) {
    userName.textContent = "";
    loginBtn.textContent = "로그인";
    loginBtn.href = "login.html";
    loginBtn.onclick = null;
    return;
  }

  let displayName = "";

  try {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const userData = userSnap.data();
      displayName =
        userData.nickname ||
        userData.name ||
        userData.username ||
        userData.userName ||
        "";
    }
  } catch (error) {
    console.error("사용자 정보 불러오기 실패:", error);
  }

  if (!displayName) {
    displayName = user.displayName || user.email?.split("@")[0] || "사용자";
  }

  userName.textContent = displayName + "님";
  loginBtn.textContent = "로그아웃";
  loginBtn.href = "#";
  loginBtn.onclick = async function (e) {
    e.preventDefault();
    await signOut(auth);
    window.location.href = "index.html";
  };
}

function showError(message = "게시글을 찾을 수 없습니다.") {
  loadingBox.classList.add("hidden");
  detailCard.classList.add("hidden");
  errorBox.classList.remove("hidden");
  errorBox.textContent = message;
}

function renderTags(post) {
  const categoryTag = `<span class="tag ${getCategoryClass(post.category)}">${getCategoryText(post.category)}</span>`;

  if (post.category === "study" && post.studyInfo) {
    const currentMembers = post.studyInfo.currentMembers || 1;
    const maxMembers = post.studyInfo.maxMembers || 1;
    const isClosed = currentMembers >= maxMembers || post.studyInfo.status === "마감";

    const statusTag = `<span class="tag ${isClosed ? "status-close" : "status-open"}">${isClosed ? "마감" : "모집중"}</span>`;
    tagArea.innerHTML = categoryTag + statusTag;
    return;
  }

  tagArea.innerHTML = categoryTag;
}

function isMyPost(post, user) {
  if (!user) return false;

  return (
    (post.authorUid && post.authorUid === user.uid) ||
    (post.uid && post.uid === user.uid) ||
    (post.authorEmail && post.authorEmail === user.email) ||
    (post.email && post.email === user.email)
  );
}

async function getUserDisplayName(user) {
  if (!user) return "사용자";

  try {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const userData = userSnap.data();
      return (
        userData.nickname ||
        userData.name ||
        userData.username ||
        userData.userName ||
        user.email?.split("@")[0] ||
        "사용자"
      );
    }
  } catch (error) {
    console.error("댓글 작성자 이름 불러오기 실패:", error);
  }

  return user.displayName || user.email?.split("@")[0] || "사용자";
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ===============================
// 채팅방 멤버 구성 함수 추가
// ===============================
function getOwnerMember(post) {
  return {
    uid: post.authorUid || post.uid || "",
    email: post.authorEmail || post.email || "",
    name: post.author || "작성자",
    role: "owner"
  };
}

function buildChatMembers(post) {
  const members = [];
  const owner = getOwnerMember(post);

  if (owner.uid || owner.email) {
    members.push(owner);
  }

  const applications = post.applications || [];

  applications.forEach((app) => {
    if (app.status !== "approved") return;

    const alreadyExists = members.some((member) => {
      return (
        (member.uid && app.uid && member.uid === app.uid) ||
        (member.email && app.email && member.email === app.email)
      );
    });

    if (!alreadyExists) {
      members.push({
        uid: app.uid || "",
        email: app.email || "",
        name: app.name || "참여자",
        role: "member"
      });
    }
  });

  return members;
}

function loadComments() {
  if (!postId || !commentList || !commentEmptyMessage) return;

  if (unsubscribeComments) {
    unsubscribeComments();
  }

  const commentsQuery = query(
    collection(db, "posts", postId, "comments"),
    orderBy("createdAt", "asc")
  );

  unsubscribeComments = onSnapshot(commentsQuery, (snapshot) => {
    commentList.innerHTML = "";

    if (snapshot.empty) {
      commentEmptyMessage.style.display = "block";
      commentEmptyMessage.textContent = "아직 댓글이 없습니다.";
      if (postComments) {
        postComments.textContent = "댓글: 0개";
      }
      return;
    }

    commentEmptyMessage.style.display = "none";

    const currentUser = auth.currentUser;

    snapshot.forEach((docItem) => {
      const comment = docItem.data();
      const commentId = docItem.id;

      const isMyComment =
        currentUser &&
        (
          (comment.authorUid && comment.authorUid === currentUser.uid) ||
          (comment.authorEmail && comment.authorEmail === currentUser.email)
        );

      const actionButtons = isMyComment
        ? `
          <div class="comment-actions" style="display:flex; gap:8px; margin-top:10px;">
            <button
              type="button"
              onclick="editComment('${commentId}')"
              style="padding:8px 12px; border:none; border-radius:10px; background:#eef2ff; color:#4a6cf7; font-weight:700; cursor:pointer;"
            >
              수정
            </button>
            <button
              type="button"
              onclick="deleteComment('${commentId}')"
              style="padding:8px 12px; border:none; border-radius:10px; background:#ffeaea; color:#d63b3b; font-weight:700; cursor:pointer;"
            >
              삭제
            </button>
          </div>
        `
        : "";

      const commentHtml = `
        <div class="comment-item">
          <div class="comment-top">
            <strong class="comment-author">${escapeHtml(comment.authorName || "익명")}</strong>
            <span class="comment-date">${formatDate(comment.createdAt)}</span>
          </div>
          <div class="comment-content">${escapeHtml(comment.content || "")}</div>
          ${actionButtons}
        </div>
      `;

      commentList.insertAdjacentHTML("beforeend", commentHtml);
    });

    if (postComments) {
      postComments.textContent = `댓글: ${snapshot.size}개`;
    }
  }, (error) => {
    console.error("댓글 불러오기 오류:", error);
    commentList.innerHTML = "";
    commentEmptyMessage.style.display = "block";
    commentEmptyMessage.textContent = "댓글을 불러오는 중 오류가 발생했습니다.";
  });
}

async function submitComment() {
  const user = auth.currentUser;

  if (!user) {
    alert("로그인 후 댓글을 작성할 수 있습니다.");
    return;
  }

  if (!postId) {
    alert("잘못된 접근입니다.");
    return;
  }

  if (!commentInput) {
    alert("댓글 입력창을 찾을 수 없습니다.");
    return;
  }

  const content = commentInput.value.trim();

  if (!content) {
    alert("댓글 내용을 입력해주세요.");
    commentInput.focus();
    return;
  }

  try {
    const authorName = await getUserDisplayName(user);

    await addDoc(collection(db, "posts", postId, "comments"), {
      content: content,
      authorUid: user.uid,
      authorEmail: user.email || "",
      authorName: authorName,
      createdAt: serverTimestamp()
    });

    await updateDoc(doc(db, "posts", postId), {
      commentCount: increment(1)
    });

    commentInput.value = "";
  } catch (error) {
    console.error("댓글 등록 오류:", error);
    alert("댓글 등록 중 오류가 발생했습니다.");
  }
}

window.editComment = async function (commentId) {
  const user = auth.currentUser;

  if (!user) {
    alert("로그인 후 이용할 수 있습니다.");
    return;
  }

  try {
    const commentRef = doc(db, "posts", postId, "comments", commentId);
    const commentSnap = await getDoc(commentRef);

    if (!commentSnap.exists()) {
      alert("댓글을 찾을 수 없습니다.");
      return;
    }

    const comment = commentSnap.data();

    const isMyComment =
      (comment.authorUid && comment.authorUid === user.uid) ||
      (comment.authorEmail && comment.authorEmail === user.email);

    if (!isMyComment) {
      alert("본인이 작성한 댓글만 수정할 수 있습니다.");
      return;
    }

    const newContent = prompt("댓글을 수정하세요.", comment.content || "");

    if (newContent === null) return;

    const trimmedContent = newContent.trim();

    if (!trimmedContent) {
      alert("댓글 내용을 입력해주세요.");
      return;
    }

    await updateDoc(commentRef, {
      content: trimmedContent,
      updatedAt: serverTimestamp()
    });

    alert("댓글이 수정되었습니다.");
  } catch (error) {
    console.error("댓글 수정 오류:", error);
    alert("댓글 수정 중 오류가 발생했습니다.");
  }
};

window.deleteComment = async function (commentId) {
  const user = auth.currentUser;

  if (!user) {
    alert("로그인 후 이용할 수 있습니다.");
    return;
  }

  const ok = confirm("이 댓글을 삭제하시겠습니까?");
  if (!ok) return;

  try {
    const commentRef = doc(db, "posts", postId, "comments", commentId);
    const commentSnap = await getDoc(commentRef);

    if (!commentSnap.exists()) {
      alert("댓글을 찾을 수 없습니다.");
      return;
    }

    const comment = commentSnap.data();

    const isMyComment =
      (comment.authorUid && comment.authorUid === user.uid) ||
      (comment.authorEmail && comment.authorEmail === user.email);

    if (!isMyComment) {
      alert("본인이 작성한 댓글만 삭제할 수 있습니다.");
      return;
    }

    await deleteDoc(commentRef);

    await updateDoc(doc(db, "posts", postId), {
      commentCount: increment(-1)
    });

    alert("댓글이 삭제되었습니다.");
  } catch (error) {
    console.error("댓글 삭제 오류:", error);
    alert("댓글 삭제 중 오류가 발생했습니다.");
  }
};

window.approveApplication = async function (postId, index) {
  try {
    const postRef = doc(db, "posts", postId);
    const postSnap = await getDoc(postRef);

    if (!postSnap.exists()) {
      alert("게시글이 존재하지 않습니다.");
      return;
    }

    const post = postSnap.data();
    const applications = [...(post.applications || [])];
    const studyInfo = post.studyInfo || {};

    if (!applications[index]) {
      alert("신청자 정보를 찾을 수 없습니다.");
      return;
    }

    if (applications[index].status !== "pending") {
      alert("이미 처리된 신청입니다.");
      return;
    }

    let currentMembers = studyInfo.currentMembers || 1;
    const maxMembers = studyInfo.maxMembers || 1;

    if (currentMembers >= maxMembers) {
      alert("이미 모집이 마감되었습니다.");
      return;
    }

    applications[index].status = "approved";
    currentMembers += 1;

    const nextStatus = currentMembers >= maxMembers ? "마감" : "모집중";

    const updatedPostForMembers = {
      ...post,
      applications: applications,
      studyInfo: {
        ...studyInfo,
        currentMembers: currentMembers,
        status: nextStatus
      }
    };

    const chatMembers = buildChatMembers(updatedPostForMembers);

    await updateDoc(postRef, {
      applications: applications,
      "studyInfo.currentMembers": currentMembers,
      "studyInfo.status": nextStatus,
      chatMembers: chatMembers
    });

    alert("신청을 수락했습니다.");
    location.reload();
  } catch (error) {
    console.error("신청 수락 오류:", error);
    alert("신청 수락 중 오류가 발생했습니다.");
  }
};

window.rejectApplication = async function (postId, index) {
  try {
    const postRef = doc(db, "posts", postId);
    const postSnap = await getDoc(postRef);

    if (!postSnap.exists()) {
      alert("게시글이 존재하지 않습니다.");
      return;
    }

    const post = postSnap.data();
    const applications = [...(post.applications || [])];

    if (!applications[index]) {
      alert("신청자 정보를 찾을 수 없습니다.");
      return;
    }

    if (applications[index].status !== "pending") {
      alert("이미 처리된 신청입니다.");
      return;
    }

    applications[index].status = "rejected";

    const updatedPostForMembers = {
      ...post,
      applications: applications
    };

    const chatMembers = buildChatMembers(updatedPostForMembers);

    await updateDoc(postRef, {
      applications: applications,
      chatMembers: chatMembers
    });

    alert("신청을 거절했습니다.");
    location.reload();
  } catch (error) {
    console.error("신청 거절 오류:", error);
    alert("신청 거절 중 오류가 발생했습니다.");
  }
};

window.goToStudyChat = function () {
  location.href = `study-chat.html?id=${postId}`;
};

async function loadPost(user) {
  if (!postId) {
    showError("잘못된 접근입니다.");
    return;
  }

  try {
    const postRef = doc(db, "posts", postId);
    const postSnap = await getDoc(postRef);

    if (!postSnap.exists()) {
      showError("존재하지 않는 게시글입니다.");
      return;
    }

    let post = postSnap.data();

    // 스터디 글이면 chatMembers 초기화
    if (post.category === "study") {
      const currentChatMembers = post.chatMembers || [];
      const shouldInitChatMembers = currentChatMembers.length === 0;

      if (shouldInitChatMembers) {
        const initializedChatMembers = buildChatMembers(post);

        await updateDoc(postRef, {
          chatMembers: initializedChatMembers
        });

        const refreshedSnap = await getDoc(postRef);
        if (refreshedSnap.exists()) {
          post = refreshedSnap.data();
        }
      }
    }

    const viewerId = user ? user.uid : "guest";
    const viewedKey = `viewed_post_${postId}_${viewerId}`;

    if (!sessionStorage.getItem(viewedKey)) {
      try {
        await updateDoc(postRef, {
          viewCount: increment(1)
        });

        sessionStorage.setItem(viewedKey, "true");

        const updatedSnap = await getDoc(postRef);
        if (updatedSnap.exists()) {
          post = updatedSnap.data();
        }
      } catch (error) {
        console.error("조회수 증가 실패:", error);
      }
    }

    renderTags(post);

    postTitle.textContent = post.title || "제목 없음";
    postAuthor.textContent = `작성자: ${post.author || "-"}`;
    postDate.textContent = `작성일: ${formatDate(post.createdAt)}`;
    postViews.textContent = `조회수: ${post.viewCount || 0}`;
    postComments.textContent = `댓글: ${post.commentCount || 0}개`;
    postContent.textContent = post.content || "";

    if (post.category === "study" && post.studyInfo) {
      studyBox?.classList.remove("hidden");

      studyPlace.textContent = post.studyInfo.place || "-";
      studySchedule.textContent = post.studyInfo.schedule || "-";

      const currentMembers = post.studyInfo.currentMembers || 1;
      const maxMembers = post.studyInfo.maxMembers || 1;
      const isClosed = currentMembers >= maxMembers || post.studyInfo.status === "마감";

      studyMembers.textContent = `${currentMembers} / ${maxMembers}명`;
      studyStatus.textContent = isClosed ? "마감" : "모집중";
    } else {
      studyBox?.classList.add("hidden");
    }

    if (post.category === "study" && isMyPost(post, user)) {
      applicationBox.classList.remove("hidden");

      const applications = post.applications || [];

      if (applications.length === 0) {
        applicationList.innerHTML = "<p>아직 신청자가 없습니다.</p>";
      } else {
        applicationList.innerHTML = "";

        applications.forEach((app, index) => {
          let statusText = "대기중";

          if (app.status === "approved") statusText = "수락됨";
          if (app.status === "rejected") statusText = "거절됨";

          let actionButtons = "";

          if (app.status === "pending") {
            actionButtons = `
              <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <button
                  type="button"
                  onclick="approveApplication('${postId}', ${index})"
                  style="padding:8px 12px; border:none; border-radius:8px; background:#4a6cf7; color:#fff; font-weight:700; cursor:pointer;"
                >
                  수락
                </button>
                <button
                  type="button"
                  onclick="rejectApplication('${postId}', ${index})"
                  style="padding:8px 12px; border:none; border-radius:8px; background:#ffeaea; color:#d63b3b; font-weight:700; cursor:pointer;"
                >
                  거절
                </button>
              </div>
            `;
          }

          applicationList.innerHTML += `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:12px 0; border-bottom:1px solid #eee; flex-wrap:wrap;">
              <div>
                <p style="font-weight:700; margin-bottom:4px;">${app.name || "이름 없음"}</p>
                <p style="font-size:14px; color:#666; margin-bottom:4px;">${app.email || "-"}</p>
                <p style="font-size:14px; font-weight:700; color:#4a6cf7;">${statusText}</p>
              </div>
              ${actionButtons}
            </div>
          `;
        });
      }
    } else {
      applicationBox.classList.add("hidden");
    }

    if (isMyPost(post, user)) {
      editBtn.classList.remove("hidden");
      deleteBtn.classList.remove("hidden");

      editBtn.onclick = function () {
        location.href = `write.html?id=${postId}&mode=edit`;
      };

      deleteBtn.onclick = async function () {
        const ok = confirm("정말 이 게시글을 삭제하시겠습니까?");
        if (!ok) return;

        try {
          await deleteDoc(doc(db, "posts", postId));
          alert("게시글이 삭제되었습니다.");
          location.href = "community.html";
        } catch (error) {
          console.error("게시글 삭제 오류:", error);
          alert("게시글 삭제 중 오류가 발생했습니다.");
        }
      };
    } else {
      editBtn.classList.add("hidden");
      deleteBtn.classList.add("hidden");
    }

    loadingBox.classList.add("hidden");
    errorBox.classList.add("hidden");
    detailCard.classList.remove("hidden");
  } catch (error) {
    console.error("게시글 상세 불러오기 오류:", error);
    showError("게시글을 불러오는 중 오류가 발생했습니다.");
  }
}

if (commentSubmitBtn) {
  commentSubmitBtn.addEventListener("click", submitComment);
}

if (commentInput) {
  commentInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitComment();
    }
  });
}

onAuthStateChanged(auth, async (user) => {
  await updateHeaderUserInfo(user);
  await loadPost(user);
  loadComments();
});