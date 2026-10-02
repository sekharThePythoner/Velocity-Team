// Velocity Team - Interactive Member Card & Canvas Export Engine

export function initCardTilt() {
  const card = document.getElementById('memberCard');
  if (!card) return;

  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    const rotateX = ((y - centerY) / centerY) * -8;
    const rotateY = ((x - centerX) / centerX) * 8;
    
    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
  });

  card.addEventListener('mouseleave', () => {
    card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
  });
}

// Download High-Resolution Member Card as PNG using HTML5 Canvas
export function downloadCardPNG(userData) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 740;
  const ctx = canvas.getContext('2d');

  // Background Gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 1200, 740);
  bgGrad.addColorStop(0, '#242938');
  bgGrad.addColorStop(0.55, '#151822');
  bgGrad.addColorStop(1, '#0e1118');
  ctx.fillStyle = bgGrad;
  ctx.roundRect(0, 0, 1200, 740, 40);
  ctx.fill();

  // Subtle Border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Futuristic Background Geometry & Grid Accents
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.05)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 1200; i += 80) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 740);
    ctx.stroke();
  }
  for (let j = 0; j < 740; j += 80) {
    ctx.beginPath();
    ctx.moveTo(0, j);
    ctx.lineTo(1200, j);
    ctx.stroke();
  }

  // Large Geometric Watermark in Background
  ctx.save();
  ctx.translate(950, 480);
  ctx.rotate(-0.15);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  for (let r = 50; r <= 320; r += 45) {
    ctx.arc(0, 0, r, 0, Math.PI * 1.5);
  }
  ctx.stroke();
  ctx.restore();

  // Header: Brand & RF Serial
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px "Plus Jakarta Sans", sans-serif';
  ctx.fillText("VELOCITY TEAM", 70, 95);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.font = '500 24px "JetBrains Mono", monospace';
  ctx.fillText("RF · 8972 9792", 900, 95);

  // Center: Member ID
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.font = 'bold 22px "Inter", sans-serif';
  ctx.fillText("MEMBER", 70, 240);

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 88px "Plus Jakarta Sans", sans-serif';
  const memberIdText = userData.memberId || '#042';
  ctx.fillText(memberIdText, 70, 335);

  // Early-Bird Airdrop Badge
  if (userData.rewardAmount) {
    ctx.save();
    ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
    ctx.lineWidth = 2;
    ctx.roundRect(70, 375, 480, 52, 26);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 22px "Inter", sans-serif';
    ctx.fillText(`★ EARLY BIRD BONUS: $${userData.rewardAmount} UNLOCKED`, 95, 410);
    ctx.restore();
  }

  // Bottom Left: Avatar & User Handle
  ctx.save();
  ctx.beginPath();
  ctx.arc(115, 620, 45, 0, Math.PI * 2);
  ctx.fillStyle = '#38bdf8';
  ctx.fill();
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 36px "Inter", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText((userData.displayName || 'V')[0].toUpperCase(), 115, 633);
  ctx.restore();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px "Inter", sans-serif';
  ctx.fillText(userData.displayName || 'Velocity Member', 185, 610);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.font = '22px "Inter", sans-serif';
  ctx.fillText(userData.handle || '@member', 185, 645);

  // Bottom Right: Invite Code
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.font = 'bold 20px "Inter", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText("INVITE CODE", 1130, 600);

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 48px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(userData.inviteCode || 'K2A5M9', 1130, 655);

  // Trigger Download
  const link = document.createElement('a');
  link.download = `VelocityTeam_${memberIdText.replace('#', '')}_Pass.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// Toast Notification
export function showToast(message) {
  let toast = document.getElementById('appToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appToast';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: rgba(18, 22, 32, 0.95);
      border: 1px solid rgba(56, 189, 248, 0.4);
      color: #ffffff;
      padding: 12px 20px;
      border-radius: 9999px;
      font-size: 0.88rem;
      font-weight: 600;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(12px);
      z-index: 9999;
      transform: translateY(100px);
      opacity: 0;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      display: flex;
      align-items: center;
      gap: 8px;
    `;
    document.body.appendChild(toast);
  }
  
  toast.innerHTML = `<span>✓</span> ${message}`;
  toast.style.transform = 'translateY(0)';
  toast.style.opacity = '1';

  setTimeout(() => {
    toast.style.transform = 'translateY(100px)';
    toast.style.opacity = '0';
  }, 2800);
}
