// ── Study Spot 커스텀 모달 유틸리티 ──
// alert() → showAlert(message, type)
// confirm() → showConfirm(message) → Promise<boolean>

(function () {
  // 이미 삽입된 경우 중복 방지
  if (document.getElementById('ss-modal-style')) return;

  // CSS 삽입
  const style = document.createElement('style');
  style.id = 'ss-modal-style';
  style.textContent = `
    .ss-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 20, 50, 0.45);
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      animation: ss-fade-in 0.15s ease;
    }
    @keyframes ss-fade-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    .ss-box {
      background: #fff;
      border-radius: 20px;
      padding: 32px 28px 24px;
      max-width: 380px;
      width: 100%;
      box-shadow: 0 24px 60px rgba(74, 108, 247, 0.18);
      border: 1px solid #e8eeff;
      animation: ss-slide-up 0.2s ease;
      text-align: center;
    }
    @keyframes ss-slide-up {
      from { transform: translateY(18px); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }
    .ss-icon {
      font-size: 40px;
      margin-bottom: 14px;
      line-height: 1;
    }
    .ss-message {
      font-size: 15px;
      font-weight: 600;
      color: #1a1f36;
      line-height: 1.65;
      margin-bottom: 22px;
      white-space: pre-wrap;
    }
    .ss-btn-wrap {
      display: flex;
      gap: 10px;
      justify-content: center;
    }
    .ss-btn {
      flex: 1;
      max-width: 140px;
      padding: 12px 0;
      border: none;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: opacity 0.15s, transform 0.1s;
      font-family: inherit;
    }
    .ss-btn:hover  { opacity: 0.88; }
    .ss-btn:active { transform: scale(0.97); }
    .ss-btn-primary {
      background: linear-gradient(135deg, #4a6cf7, #6d8dff);
      color: #fff;
      box-shadow: 0 6px 16px rgba(74, 108, 247, 0.28);
    }
    .ss-btn-danger {
      background: linear-gradient(135deg, #ef4444, #f87171);
      color: #fff;
      box-shadow: 0 6px 16px rgba(239, 68, 68, 0.25);
    }
    .ss-btn-cancel {
      background: #f0f2ff;
      color: #4a6cf7;
    }
  `;
  document.head.appendChild(style);

  // 아이콘 & 버튼 색상 결정
  function resolveType(msg) {
    if (!msg) return { icon: 'ℹ️', btnClass: 'ss-btn-primary' };
    const m = msg.toLowerCase();
    if (m.includes('성공') || m.includes('완료') || m.includes('저장') || m.includes('등록') || m.includes('수락') || m.includes('승인') || m.includes('접수')) {
      return { icon: '✅', btnClass: 'ss-btn-primary' };
    }
    if (m.includes('삭제') || m.includes('취소') || m.includes('실패') || m.includes('오류') || m.includes('없습니다') || m.includes('불가') || m.includes('제한') || m.includes('거절') || m.includes('정지') || m.includes('퇴실')) {
      return { icon: '❌', btnClass: 'ss-btn-danger' };
    }
    if (m.includes('경고') || m.includes('주의') || m.includes('일치하지') || m.includes('입력') || m.includes('선택') || m.includes('필요') || m.includes('이상') || m.includes('않습니다')) {
      return { icon: '⚠️', btnClass: 'ss-btn-primary' };
    }
    if (m.includes('로그인') || m.includes('인증') || m.includes('관리자')) {
      return { icon: '🔒', btnClass: 'ss-btn-primary' };
    }
    return { icon: 'ℹ️', btnClass: 'ss-btn-primary' };
  }

  // showAlert: alert() 대체
  window.showAlert = function (message, type) {
    return new Promise((resolve) => {
      const { icon, btnClass } = type ? { icon: { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' }[type] || 'ℹ️', btnClass: type === 'error' ? 'ss-btn-danger' : 'ss-btn-primary' } : resolveType(message);

      const overlay = document.createElement('div');
      overlay.className = 'ss-overlay';
      overlay.innerHTML = `
        <div class="ss-box">
          <div class="ss-icon">${icon}</div>
          <div class="ss-message">${message}</div>
          <div class="ss-btn-wrap">
            <button class="ss-btn ${btnClass}" id="ss-ok">확인</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const ok = overlay.querySelector('#ss-ok');
      const close = () => { overlay.remove(); resolve(); };
      ok.addEventListener('click', close);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
      document.addEventListener('keydown', function onKey(e) {
        if (e.key === 'Enter' || e.key === 'Escape') { document.removeEventListener('keydown', onKey); close(); }
      });
      ok.focus();
    });
  };

  // showConfirm: confirm() 대체 → Promise<boolean>
  window.showConfirm = function (message, isDanger = false) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'ss-overlay';
      overlay.innerHTML = `
        <div class="ss-box">
          <div class="ss-icon">${isDanger ? '🗑️' : '❓'}</div>
          <div class="ss-message">${message}</div>
          <div class="ss-btn-wrap">
            <button class="ss-btn ss-btn-cancel" id="ss-cancel">취소</button>
            <button class="ss-btn ${isDanger ? 'ss-btn-danger' : 'ss-btn-primary'}" id="ss-confirm">확인</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const confirmBtn = overlay.querySelector('#ss-confirm');
      const cancelBtn  = overlay.querySelector('#ss-cancel');
      const closeWith  = (val) => { overlay.remove(); resolve(val); };

      confirmBtn.addEventListener('click', () => closeWith(true));
      cancelBtn.addEventListener('click',  () => closeWith(false));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) closeWith(false); });
      document.addEventListener('keydown', function onKey(e) {
        if (e.key === 'Enter') { document.removeEventListener('keydown', onKey); closeWith(true); }
        if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); closeWith(false); }
      });
      cancelBtn.focus();
    });
  };
})();