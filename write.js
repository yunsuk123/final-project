import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  addDoc,
  serverTimestamp,
  doc,
  getDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const writeForm = document.getElementById("writeForm");
const messageBox = document.getElementById("messageBox");
const authorInput = document.getElementById("author");
const categoryInput = document.getElementById("category");
const titleInput = document.getElementById("title");
const contentInput = document.getElementById("content");
const placeInput = document.getElementById("place");
const scheduleInput = document.getElementById("schedule");
const maxMembersInput = document.getElementById("maxMembers");
const studyFields = document.getElementById("studyFields");
const submitBtn = writeForm.querySelector('button[type="submit"]');

let currentUser = null;
let isEditMode = false;
let editingPostId = null;

const params = new URLSearchParams(window.location.search);
const mode = params.get("mode");
const postId = params.get("id");

if (mode === "edit" && postId) {
  isEditMode = true;
  editingPostId = postId;
}

function showMessage(text, type) {
  messageBox.textContent = text;
  messageBox.className = "message-box";
  messageBox.classList.add(type);
  messageBox.style.display = "block";
}

function toggleStudyFields() {
  if (categoryInput.value === "study") {
    studyFields.style.display = "block";
  } else {
    studyFields.style.display = "none";
  }
}

categoryInput.addEventListener("change", toggleStudyFields);

async function loadPostForEdit(user) {
  if (!isEditMode || !editingPostId) return;

  try {
    const postRef = doc(db, "posts", editingPostId);
    const postSnap = await getDoc(postRef);

    if (!postSnap.exists()) {
      alert("존재하지 않는 게시글입니다.");
      location.href = "mypage.html";
      return;
    }

    const post = postSnap.data();

    const isMyPost =
      (post.authorUid && post.authorUid === user.uid) ||
      (post.uid && post.uid === user.uid) ||
      (post.authorEmail && post.authorEmail === user.email) ||
      (post.email && post.email === user.email);

    if (!isMyPost) {
      alert("본인이 작성한 글만 수정할 수 있습니다.");
      location.href = "mypage.html";
      return;
    }

    categoryInput.value = post.category || "";
    authorInput.value = post.author || "";
    titleInput.value = post.title || "";
    contentInput.value = post.content || "";

    toggleStudyFields();

    if (post.category === "study" && post.studyInfo) {
      placeInput.value = post.studyInfo.place || "";
      scheduleInput.value = post.studyInfo.schedule || "";
      maxMembersInput.value = post.studyInfo.maxMembers || "";
    }

    if (submitBtn) {
      submitBtn.textContent = "수정 완료";
    }

    document.title = "게시글 수정";
  } catch (error) {
    console.error("수정할 게시글 불러오기 오류:", error);
    alert("게시글 정보를 불러오는 중 오류가 발생했습니다.");
    location.href = "mypage.html";
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    alert("로그인 후 글쓰기가 가능합니다.");
    location.href = "login.html";
    return;
  }

  currentUser = user;

  if (!isEditMode && !authorInput.value) {
    authorInput.value = user.displayName || user.email?.split("@")[0] || "";
  }

  await loadPostForEdit(user);
});

writeForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const category = categoryInput.value;
  const author = authorInput.value.trim();
  const title = titleInput.value.trim();
  const content = contentInput.value.trim();
  const place = placeInput.value.trim();
  const schedule = scheduleInput.value.trim();
  const maxMembers = maxMembersInput.value.trim();

  messageBox.className = "message-box";
  messageBox.style.display = "none";

  if (!category || !author || !title || !content) {
    showMessage("카테고리, 작성자, 제목, 내용을 모두 입력해주세요.", "error");
    return;
  }

  if (category === "study") {
    if (!place || !schedule || !maxMembers) {
      showMessage("스터디 모집 글은 지점, 일정, 모집 인원을 모두 입력해야 합니다.", "error");
      return;
    }
  }

  if (!currentUser) {
    showMessage("로그인 정보를 확인할 수 없습니다.", "error");
    return;
  }

  try {
    if (isEditMode && editingPostId) {
      const postRef = doc(db, "posts", editingPostId);
      const postSnap = await getDoc(postRef);

      if (!postSnap.exists()) {
        showMessage("수정할 게시글이 존재하지 않습니다.", "error");
        return;
      }

      const oldPost = postSnap.data();
      const isMyPost =
        (oldPost.authorUid && oldPost.authorUid === currentUser.uid) ||
        (oldPost.uid && oldPost.uid === currentUser.uid) ||
        (oldPost.authorEmail && oldPost.authorEmail === currentUser.email) ||
        (oldPost.email && oldPost.email === currentUser.email);

      if (!isMyPost) {
        showMessage("본인이 작성한 글만 수정할 수 있습니다.", "error");
        return;
      }

      await updateDoc(postRef, {
        category,
        author,
        title,
        content,
        authorUid: currentUser.uid,
        authorEmail: currentUser.email,
        uid: currentUser.uid,
        email: currentUser.email,
        updatedAt: serverTimestamp(),
        studyInfo: category === "study"
          ? {
              place,
              schedule,
              maxMembers: Number(maxMembers),
              currentMembers: oldPost.studyInfo?.currentMembers || 1,
              status: oldPost.studyInfo?.status || "모집중"
            }
          : null
      });

      showMessage("게시글이 수정되었습니다.", "success");

      setTimeout(() => {
        location.href = "mypage.html";
      }, 1000);

    } else {
      await addDoc(collection(db, "posts"), {
        category,
        author,
        title,
        content,
        authorUid: currentUser.uid,
        authorEmail: currentUser.email,
        uid: currentUser.uid,
        email: currentUser.email,
        createdAt: serverTimestamp(),
        viewCount: 0,
        commentCount: 0,
        studyInfo: category === "study"
          ? {
              place,
              schedule,
              maxMembers: Number(maxMembers),
              currentMembers: 1,
              status: "모집중"
            }
          : null,
        applications: category === "study" ? [] : null
      });

      showMessage("글이 등록되었습니다.", "success");
      writeForm.reset();
      studyFields.style.display = "none";

      setTimeout(() => {
        location.href = "community.html";
      }, 1000);
    }
  } catch (error) {
    console.error("게시글 저장 오류:", error);
    showMessage("게시글 저장 중 오류가 발생했습니다.", "error");
  }
});

toggleStudyFields();