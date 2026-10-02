// Velocity Team - 60-Second BTC Prediction Arena Engine
import { showToast } from "./card.js";
import { getStoredUser, saveUserSession } from "./auth.js";

export class PredictionEngine {
  constructor() {
    this.currentPrice = 86650.00;
    this.priceHistory = [];
    this.roundDuration = 60;
    this.timeLeft = this.roundDuration;
    this.activeTrade = null; // { direction, amount, strikePrice, startTime, timer }
    this.payoutMultiplier = 1.80; // Matching screenshot: 1.80x
    this.chartCanvas = null;
    this.chartCtx = null;
    this.ws = null;
    this.tradeInterval = null;
  }

  init() {
    this.chartCanvas = document.getElementById('priceCanvas');
    if (this.chartCanvas) {
      this.chartCtx = this.chartCanvas.getContext('2d');
      this.resizeCanvas();
      window.addEventListener('resize', () => this.resizeCanvas());
    }

    // Seed realistic BTC history around 86,600
    let p = 86620;
    for (let i = 0; i < 45; i++) {
      p += (Math.random() - 0.49) * 12;
      this.priceHistory.push(p);
    }
    this.currentPrice = p;

    // Connect to Live Binance BTC Ticker Feed
    this.connectLiveFeed();

    // Render User Balance & Stats
    this.syncUserStats();

    // Setup Betting Buttons & Form
    this.setupUIHandlers();

    // Render Clean History Table (No fake pre-added data)
    this.renderHistoryTable();

    // Start 60fps Chart Render Loop
    this.animateChart();
  }

  resizeCanvas() {
    if (!this.chartCanvas) return;
    const rect = this.chartCanvas.parentElement.getBoundingClientRect();
    this.chartCanvas.width = rect.width;
    this.chartCanvas.height = rect.height;
  }

  connectLiveFeed() {
    try {
      this.ws = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@ticker');
      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.c) {
          const newPrice = parseFloat(data.c);
          this.updatePrice(newPrice);
        }
      };
      this.ws.onerror = () => this.startSimulatedFeed();
      this.ws.onclose = () => this.startSimulatedFeed();
    } catch (e) {
      this.startSimulatedFeed();
    }
  }

  startSimulatedFeed() {
    if (this.simInterval) return;
    this.simInterval = setInterval(() => {
      const delta = (Math.random() - 0.495) * 6.5;
      this.updatePrice(this.currentPrice + delta);
    }, 400); // 400ms pull oracle frequency
  }

  updatePrice(newPrice) {
    const prev = this.currentPrice;
    this.currentPrice = newPrice;
    this.priceHistory.push(newPrice);
    if (this.priceHistory.length > 60) this.priceHistory.shift();

    const priceEl = document.getElementById('btcCurrentPrice');
    const changeEl = document.getElementById('btcPriceChange');

    if (priceEl) {
      priceEl.textContent = `$${newPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      priceEl.style.color = newPrice >= prev ? '#10b981' : '#f43f5e';
    }

    if (changeEl) {
      const changePct = ((newPrice - this.priceHistory[0]) / this.priceHistory[0] * 100);
      changeEl.textContent = `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`;
      changeEl.style.color = changePct >= 0 ? '#10b981' : '#f43f5e';
    }

    // Update active trade indicator in real time
    if (this.activeTrade) {
      this.updateTradeIndicator();
    }
  }

  updateTradeIndicator() {
    const indicatorEl = document.getElementById('tradeLiveIndicator');
    if (!indicatorEl || !this.activeTrade) return;

    const isWinning = this.activeTrade.direction === 'UP' 
      ? this.currentPrice >= this.activeTrade.strikePrice 
      : this.currentPrice <= this.activeTrade.strikePrice;

    const expectedPayout = (this.activeTrade.amount * this.payoutMultiplier).toFixed(2);

    if (isWinning) {
      indicatorEl.style.color = '#10b981';
      indicatorEl.innerHTML = `Indicator: ↗ Winning: +$${expectedPayout} Expected`;
    } else {
      indicatorEl.style.color = '#f43f5e';
      indicatorEl.innerHTML = `Indicator: ↘ Losing: -$${this.activeTrade.amount.toFixed(2)} Expected`;
    }
  }

  placeTrade(direction) {
    if (this.activeTrade) {
      showToast("A 60s prediction is already running. Please wait for resolution!");
      return;
    }

    const stakeInput = document.getElementById('stakeAmountInput');
    const amount = parseFloat(stakeInput.value);

    if (isNaN(amount) || amount < 0.10) {
      showToast("Minimum bet amount is $0.10 USDC");
      return;
    }

    let user = getStoredUser();

    if (!user || user.isGuest) {
      showToast("Please sign in or claim your welcome bonus to place trades!");
      const modal = document.getElementById('authModal');
      if (modal) modal.classList.add('active');
      return;
    }

    const availableBal = Number(user.balance || 0);
    if (availableBal < amount) {
      showToast(`Insufficient balance ($${availableBal.toFixed(2)} available).`);
      return;
    }

    // Deduct stake from game balance and sync immediately
    user.balance = parseFloat((availableBal - amount).toFixed(2));
    saveUserSession(user);
    this.syncUserStats();

    // Start 60s Active Trade
    this.activeTrade = {
      direction: direction,
      amount: amount,
      strikePrice: this.currentPrice,
      timeLeft: this.roundDuration
    };

    // Show Active Trade Card (Pic 1)
    const card = document.getElementById('activeTradeCard');
    const pill = document.getElementById('tradeTypePill');
    const stakeText = document.getElementById('tradeStakeText');
    const strikeText = document.getElementById('tradeStrikeText');
    const timerRing = document.getElementById('tradeTimerRing');

    if (card) card.style.display = 'block';
    if (pill) {
      pill.className = `trade-type-pill ${direction.toLowerCase()}`;
      pill.textContent = direction === 'UP' ? 'UP (CALL)' : 'DOWN (PUT)';
    }
    if (stakeText) stakeText.textContent = `$${amount.toFixed(2)} USDC`;
    if (strikeText) strikeText.textContent = `Strike: $${this.currentPrice.toFixed(2)}`;
    if (timerRing) timerRing.textContent = `${this.roundDuration}s`;

    // Disable action buttons
    document.querySelectorAll('.btn-trade-action').forEach(b => b.disabled = true);

    showToast(`Locked ${direction} prediction at $${this.currentPrice.toFixed(2)}!`);

    // 1-Second Timer Interval
    this.tradeInterval = setInterval(() => {
      this.activeTrade.timeLeft--;
      if (timerRing) timerRing.textContent = `${this.activeTrade.timeLeft}s`;

      if (this.activeTrade.timeLeft <= 0) {
        clearInterval(this.tradeInterval);
        this.settleTrade();
      }
    }, 1000);
  }

  async settleTrade() {
    const exitPrice = this.currentPrice;
    const entryPrice = this.activeTrade.strikePrice;
    const amount = this.activeTrade.amount;
    const direction = this.activeTrade.direction;

    const isUp = exitPrice >= entryPrice;
    const won = (direction === 'UP' && isUp) || (direction === 'DOWN' && !isUp);
    const payout = won ? parseFloat((amount * this.payoutMultiplier).toFixed(2)) : 0;
    const netProfitDelta = won ? parseFloat((payout - amount).toFixed(2)) : -amount;

    // Update user state
    let user = getStoredUser();

    if (user) {
      if (won) {
        // Full 1.80x payout rewarded into user's balance
        user.balance = parseFloat((Number(user.balance || 0) + payout).toFixed(2));
        user.transferable = parseFloat((Number(user.transferable || 0) + (payout - amount)).toFixed(2));
      }
      user.netProfit = parseFloat((Number(user.netProfit || 0) + netProfitDelta).toFixed(2));

      user.orders = user.orders || [];
      const newOrder = {
        type: direction,
        amount: amount,
        entry: entryPrice,
        exit: exitPrice,
        result: won ? payout : amount,
        won: won,
        timestamp: new Date().toISOString()
      };
      user.orders.unshift(newOrder);

      await saveUserSession(user);
    }

    // Hide active trade card
    const card = document.getElementById('activeTradeCard');
    if (card) card.style.display = 'none';

    // Re-enable trade buttons
    document.querySelectorAll('.btn-trade-action').forEach(b => b.disabled = false);

    // Refresh UI & History Table
    this.syncUserStats();
    this.renderHistoryTable();

    // Show Win or Loss Modal (Pic 3: 1.8x Payout)
    if (won) {
      this.showWinModal(entryPrice, exitPrice, payout);
      showToast(`🎉 WON! +$${payout.toFixed(2)} USDC rewarded (1.80x)!`);
    } else {
      this.showLossModal(entryPrice, exitPrice, amount);
    }

    this.activeTrade = null;
  }

  showWinModal(entry, exit, payout) {
    const modal = document.getElementById('winModal');
    if (!modal) return;

    document.getElementById('winEntryStrike').textContent = `$${entry.toFixed(2)}`;
    document.getElementById('winExitSettle').textContent = `$${exit.toFixed(2)}`;
    document.getElementById('winProfitPayout').textContent = `+$${payout.toFixed(2)} USDC`;

    modal.classList.add('active');
  }

  showLossModal(entry, exit, lostAmt) {
    showToast(`Round resolved at $${exit.toFixed(2)}. Result: -$${lostAmt.toFixed(2)} USDC.`);
  }

  syncUserStats() {
    const user = getStoredUser();

    const gameBalEl = document.getElementById('gameBalanceAmount');
    const lockedBonusEl = document.getElementById('statLockedBonus');
    const netProfitEl = document.getElementById('statNetProfit');
    const transferableEl = document.getElementById('statTransferable');
    const transferredEl = document.getElementById('statTransferredToWithdrawal');
    const headerBalEl = document.getElementById('headerPortfolioBalance');

    const bal = user ? Number(user.balance || 0).toFixed(2) : '0.00';
    const locked = user ? Number(user.lockedBonus || user.rewardAmount || 0).toFixed(2) : '0.00';
    const netProf = user ? Number(user.netProfit || 0).toFixed(2) : '0.00';
    const transfer = user ? Number(user.transferable || 0).toFixed(2) : '0.00';
    const transferred = user ? Number(user.transferredToWithdrawal || 0).toFixed(2) : '0.00';

    if (gameBalEl) gameBalEl.textContent = `$${bal}`;
    if (headerBalEl) headerBalEl.textContent = `$${bal}`;
    if (lockedBonusEl) lockedBonusEl.textContent = `$${locked}`;
    if (transferableEl) transferableEl.textContent = `$${transfer}`;
    if (transferredEl) transferredEl.textContent = `$${transferred}`;

    if (netProfitEl) {
      netProfitEl.textContent = `${Number(netProf) >= 0 ? '+' : ''}$${netProf}`;
      netProfitEl.className = `substat-val ${Number(netProf) >= 0 ? 'val-green' : 'val-red'}`;
    }
  }

  renderHistoryTable() {
    const tbody = document.getElementById('predictionHistoryTbody');
    const emptyState = document.getElementById('historyEmptyState');
    if (!tbody) return;

    const user = getStoredUser();
    const orders = (user && user.orders) ? user.orders : [];

    if (orders.length === 0) {
      tbody.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    tbody.innerHTML = orders.map(o => `
      <tr>
        <td>
          <span class="${o.type === 'UP' ? 'type-up' : 'type-down'}">
            ${o.type === 'UP' ? '↑ UP' : '↓ DOWN'}
          </span>
        </td>
        <td class="td-amount">$${Number(o.amount).toFixed(2)}</td>
        <td class="td-strike">$${Number(o.entry).toFixed(2)}</td>
        <td class="td-strike">$${Number(o.exit).toFixed(2)}</td>
        <td class="${o.won ? 'td-result-win' : 'td-result-loss'}">
          ${o.won ? '+' : '-'}$${Number(o.result).toFixed(2)}
        </td>
      </tr>
    `).join('');
  }

  animateChart() {
    if (!this.chartCanvas || !this.chartCtx) return;
    const ctx = this.chartCtx;
    const w = this.chartCanvas.width;
    const h = this.chartCanvas.height;

    ctx.clearRect(0, 0, w, h);

    // Min and Max prices for scaling
    const minP = Math.min(...this.priceHistory) - 3;
    const maxP = Math.max(...this.priceHistory) + 3;
    const range = (maxP - minP) || 1;

    // Grid Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let y = 20; y < h; y += 35) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Chart Line Path
    ctx.beginPath();
    const step = w / (this.priceHistory.length - 1);
    this.priceHistory.forEach((price, idx) => {
      const x = idx * step;
      const y = h - ((price - minP) / range) * (h - 40) - 20;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Fill area below with neon gradient
    const lastX = (this.priceHistory.length - 1) * step;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(16, 185, 129, 0.25)');
    grad.addColorStop(1, 'transparent');
    ctx.lineTo(lastX, h);
    ctx.lineTo(0, h);
    ctx.fillStyle = grad;
    ctx.fill();

    // Pulse dot at latest price
    const latestPrice = this.priceHistory[this.priceHistory.length - 1];
    const latestY = h - ((latestPrice - minP) / range) * (h - 40) - 20;
    ctx.beginPath();
    ctx.arc(lastX, latestY, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Draw Strike Price Line if trade is active (Exact Pic 1 Entry Line)
    if (this.activeTrade) {
      const strikeY = h - ((this.activeTrade.strikePrice - minP) / range) * (h - 40) - 20;
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.5;
      ctx.moveTo(0, strikeY);
      ctx.lineTo(w, strikeY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Entry badge at bottom right
      ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1;
      ctx.roundRect(w - 150, strikeY - 18, 145, 24, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.fillText(`Entry: $${this.activeTrade.strikePrice.toFixed(2)}`, w - 142, strikeY - 2);
    }

    requestAnimationFrame(() => this.animateChart());
  }

  setupUIHandlers() {
    const btnUp = document.getElementById('btnPredictUpCall');
    const btnDown = document.getElementById('btnPredictDownPut');
    const stakeInput = document.getElementById('stakeAmountInput');

    // Preset Chip Buttons
    document.querySelectorAll('.btn-quick-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.getAttribute('data-val');
        if (val === 'max') {
          const userStr = localStorage.getItem('velocity_user');
          const user = userStr ? JSON.parse(userStr) : null;
          stakeInput.value = user ? Number(user.balance || 10).toFixed(2) : '10.00';
        } else {
          stakeInput.value = parseFloat(val).toFixed(2);
        }
      });
    });

    if (btnUp) btnUp.addEventListener('click', () => this.placeTrade('UP'));
    if (btnDown) btnDown.addEventListener('click', () => this.placeTrade('DOWN'));

    // Continue Playing Modal Button (Pic 3)
    const btnContinue = document.getElementById('btnContinuePlaying');
    if (btnContinue) {
      btnContinue.addEventListener('click', () => {
        const modal = document.getElementById('winModal');
        if (modal) modal.classList.remove('active');
      });
    }

    // Refresh history icon
    const refreshBtn = document.getElementById('refreshHistoryBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.renderHistoryTable();
        showToast("Order history refreshed!");
      });
    }
  }
}
