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
  where,
  getDocs,
  onSnapshot,
  deleteDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const userName = document.getElementById("userName");
const userEmail = document.getElementById("userEmail");
const userCreatedAt = document.getElementById("userCreatedAt");
const userVerified = document.getElementById("userVerified");
const userRegion = document.getElementById("userRegion");

const sidoSelect = document.getElementById("sido");
const sigunguInput = document.getElementById("sigungu");
const dongInput = document.getElementById("dong");

const joinedStudyList = document.getElementById("joinedStudyList");
const emptyJoinedStudyMessage = document.getElementById("emptyJoinedStudyMessage");
const myPostList = document.getElementById("myPostList");
const emptyPostMessage = document.getElementById("emptyPostMessage");

let unsubscribeMyPosts = null;
let currentUser = null;

function formatDate(value) {
  if (!value) return "-";
  if (value.seconds) return new Date(value.seconds * 1000).toLocaleDateString("ko-KR");
  return value;
}

function getCategoryText(category) {
  if (category === "free") return "자유게시판";
  if (category === "study") return "스터디모집";
  if (category === "review") return "후기게시판";
  if (category === "notice") return "공지사항";
  return category || "게시글";
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
  const postsQuery = query(collection(db, "posts"), orderBy("createdAt", "desc"));
  if (unsubscribeMyPosts) unsubscribeMyPosts();

  unsubscribeMyPosts = onSnapshot(postsQuery, (snapshot) => {
    myPostList.innerHTML = "";
    const myPosts = [];
    snapshot.forEach((docItem) => {
      const post = docItem.data();
      if (isMyPost(post, user)) myPosts.push({ id: docItem.id, ...post });
    });

    // ✅ 내 게시글 수 업데이트
    const summaryPosts = document.getElementById("summaryPosts");
    if (summaryPosts) summaryPosts.textContent = myPosts.length;

    if (myPosts.length === 0) {
      emptyPostMessage.style.display = "block";
      emptyPostMessage.textContent = "작성한 게시글이 없습니다.";
      return;
    }
    emptyPostMessage.style.display = "none";

    myPosts.forEach((post) => {
      myPostList.insertAdjacentHTML("beforeend", `
        <div class="list-card">
          <div>
            <span class="tag blue">${getCategoryText(post.category)}</span>
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
      `);
    });
  });
}

function renderJoinedStudies(user) {
  if (!joinedStudyList || !emptyJoinedStudyMessage) return;
  const postsQuery = query(collection(db, "posts"), orderBy("createdAt", "desc"));

  onSnapshot(postsQuery, (snapshot) => {
    joinedStudyList.innerHTML = "";
    const joinedStudies = [];

    snapshot.forEach((docItem) => {
      const post = docItem.data();
      if (post.category !== "study") return;
      const applications = post.applications || [];
      const isAuthor = isMyPost(post, user);
      const myApproved = applications.find(app =>
        ((app.uid && app.uid === user.uid) || (app.email && app.email === user.email)) && app.status === "approved"
      );
      if (isAuthor || myApproved) joinedStudies.push({ id: docItem.id, ...post, isAuthor });
    });

    // ✅ 스터디 그룹 수 업데이트
    const summaryGroups = document.getElementById("summaryGroups");
    if (summaryGroups) summaryGroups.textContent = joinedStudies.length;

    if (joinedStudies.length === 0) {
      emptyJoinedStudyMessage.style.display = "block";
      emptyJoinedStudyMessage.textContent = "참여 중인 스터디 그룹이 없습니다.";
      return;
    }
    emptyJoinedStudyMessage.style.display = "none";

    joinedStudies.forEach((study) => {
      joinedStudyList.innerHTML += `
        <div class="list-card">
          <div>
            <span class="tag green">${study.isAuthor ? "내가 만든 스터디" : "참여중"}</span>
            <h3>${study.title || "제목 없음"}</h3>
            <div class="meta">
              <span>장소: ${study.studyInfo?.place || "-"}</span>
              <span>일정: ${study.studyInfo?.schedule || "-"}</span>
              <span>인원: ${study.studyInfo?.currentMembers || 1} / ${study.studyInfo?.maxMembers || 1}명</span>
              <span>상태: ${study.studyInfo?.status || "모집중"}</span>
            </div>
          </div>
          <div class="actions">
            <button class="sub-btn" onclick="viewPost('${study.id}')">상세보기</button>
            <button class="sub-btn" onclick="goToStudyChat('${study.id}')">채팅방 이동</button>
          </div>
        </div>
      `;
    });
  });
}

// ✅ 예약 내역 불러오기
async function renderReservations(user) {
  const tbody = document.getElementById("reservationTableBody");
  const payTbody = document.getElementById("paymentTableBody");
  if (!tbody) return;

  try {
    const q = query(
      collection(db, "reservations"),
      where("uid", "==", user.uid)
    );
    const snap = await getDocs(q);

    const docs = snap.docs.sort((a, b) => {
      const aTime = a.data().createdAt?.seconds || 0;
      const bTime = b.data().createdAt?.seconds || 0;
      return bTime - aTime;
    });

    const activeCount = docs.filter(d => d.data().status === "active").length;
    const summaryRes = document.getElementById("summaryReservations");
    const summaryPay = document.getElementById("summaryPayments");
    if (summaryRes) summaryRes.textContent = activeCount;
    if (summaryPay) summaryPay.textContent = docs.length;

    if (docs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#aaa;padding:24px;">예약 내역이 없습니다.</td></tr>`;
      if (payTbody) payTbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#aaa;padding:24px;">결제 내역이 없습니다.</td></tr>`;
      return;
    }

    tbody.innerHTML = "";
    if (payTbody) payTbody.innerHTML = "";

    docs.forEach(docItem => {
      const d = docItem.data();
      const resId = docItem.id;
      // 이용권 타입별 이용 시간 표시 (구버전/신버전 모두 호환)
      const rType = d.reservationType || (d.zone === "A" ? "daily" : "period");
      let timeInfo = "-";
      if (rType === "daily") {
        // 신버전: hours / 구버전: startHour~endHour
        if (d.hours) {
          timeInfo = `${d.hours}시간 이용`;
        } else if (d.startHour !== undefined && d.endHour !== undefined) {
          timeInfo = `${d.startHour}:00 ~ ${d.endHour}:00`;
        }
      } else if (rType === "period" || rType === "fixed") {
        // 신버전: days / 구버전: weeks
        if (d.days) {
          timeInfo = `${d.days}일 이용권`;
        } else if (d.weeks) {
          timeInfo = `${d.weeks}주 이용권`;
        } else if (d.week) {
          timeInfo = `${d.week}주 이용권`;
        }
      } else if (rType === "room") {
        timeInfo = d.hours ? `${d.hours}시간 이용` : "-";
      } else if (rType === "locker") {
        timeInfo = d.days ? `${d.days}일 이용` : "-";
      }

      // ✅ 수정 2: confirmed도 예약중으로 표시
      const isActive = d.status === "active" || d.status === "confirmed";
      const statusClass = isActive ? "status-done" : "status-cancel";
      const statusText = isActive ? "예약중" : "취소됨";

      tbody.innerHTML += `
        <tr>
          <td>${d.cafeName || "-"}</td>
          <td>${d.seatId || "-"} (${
            d.reservationType === "room"   ? "스터디룸" :
            d.reservationType === "locker" ? "사물함"   :
            d.reservationType === "fixed"  ? "고정석"   :
            d.zone === "B"                 ? "고정석"   :
            d.zone === "A"                 ? "자유석"   : "-"
          })</td>
          <td>${d.date || "-"}</td>
          <td>${timeInfo}</td>
          <td>${(d.totalPrice || d.price || 0).toLocaleString()}원</td>
          <td>${d.payMethod || "-"}</td>
          <td class="${statusClass}">${statusText}</td>
          <td>${d.status === "active"
            ? `<button class="danger-btn" onclick="cancelReservation('${resId}')">취소</button>`
            : "-"
          }</td>
        </tr>
      `;

      if (payTbody) {
        payTbody.innerHTML += `
          <tr>
            <td>${formatDate(d.createdAt)}</td>
            <td>${d.cafeName || "-"}</td>
            <td>${d.seatId || "-"}</td>
            <td>${(d.totalPrice || d.price || 0).toLocaleString()}원</td>
            <td>${d.payMethod || "-"}</td>
            <td class="${statusClass}">${statusText}</td>
          </tr>
        `;
      }
    });
  } catch(e) {
    console.error("예약 내역 불러오기 오류:", e);
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#e54848;">불러오기 실패: ${e.message}</td></tr>`;
  }
}

// ✅ 예약 취소
window.cancelReservation = async function(resId) {
  const ok = confirm("예약을 취소하시겠습니까?\n취소 후 해당 좌석은 다른 사람이 예약할 수 있습니다.");
  if (!ok) return;
  try {
    await updateDoc(doc(db, "reservations", resId), { status: "cancelled" });
    alert("예약이 취소되었습니다.");
    renderReservations(currentUser);
  } catch(e) {
    console.error("예약 취소 오류:", e);
    alert("취소 중 오류가 발생했습니다.");
  }
};

onAuthStateChanged(auth, async (user) => {
  if (!user) { alert("로그인이 필요합니다."); location.href = "login.html"; return; }
  currentUser = user;

  try {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const data = userSnap.data();
      const region = data.region || `${data.sido || ""} ${data.sigungu || ""} ${data.dong || ""}`.trim();
      userName.textContent = data.name || data.nickname || "이름 없음";
      userEmail.textContent = data.email || user.email || "이메일 없음";
      userCreatedAt.textContent = formatDate(data.createdAt);
      if (userRegion) userRegion.textContent = region || "지역 미설정";
      if (sidoSelect) sidoSelect.value = data.sido || "";
      if (sigunguInput) sigunguInput.value = data.sigungu || "";
      if (dongInput) dongInput.value = data.dong || "";
    } else {
      userName.textContent = "이름 없음";
      userEmail.textContent = user.email || "이메일 없음";
      userCreatedAt.textContent = "-";
      if (userRegion) userRegion.textContent = "지역 미설정";
    }

    userVerified.textContent = user.emailVerified ? "인증 완료" : "미인증";
    userVerified.style.color = user.emailVerified ? "green" : "red";

    renderMyPosts(user);
    renderJoinedStudies(user);
    renderReservations(user);
  } catch (error) {
    console.error("마이페이지 정보 불러오기 오류:", error);
  }
});

window.updateRegion = async function() {
  if (!currentUser) { alert("로그인 정보를 확인할 수 없습니다."); return; }
  const sido = sidoSelect.value.trim();
  const sigungu = sigunguInput.value.trim();
  const dong = dongInput.value.trim();
  if (!sido || !sigungu || !dong) { alert("시/도, 시/군/구, 동/읍/면을 모두 입력해주세요."); return; }
  const region = `${sido} ${sigungu} ${dong}`;
  try {
    await updateDoc(doc(db, "users", currentUser.uid), { sido, sigungu, dong, region });
    if (userRegion) userRegion.textContent = region;
    alert("지역이 저장되었습니다.");
  } catch (error) {
    console.error("지역 저장 오류:", error);
    alert("지역 저장 중 오류가 발생했습니다.");
  }
};

window.viewPost = function(postId) { location.href = `community-detail.html?id=${postId}`; };
window.goToStudyChat = function(postId) { location.href = `study-chat.html?id=${postId}`; };
window.editPost = function(postId) { location.href = `write.html?id=${postId}&mode=edit`; };

window.deletePost = async function(postId) {
  if (!confirm("정말 이 게시글을 삭제하시겠습니까?")) return;
  try {
    await deleteDoc(doc(db, "posts", postId));
    alert("게시글이 삭제되었습니다.");
  } catch (error) {
    console.error("게시글 삭제 오류:", error);
    alert("게시글 삭제 중 오류가 발생했습니다.");
  }
};

window.changePassword = async function(event) {
  event.preventDefault();
  const currentPassword = document.getElementById("currentPassword").value;
  const newPassword = document.getElementById("newPassword").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  if (!currentPassword || !newPassword || !confirmPassword) { alert("모든 항목을 입력해주세요."); return; }
  if (newPassword.length < 6) { alert("새 비밀번호는 6자 이상이어야 합니다."); return; }
  if (newPassword !== confirmPassword) { alert("새 비밀번호와 비밀번호 확인이 일치하지 않습니다."); return; }

  try {
    const user = auth.currentUser;
    if (!user || !user.email) { alert("로그인 정보를 확인할 수 없습니다."); return; }
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
    alert("비밀번호가 성공적으로 변경되었습니다.");
    document.getElementById("currentPassword").value = "";
    document.getElementById("newPassword").value = "";
    document.getElementById("confirmPassword").value = "";
  } catch (error) {
    if (error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") {
      alert("현재 비밀번호가 올바르지 않습니다.");
    } else if (error.code === "auth/weak-password") {
      alert("새 비밀번호가 너무 약합니다.");
    } else {
      alert("비밀번호 변경 중 오류가 발생했습니다.");
    }
  }
};