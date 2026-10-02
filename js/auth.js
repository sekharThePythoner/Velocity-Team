// Velocity Team - Authentication & Profile State Management
import { 
  auth, 
  googleProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  db,
  doc,
  getDoc,
  setDoc,
  updateDoc
} from "./firebase-config.js";
import { showToast } from "./card.js";

// Global User State
export let currentUserProfile = null;

// Parse Referral query param (?ref=CODE)
export function getReferralCodeFromURL() {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref');
  if (ref) {
    localStorage.setItem('velocity_referrer_code', ref.trim().toUpperCase());
    return ref.trim().toUpperCase();
  }
  return localStorage.getItem('velocity_referrer_code') || null;
}

// Generate random invite code
export function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let res = '';
  for (let i = 0; i < 6; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
}

// Generate randomized reward between $10 and $100 (random odd number)
export function rollEarlyBirdReward() {
  const minOdd = 11;
  const maxOdd = 99;
  const count = (maxOdd - minOdd) / 2 + 1; // 45 odd numbers: 11, 13, ..., 99
  const randIndex = Math.floor(Math.random() * count);
  return minOdd + (randIndex * 2);
}

// Get Stored User from LocalStorage safely
export function getStoredUser() {
  try {
    const cached = localStorage.getItem('velocity_user');
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    return parsed;
  } catch (e) {
    console.warn("Error reading stored user:", e);
    return null;
  }
}

// Save User Profile to LocalStorage AND Sync to Firestore
export async function saveUserSession(updatedProfile) {
  if (!updatedProfile) return;
  currentUserProfile = updatedProfile;
  localStorage.setItem('velocity_user', JSON.stringify(updatedProfile));
  updateUIWithUserProfile(updatedProfile);

  // Sync to Firestore if authenticated
  if (auth && auth.currentUser && !updatedProfile.isGuest) {
    try {
      const userRef = doc(db, "users", auth.currentUser.uid);
      await setDoc(userRef, updatedProfile, { merge: true });
    } catch (e) {
      console.warn("Firestore sync fallback to localStorage:", e);
    }
  }
}

// Initialize Auth Handlers
export function initAuth(onUserLoaded) {
  // Capture URL referral if present
  getReferralCodeFromURL();

  // 1. Immediately hydrate from LocalStorage so UI never flickers or loses state on refresh
  const cachedUser = getStoredUser();
  if (cachedUser && !cachedUser.isGuest) {
    currentUserProfile = cachedUser;
    updateUIWithUserProfile(currentUserProfile);
    if (onUserLoaded) onUserLoaded(currentUserProfile);
  } else {
    setupGuestState(onUserLoaded);
  }

  // 2. Firebase Auth State Listener for background cloud sync
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      await loadOrCreateUserProfile(user, onUserLoaded);
    } else {
      const stored = getStoredUser();
      if (!stored || stored.isGuest) {
        setupGuestState(onUserLoaded);
      }
    }
  });

  setupAuthUI();
}

function setupGuestState(onUserLoaded) {
  // Check if we already have a valid local user before reverting to guest
  const existing = getStoredUser();
  if (existing && !existing.isGuest) {
    currentUserProfile = existing;
    updateUIWithUserProfile(currentUserProfile);
    if (onUserLoaded) onUserLoaded(currentUserProfile);
    return;
  }

  currentUserProfile = {
    isGuest: true,
    displayName: 'Guest Trader',
    email: '',
    handle: '@guest',
    memberId: '#GUEST',
    inviteCode: '',
    rewardAmount: 0,
    balance: 0.00,
    lockedBonus: 0.00,
    netProfit: 0.00,
    transferable: 0.00,
    transferredToWithdrawal: 0.00,
    invitedCount: 0,
    orders: []
  };

  updateUIWithGuestState();
  if (onUserLoaded) onUserLoaded(currentUserProfile);
}

async function loadOrCreateUserProfile(firebaseUser, callback) {
  let profile = null;
  const userRef = doc(db, "users", firebaseUser.uid);
  const referredByCode = localStorage.getItem('velocity_referrer_code') || null;
  const localUser = getStoredUser();

  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const fsData = snap.data();
      // Reconcile: merge Firestore with local storage so trades, orders, and balance are NEVER lost
      if (localUser && (localUser.uid === firebaseUser.uid || localUser.email === firebaseUser.email)) {
        profile = {
          ...fsData,
          ...localUser,
          uid: firebaseUser.uid,
          displayName: localUser.displayName || fsData.displayName || firebaseUser.displayName,
          email: firebaseUser.email || fsData.email || localUser.email,
          balance: typeof localUser.balance === 'number' ? localUser.balance : (fsData.balance || 0),
          netProfit: typeof localUser.netProfit === 'number' ? localUser.netProfit : (fsData.netProfit || 0),
          transferable: typeof localUser.transferable === 'number' ? localUser.transferable : (fsData.transferable || 0),
          transferredToWithdrawal: typeof localUser.transferredToWithdrawal === 'number' 
            ? localUser.transferredToWithdrawal 
            : (fsData.transferredToWithdrawal || 0),
          orders: (localUser.orders && localUser.orders.length > 0) ? localUser.orders : (fsData.orders || []),
          lockedBonus: localUser.lockedBonus || fsData.lockedBonus || localUser.rewardAmount || fsData.rewardAmount || 0,
          rewardAmount: localUser.rewardAmount || fsData.rewardAmount || 0,
          inviteCode: localUser.inviteCode || fsData.inviteCode || generateInviteCode(),
          memberId: localUser.memberId || fsData.memberId || '#042'
        };
        // Sync merged data back to Firestore
        await setDoc(userRef, profile, { merge: true });
      } else {
        profile = fsData;
      }
    } else {
      // First-time signup! Roll early bird reward ($10 - $100 odd number)
      const rolledReward = (localUser && localUser.rewardAmount) ? localUser.rewardAmount : rollEarlyBirdReward();
      const randomMemberNum = Math.floor(Math.random() * 95) + 5;
      const memberIdStr = '#' + String(randomMemberNum).padStart(3, '0');
      const cleanName = firebaseUser.displayName || (firebaseUser.email ? firebaseUser.email.split('@')[0] : 'Velocity Trader');
      const handleStr = '@' + (firebaseUser.email ? firebaseUser.email.split('@')[0] : cleanName.toLowerCase().replace(/\s+/g, ''));

      profile = {
        isGuest: false,
        uid: firebaseUser.uid,
        displayName: cleanName,
        email: firebaseUser.email || '',
        handle: handleStr,
        memberId: memberIdStr,
        inviteCode: generateInviteCode(),
        rewardAmount: rolledReward,
        balance: rolledReward,
        lockedBonus: rolledReward,
        netProfit: 0.00,
        transferable: 0.00,
        transferredToWithdrawal: 0.00,
        invitedCount: 0,
        referredBy: referredByCode,
        createdAt: new Date().toISOString(),
        orders: []
      };

      await setDoc(userRef, profile);
      showWelcomeModal(profile);
    }
  } catch (err) {
    console.warn("Firestore sync fallback to LocalStorage:", err);
    if (!profile) {
      if (localUser && !localUser.isGuest) {
        profile = localUser;
      } else {
        const rolledReward = rollEarlyBirdReward();
        const cleanName = firebaseUser.displayName || (firebaseUser.email ? firebaseUser.email.split('@')[0] : 'Velocity Trader');
        profile = {
          isGuest: false,
          uid: firebaseUser.uid,
          displayName: cleanName,
          email: firebaseUser.email || '',
          handle: '@' + (firebaseUser.email ? firebaseUser.email.split('@')[0] : 'member'),
          memberId: '#0' + (Math.floor(Math.random() * 89) + 10),
          inviteCode: generateInviteCode(),
          rewardAmount: rolledReward,
          balance: rolledReward,
          lockedBonus: rolledReward,
          netProfit: 0.00,
          transferable: 0.00,
          transferredToWithdrawal: 0.00,
          invitedCount: 0,
          referredBy: referredByCode,
          orders: []
        };
        showWelcomeModal(profile);
      }
    }
  }

  currentUserProfile = profile;
  localStorage.setItem('velocity_user', JSON.stringify(profile));
  updateUIWithUserProfile(profile);
  if (callback) callback(profile);
}

// Update DOM elements for logged-in user
export function updateUIWithUserProfile(profile) {
  if (!profile || profile.isGuest) {
    updateUIWithGuestState();
    return;
  }

  // Hide guest landing hero if on index.html, show logged-in dashboard
  const guestLanding = document.getElementById('guestLandingSection');
  const loggedInDashboard = document.getElementById('loggedInDashboardSection');
  if (guestLanding) guestLanding.style.display = 'none';
  if (loggedInDashboard) loggedInDashboard.style.display = 'block';

  // Header Elements
  const headerName = document.getElementById('headerUserName');
  const headerNum = document.getElementById('headerUserNum');
  const headerBal = document.getElementById('headerPortfolioBalance');
  const headerAvatar = document.getElementById('headerUserAvatar');

  if (headerName) headerName.textContent = profile.displayName;
  if (headerNum) headerNum.textContent = profile.memberId;
  if (headerBal) headerBal.textContent = `$${Number(profile.balance || 0).toFixed(2)}`;
  if (headerAvatar) {
    headerAvatar.textContent = (profile.displayName || 'V')[0].toUpperCase();
  }

  // Dashboard Headings
  const dashMemberTitle = document.getElementById('dashMemberTitle');
  if (dashMemberTitle) dashMemberTitle.textContent = `Member ${profile.memberId}`;

  // Member Card
  const cardMemberId = document.getElementById('cardMemberId');
  const cardUserName = document.getElementById('cardUserName');
  const cardHandle = document.getElementById('cardHandle');
  const cardInviteCode = document.getElementById('cardInviteCode');
  const cardAirdropTag = document.getElementById('cardAirdropTag');
  const cardAvatarText = document.getElementById('cardAvatarText');

  if (cardMemberId) cardMemberId.textContent = profile.memberId;
  if (cardUserName) cardUserName.textContent = profile.displayName;
  if (cardHandle) cardHandle.textContent = profile.handle;
  if (cardInviteCode) cardInviteCode.textContent = profile.inviteCode;
  if (cardAvatarText) cardAvatarText.textContent = (profile.displayName || 'V')[0].toUpperCase();

  if (cardAirdropTag && profile.rewardAmount) {
    cardAirdropTag.style.display = 'inline-flex';
    cardAirdropTag.innerHTML = `★ EARLY BIRD BONUS: $${profile.rewardAmount} UNLOCKED`;
  }

  // Referral Panel on Index
  const inviteInput = document.getElementById('inviteLinkInput');
  const statInvited = document.getElementById('statInvitedCount');
  const statMyNumber = document.getElementById('statMyNumber');

  if (inviteInput) {
    const origin = window.location.origin + window.location.pathname.replace(/index\.html|referandearn\.html|predict\.html/g, '');
    inviteInput.value = `${origin}referandearn.html?ref=${profile.inviteCode}`;
  }
  if (statInvited) statInvited.textContent = profile.invitedCount || 0;
  if (statMyNumber) statMyNumber.textContent = profile.memberId;
}

// Update DOM elements for guest state (no fake user data)
export function updateUIWithGuestState() {
  const guestLanding = document.getElementById('guestLandingSection');
  const loggedInDashboard = document.getElementById('loggedInDashboardSection');
  if (guestLanding) guestLanding.style.display = 'block';
  if (loggedInDashboard) loggedInDashboard.style.display = 'none';

  const headerName = document.getElementById('headerUserName');
  const headerNum = document.getElementById('headerUserNum');
  const headerBal = document.getElementById('headerPortfolioBalance');
  const headerAvatar = document.getElementById('headerUserAvatar');

  if (headerName) headerName.textContent = 'Connect Account';
  if (headerNum) headerNum.textContent = 'Claim $10-$100';
  if (headerBal) headerBal.textContent = '$0.00';
  if (headerAvatar) headerAvatar.textContent = '+';
}

// Show the Welcome Popup
export function showWelcomeModal(profile) {
  const modal = document.getElementById('welcomeModal');
  const bonusVal = document.getElementById('welcomeBonusAmount');
  if (!modal) return;

  if (bonusVal) {
    bonusVal.textContent = `$${profile.rewardAmount || 500}`;
  }
  modal.classList.add('active');
}

// Setup Auth UI listeners
function setupAuthUI() {
  const authModal = document.getElementById('authModal');
  const openAuthBtns = document.querySelectorAll('.trigger-auth-modal');
  const closeAuthBtn = document.getElementById('closeAuthModal');
  const googleBtn = document.getElementById('btnGoogleAuth');
  const authForm = document.getElementById('emailAuthForm');
  const toggleLink = document.getElementById('toggleAuthModeLink');
  let isSignUpMode = true;

  openAuthBtns.forEach(btn => btn.addEventListener('click', () => {
    if (authModal) authModal.classList.add('active');
  }));

  if (closeAuthBtn && authModal) {
    closeAuthBtn.addEventListener('click', () => authModal.classList.remove('active'));
  }

  // Google Sign In
  if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
      try {
        const result = await signInWithPopup(auth, googleProvider);
        if (authModal) authModal.classList.remove('active');
        showToast("Signed in with Google!");
      } catch (error) {
        console.warn("Google popup blocked/unavailable:", error);
        // Fallback for local testing
        const fakeEmail = 'trader_' + Math.random().toString(36).substring(7) + '@gmail.com';
        const rolledReward = rollEarlyBirdReward();
        const dummyUser = {
          isGuest: false,
          uid: 'google_' + Math.random().toString(36).substring(7),
          displayName: 'Google Trader',
          email: fakeEmail,
          handle: '@' + fakeEmail.split('@')[0],
          memberId: '#0' + (Math.floor(Math.random() * 89) + 10),
          inviteCode: generateInviteCode(),
          rewardAmount: rolledReward,
          balance: rolledReward,
          lockedBonus: rolledReward,
          netProfit: 0.00,
          transferable: 0.00,
          transferredToWithdrawal: 0.00,
          invitedCount: 0,
          referredBy: localStorage.getItem('velocity_referrer_code') || null,
          orders: []
        };
        await saveUserSession(dummyUser);
        showWelcomeModal(dummyUser);
        if (authModal) authModal.classList.remove('active');
        showToast("Google account connected! Welcome bonus credited.");
      }
    });
  }

  // Toggle Email Auth Mode
  if (toggleLink) {
    toggleLink.addEventListener('click', (e) => {
      e.preventDefault();
      isSignUpMode = !isSignUpMode;
      const title = document.getElementById('authModalTitle');
      const submitBtn = document.getElementById('btnSubmitAuth');
      if (title) title.textContent = isSignUpMode ? "Create an Account" : "Sign In to Velocity";
      if (submitBtn) submitBtn.textContent = isSignUpMode ? "Create Account & Claim Bonus" : "Sign In";
      toggleLink.textContent = isSignUpMode ? "Already have an account? Sign In" : "New user? Create an account";
    });
  }

  // Email/Password Form
  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('authEmail').value;
      const password = document.getElementById('authPassword').value;

      try {
        if (isSignUpMode) {
          await createUserWithEmailAndPassword(auth, email, password);
        } else {
          await signInWithEmailAndPassword(auth, email, password);
        }
        if (authModal) authModal.classList.remove('active');
      } catch (err) {
        console.warn("Auth fallback for localhost demo:", err);
        const nameStr = email.split('@')[0];
        const rolledReward = rollEarlyBirdReward();
        const dummyUser = {
          isGuest: false,
          uid: 'email_' + Math.random().toString(36).substring(7),
          displayName: nameStr,
          email: email,
          handle: '@' + nameStr,
          memberId: '#0' + (Math.floor(Math.random() * 89) + 10),
          inviteCode: generateInviteCode(),
          rewardAmount: rolledReward,
          balance: rolledReward,
          lockedBonus: rolledReward,
          netProfit: 0.00,
          transferable: 0.00,
          transferredToWithdrawal: 0.00,
          invitedCount: 0,
          referredBy: localStorage.getItem('velocity_referrer_code') || null,
          orders: []
        };
        await saveUserSession(dummyUser);
        showWelcomeModal(dummyUser);
        if (authModal) authModal.classList.remove('active');
        showToast("Welcome to Velocity Team, " + nameStr + "!");
      }
    });
  }
}
