// ==========================================
// firebase.js에서 공유 인스턴스 가져오기 (중복 초기화 제거)
// ==========================================
import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, onSnapshot, updateDoc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ==========================================
// 전역 상태
// ==========================================
let cafeDocRef = null; // 로그인 후 ownerUid로 동적 설정
let ZONE_A = 30;
let ZONE_B = 20;
let seats = {};
let notifications = [];
let revenue = 0;
let seatUnsubscribe = null;
let cafeUnsubscribe = null;

// ==========================================
// 인증 확인 후 초기화 (권한 오류의 핵심 수정)
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        alert("로그인이 필요합니다.");
        location.href = "login.html";
        return;
    }

    // role 확인
    try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const role = userDoc.exists() ? userDoc.data().role : null;
        if (role !== "admin" && role !== "superAdmin") {
            alert("접근 권한이 없습니다.");
            location.href = "index.html";
            return;
        }
    } catch (e) {
        console.error("권한 확인 실패:", e);
        alert("권한 확인 중 오류가 발생했습니다.");
        location.href = "login.html";
        return;
    }

    // 카페 문서 ID = 로그인한 관리자의 UID
    cafeDocRef = doc(db, "cafes", user.uid);

    // 사이드바 이름 표시
    const brandTitle = document.getElementById('sb-cafe-name');
    if (brandTitle) brandTitle.textContent = "불러오는 중...";

    // 리스너 시작
    listenToCafeInfo();
    listenToSeats();

    // 버튼 이벤트
    const saveBtn = document.getElementById('btn-save');
    if (saveBtn) saveBtn.addEventListener('click', saveCafeInfo);

    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js")
                .then(({ signOut }) => signOut(auth).then(() => location.href = "login.html"));
        });
    }
});

// ==========================================
// 1. 업장 기본 정보 실시간 동기화
// ==========================================
function listenToCafeInfo() {
    if (!cafeDocRef) return;
    if (cafeUnsubscribe) cafeUnsubscribe();

    cafeUnsubscribe = onSnapshot(cafeDocRef, (docSnap) => {
        if (!docSnap.exists()) {
            console.log("업장 정보 데이터가 존재하지 않습니다.");
            // 사이드바에 안내 표시
            const brandTitle = document.getElementById('sb-cafe-name');
            if (brandTitle) brandTitle.textContent = "업장 미등록";
            const sbCafeSub = document.getElementById('sb-cafe-sub');
            if (sbCafeSub) sbCafeSub.textContent = "업장 정보를 먼저 등록해주세요";
            return;
        }

        const data = docSnap.data();

        ZONE_A = Number(data.seatsA) || 30;
        ZONE_B = Number(data.seatsB) || 20;

        const totalSeats = Number(data.totalSeats) || (ZONE_A + ZONE_B);
        const priceDay   = data.price ? (data.price.daily   || 0) : 0;
        const priceWeek  = data.price ? (data.price.weekly  || 0) : 0;
        const priceMonth = data.price ? (data.price.monthly || 0) : 0;
        const priceHourly = data.price ? (data.price.hourly || 0) : 0;

        const sbCafeSub = document.getElementById('sb-cafe-sub');
        if (sbCafeSub) sbCafeSub.textContent = "관리자 페이지";

        const brandTitle = document.getElementById('sb-cafe-name');
        if (brandTitle) brandTitle.textContent = data.cafeName || "Study Cafe";

        const textPrice = document.getElementById('sb-cafe-price');
        const textSeats = document.getElementById('sb-cafe-seats');
        if (textPrice) textPrice.textContent = `당일권 ${priceDay.toLocaleString()}원 · 주간 ${priceWeek.toLocaleString()}원`;
        if (textSeats) textSeats.textContent = `총 ${totalSeats}석 (A구역 ${ZONE_A} · B구역 ${ZONE_B})`;

        // 설정 폼 바인딩 (새 구조)
        if (document.getElementById('f-name'))   document.getElementById('f-name').value   = data.cafeName      || '';
        if (document.getElementById('f-addr'))   document.getElementById('f-addr').value   = data.address       || '';
        if (document.getElementById('f-addr2'))  document.getElementById('f-addr2').value  = data.addressDetail || '';
        if (document.getElementById('f-biz'))    document.getElementById('f-biz').value    = data.bizNumber     || '';
        if (document.getElementById('f-total'))  document.getElementById('f-total').value  = totalSeats;
        if (document.getElementById('f-zone-a')) document.getElementById('f-zone-a').value = ZONE_A;
        if (document.getElementById('f-zone-b')) document.getElementById('f-zone-b').value = ZONE_B;
        // 자유 행 테이블 복원 (한 번만 실행)
        if (!window._dashFormLoaded) {
            window._dashFormLoaded = true;
            dLoadRows('daily',  data.dailyPrice  || []);
            dLoadRows('period', data.periodPrice || []);
            // 고정석
            if (data.fixedSeat?.enabled) {
                const cb = document.getElementById('d-useFixed');
                if (cb) { cb.checked = true; dToggle('d-fixed-body', true); }
                const fc = document.getElementById('d-fixedCount');
                if (fc) fc.value = data.fixedSeat.count || '';
                dLoadRows('fixed', data.fixedSeat.priceList || []);
            }
            // 그룹 룸
            if (data.rooms?.enabled && data.rooms.list?.length > 0) {
                const cb = document.getElementById('d-useRoom');
                if (cb) { cb.checked = true; dToggle('d-room-body', true); }
                data.rooms.list.forEach(r => {
                    dAddRoomCard(r);
                    const cards = document.querySelectorAll('#d-room-cards .d-room-card');
                    const card = cards[cards.length - 1];
                    const ri = card?.dataset.ri;
                    if (ri !== undefined) {
                        (r.timePrice || []).forEach(tp => dAddRoomTimeRow(parseInt(ri), [tp.hours, tp.price]));
                    }
                });
            }
            // 사물함
            if (data.locker?.enabled) {
                const cb = document.getElementById('d-useLocker');
                if (cb) { cb.checked = true; dToggle('d-locker-body', true); }
                const lc = document.getElementById('d-lockerCount');
                if (lc) lc.value = data.locker.count || '';
                dLoadRows('locker', data.locker.priceList || []);
            }
        }

        renderSeats();
        updateStats();
    }, (error) => {
        console.error("카페 기본 정보 로드 실패:", error);
    });
}

// ==========================================
// 2. 실시간 좌석 상태 감시 (별도 리스너로 분리)
// ==========================================
function listenToSeats() {
    if (!cafeDocRef) return;
    if (seatUnsubscribe) seatUnsubscribe();

    seatUnsubscribe = onSnapshot(cafeDocRef, (docSnap) => {
        if (!docSnap.exists()) return;

        const remoteSeats = docSnap.data().seats;

        if (!remoteSeats) {
            // seats 필드가 아직 없으면 초기화
            resetDefaultSeatsInFirebase();
            return;
        }

        // 변경 감지 알림
        Object.keys(remoteSeats).forEach(id => {
            if (seats[id] && seats[id].status === 'empty' && remoteSeats[id].status === 'occupied') {
                showToast('success', `🔔 ${id}석 신규 예약`, `${remoteSeats[id].name} 사용자가 좌석을 선택했습니다.`);
                addLog(`${id}석 - ${remoteSeats[id].name} 입실`);
            }
            if (seats[id] && seats[id].status !== 'empty' && remoteSeats[id].status === 'empty') {
                showToast('warning', `💨 ${id}석 이용 종료`, '사용자가 퇴실했거나 시간이 만료되었습니다.');
                addLog(`${id}석 퇴실 처리`);
            }
        });

        seats = remoteSeats;
        renderSeats();
        updateStats();
    }, (error) => {
        console.error("Firebase 좌석 연결 에러:", error);
    });
}

// ==========================================
// 3. 업장 설정 저장 (점 표기법으로 중첩 필드 안전 업데이트)
// ==========================================
async function saveCafeInfo() {
    if (!cafeDocRef) return;

    try {
        const nameVal   = document.getElementById('f-name')?.value  || '';
        const addrVal   = document.getElementById('f-addr')?.value  || '';
        const addr2Val  = document.getElementById('f-addr2')?.value || '';
        const bizVal    = document.getElementById('f-biz')?.value   || '';
        const totalVal  = Number(document.getElementById('f-total')?.value   || 50);
        const seatsAVal = Number(document.getElementById('f-zone-a')?.value  || 30);
        const seatsBVal = Number(document.getElementById('f-zone-b')?.value  || 20);

        if (seatsAVal + seatsBVal !== totalVal) {
            alert(`⚠️ A구역(${seatsAVal}) + B구역(${seatsBVal}) = ${seatsAVal + seatsBVal}석이\n총 좌석 수(${totalVal})와 일치하지 않습니다.`);
            return;
        }

        // 자유 행 수집
        const dailyPrice  = dGetRows('daily');
        const periodPrice = dGetRows('period');

        const useFixed = document.getElementById('d-useFixed')?.checked || false;
        const fixedSeat = useFixed ? {
            enabled: true,
            count: Number(document.getElementById('d-fixedCount')?.value || 0),
            priceList: dGetRows('fixed')
        } : { enabled: false };

        const useRoom = document.getElementById('d-useRoom')?.checked || false;
        const rooms = useRoom
            ? { enabled: true, list: dGetRoomData() }
            : { enabled: false, list: [] };

        const useLocker = document.getElementById('d-useLocker')?.checked || false;
        const locker = useLocker ? {
            enabled: true,
            count: Number(document.getElementById('d-lockerCount')?.value || 0),
            priceList: dGetRows('locker')
        } : { enabled: false };

        await updateDoc(cafeDocRef, {
            cafeName:      nameVal,
            address:       addrVal,
            addressDetail: addr2Val,
            bizNumber:     bizVal,
            totalSeats:    totalVal,
            seatsA:        seatsAVal,
            seatsB:        seatsBVal,
            // 기존 호환 필드
            'price.daily':  dailyPrice[0]?.price  || 0,
            'price.weekly': periodPrice[0]?.price || 0,
            dailyPrice,
            periodPrice,
            fixedSeat,
            rooms,
            locker
        });

        showToast('success', '저장 완료', '업장 정보가 성공적으로 업데이트되었습니다.');
        addLog('업장 정보 수동 저장 완료');
    } catch (e) {
        console.error('🔥 [SAVE ERROR] 파이어베이스 업데이트 실패:', e);
        showToast('danger', '저장 실패', '파이어베이스 연동 오류: ' + e.message);
    }
}

// ==========================================
// 4. 좌석 초기화
// ==========================================
async function resetDefaultSeatsInFirebase() {
    if (!cafeDocRef) return;
    const initialSeats = {};
    for (let i = 1; i <= ZONE_A; i++) initialSeats['A' + i] = { status: 'empty', name: '', type: '', endTime: null, userId: '' };
    for (let i = 1; i <= ZONE_B; i++) initialSeats['B' + i] = { status: 'empty', name: '', type: '', endTime: null, userId: '' };
    try {
        await updateDoc(cafeDocRef, { seats: initialSeats });
    } catch (e) {
        console.error("좌석 초기화 실패:", e);
    }
}

// ==========================================
// 5. 좌석 렌더링
// ==========================================
function renderSeats() {
    const za = document.getElementById('zone-a');
    const zb = document.getElementById('zone-b');
    if (!za || !zb) return;

    za.innerHTML = '';
    zb.innerHTML = '';
    for (let i = 1; i <= ZONE_A; i++) za.appendChild(makeSeatEl('A' + i));
    for (let i = 1; i <= ZONE_B; i++) zb.appendChild(makeSeatEl('B' + i));
}

function makeSeatEl(id) {
    const s = seats[id] || { status: 'empty', name: '', type: '', endTime: null };
    const div = document.createElement('div');
    const isA = id.startsWith('A');
    let cls = 'seat ';

    if (s.status === 'empty') cls += 'empty';
    else if (s.status === 'occupied') cls += (isA ? 'occupied-a' : 'occupied-b');
    else if (s.status === 'expiring') cls += 'expiring';
    div.className = cls;
    div.onclick = () => clickSeat(id);

    const numEl = document.createElement('div');
    numEl.className = 'seat-num';
    numEl.textContent = id;
    div.appendChild(numEl);

    if (s.status !== 'empty' && s.endTime) {
        const rem = Math.max(0, Math.floor((s.endTime - Date.now()) / 1000));
        const timerEl = document.createElement('div');
        timerEl.className = 'seat-timer';
        timerEl.id = 'timer-' + id;
        timerEl.textContent = formatTime(rem);
        div.appendChild(timerEl);

        if (s.name) {
            const badge = document.createElement('div');
            badge.className = 'seat-type-badge';
            badge.textContent = s.name.slice(0, 2);
            div.appendChild(badge);
        }
    }
    return div;
}

function formatTime(sec) {
    if (sec <= 0) return '종료';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'm';
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

// ==========================================
// 6. 타이머 & 통계 업데이트 (1초 인터벌)
// ==========================================
function updateTimers() {
    let occ = 0, exp = 0, free = 0;
    Object.keys(seats).forEach(id => {
        const s = seats[id];
        if (!s || s.status === 'empty') { free++; return; }
        occ++;
        const rem = s.endTime ? Math.max(0, Math.floor((s.endTime - Date.now()) / 1000)) : Infinity;
        const el = document.getElementById('timer-' + id);
        if (el) el.textContent = formatTime(rem);

        if (rem <= 0 && s.status !== 'empty') {
            addNotification('danger', `⏰ ${id}석 이용 종료`, `${s.name || '사용자'}의 이용 시간이 만료되었습니다.`);
            showToast('danger', `${id}석 시간 만료`, '자동 퇴실 처리되었습니다.');
            updateFirebaseSeat(id, { status: 'empty', name: '', type: '', endTime: null, userId: '' });
            return;
        }

        if (rem <= 900 && rem > 0 && s.status === 'occupied') {
            seats[id].status = 'expiring';
            if (!s._warned) {
                s._warned = true;
                addNotification('warning', `⚠️ ${id}석 만료 임박`, `${s.name || '사용자'}의 잔여 시간이 15분 미만입니다.`);
                showToast('warning', `${id}석 만료 임박`, '종료 전 좌석 이동이나 연장이 필요할 수 있습니다.');
            }
            const el2 = document.getElementById('timer-' + id);
            if (el2) el2.closest('.seat').className = 'seat expiring';
        }
        if (s.status === 'expiring') exp++;
    });

    if (document.getElementById('stat-occ'))  document.getElementById('stat-occ').textContent  = occ;
    if (document.getElementById('stat-free')) document.getElementById('stat-free').textContent = free;
    if (document.getElementById('stat-exp'))  document.getElementById('stat-exp').textContent  = exp;
}

function updateStats() {
    let occ = 0, free = 0, exp = 0;
    Object.keys(seats).forEach(id => {
        if (!seats[id] || seats[id].status === 'empty') free++;
        else { occ++; if (seats[id].status === 'expiring') exp++; }
    });

    if (document.getElementById('stat-occ'))  document.getElementById('stat-occ').textContent  = occ;
    if (document.getElementById('stat-free')) document.getElementById('stat-free').textContent = free;
    if (document.getElementById('stat-exp'))  document.getElementById('stat-exp').textContent  = exp;
    if (document.getElementById('stat-rev'))  document.getElementById('stat-rev').textContent  = revenue.toLocaleString();
}

// ==========================================
// 7. 좌석 클릭 (강제 퇴실)
// ==========================================
function clickSeat(id) {
    const s = seats[id];
    if (s && s.status !== 'empty') {
        if (confirm(`⚠️ [${id}석] (${s.name} 사용자)을 강제 퇴실 처리하시겠습니까?\n이 작업은 파이어베이스 클라우드에 즉시 반영됩니다.`)) {
            updateFirebaseSeat(id, { status: 'empty', name: '', type: '', endTime: null, userId: '' });
            addLog(`${id}석 관리자 강제 퇴실`);
            // reservations에서 해당 좌석 활성 예약 찾아서 force_cancelled로 변경
            forceEvictReservation(id);
        }
    }
}

async function forceEvictReservation(seatId) {
    if (!cafeDocRef) return;
    const cafeId = cafeDocRef.id;
    try {
        const q = query(
            collection(db, "reservations"),
            where("cafeId", "==", cafeId),
            where("seatId", "==", seatId),
            where("status", "in", ["active", "confirmed"])
        );
        const snap = await getDocs(q);
        snap.forEach(async (docSnap) => {
            await updateDoc(doc(db, "reservations", docSnap.id), {
                status: "force_cancelled"
            });
        });
        console.log(`[강제퇴실] ${seatId}석 예약 상태 업데이트 완료`);
    } catch(e) {
        console.error("reservations 강제퇴실 업데이트 실패:", e);
    }
}

async function updateFirebaseSeat(seatId, data) {
    if (!cafeDocRef) return;
    try {
        const updateObj = {};
        updateObj[`seats.${seatId}`] = data;
        await updateDoc(cafeDocRef, updateObj);
    } catch (e) {
        console.error("Firebase 데이터 동기화 실패:", e);
    }
}

// ==========================================
// 8. 수동 발권 (관리자 강제 발권)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const manualBtn = document.getElementById('btn-manual-issue');
    if (manualBtn) {
        manualBtn.addEventListener('click', async () => {
            if (!cafeDocRef) { alert("로그인 후 사용하세요."); return; }
            const seatId   = document.getElementById('m-seat-id')?.value.trim().toUpperCase();
            const userName = document.getElementById('m-user-name')?.value.trim();
            const type     = document.getElementById('m-type')?.value;
            const hours    = Number(document.getElementById('m-hours')?.value || 8);

            if (!seatId || !userName) { alert("좌석 번호와 사용자 성함을 입력해주세요."); return; }

            const endTime = type === 'day' ? Date.now() + hours * 3600 * 1000 : null;
            await updateFirebaseSeat(seatId, {
                status: 'occupied',
                name:   userName,
                type:   type === 'day' ? '당일권' : '기간권',
                endTime,
                userId: 'manual'
            });

            if (type === 'day') revenue += (ZONE_A > 0 ? 4000 : 0); // 임시 금액, 실제는 price 필드 참조
            showToast('success', `${seatId}석 발권 완료`, `${userName} (${type === 'day' ? '당일권' : '기간권'})`);
            addLog(`관리자 발권: ${seatId}석 → ${userName}`);

            if (document.getElementById('m-seat-id'))  document.getElementById('m-seat-id').value  = '';
            if (document.getElementById('m-user-name')) document.getElementById('m-user-name').value = '';
        });
    }
});

// ==========================================
// 9. 알림 & 토스트
// ==========================================
function addNotification(type, title, body) {
    notifications.unshift({ type, title, body, time: new Date(), read: false });
    const count = notifications.filter(n => !n.read).length;
    const badge = document.getElementById('notif-count');
    if (badge) { badge.textContent = count; badge.style.display = count > 0 ? 'flex' : 'none'; }
    renderNotifList();
}

function renderNotifList() {
    const list = document.getElementById('notif-list');
    if (!list) return;
    if (!notifications.length) { list.innerHTML = '<div class="notif-empty">알림이 없습니다</div>'; return; }
    list.innerHTML = notifications.slice(0, 10).map((n, i) => `
        <div class="notif-item ${n.read ? '' : 'unread'}" onclick="markRead(${i})">
            <p>${n.title}</p>
            <p style="margin-top:2px;color:var(--gray-600);font-size:12px">${n.body}</p>
            <span>${n.time.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
    `).join('');
}

window.markRead = function (i) {
    notifications[i].read = true;
    const c = notifications.filter(n => !n.read).length;
    const badge = document.getElementById('notif-count');
    if (badge) { badge.textContent = c; badge.style.display = c > 0 ? 'flex' : 'none'; }
    renderNotifList();
};

window.clearNotifs = function () {
    notifications.forEach(n => n.read = true);
    const badge = document.getElementById('notif-count');
    if (badge) badge.style.display = 'none';
    renderNotifList();
};

window.toggleNotif = function () {
    const o = document.getElementById('notif-overlay');
    if (!o) return;
    o.style.display = o.style.display === 'none' ? 'flex' : 'none';
    if (o.style.display !== 'none') renderNotifList();
};

function showToast(type, title, body) {
    const wrap = document.getElementById('toast-wrap');
    if (!wrap) return;
    const div = document.createElement('div');
    const icons = { success: 'ti-circle-check', danger: 'ti-alert-circle', warning: 'ti-alert-triangle' };
    div.className = 'toast ' + (type === 'success' ? '' : type);
    div.innerHTML = `<i class="ti ${icons[type] || 'ti-bell'}" aria-hidden="true"></i><div class="toast-body"><p>${title}</p><span>${body}</span></div>`;
    wrap.appendChild(div);
    setTimeout(() => {
        div.style.opacity = '0';
        div.style.transition = 'opacity 0.4s';
        setTimeout(() => div.remove(), 400);
    }, 4000);
    if (type !== 'success') addNotification(type, title, body);
}

// ==========================================
// 10. 실시간 출입 로그
// ==========================================
function addLog(msg) {
    const logList = document.getElementById('log-list');
    if (!logList) return;
    const item = document.createElement('div');
    item.className = 'log-item';
    const now = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    item.innerHTML = `<span class="time">${now}</span>${msg}`;
    logList.prepend(item);
    // 최대 30개 유지
    while (logList.children.length > 30) logList.lastChild.remove();
}

// ==========================================
// 11. 페이지 전환
// ==========================================
window.showPage = function (id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const targetPage = document.getElementById('page-' + id);
    const targetNav  = document.getElementById('nav-' + id);
    if (targetPage) targetPage.classList.add('active');
    if (targetNav)  targetNav.classList.add('active');

    const titles = { seats: '좌석 배치도 · 실시간 모니터링', info: '업장 정보 설정', users: '이용자 현황' };
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.textContent = titles[id] || '';
};

// ==========================================
// 12. 시계 & 인터벌 시작
// ==========================================
function liveClock() {
    const clock = document.getElementById('live-clock');
    if (clock) clock.textContent = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

document.addEventListener('DOMContentLoaded', () => {
    liveClock();
    setInterval(liveClock, 1000);
    setInterval(updateTimers, 1000);
    showToast('success', '실시간 관제 시스템 가동', '로그인 인증 후 데이터 동기화를 시작합니다.');
});
// ==========================================
// 13. 이용자 현황 (기간권 · 고정석 · 사물함 남은 기간)
// ==========================================
let allUserStatusData = [];
let currentUserTab = 'all';

window.loadUserStatus = async function() {
    if (!cafeDocRef) return;
    const cafeId = cafeDocRef.id;
    const listEl = document.getElementById('userStatusList');
    if (!listEl) return;

    listEl.innerHTML = '<div class="usc-empty">불러오는 중...</div>';

    try {
        const q = query(
            collection(db, 'reservations'),
            where('cafeId', '==', cafeId),
            where('status', 'in', ['active', 'confirmed'])
        );
        const snap = await getDocs(q);

        // uid별로 그룹핑
        const byUser = {};
        snap.forEach(d => {
            const r = { id: d.id, ...d.data() };
            if (!byUser[r.uid]) byUser[r.uid] = { uid: r.uid, email: r.email || '-', items: [] };
            byUser[r.uid].items.push(r);
        });

        allUserStatusData = Object.values(byUser);
        renderUserStatus(allUserStatusData, currentUserTab);

    } catch(e) {
        console.error('이용자 현황 로드 실패:', e);
        listEl.innerHTML = `<div class="usc-empty">불러오기 실패: ${e.message}</div>`;
    }
};

window.filterUserTab = function(tab) {
    currentUserTab = tab;
    ['all','period','fixed','room','locker'].forEach(t => {
        const btn = document.getElementById('utab-' + t);
        if (!btn) return;
        btn.className = t === tab ? 'btn btn-primary' : 'btn btn-secondary';
        btn.style.padding = '8px 16px';
        btn.style.fontSize = '13px';
    });
    renderUserStatus(allUserStatusData, tab);
};

function daysLeft(createdAt, days) {
    if (!createdAt || !days) return null;
    const start = createdAt.seconds ? createdAt.seconds * 1000 : new Date(createdAt).getTime();
    const end = start + days * 86400000;
    return Math.ceil((end - Date.now()) / 86400000);
}

function renderUserStatus(data, tab) {
    const listEl = document.getElementById('userStatusList');
    if (!listEl) return;

    if (!data || data.length === 0) {
        listEl.innerHTML = '<div class="usc-empty">활성 이용자가 없습니다.</div>';
        return;
    }

    let html = '';

    data.forEach(u => {
        const badges = [];

        u.items.forEach(r => {
            const type = r.reservationType || (r.zone === 'A' ? 'period' : r.zone === 'B' ? 'fixed' : r.type || 'period');

            if ((r.zone === 'A' || type === 'period') && (r.days || r.weeks)) {
                if (tab !== 'all' && tab !== 'period') return;
                const totalDays = r.days || (r.weeks * 7);
                const left = daysLeft(r.createdAt, totalDays);
                const cls = left === null ? 'period' : left <= 3 ? 'expiring' : left < 0 ? 'expired' : 'period';
                const leftTxt = left === null ? '' : left < 0 ? '만료' : left + '일 남음';
                badges.push('<span class="usc-badge ' + cls + '">📅 기간권 ' + (r.seatId||'') + ' ' + leftTxt + '</span>');
            } else if (r.zone === 'B' || type === 'fixed') {
                if (tab !== 'all' && tab !== 'fixed') return;
                const totalDays = r.days || (r.weeks * 7) || 14;
                const left = daysLeft(r.createdAt, totalDays);
                const cls = left === null ? 'fixed' : left <= 3 ? 'expiring' : left < 0 ? 'expired' : 'fixed';
                const leftTxt = left === null ? '' : left < 0 ? '만료' : left + '일 남음';
                badges.push('<span class="usc-badge ' + cls + '">🪑 고정석 ' + (r.seatId||'') + ' ' + leftTxt + '</span>');
            } else if (type === 'room') {
                if (tab !== 'all' && tab !== 'room') return;
                badges.push('<span class="usc-badge room">🏠 스터디룸 ' + (r.seatId||'') + '</span>');
            } else if (type === 'locker') {
                if (tab !== 'all' && tab !== 'locker') return;
                const totalDays = r.days || 30;
                const left = daysLeft(r.createdAt, totalDays);
                const cls = left === null ? 'locker' : left <= 3 ? 'expiring' : left < 0 ? 'expired' : 'locker';
                const leftTxt = left === null ? '' : left < 0 ? '만료' : left + '일 남음';
                badges.push('<span class="usc-badge ' + cls + '">🔒 사물함 ' + (r.seatId||'') + ' ' + leftTxt + '</span>');
            }
        });

        if (badges.length === 0) return;

        html += '<div class="user-status-card">'
              + '<div><div class="usc-name">' + u.email + '</div>'
              + '<div class="usc-email">' + u.uid.slice(0,8) + '...</div></div>'
              + '<div class="usc-badges">' + badges.join('') + '</div>'
              + '</div>';
    });

    listEl.innerHTML = html || '<div class="usc-empty">해당 유형의 이용자가 없습니다.</div>';
}

// ==========================================
// 14. 대시보드 업장 설정 — 자유 행 UI 함수
//     admin-cafe.html과 동일한 데이터 구조 사용
// ==========================================
const _dRowIdx = { daily:0, period:0, fixed:0, locker:0 };

function _dRowTd(inp) {
    return `<td style="padding:5px 7px;border:1px solid var(--gray-200)">${inp}</td>`;
}
function _dInp(id, ph, type='number') {
    return `<input type="${type}" id="${id}" placeholder="${ph}" style="width:100%;height:34px;border:1px solid var(--gray-300);border-radius:6px;padding:0 8px;font-size:13px">`;
}

window.dAddRow = function(type, vals) {
    const tbody = document.getElementById('d-' + type + '-tbody');
    if (!tbody) return;
    const i = _dRowIdx[type]++;
    const isHour = type === 'daily';
    tbody.insertAdjacentHTML('beforeend', `
        <tr id="d-${type}-row-${i}">
            ${_dRowTd(_dInp(`d-${type}-a-${i}`, isHour ? '예: 2' : '예: 14'))}
            ${_dRowTd(_dInp(`d-${type}-b-${i}`, '가격 입력'))}
            <td style="padding:5px 7px;border:1px solid var(--gray-200);text-align:center">
                <button type="button" onclick="document.getElementById('d-${type}-row-${i}').remove()"
                    style="background:#fff0f0;border:1px solid #ffb3b3;color:#e53935;border-radius:6px;padding:3px 8px;font-size:12px;cursor:pointer;font-weight:700">삭제</button>
            </td>
        </tr>
    `);
    if (vals) {
        document.getElementById(`d-${type}-a-${i}`).value = vals[0] || '';
        document.getElementById(`d-${type}-b-${i}`).value = vals[1] || '';
    }
};

window.dLoadRows = function(type, data) {
    if (!data || data.length === 0) return;
    data.forEach(r => dAddRow(type, [r.key, r.price]));
};

window.dGetRows = function(type) {
    const rows = [];
    document.querySelectorAll(`#d-${type}-tbody tr`).forEach(tr => {
        const i = tr.id.replace(`d-${type}-row-`, '');
        const a = parseInt(document.getElementById(`d-${type}-a-${i}`)?.value);
        const b = parseInt(document.getElementById(`d-${type}-b-${i}`)?.value);
        if (a > 0) rows.push({ key: a, price: b || 0 });
    });
    return rows;
};

window.dToggle = function(id, show) {
    const el = document.getElementById(id);
    if (el) el.style.display = show ? 'block' : 'none';
};

// 룸 카드
let _dRoomIdx = 0;
window.dAddRoomCard = function(vals) {
    const container = document.getElementById('d-room-cards');
    if (!container) return;
    const i = _dRoomIdx++;
    container.insertAdjacentHTML('beforeend', `
        <div class="d-room-card" id="d-room-${i}" data-ri="${i}"
            style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:10px;padding:14px;margin-bottom:10px;position:relative">
            <button type="button" onclick="document.getElementById('d-room-${i}').remove()"
                style="position:absolute;top:8px;right:8px;background:#fff0f0;border:1px solid #ffb3b3;color:#e53935;border-radius:6px;padding:3px 10px;font-size:12px;cursor:pointer;font-weight:700">삭제</button>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px">
                <div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">인실 수</label>${_dInp('d-rp-'+i,'예: 4')}</div>
                <div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">룸 개수</label>${_dInp('d-rc-'+i,'예: 2')}</div>
                <div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">1시간당 가격</label>${_dInp('d-rh-'+i,'예: 5000')}</div>
            </div>
            <p style="font-size:11px;color:var(--gray-400);margin-bottom:6px">시간별 차등 가격 (선택)</p>
            <table style="width:100%;border-collapse:collapse">
                <thead><tr>
                    <th style="background:var(--blue-light);padding:6px;font-size:11px;font-weight:700;color:var(--blue);border:1px solid var(--gray-200);width:110px">최소 이용 시간</th>
                    <th style="background:var(--blue-light);padding:6px;font-size:11px;font-weight:700;color:var(--blue);border:1px solid var(--gray-200)">가격 (원)</th>
                    <th style="background:var(--blue-light);padding:6px;font-size:11px;font-weight:700;color:var(--blue);border:1px solid var(--gray-200);width:56px">삭제</th>
                </tr></thead>
                <tbody id="d-rt-${i}"></tbody>
            </table>
            <button type="button" onclick="dAddRoomTimeRow(${i})"
                style="width:100%;margin-top:6px;padding:7px;background:var(--gray-100);border:1.5px dashed var(--gray-300);border-radius:6px;font-size:12px;font-weight:700;color:var(--gray-600);cursor:pointer">+ 시간 항목 추가</button>
        </div>
    `);
    if (vals) {
        document.getElementById('d-rp-' + i).value = vals.persons      || '';
        document.getElementById('d-rc-' + i).value = vals.count        || '';
        document.getElementById('d-rh-' + i).value = vals.pricePerHour || '';
    }
};

const _dRtIdx = {};
window.dAddRoomTimeRow = function(ri, vals) {
    if (!_dRtIdx[ri]) _dRtIdx[ri] = 0;
    const j = _dRtIdx[ri]++;
    const tbody = document.getElementById('d-rt-' + ri);
    if (!tbody) return;
    tbody.insertAdjacentHTML('beforeend', `
        <tr id="d-rt-${ri}-${j}">
            ${_dRowTd(_dInp(`d-rta-${ri}-${j}`, '예: 2'))}
            ${_dRowTd(_dInp(`d-rtb-${ri}-${j}`, '가격 입력'))}
            <td style="padding:5px 7px;border:1px solid var(--gray-200);text-align:center">
                <button type="button" onclick="document.getElementById('d-rt-${ri}-${j}').remove()"
                    style="background:#fff0f0;border:1px solid #ffb3b3;color:#e53935;border-radius:6px;padding:3px 8px;font-size:12px;cursor:pointer;font-weight:700">삭제</button>
            </td>
        </tr>
    `);
    if (vals) {
        document.getElementById(`d-rta-${ri}-${j}`).value = vals[0] || '';
        document.getElementById(`d-rtb-${ri}-${j}`).value = vals[1] || '';
    }
};

window.dGetRoomData = function() {
    const rooms = [];
    document.querySelectorAll('#d-room-cards .d-room-card').forEach(card => {
        const i = card.dataset.ri;
        const persons = parseInt(document.getElementById('d-rp-' + i)?.value) || 0;
        const count   = parseInt(document.getElementById('d-rc-' + i)?.value) || 1;
        const perHour = parseInt(document.getElementById('d-rh-' + i)?.value) || 0;
        const timePrice = [];
        card.querySelectorAll('tbody tr').forEach(tr => {
            const parts = tr.id.split('-');
            const j  = parts[parts.length - 1];
            const ri = parts[parts.length - 2];
            const a  = parseInt(document.getElementById(`d-rta-${ri}-${j}`)?.value);
            const b  = parseInt(document.getElementById(`d-rtb-${ri}-${j}`)?.value);
            if (a > 0) timePrice.push({ hours: a, price: b || 0 });
        });
        if (persons > 0) rooms.push({ persons, count, pricePerHour: perHour, timePrice });
    });
    return rooms;
};