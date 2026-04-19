import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  doc,
  getDoc,
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
const chatLayout = document.getElementById("chatLayout");

const studyTitle = document.getElementById("studyTitle");
const studyPlace = document.getElementById("studyPlace");
const studySchedule = document.getElementById("studySchedule");
const studyStatus = document.getElementById("studyStatus");

const headerTitle = document.getElementById("headerTitle");
const headerSub = document.getElementById("headerSub");
const memberCountBadge = document.getElementById("memberCountBadge");
const memberList = document.getElementById("memberList");

const chatList = document.getElementById("chatList");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const backToPostBtn = document.getElementById("backToPostBtn");

const params = new URLSearchParams(window.location.search);
const postId = params.get("id");

let currentUser = null;
let currentPost = null;
let unsubscribeMessages = null;

function formatDate(value) {
  if (!value) return "";

  if (value.seconds) {
    return new Date(value.seconds * 1000).toLocaleString("ko-KR");
  }

  if (value.toDate) {
    return value.toDate().toLocaleString("ko-KR");
  }

  return String(value);
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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

function showError(message) {
  loadingBox.classList.add("hidden");
  chatLayout.classList.add("hidden");
  errorBox.classList.remove("hidden");
  errorBox.textContent = message;
}

function isChatMember(post, user) {
  if (!user) return false;

  const chatMembers = post.chatMembers || [];

  return chatMembers.some((member) => {
    return (
      (member.uid && member.uid === user.uid) ||
      (member.email && member.email === user.email)
    );
  });
}

function renderStudyInfo(post) {
  const members = post.chatMembers || [];
  const place = post.studyInfo?.place || "-";
  const schedule = post.studyInfo?.schedule || "-";
  const status = post.studyInfo?.status || "모집중";

  studyTitle.textContent = post.title || "제목 없음";
  studyPlace.textContent = place;
  studySchedule.textContent = schedule;
  studyStatus.textContent = status;

  headerTitle.textContent = post.title || "스터디 채팅방";
  headerSub.textContent = `${place} · ${schedule}`;
  memberCountBadge.textContent = `${members.length}명`;

  memberList.innerHTML = "";

  if (members.length === 0) {
    memberList.innerHTML = `<div class="empty-chat">참여 멤버가 없습니다.</div>`;
  } else {
    members.forEach((member) => {
      memberList.innerHTML += `
        <div class="member-item">
          <span class="member-name">${escapeHtml(member.name || "사용자")}</span>
          <span class="member-role">${member.role === "owner" ? "방장" : "멤버"}</span>
        </div>
      `;
    });
  }

  backToPostBtn.href = `community-detail.html?id=${postId}`;
}

function renderEmptyChat() {
  chatList.innerHTML = `
    <div class="empty-chat">
      아직 대화가 없습니다.<br />
      첫 메시지를 보내보세요.
    </div>
  `;
}

function renderMessages(snapshot) {
  chatList.innerHTML = "";

  if (snapshot.empty) {
    renderEmptyChat();
    return;
  }

  snapshot.forEach((docItem) => {
    const message = docItem.data();

    const isMine =
      currentUser &&
      (
        (message.senderUid && message.senderUid === currentUser.uid) ||
        (message.senderEmail && message.senderEmail === currentUser.email)
      );

    const rowClass = isMine ? "mine" : "other";

    chatList.innerHTML += `
      <div class="message-row ${rowClass}">
        <div class="message-bubble">
          <div class="message-author">${escapeHtml(message.senderName || "사용자")}</div>
          <div class="message-text">${escapeHtml(message.text || "")}</div>
          <div class="message-time">${formatDate(message.createdAt)}</div>
        </div>
      </div>
    `;
  });

  chatList.scrollTop = chatList.scrollHeight;
}

function loadMessages() {
  if (!postId) return;

  if (unsubscribeMessages) {
    unsubscribeMessages();
  }

  const messagesQuery = query(
    collection(db, "posts", postId, "messages"),
    orderBy("createdAt", "asc")
  );

  unsubscribeMessages = onSnapshot(messagesQuery, (snapshot) => {
    renderMessages(snapshot);
  }, (error) => {
    console.error("채팅 불러오기 오류:", error);
    showError("채팅 메시지를 불러오는 중 오류가 발생했습니다.");
  });
}

async function getCurrentUserDisplayName(user) {
  if (!user) return "사용자";

  try {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const data = userSnap.data();
      return (
        data.nickname ||
        data.name ||
        data.username ||
        data.userName ||
        user.email?.split("@")[0] ||
        "사용자"
      );
    }
  } catch (error) {
    console.error("보내는 사용자 이름 조회 실패:", error);
  }

  return user.displayName || user.email?.split("@")[0] || "사용자";
}

async function sendMessage() {
  if (!currentUser) {
    alert("로그인 후 이용할 수 있습니다.");
    return;
  }

  if (!currentPost) {
    alert("채팅방 정보를 찾을 수 없습니다.");
    return;
  }

  const text = chatInput.value.trim();

  if (!text) {
    chatInput.focus();
    return;
  }

  if (!isChatMember(currentPost, currentUser)) {
    alert("이 채팅방에 메시지를 보낼 권한이 없습니다.");
    return;
  }

  try {
    const senderName = await getCurrentUserDisplayName(currentUser);

    await addDoc(collection(db, "posts", postId, "messages"), {
      senderUid: currentUser.uid,
      senderEmail: currentUser.email || "",
      senderName: senderName,
      text: text,
      createdAt: serverTimestamp()
    });

    chatInput.value = "";
    chatInput.focus();
  } catch (error) {
    console.error("메시지 전송 오류:", error);
    alert("메시지 전송 중 오류가 발생했습니다.");
  }
}

async function loadChatRoom(user) {
  if (!postId) {
    showError("잘못된 접근입니다.");
    return;
  }

  if (!user) {
    showError("로그인 후 이용할 수 있습니다.");
    return;
  }

  try {
    const postRef = doc(db, "posts", postId);
    const postSnap = await getDoc(postRef);

    if (!postSnap.exists()) {
      showError("존재하지 않는 스터디 채팅방입니다.");
      return;
    }

    const post = postSnap.data();

    if (post.category !== "study") {
      showError("스터디 채팅방만 이용할 수 있습니다.");
      return;
    }

    if (!isChatMember(post, user)) {
      showError("이 채팅방에 접근할 권한이 없습니다.");
      return;
    }

    currentPost = post;
    renderStudyInfo(post);

    loadingBox.classList.add("hidden");
    errorBox.classList.add("hidden");
    chatLayout.classList.remove("hidden");

    loadMessages();
  } catch (error) {
    console.error("채팅방 불러오기 오류:", error);
    showError("채팅방을 불러오는 중 오류가 발생했습니다.");
  }
}

if (sendBtn) {
  sendBtn.addEventListener("click", sendMessage);
}

if (chatInput) {
  chatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
}

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  await updateHeaderUserInfo(user);
  await loadChatRoom(user);
});