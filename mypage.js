import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

function formatDate(timestamp) {
  if (!timestamp) return "-";
  let date;
  if (timestamp.toDate) date = timestamp.toDate();
  else if (timestamp.seconds) date = new Date(timestamp.seconds * 1000);
  else date = new Date(timestamp);
  if (isNaN(date.getTime())) return "-";
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

function formatDateTime(timestamp) {
  if (!timestamp) return "-";
  let date;
  if (timestamp.toDate) date = timestamp.toDate();
  else if (timestamp.seconds) date = new Date(timestamp.seconds * 1000);
  else date = new Date(timestamp);
  if (isNaN(date.getTime())) return "-";
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")} ${String(date.getHours()).padStart(2,"0")}:${String(date.getMinutes()).padStart(2,"0")}`;
}

function escapeHtml(v) {
  return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

let currentUser = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    alert("로그인 후 이용 가능합니다.");
    location.href = "login.html";
    return;
  }
  currentUser = user;

  const authBtn = document.getElementById("authBtn");
  const welcomeText = document.getElementById("welcomeText");
  if (authBtn && welcomeText) {
    try {
      const userSnap = await getDoc(doc(db, "users", user.uid));
      const userData = userSnap.exists() ? userSnap.data() : {};
      const displayName = userData.name || userData.nickname || user.displayName || user.email?.split("@")[0] || "사용자";
      welcomeText.textContent = displayName + "님";
    } catch (e) {
      welcomeText.textContent = (user.email?.split("@")[0] || "사용자") + "님";
    }
    authBtn.textContent = "로그아웃";
    authBtn.href = "#";
    authBtn.onclick = async (e) => {
      e.preventDefault();
      await signOut(auth);
      location.href = "login.html";
    };
  }
  
  await loadAll(user);
});

async function loadAll(user) {
  await loadProfile(user);
  await loadPosts(user);
  await loadReviews(user);  // ✅ 리뷰 로드 추가
  await loadReservations(user);
  await loadPayments(user);
  await loadStudyGroups(user);
}

async function loadProfile(user) {
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    const data = snap.exists() ? snap.data() : {};
    const name = data.name || data.nickname || user.displayName || user.email?.split("@")[0] || "-";
    document.getElementById("userName").textContent = name;
    document.getElementById("userEmail").textContent = user.email || "-";
    document.getElementById("userCreatedAt").textContent = formatDate(data.createdAt) || "-";
    const verifiedEl = document.getElementById("userVerified");
    if (user.emailVerified) {
      verifiedEl.textContent = "인증 완료";
      verifiedEl.style.color = "#1db954";
    } else {
      verifiedEl.textContent = "미인증";
      verifiedEl.style.color = "#ff4d4f";
    }
    const region = data.region || (data.sido ? `${data.sido} ${data.sigungu||""} ${data.dong||""}`.trim() : "");
    document.getElementById("userRegion").textContent = region || "지역 미설정";
    if (data.sido) document.getElementById("sido").value = data.sido;
    if (data.sigungu) document.getElementById("sigungu").value = data.sigungu;
    if (data.dong) document.getElementById("dong").value = data.dong;
  } catch (e) {
    console.error("프로필 로드 실패:", e);
  }
}

window.updateRegion = async function() {
  if (!currentUser) return;
  const sido    = document.getElementById("sido").value.trim();
  const sigungu = document.getElementById("sigungu").value.trim();
  const dong    = document.getElementById("dong").value.trim();
  if (!sido) { alert("시/도를 선택해주세요."); return; }
  if (!sigungu) { alert("시/군/구를 입력해주세요."); return; }
  try {
    await updateDoc(doc(db, "users", currentUser.uid), {
      sido, sigungu, dong,
      region: `${sido} ${sigungu} ${dong}`.trim()
    });
    document.getElementById("userRegion").textContent = `${sido} ${sigungu} ${dong}`.trim();
    alert("지역이 저장되었습니다.");
  } catch (e) {
    console.error("지역 저장 실패:", e);
    alert("저장 중 오류가 발생했습니다.");
  }
};

window.changePassword = async function(e) {
  e.preventDefault();
  if (!currentUser) return;
  const current = document.getElementById("currentPassword").value;
  const newPw   = document.getElementById("newPassword").value;
  const confirm = document.getElementById("confirmPassword").value;
  if (!current || !newPw || !confirm) { alert("모든 항목을 입력해주세요."); return; }
  if (newPw !== confirm) { alert("새 비밀번호가 일치하지 않습니다."); return; }
  if (newPw.length < 6) { alert("비밀번호는 6자 이상이어야 합니다."); return; }
  try {
    const credential = EmailAuthProvider.credential(currentUser.email, current);
    await reauthenticateWithCredential(currentUser, credential);
    await updatePassword(currentUser, newPw);
    alert("비밀번호가 변경되었습니다.");
    document.getElementById("currentPassword").value = "";
    document.getElementById("newPassword").value = "";
    document.getElementById("confirmPassword").value = "";
  } catch (err) {
    console.error("비밀번호 변경 실패:", err);
    if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
      alert("현재 비밀번호가 올바르지 않습니다.");
    } else {
      alert("비밀번호 변경 중 오류가 발생했습니다.");
    }
  }
};

// ── 내가 쓴 게시글 (study 제외) ──
async function loadPosts(user) {
  const list = document.getElementById("myPostList");
  const empty = document.getElementById("emptyPostMessage");
  try {
    const q = query(
      collection(db, "posts"),
      where("authorUid", "==", user.uid),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(q);

    const filteredDocs = snap.docs.filter(d => d.data().category !== "study");

    document.getElementById("summaryPosts").textContent = filteredDocs.length + "건";

    if (filteredDocs.length === 0) {
      list.innerHTML = "";
      empty.style.display = "block";
      return;
    }
    empty.style.display = "none";
    list.innerHTML = filteredDocs.map(d => {
      const p = d.data();
      const catLabel = { free:"자유게시판", review:"후기 게시판", notice:"공지사항" }[p.category] || p.category || "일반";
      return `
        <div class="card-item" style="background:#fff;border-radius:14px;padding:18px 20px;margin-bottom:12px;border:1px solid #eef1f5;box-shadow:0 4px 12px rgba(0,0,0,0.04);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
            <div>
              <span style="font-size:12px;font-weight:700;background:#eef2ff;color:#4a6cf7;padding:3px 9px;border-radius:20px;">${escapeHtml(catLabel)}</span>
              <div style="font-size:16px;font-weight:700;margin:8px 0 4px;">${escapeHtml(p.title || "제목 없음")}</div>
              <div style="font-size:13px;color:#888;">${formatDate(p.createdAt)}</div>
            </div>
            <div style="display:flex;gap:8px;flex-shrink:0;">
              <a href="community-detail.html?id=${d.id}" style="padding:7px 14px;background:#eef2ff;color:#4a6cf7;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;">보기</a>
              <a href="write.html?mode=edit&id=${d.id}" style="padding:7px 14px;background:#fff3e0;color:#e67e22;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;">수정</a>
            </div>
          </div>
        </div>`;
    }).join("");
  } catch (e) {
    console.error("게시글 로드 실패:", e);
    list.innerHTML = "<p style='color:#aaa;padding:16px;'>게시글을 불러오지 못했습니다.</p>";
  }
}

// ✅ 내가 쓴 리뷰 로드
async function loadReviews(user) {
  const list  = document.getElementById("myReviewList");
  const empty = document.getElementById("emptyReviewMessage");
  try {
    const q = query(
      collection(db, "cafeReviews"),
      where("authorUid", "==", user.uid),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      list.innerHTML = "";
      empty.style.display = "block";
      return;
    }
    empty.style.display = "none";
    list.innerHTML = snap.docs.map(d => {
      const r = d.data();
      const stars = "⭐".repeat(r.rating || 0);
      return `
        <div class="review-card">
          <div class="review-card-top">
            <div>
              <span class="review-cafe">${escapeHtml(r.cafeName || "업장명 없음")}</span>
              <span class="review-stars" style="margin-left:8px;">${stars}</span>
            </div>
            <span class="review-date">${formatDate(r.createdAt)}</span>
          </div>
          <div class="review-text">${escapeHtml(r.content || "")}</div>
        </div>`;
    }).join("");
  } catch (e) {
    console.error("리뷰 로드 실패:", e);
    list.innerHTML = "<p style='color:#aaa;padding:16px;'>리뷰를 불러오지 못했습니다.</p>";
  }
}

// ── 예약 내역 ──
async function loadReservations(user) {
  const tbody = document.getElementById("reservationTableBody");
  try {
    const q = query(
      collection(db, "reservations"),
      where("uid", "==", user.uid),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(q);
    document.getElementById("summaryReservations").textContent = snap.size + "건";
    if (snap.empty) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#aaa;padding:24px;">예약 내역이 없습니다.</td></tr>`;
      return;
    }
    const typeLabel = { daily:"당일권", period:"기간권", fixed:"고정석", room:"스터디룸", locker:"사물함" };
    const statusClass = { confirmed:"status-done", active:"status-done", completed:"status-complete", cancelled:"status-cancel", cancel:"status-cancel", force_cancelled:"status-cancel" };
    const statusText  = { confirmed:"이용 예정", active:"사용중", completed:"사용 완료", cancelled:"취소됨", cancel:"취소됨", force_cancelled:"강제퇴실" };
    tbody.innerHTML = snap.docs.map(d => {
      const r = d.data();
      const type = typeLabel[r.reservationType] || r.reservationType || "-";
      const usageText = r.hours
        ? (r.startTime ? `${r.hours}시간 (${r.startTime} 입실)` : `${r.hours}시간`)
        : r.days ? `${r.days}일` : "-";
      let st = (r.status || "confirmed").toLowerCase();
      const now = Date.now();
      if (st === "confirmed" || st === "active") {
        if (r.endTimestamp && r.endTimestamp < now) {
          st = "completed";
        } else if (r.startTimestamp && r.startTimestamp <= now) {
          st = "active";
        }
      }
      const sCls = statusClass[st] || "status-done";
      const sTxt = statusText[st]  || r.status || "-";
      const lockerBadge = r.lockerAddon?.seatId
        ? `<br><span style="font-size:11px;background:#e1f5ee;color:#0f6e56;padding:2px 6px;border-radius:4px;font-weight:700;">🔒 사물함 ${r.lockerAddon.seatId}</span>`
        : "";
      const canCancel = (st === "confirmed" || st === "active") && !(r.endTimestamp && r.endTimestamp < now);
      return `<tr>
        <td>${escapeHtml(r.cafeName || "-")}</td>
        <td>${escapeHtml(r.seatId || "-")}${lockerBadge}</td>
        <td>${escapeHtml(r.date || formatDate(r.createdAt))}</td>
        <td>${escapeHtml(type)} / ${escapeHtml(usageText)}</td>
        <td style="font-weight:700;color:#4a6cf7;">${(r.totalPrice||0).toLocaleString()}원</td>
        <td>${escapeHtml(r.payMethod || "-")}</td>
        <td class="${sCls}">${sTxt}</td>
        <td>${canCancel ? `<button onclick="cancelReservation('${d.id}')" style="border:none;background:#ffeaea;color:#e53935;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">취소</button>` : "-"}</td>
      </tr>`;
    }).join("");
  } catch (e) {
    console.error("예약 내역 로드 실패:", e);
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#aaa;padding:24px;">예약 내역을 불러오지 못했습니다.</td></tr>`;
  }
}

window.cancelReservation = async function(resId) {
  if (!confirm("예약을 취소하시겠습니까?")) return;
  try {
    await updateDoc(doc(db, "reservations", resId), { status: "cancelled" });
    alert("예약이 취소되었습니다.");
    await loadReservations(currentUser);
  } catch (e) {
    console.error("취소 실패:", e);
    alert("취소 중 오류가 발생했습니다.");
  }
};

// ── 결제 내역 ──
async function loadPayments(user) {
  const tbody = document.getElementById("paymentTableBody");
  try {
    const q = query(
      collection(db, "reservations"),
      where("uid", "==", user.uid),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(q);
    document.getElementById("summaryPayments").textContent = snap.size + "건";
    if (snap.empty) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#aaa;padding:24px;">결제 내역이 없습니다.</td></tr>`;
      return;
    }
    const statusText = { confirmed:"결제완료", active:"이용중", completed:"이용완료", cancelled:"취소됨", cancel:"취소됨" };
    const statusCls  = { confirmed:"status-done", active:"status-done", completed:"status-complete", cancelled:"status-cancel", cancel:"status-cancel" };
    tbody.innerHTML = snap.docs.map(d => {
      const r = d.data();
      const st   = (r.status || "confirmed").toLowerCase();
      const sTxt = statusText[st] || r.status || "-";
      const sCls = statusCls[st] || "status-done";
      const lockerBadge = r.lockerAddon?.seatId
        ? `<br><span style="font-size:11px;background:#e1f5ee;color:#0f6e56;padding:2px 6px;border-radius:4px;font-weight:700;">🔒 +${(r.lockerAddon.price||0).toLocaleString()}원</span>`
        : "";
      return `<tr>
        <td>${escapeHtml(formatDate(r.createdAt))}</td>
        <td>${escapeHtml(r.cafeName || "-")}</td>
        <td>${escapeHtml(r.seatId || "-")}${lockerBadge}</td>
        <td style="font-weight:700;color:#4a6cf7;">${(r.totalPrice||0).toLocaleString()}원</td>
        <td>${escapeHtml(r.payMethod || "-")}</td>
        <td class="${sCls}">${sTxt}</td>
      </tr>`;
    }).join("");
  } catch (e) {
    console.error("결제 내역 로드 실패:", e);
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#aaa;padding:24px;">결제 내역을 불러오지 못했습니다.</td></tr>`;
  }
}

// ── 참여 스터디 그룹 ──
async function loadStudyGroups(user) {
  const list  = document.getElementById("joinedStudyList");
  const empty = document.getElementById("emptyJoinedStudyMessage");
  try {
    const q = query(
      collection(db, "posts"),
      where("category", "==", "study"),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(q);
    const joined = snap.docs.filter(d => {
      const p = d.data();
      const apps = p.applications || [];
      return p.authorUid === user.uid
        || apps.some(a =>
            (typeof a === "string" ? a === user.uid : a.uid === user.uid)
            && a.status === "approved"
          );
    });
    document.getElementById("summaryGroups").textContent = joined.length + "건";
    if (joined.length === 0) {
      list.innerHTML = "";
      empty.style.display = "block";
      return;
    }
    empty.style.display = "none";
    list.innerHTML = joined.map(d => {
      const p = d.data();
      const cur = p.studyInfo?.currentMembers || 1;
      const max = p.studyInfo?.maxMembers || 1;
      const isLeader = p.authorUid === user.uid;
      return `
        <div style="background:#fff;border-radius:14px;padding:18px 20px;margin-bottom:12px;border:1px solid #eef1f5;box-shadow:0 4px 12px rgba(0,0,0,0.04);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
            <div>
              ${isLeader ? '<span style="font-size:11px;font-weight:700;background:#fff3e0;color:#e67e22;padding:3px 8px;border-radius:20px;margin-right:6px;">방장</span>' : ''}
              <span style="font-size:12px;font-weight:700;background:#eafaf0;color:#1a9a55;padding:3px 9px;border-radius:20px;">${escapeHtml(p.studyInfo?.status || "모집중")}</span>
              <div style="font-size:16px;font-weight:700;margin:8px 0 4px;">${escapeHtml(p.title || "제목 없음")}</div>
              <div style="font-size:13px;color:#888;">📍 ${escapeHtml(p.studyInfo?.place || "-")} &nbsp;|&nbsp; 🗓 ${escapeHtml(p.studyInfo?.schedule || "-")} &nbsp;|&nbsp; 👥 ${cur}/${max}명</div>
            </div>
            <button onclick="goToChat('${d.id}')" style="padding:8px 16px;background:#4a6cf7;color:#fff;border-radius:8px;font-size:13px;font-weight:700;border:none;cursor:pointer;flex-shrink:0;">채팅방 이동</button>
          </div>
        </div>`;
    }).join("");
  } catch (e) {
    console.error("스터디 그룹 로드 실패:", e);
    list.innerHTML = "<p style='color:#aaa;padding:16px;'>스터디 그룹을 불러오지 못했습니다.</p>";
  }
}

// ── 채팅방 이동 ──
window.goToChat = async function(postId) {
  try {
    const postRef = doc(db, "posts", postId);
    const postSnap = await getDoc(postRef);
    if (!postSnap.exists()) return;

    const post = postSnap.data();

    if (!post.chatMembers || post.chatMembers.length === 0) {
      const members = [{
        uid: post.authorUid || "",
        email: post.authorEmail || "",
        name: post.author || "작성자",
        role: "owner"
      }];

      (post.applications || []).forEach(app => {
        if (app.status !== "approved") return;
        const exists = members.some(m => m.uid === app.uid || m.email === app.email);
        if (!exists) members.push({
          uid: app.uid || "",
          email: app.email || "",
          name: app.name || "참여자",
          role: "member"
        });
      });

      await updateDoc(postRef, { chatMembers: members });
    }

    location.href = `study-chat.html?id=${postId}`;
  } catch (e) {
    console.error("채팅방 이동 오류:", e);
    alert("채팅방 이동 중 오류가 발생했습니다.");
  }
};

// ── 로그아웃 버튼 ──
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    location.href = "login.html";
  });
}