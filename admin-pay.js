import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, getDocs, query, where, doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ── 전역 상태 ──
let allReservations = [];
let cafeMap = {};
let trendChartInst = null;
let cafeChartInst  = null;

// ── 금액 읽기 헬퍼 ── ✅ totalPrice 우선순위 변경
const getAmt = r => r.totalPrice || r.finalPrice || r.amount || r.price || 0;

// ── 셀렉트 초기화 ──
function initSelects() {
  const now = new Date();
  const yearSel  = document.getElementById("yearSel");
  const monthSel = document.getElementById("monthSel");

  for (let y = now.getFullYear(); y >= now.getFullYear() - 2; y--) {
    yearSel.innerHTML += `<option value="${y}" ${y === now.getFullYear() ? "selected" : ""}>${y}년</option>`;
  }
  for (let m = 1; m <= 12; m++) {
    monthSel.innerHTML += `<option value="${m}" ${m === now.getMonth() + 1 ? "selected" : ""}>${m}월</option>`;
  }

  onViewModeChange();
}

// ── 조회 기준 변경 ──
window.onViewModeChange = function () {
  const mode = document.getElementById("viewMode").value;
  document.getElementById("monthSel").style.display = mode === "daily" ? "inline-block" : "none";
  loadData();
};

// ── Firebase 전체 데이터 로드 ──
async function fetchAll() {
  const cafeSnap = await getDocs(collection(db, "cafes"));
  cafeMap = {};
  const cafeSel = document.getElementById("cafeSel");

  // ✅ 현재 선택값 저장
  const prevSelected = cafeSel.value;

  // ✅ onchange 잠깐 끄기
  cafeSel.onchange = null;

  while (cafeSel.options.length > 1) cafeSel.remove(1);

  cafeSnap.forEach(d => {
    cafeMap[d.id] = d.data().cafeName || d.id;
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = d.data().cafeName || d.id;
    cafeSel.appendChild(opt);
  });

  // ✅ 이전 선택값 복원
  if (prevSelected && [...cafeSel.options].some(o => o.value === prevSelected)) {
    cafeSel.value = prevSelected;
  }

  // ✅ onchange 다시 켜기
  cafeSel.onchange = () => loadData();

  const rSnap = await getDocs(
    query(
      collection(db, "reservations"),
      where("status", "in", ["active", "confirmed", "completed"])
    )
  );
  allReservations = [];
  rSnap.forEach(d => allReservations.push({ id: d.id, ...d.data() }));
}

// ── 필터 적용 ──
function filterReservations() {
  const mode   = document.getElementById("viewMode").value;
  const year   = parseInt(document.getElementById("yearSel").value);
  const month  = parseInt(document.getElementById("monthSel").value);
  const cafeId = document.getElementById("cafeSel").value;

  return allReservations.filter(r => {
    if (!r.date) return false;
    const d = new Date(r.date + "T00:00:00"); // ✅ UTC 버그 수정
    if (d.getFullYear() !== year) return false;
    if (mode === "daily" && d.getMonth() + 1 !== month) return false;

    if (cafeId !== "all") {
      const matchById   = r.cafeId === cafeId;
      const matchByName = r.cafeName === cafeMap[cafeId];
      if (!matchById && !matchByName) return false;
    }

    return true;
  });
}

// ── KPI 업데이트 ──
function updateKPI(filtered) {
  const total = filtered.reduce((s, r) => s + getAmt(r), 0);
  const count = filtered.length;
  const avg   = count > 0 ? Math.round(total / count) : 0;

  const mode  = document.getElementById("viewMode").value;
  const year  = document.getElementById("yearSel").value;
  const month = document.getElementById("monthSel").value;

  document.getElementById("kpiTotal").textContent  = total.toLocaleString() + "원";
  document.getElementById("kpiCount").textContent  = count.toLocaleString() + "건";
  document.getElementById("kpiAvg").textContent    = avg.toLocaleString() + "원";
  document.getElementById("kpiPeriod").textContent = mode === "daily"
    ? `${year}년 ${month}월`
    : `${year}년 연간`;

  // 사물함 포함 예약 KPI
  const lockerItems  = filtered.filter(r => r.lockerAddon && r.lockerAddon.seatId);
  const lockerAmt    = lockerItems.reduce((s, r) => s + (r.lockerAddon?.price || 0), 0);
  const lockerEl     = document.getElementById("kpiLocker");
  const lockerAmtEl  = document.getElementById("kpiLockerAmt");
  if (lockerEl)    lockerEl.textContent    = lockerItems.length.toLocaleString() + "건";
  if (lockerAmtEl) lockerAmtEl.textContent = "사물함 매출 " + lockerAmt.toLocaleString() + "원";
}

// ── 매출 추이 차트 ──
function buildTrendChart(filtered) {
  const mode  = document.getElementById("viewMode").value;
  const year  = parseInt(document.getElementById("yearSel").value);
  const month = parseInt(document.getElementById("monthSel").value);

  let labels = [], dataMap = {};

  if (mode === "monthly") {
    for (let m = 1; m <= 12; m++) { labels.push(`${m}월`); dataMap[m] = 0; }
    filtered.forEach(r => {
      const m = new Date(r.date + "T00:00:00").getMonth() + 1; // ✅ UTC 버그 수정
      dataMap[m] += getAmt(r);
    });
    document.getElementById("trendTitle").textContent = `${year}년 월별 매출 추이`;
    document.getElementById("trendTag").textContent   =
      `연간 합계 ${filtered.reduce((s, r) => s + getAmt(r), 0).toLocaleString()}원`;
  } else {
    const days = new Date(year, month, 0).getDate();
    for (let d = 1; d <= days; d++) { labels.push(`${d}일`); dataMap[d] = 0; }
    filtered.forEach(r => {
      const d = new Date(r.date + "T00:00:00").getDate(); // ✅ UTC 버그 수정
      dataMap[d] += getAmt(r);
    });
    document.getElementById("trendTitle").textContent = `${year}년 ${month}월 일별 매출 추이`;
    document.getElementById("trendTag").textContent   =
      `월 합계 ${filtered.reduce((s, r) => s + getAmt(r), 0).toLocaleString()}원`;
  }

  const values = labels.map((_, i) => dataMap[i + 1] || 0);

  if (trendChartInst) trendChartInst.destroy();
  const ctx  = document.getElementById("trendChart").getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 300);
  grad.addColorStop(0, "rgba(74,108,247,0.3)");
  grad.addColorStop(1, "rgba(74,108,247,0.02)");

  trendChartInst = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "매출(원)",
        data: values,
        fill: true,
        backgroundColor: grad,
        borderColor: "#4a6cf7",
        borderWidth: 2.5,
        pointBackgroundColor: "#4a6cf7",
        pointRadius: mode === "daily" ? 3 : 5,
        pointHoverRadius: 7,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => `  ${c.parsed.y.toLocaleString()}원` } }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: "rgba(0,0,0,0.05)" },
          ticks: { callback: v => v >= 10000 ? (v / 10000).toFixed(0) + "만" : v.toLocaleString() }
        },
        x: { grid: { display: false } }
      }
    }
  });
}

// ── 지점별 바차트 ──
function buildCafeChart(filtered) {
  const byName = {};
  filtered.forEach(r => {
    const name = r.cafeName || cafeMap[r.cafeId] || r.cafeId || "unknown";
    byName[name] = (byName[name] || 0) + getAmt(r);
  });

  const sorted = Object.entries(byName).sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(([name]) => name);
  const values = sorted.map(([, v]) => v);

  document.getElementById("cafeTag").textContent = `총 ${labels.length}개 지점`;

  if (cafeChartInst) cafeChartInst.destroy();
  if (labels.length === 0) return;

  const ctx = document.getElementById("cafeChart").getContext("2d");
  cafeChartInst = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "매출(원)",
        data: values,
        backgroundColor: labels.map((_, i) => `rgba(74,108,247,${1 - (i / labels.length) * 0.45})`),
        borderRadius: 8,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => `  ${c.parsed.y.toLocaleString()}원` } }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: "rgba(0,0,0,0.05)" },
          ticks: { callback: v => v >= 10000 ? (v / 10000).toFixed(0) + "만원" : v + "원" }
        },
        x: { grid: { display: false } }
      }
    }
  });
}

// ── 지점별 테이블 ──
function buildCafeTable(filtered) {
  const byName = {};
  filtered.forEach(r => {
    const name = r.cafeName || cafeMap[r.cafeId] || r.cafeId || "unknown";
    if (!byName[name]) byName[name] = { total: 0, count: 0, daily: 0, weekly: 0, lockerCount: 0, lockerAmt: 0 };
    const amt = getAmt(r);
    byName[name].total += amt;
    byName[name].count += 1;
    if (r.zone === "A") byName[name].daily  += amt;
    else                byName[name].weekly += amt;
    // 사물함 애드온 집계
    if (r.lockerAddon && r.lockerAddon.seatId) {
      byName[name].lockerCount += 1;
      byName[name].lockerAmt   += (r.lockerAddon.price || 0);
    }
  });

  const sorted   = Object.entries(byName).sort((a, b) => b[1].total - a[1].total);
  const maxTotal = sorted.length > 0 ? sorted[0][1].total : 1;
  const tbody    = document.getElementById("cafeTableBody");

  if (sorted.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8">해당 기간에 결제 데이터가 없습니다.</td></tr>`;
    return;
  }

  tbody.innerHTML = sorted.map(([name, v], i) => {
    const rankClass = ["r1", "r2", "r3"][i] || "rn";
    const pct = Math.round((v.total / maxTotal) * 100);
    const lockerCell = v.lockerCount > 0
      ? `<span style="background:#e1f5ee;color:#0f6e56;font-size:12px;font-weight:700;padding:3px 8px;border-radius:6px;">${v.lockerCount}건 (+${v.lockerAmt.toLocaleString()}원)</span>`
      : `<span style="color:#ccc;font-size:12px;">-</span>`;
    return `
      <tr>
        <td><span class="rank ${rankClass}">${i + 1}</span></td>
        <td>${name}</td>
        <td style="color:#4a6cf7; font-weight:800;">${v.total.toLocaleString()}원</td>
        <td>${v.count}건</td>
        <td><span class="zone-a">${v.daily.toLocaleString()}원</span></td>
        <td><span class="zone-b">${v.weekly.toLocaleString()}원</span></td>
        <td>${lockerCell}</td>
        <td>
          <div class="bar-wrap">
            <div class="bar-bg"><div class="bar-fill" style="width:${pct}%"></div></div>
          </div>
        </td>
      </tr>`;
  }).join("");
}

// ── 메인 로드 ──
window.loadData = async function () {
  const btn = document.getElementById("refreshBtn");
  btn.disabled = true;
  btn.textContent = "로딩 중...";
  document.getElementById("loadingOverlay").style.display = "flex";

  try {
    await fetchAll();
    const filtered = filterReservations();
    updateKPI(filtered);
    buildTrendChart(filtered);
    buildCafeChart(filtered);
    buildCafeTable(filtered);
  } catch (e) {
    console.error("데이터 로드 실패:", e);
    alert("데이터를 불러오는 데 실패했습니다.\n" + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "🔄 새로고침";
    document.getElementById("loadingOverlay").style.display = "none";
  }
};

// ── 앱 시작 ──
onAuthStateChanged(auth, async user => {
  if (!user) { location.href = "login.html"; return; }

  const userDoc = await getDoc(doc(db, "users", user.uid));
  const role = userDoc.exists() ? userDoc.data().role : null;
  if (role !== "admin" && role !== "superAdmin") {
    alert("접근 권한이 없습니다.");
    location.href = "index.html";
    return;
  }

  document.getElementById("adminId").textContent = user.email || "admin";

  document.getElementById("logoutBtn").onclick = () => {
    import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js")
      .then(({ signOut }) => signOut(auth).then(() => location.href = "login.html"));
  };

  initSelects();
  await loadData();
});