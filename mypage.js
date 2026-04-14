import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  doc,
  getDoc,
  collection,
  query,
  orderBy,
  onSnapshot,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const userName = document.getElementById("userName");
const userEmail = document.getElementById("userEmail");
const userCreatedAt = document.getElementById("userCreatedAt");
const userVerified = document.getElementById("userVerified");

const joinedStudyList = document.getElementById("joinedStudyList");
const emptyJoinedStudyMessage = document.getElementById("emptyJoinedStudyMessage");

const myPostList = document.getElementById("myPostList");
const emptyPostMessage = document.getElementById("emptyPostMessage");

let unsubscribeMyPosts = null;

function formatDate(value) {
  if (!value) return "-";

  if (value.seconds) {
    const date = new Date(value.seconds * 1000);
    return date.toLocaleDateString("ko-KR");
  }

  return value;
}

function getCategoryText(category) {
  if (category === "free") return "자유게시판";
  if (category === "study") return "스터디모집";
  if (category === "review") return "후기게시판";
  if (category === "notice") return "공지사항";
  return category || "게시글";
}

function getCategoryClass(category) {
  if (category === "free") return "blue";
  if (category === "study") return "blue";
  if (category === "review") return "blue";
  if (category === "notice") return "blue";
  return "blue";
}

function isMyPost(post, user) {
  return (
    (post.authorUid && post.authorUid === user.uid) ||
    (post.uid && post.uid === user.uid) ||
    (post.authorEmail && post.authorEmail === user.email) ||
    (post.email && post.email === user.email)
  );
}

function renderMyPosts(user) {
  if (!myPostList || !emptyPostMessage) return;

  const postsQuery = query(
    collection(db, "posts"),
    orderBy("createdAt", "desc")
  );

  if (unsubscribeMyPosts) {
    unsubscribeMyPosts();
  }

  unsubscribeMyPosts = onSnapshot(
    postsQuery,
    (snapshot) => {
      myPostList.innerHTML = "";

      const myPosts = [];

      snapshot.forEach((docItem) => {
        const post = docItem.data();

        if (isMyPost(post, user)) {
          myPosts.push({
            id: docItem.id,
            ...post
          });
        }
      });

      if (myPosts.length === 0) {
        emptyPostMessage.style.display = "block";
        emptyPostMessage.textContent = "작성한 게시글이 없습니다.";
        return;
      }

      emptyPostMessage.style.display = "none";

      myPosts.forEach((post) => {
        const cardHtml = `
          <div class="list-card">
            <div>
              <span class="tag ${getCategoryClass(post.category)}">${getCategoryText(post.category)}</span>
              <h3>${post.title || "제목 없음"}</h3>
              <div class="meta">
                <span>작성일: ${formatDate(post.createdAt)}</span>
                <span>댓글 ${post.commentCount || 0}개</span>
                <span>조회수 ${post.viewCount || 0}</span>
              </div>
              <p>${post.content || ""}</p>
            </div>
            <div class="actions">
              <button class="sub-btn" onclick="viewPost('${post.id}')">상세보기</button>
              <button class="sub-btn" onclick="editPost('${post.id}')">수정</button>
              <button class="danger-btn" onclick="deletePost('${post.id}')">삭제</button>
            </div>
          </div>
        `;

        myPostList.insertAdjacentHTML("beforeend", cardHtml);
      });
    },
    (error) => {
      console.error("내 게시글 불러오기 오류:", error);
      myPostList.innerHTML = "";
      emptyPostMessage.style.display = "block";
      emptyPostMessage.textContent = "게시글을 불러오는 중 오류가 발생했습니다.";
    }
  );
}

function renderJoinedStudies(user) {
  if (!joinedStudyList || !emptyJoinedStudyMessage) return;

  const postsQuery = query(
    collection(db, "posts"),
    orderBy("createdAt", "desc")
  );

  onSnapshot(
    postsQuery,
    (snapshot) => {
      joinedStudyList.innerHTML = "";

      const joinedStudies = [];

      snapshot.forEach((docItem) => {
        const post = docItem.data();

        if (post.category !== "study") return;

        const applications = post.applications || [];

        const isAuthor =
          (post.authorUid && post.authorUid === user.uid) ||
          (post.uid && post.uid === user.uid) ||
          (post.authorEmail && post.authorEmail === user.email) ||
          (post.email && post.email === user.email);

        const myApprovedApplication = applications.find((app) => {
          const isMe =
            (app.uid && app.uid === user.uid) ||
            (app.email && app.email === user.email);

          return isMe && app.status === "approved";
        });

        if (isAuthor || myApprovedApplication) {
          joinedStudies.push({
            id: docItem.id,
            ...post,
            isAuthor: isAuthor
          });
        }
      });

      if (joinedStudies.length === 0) {
        emptyJoinedStudyMessage.style.display = "block";
        emptyJoinedStudyMessage.textContent = "참여 중인 스터디 그룹이 없습니다.";
        return;
      }

      emptyJoinedStudyMessage.style.display = "none";

      joinedStudies.forEach((study) => {
        const place = study.studyInfo?.place || "-";
        const schedule = study.studyInfo?.schedule || "-";
        const currentMembers = study.studyInfo?.currentMembers || 1;
        const maxMembers = study.studyInfo?.maxMembers || 1;
        const content = study.content || "";
        const status = study.studyInfo?.status || "모집중";

        joinedStudyList.innerHTML += `
          <div class="list-card">
            <div>
              <span class="tag green">${study.isAuthor ? "내가 만든 스터디" : "참여중"}</span>
              <h3>${study.title || "제목 없음"}</h3>
              <div class="meta">
                <span>장소: ${place}</span>
                <span>일정: ${schedule}</span>
                <span>인원: ${currentMembers} / ${maxMembers}명</span>
                <span>상태: ${status}</span>
              </div>
              <p>${content}</p>
            </div>
            <div class="actions">
              <button class="sub-btn" onclick="viewPost('${study.id}')">상세보기</button>
            </div>
          </div>
        `;
      });
    },
    (error) => {
      console.error("참여 스터디 그룹 불러오기 오류:", error);
      joinedStudyList.innerHTML = "";
      emptyJoinedStudyMessage.style.display = "block";
      emptyJoinedStudyMessage.textContent = "데이터를 불러오는 중 오류가 발생했습니다.";
    }
  );
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

      userName.textContent = data.name || data.nickname || "이름 없음";
      userEmail.textContent = data.email || user.email || "이메일 없음";
      userCreatedAt.textContent = formatDate(data.createdAt);
    } else {
      userName.textContent = "이름 없음";
      userEmail.textContent = user.email || "이메일 없음";
      userCreatedAt.textContent = "-";
    }

    userVerified.textContent = user.emailVerified ? "인증 완료" : "미인증";
    userVerified.style.color = user.emailVerified ? "green" : "red";

    renderMyPosts(user);
  } catch (error) {
    console.error("마이페이지 정보 불러오기 오류:", error);
    userName.textContent = "오류";
    userEmail.textContent = "오류";
    userCreatedAt.textContent = "오류";
    userVerified.textContent = "오류";
  }

  renderJoinedStudies(user);
});

window.viewPost = function (postId) {
  location.href = `community-detail.html?id=${postId}`;
};

window.editPost = function (postId) {
  location.href = `write.html?id=${postId}&mode=edit`;
};

window.deletePost = async function (postId) {
  const ok = confirm("정말 이 게시글을 삭제하시겠습니까?");
  if (!ok) return;

  try {
    await deleteDoc(doc(db, "posts", postId));
    alert("게시글이 삭제되었습니다.");
  } catch (error) {
    console.error("게시글 삭제 오류:", error);
    alert("게시글 삭제 중 오류가 발생했습니다.");
  }
};

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