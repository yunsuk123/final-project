import { db, auth } from "./firebase.js";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  arrayUnion,
  addDoc,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const postList = document.getElementById("postList");
const emptyMessage = document.getElementById("emptyMessage");

const totalPostCount = document.getElementById("totalPostCount");
const recruitingStudyCount = document.getElementById("recruitingStudyCount");
const todayCommentCount = document.getElementById("todayCommentCount");
const searchInput = document.getElementById("searchInput");

window.currentCategory = "all";

function formatDate(timestamp) {
  if (!timestamp) return "방금 전";

  if (timestamp.toDate) {
    return timestamp.toDate().toLocaleString("ko-KR");
  }

  if (timestamp.seconds) {
    return new Date(timestamp.seconds * 1000).toLocaleString("ko-KR");
  }

  return "방금 전";
}

function getCategoryText(category) {
  if (category === "free") return "자유게시판";
  if (category === "study") return "스터디 모집";
  if (category === "review") return "후기 게시판";
  if (category === "notice") return "공지사항";
  return category || "";
}

function getCategoryClass(category) {
  if (category === "free") return "free";
  if (category === "study") return "study";
  if (category === "review") return "review";
  if (category === "notice") return "notice";
  return "";
}

function getPostAuthorUid(post) {
  return post.authorUid || post.uid || "";
}

function checkMyPost(post, user) {
  if (!user || !post) return false;

  return (
    (post.authorUid && post.authorUid === user.uid) ||
    (post.uid && post.uid === user.uid) ||
    (post.authorEmail && post.authorEmail === user.email) ||
    (post.email && post.email === user.email)
  );
}

function isUserSuspended(userData) {
  if (!userData || !userData.suspendedUntil) return false;

  let suspendedDate = null;

  if (userData.suspendedUntil.toDate) {
    suspendedDate = userData.suspendedUntil.toDate();
  } else if (userData.suspendedUntil.seconds) {
    suspendedDate = new Date(userData.suspendedUntil.seconds * 1000);
  } else {
    suspendedDate = new Date(userData.suspendedUntil);
  }

  return suspendedDate > new Date();
}

async function checkSuspendedUser(user) {
  if (!user) return false;

  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) return false;

  return isUserSuspended(userSnap.data());
}

function makeSuspendedDate(reportCount) {
  const suspendedDate = new Date();

  if (reportCount >= 20 && reportCount < 30) {
    suspendedDate.setDate(suspendedDate.getDate() + 14);
    return suspendedDate;
  }

  if (reportCount >= 10 && reportCount < 20) {
    suspendedDate.setDate(suspendedDate.getDate() + 7);
    return suspendedDate;
  }

  return null;
}

async function updateHeaderUserInfo(user) {
  const loginBtn = document.getElementById("loginBtn");
  const userName = document.getElementById("userName");

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

window.deletePost = async function (postId) {
  const user = auth.currentUser;

  if (!user) {
    await window.showAlert("로그인 후 삭제할 수 있습니다.", "warning");
    return;
  }

  const ok = await window.showConfirm("정말 이 게시글을 삭제하시겠습니까?", true);
  if (!ok) return;

  try {
    const postRef = doc(db, "posts", postId);
    const postSnap = await getDoc(postRef);

    if (!postSnap.exists()) {
      await window.showAlert("이미 삭제되었거나 존재하지 않는 게시글입니다.", "error");
      return;
    }

    const post = postSnap.data();

    if (!checkMyPost(post, user)) {
      await window.showAlert("본인이 작성한 글만 삭제할 수 있습니다.", "warning");
      return;
    }

    await deleteDoc(postRef);

    await window.showAlert("게시글이 삭제되었습니다.", "success");
  } catch (error) {
    console.error("게시글 삭제 오류:", error);
    await window.showAlert("게시글 삭제 중 오류가 발생했습니다.", "error");
  }
};

window.reportPost = async function (postId) {
  const user = auth.currentUser;

  if (!user) {
    await window.showAlert("로그인 후 신고할 수 있습니다.", "warning");
    return;
  }

  const reason = prompt(
    "신고 사유를 입력해주세요.\n예: 욕설, 광고, 부적절한 게시글, 기타"
  );

  if (reason === null) return;

  const trimmedReason = reason.trim();

  if (!trimmedReason) {
    await window.showAlert("신고 사유를 입력해야 합니다.", "warning");
    return;
  }

  try {
    const postRef = doc(db, "posts", postId);
    const postSnap = await getDoc(postRef);

    if (!postSnap.exists()) {
      await window.showAlert("게시글이 존재하지 않습니다.", "error");
      return;
    }

    const post = postSnap.data();
    const authorUid = getPostAuthorUid(post);

    if (!authorUid) {
      await window.showAlert("작성자 정보를 찾을 수 없어 신고할 수 없습니다.", "error");
      return;
    }

    if (checkMyPost(post, user)) {
      await window.showAlert("본인이 작성한 글은 신고할 수 없습니다.", "warning");
      return;
    }

    const authorRef = doc(db, "users", authorUid);
    const authorSnap = await getDoc(authorRef);

    if (!authorSnap.exists()) {
      await window.showAlert("작성자 회원 정보를 찾을 수 없습니다.", "error");
      return;
    }

    // 이미 신고했는지 — reports 서브컬렉션에서 확인 (Firestore에서 지우면 실제로 초기화됨)
    const reportsRef = collection(db, "posts", postId, "reports");
    const dupQ = query(reportsRef, where("reporterUid", "==", user.uid));
    const dupSnap = await getDocs(dupQ);

    if (!dupSnap.empty) {
      await window.showAlert("이미 신고한 게시글입니다.", "warning");
      return;
    }

    const authorData = authorSnap.data();
    const newReportCount = (authorData.reportCount || 0) + 1;
    const suspendedUntil = makeSuspendedDate(newReportCount);

    // reports 서브컬렉션에 신고 저장
    await addDoc(reportsRef, {
      postId: postId,
      postTitle: post.title || "",
      reporterUid: user.uid,
      reporterEmail: user.email || "",
      reason: trimmedReason,
      reportedAt: new Date()
    });

    // 작성자 reportCount 증가
    const updateData = {
      reportCount: newReportCount,
      reportedBy: arrayUnion(user.uid)
    };

    if (suspendedUntil) {
      updateData.suspendedUntil = suspendedUntil;
    }

    await updateDoc(authorRef, updateData);

    await window.showAlert("신고가 접수되었습니다.\n관리자 검토 후 처리됩니다.", "success");
  } catch (error) {
    console.error("신고 처리 오류:", error);
    await window.showAlert("신고 처리 중 오류가 발생했습니다.", "error");
  }
};

window.joinStudy = async function (postId) {
  const user = auth.currentUser;

  if (!user) {
    await window.showAlert("로그인 후 신청할 수 있습니다.", "warning");
    return;
  }

  try {
    const suspended = await checkSuspendedUser(user);

    if (suspended) {
      await window.showAlert("정지된 계정은 스터디에 신청할 수 없습니다.", "error");
      return;
    }

    const postRef = doc(db, "posts", postId);
    const postSnap = await getDoc(postRef);

    if (!postSnap.exists()) {
      await window.showAlert("게시글이 존재하지 않습니다.", "error");
      return;
    }

    const post = postSnap.data();

    if (checkMyPost(post, user)) {
      await window.showAlert("본인이 작성한 글에는 신청할 수 없습니다.", "warning");
      return;
    }

    const applications = post.applications || [];

    const alreadyApplied = applications.some((app) =>
      (app.uid && app.uid === user.uid) ||
      (app.email && app.email === user.email)
    );

    if (alreadyApplied) {
      await window.showAlert("이미 신청한 글입니다.", "warning");
      return;
    }

    let applicantName = user.email ? user.email.split("@")[0] : "사용자";

    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const userData = userSnap.data();
      applicantName =
        userData.nickname ||
        userData.name ||
        userData.username ||
        userData.userName ||
        applicantName;
    }

    applications.push({
      uid: user.uid,
      email: user.email,
      name: applicantName,
      status: "pending"
    });

    await updateDoc(postRef, {
      applications: applications
    });

    await window.showAlert("참여 신청되었습니다.", "success");
  } catch (error) {
    console.error("참여 신청 오류:", error);
    await window.showAlert("참여 신청 중 오류가 발생했습니다.", "error");
  }
};

window.viewPost = function (postId) {
  location.href = `community-detail.html?id=${postId}`;
};

window.filterPosts = function (category, buttonElement) {
  const cards = document.querySelectorAll(".post-card");
  const tabButtons = document.querySelectorAll(".tab-btn");
  const searchValue = (searchInput?.value || "").toLowerCase().trim();

  window.currentCategory = category;

  tabButtons.forEach((btn) => btn.classList.remove("active"));
  if (buttonElement) {
    buttonElement.classList.add("active");
  }

  let visibleCount = 0;

  cards.forEach((card) => {
    const cardCategory = card.dataset.category;
    const cardSearch = (card.dataset.search || "").toLowerCase();

    const matchCategory = category === "all" || cardCategory === category;
    const matchSearch = searchValue === "" || cardSearch.includes(searchValue);

    if (matchCategory && matchSearch) {
      card.classList.remove("hidden");
      visibleCount++;
    } else {
      card.classList.add("hidden");
    }
  });

  toggleEmptyMessage(visibleCount);
};

window.searchPosts = function () {
  const cards = document.querySelectorAll(".post-card");
  const searchValue = (searchInput?.value || "").toLowerCase().trim();
  const currentCategory = window.currentCategory || "all";
  let visibleCount = 0;

  cards.forEach((card) => {
    const cardCategory = card.dataset.category;
    const cardSearch = (card.dataset.search || "").toLowerCase();

    const matchCategory = currentCategory === "all" || cardCategory === currentCategory;
    const matchSearch = searchValue === "" || cardSearch.includes(searchValue);

    if (matchCategory && matchSearch) {
      card.classList.remove("hidden");
      visibleCount++;
    } else {
      card.classList.add("hidden");
    }
  });

  toggleEmptyMessage(visibleCount);
};

function toggleEmptyMessage(count) {
  if (!emptyMessage) return;
  emptyMessage.style.display = count === 0 ? "block" : "none";
}

function updateStats(totalCount, recruitingCount, totalComments) {
  if (totalPostCount) totalPostCount.textContent = String(totalCount);
  if (recruitingStudyCount) recruitingStudyCount.textContent = String(recruitingCount);
  if (todayCommentCount) todayCommentCount.textContent = String(totalComments);
}

if (searchInput) {
  searchInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      searchPosts();
    }
  });
}

const postsQuery = query(
  collection(db, "posts"),
  orderBy("createdAt", "desc")
);

let unsubscribePosts = null;

onAuthStateChanged(auth, async (user) => {
  await updateHeaderUserInfo(user);

  if (unsubscribePosts) {
    unsubscribePosts();
  }

  unsubscribePosts = onSnapshot(postsQuery, (snapshot) => {
    if (!postList) return;

    postList.innerHTML = "";

    let totalCount = 0;
    let recruitingCount = 0;
    let totalComments = 0;

    if (snapshot.empty) {
      updateStats(0, 0, 0);
      toggleEmptyMessage(0);
      return;
    }

    snapshot.forEach((docItem) => {
      const post = docItem.data();
      totalCount++;

      const searchText = `
        ${post.title || ""}
        ${post.content || ""}
        ${post.author || ""}
        ${post.studyInfo?.place || ""}
        ${post.studyInfo?.schedule || ""}
      `.toLowerCase();

      const commentCount = post.commentCount || 0;
      totalComments += commentCount;

      const isMyPost = checkMyPost(post, user);

      const deleteButtonHtml = isMyPost
        ? `<button class="sub-btn" style="background:#ffeaea; color:#e64d4d;" onclick="deletePost('${docItem.id}')">삭제</button>`
        : "";

      const reportButtonHtml = !isMyPost
        ? `<button class="sub-btn" onclick="reportPost('${docItem.id}')">신고</button>`
        : "";

      let cardHtml = "";

      if (post.category === "study" && post.studyInfo) {
        const currentMembers = post.studyInfo.currentMembers || 1;
        const maxMembers = post.studyInfo.maxMembers || 1;
        const isClosed =
          currentMembers >= maxMembers || post.studyInfo.status === "마감";

        if (!isClosed) {
          recruitingCount++;
        }

        const applications = post.applications || [];

        const alreadyApplied =
          user &&
          applications.some((app) =>
            (app.uid && app.uid === user.uid) ||
            (app.email && app.email === user.email)
          );

        let joinButtonHtml = "";

        if (isClosed) {
          joinButtonHtml = `<button class="join-btn disabled" disabled>모집 마감</button>`;
        } else if (isMyPost) {
          joinButtonHtml = `<button class="join-btn disabled" disabled>내가 작성한 글</button>`;
        } else if (alreadyApplied) {
          joinButtonHtml = `<button class="join-btn disabled" disabled>신청 완료</button>`;
        } else {
          joinButtonHtml = `<button class="join-btn" onclick="joinStudy('${docItem.id}')">참여하기</button>`;
        }

        cardHtml = `
          <div class="post-card" data-category="${post.category}" data-search="${searchText}">
            <div>
              <span class="tag study">스터디 모집</span>
              <span class="tag ${isClosed ? "status-close" : "status-open"}">
                ${isClosed ? "마감" : "모집중"}
              </span>

              <div class="post-title">${post.title || ""}</div>
              <p class="post-desc">${post.content || ""}</p>

              <div class="study-info-grid">
                <div class="study-info-box">
                  <h4>지점</h4>
                  <p>${post.studyInfo.place || "-"}</p>
                </div>
                <div class="study-info-box">
                  <h4>일정</h4>
                  <p>${post.studyInfo.schedule || "-"}</p>
                </div>
                <div class="study-info-box">
                  <h4>인원</h4>
                  <p>${currentMembers} / ${maxMembers}명</p>
                </div>
                <div class="study-info-box">
                  <h4>상태</h4>
                  <p>${isClosed ? "마감" : "모집중"}</p>
                </div>
              </div>

              <div class="meta" style="margin-top: 14px;">
                <span>작성자: ${post.author || "-"}</span>
                <span>작성일: ${formatDate(post.createdAt)}</span>
                <span>댓글: ${commentCount}개</span>
              </div>

              <div class="post-actions">
                <button class="sub-btn" onclick="viewPost('${docItem.id}')">상세보기</button>
                ${joinButtonHtml}
                ${deleteButtonHtml}
                ${reportButtonHtml}
              </div>
            </div>
          </div>
        `;
      } else {
        cardHtml = `
          <div class="post-card" data-category="${post.category}" data-search="${searchText}">
            <div class="post-top">
              <div>
                <span class="tag ${getCategoryClass(post.category)}">${getCategoryText(post.category)}</span>
                <div class="post-title">${post.title || ""}</div>
                <p class="post-desc">${post.content || ""}</p>
                <div class="meta">
                  <span>작성자: ${post.author || "-"}</span>
                  <span>작성일: ${formatDate(post.createdAt)}</span>
                  <span>댓글: ${commentCount}개</span>
                </div>
              </div>

              <div class="post-actions">
                <button class="sub-btn" onclick="viewPost('${docItem.id}')">상세보기</button>
                ${deleteButtonHtml}
                ${reportButtonHtml}
              </div>
            </div>
          </div>
        `;
      }

      postList.insertAdjacentHTML("beforeend", cardHtml);
    });

    updateStats(totalCount, recruitingCount, totalComments);
    searchPosts();
  });
});