// ============================================================
// FIREBASE — burakdemircioglu.com.tr
// Proje: burakdmrcoglu11
// API anahtarını Firebase Console'dan kısıtla:
// console.firebase.google.com → API Key → HTTP Referrers
// ============================================================
const firebaseConfig = {
    apiKey: "AIzaSyCXphC--uF5LLjEiBxD2pT2-UzGVcFXt34",
    authDomain: "burakdmrcoglu11.firebaseapp.com",
    projectId: "burakdmrcoglu11",
    storageBucket: "burakdmrcoglu11.firebasestorage.app",
    messagingSenderId: "406084996472",
    appId: "1:406084996472:web:d4f33f939c4825e2b3cc8d",
    measurementId: "G-WHSWTZ2DWL"
};
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db   = firebase.firestore();
const auth = firebase.auth();

// Offline persistence → anlık gerçek zamanlı mesajlar
db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

// ============================================================
// FİREBASE AUTH — Aktif kullanıcı
// ============================================================
let firebaseUser = null; // firebase.auth().currentUser

auth.onAuthStateChanged(user => {
    firebaseUser = user;
    if (user) {
        // Chat ve r/place için kullanıcı adı: email'in @ öncesi
        const displayName = user.displayName || user.email.split('@')[0];
        chatUser  = displayName;
        rUsername = displayName;
        // Admin kontrolü — auth state değişince admin butonlarını güncelle
        if (isAdminLoggedIn()) {
            document.querySelectorAll('[id^="rplace-clear"]').forEach(el => el.style.display = '');
        }
    }
});

// Firebase Auth Email/Password Yardımcıları
async function fbSignIn(email, password) {
    try {
        // Önce giriş dene
        const res = await auth.signInWithEmailAndPassword(email, password);
        return { ok: true, user: res.user };
    } catch (err) {
        // Hesap yoksa veya ilk kez giriş yapılıyorsa otomatik hesap aç
        if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.code === 'auth/invalid-login-credentials') {
            try {
                const newRes = await auth.createUserWithEmailAndPassword(email, password);
                return { ok: true, user: newRes.user };
            } catch (e2) {
                // Eğer şifre zayıfsa veya email geçersizse
                if (e2.code === 'auth/weak-password') return { ok: false, msg: 'Şifre en az 6 karakter olmalı!' };
                if (e2.code === 'auth/email-already-in-use') return { ok: false, msg: 'Girdiğiniz şifre hatalı!' };
                if (e2.code === 'auth/invalid-email') return { ok: false, msg: 'Geçersiz e-posta formatı!' };
                return { ok: false, msg: e2.message };
            }
        }
        if (err.code === 'auth/wrong-password') return { ok: false, msg: 'Girdiğiniz şifre hatalı!' };
        if (err.code === 'auth/invalid-email') return { ok: false, msg: 'Geçersiz e-posta formatı!' };
        return { ok: false, msg: err.message };
    }
}

async function fbSignOut() {
    await auth.signOut();
    firebaseUser = null;
    chatUser = '';
    rUsername = '';
}


// ============================================================
// GÜVENLİK — SHA-256 (Gerçek şifreler kaynak kodda YOK)
// ============================================================
const ODA_SIFRE_HASH   = "1f52e009e83e51824eba821765dc16d427d9117689c0b51df8a3af789997cd44";
const ADMIN_SIFRE_HASH = "33aa0f5218b1bd6c82c7a4d9c0c962b4f0e1488542cd191fdc3acdd5c10f3e75";

async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}
async function checkPass(input, hash) { return await sha256(input) === hash; }

// Admin session (sessionStorage → tarayıcı kapanınca sıfırlanır)
function isAdminLoggedIn() { return sessionStorage.getItem('adminAuth') === 'true'; }
function setAdminLogin(v)  { sessionStorage.setItem('adminAuth', v ? 'true' : ''); }

// ============================================================
// TOAST
// ============================================================
function toast(msg, type = 'info', ms = 3000) {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const el = Object.assign(document.createElement('div'), {
        className: `toast toast-${type}`, textContent: msg
    });
    document.body.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
    setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 400);
    }, ms);
}

// ============================================================
// HTML ESCAPE
// ============================================================
function esc(s) {
    return String(s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ============================================================
// URL ROUTING — History API (clean URLs, no hash)
// /color  /weather  /rplace  /okey  /admin
// ============================================================
const ALL_PANELS = ['home-panel','color-game-panel','weather-panel','rplace-game-panel','okey-game-panel','admin-panel'];
const ALL_NAV    = ['nav-color-btn','nav-weather-btn','nav-rplace-btn','nav-okey-btn'];

const ROUTES = {
    '/'       : { panel: 'home-panel',         nav: null,              after: null },
    '/color'  : { panel: 'color-game-panel',   nav: 'nav-color-btn',   after: null },
    '/weather': { panel: 'weather-panel',       nav: 'nav-weather-btn', after: fetchWeatherData },
    '/rplace' : { panel: 'rplace-game-panel',  nav: 'nav-rplace-btn',  after: null },
    '/okey'   : { panel: 'okey-game-panel',    nav: 'nav-okey-btn',    after: null },
    '/admin'  : { panel: 'admin-panel',        nav: null,              after: null },
};

function navigate(path) {
    window.history.pushState({}, '', path);
    handleRoute();
}

function handleRoute() {
    const path = window.location.pathname || '/';
    const route = ROUTES[path] || ROUTES['/'];

    stopAllTimers();
    ALL_PANELS.forEach(id => document.getElementById(id)?.classList.add('hidden'));
    ALL_NAV.forEach(id => document.getElementById(id)?.classList.remove('active'));

    const panel = document.getElementById(route.panel);
    if (panel) {
        panel.classList.remove('hidden');
        panel.style.animation = 'none';
        void panel.offsetHeight;
        panel.style.animation = '';
    }
    if (route.nav) document.getElementById(route.nav)?.classList.add('active');
    if (route.after) route.after();
}

window.addEventListener('popstate', handleRoute);

// ============================================================
// PARTİKÜL ARKA PLAN
// ============================================================
function initParticles() {
    const canvas = document.getElementById('particle-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const resize = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
    resize();
    window.addEventListener('resize', resize);
    const pts = Array.from({ length: 60 }, () => ({
        x: Math.random() * innerWidth, y: Math.random() * innerHeight,
        vx: (Math.random()-.5)*.2, vy: (Math.random()-.5)*.2,
        r: Math.random()*1.2+.3, o: Math.random()*.2+.04
    }));
    (function tick() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        pts.forEach(p => {
            p.x = (p.x + p.vx + canvas.width)  % canvas.width;
            p.y = (p.y + p.vy + canvas.height) % canvas.height;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
            ctx.fillStyle = `rgba(255,255,255,${p.o})`; ctx.fill();
        });
        requestAnimationFrame(tick);
    })();
}

// ============================================================
// TEMA
// ============================================================
function setupTheme() {
    const body = document.body;
    const apply = name => {
        body.className = name;
        document.getElementById('sun-icon')?.classList.toggle('hidden', name==='light-theme');
        document.getElementById('moon-icon')?.classList.toggle('hidden', name==='dark-theme');
        localStorage.setItem('theme', name);
    };
    apply(localStorage.getItem('theme') || 'dark-theme');
    document.getElementById('theme-toggle-btn')?.addEventListener('click', () =>
        apply(body.classList.contains('dark-theme') ? 'light-theme' : 'dark-theme'));
}

// ============================================================
// HAVA DURUMU
// ============================================================
let cachedCoords = null;

function fetchWeatherData() {
    const desc = document.getElementById('weather-desc');
    if (desc) desc.innerText = 'Yükleniyor...';
    if (cachedCoords) { getWeather(cachedCoords.lat, cachedCoords.lon); return; }
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            p => { cachedCoords = { lat: p.coords.latitude, lon: p.coords.longitude }; getWeather(cachedCoords.lat, cachedCoords.lon); },
            () => { cachedCoords = { lat: 41.0082, lon: 28.9784 }; getWeather(cachedCoords.lat, cachedCoords.lon); }
        );
    } else { cachedCoords = { lat: 41.0082, lon: 28.9784 }; getWeather(cachedCoords.lat, cachedCoords.lon); }
}

async function getWeather(lat, lon) {
    try {
        fetchLocationName(lat, lon);
        const d = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m`)).json();
        const c = d.current;
        const set = (id, v) => { const e = document.getElementById(id); if (e) e.innerText = v; };
        set('weather-temp', Math.round(c.temperature_2m));
        set('weather-feels', `${Math.round(c.apparent_temperature)}°C`);
        set('weather-wind',  `${Math.round(c.wind_speed_10m)} km/s`);
        set('weather-humidity', `${c.relative_humidity_2m}%`);
        const info = wmoCode(c.weather_code);
        set('weather-icon', info.icon); set('weather-desc', info.desc);
    } catch { const e = document.getElementById('weather-desc'); if (e) e.innerText = 'Veri alınamadı'; }
}
async function fetchLocationName(lat, lon) {
    try {
        const d = await (await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=tr`)).json();
        const el = document.getElementById('weather-city-district');
        if (el) el.innerText = (d.locality && d.principalSubdivision && d.locality!==d.principalSubdivision)
            ? `${d.locality}, ${d.principalSubdivision}` : (d.principalSubdivision || 'İstanbul');
    } catch { const el = document.getElementById('weather-city-district'); if (el) el.innerText = 'İstanbul'; }
}
const WMO = {
    0:  { desc: 'Açık', icon: '☀️' },
    1:  { desc: 'Az Bulutlu', icon: '🌤️' },
    2:  { desc: 'Parçalı Bulutlu', icon: '⛅' },
    3:  { desc: 'Bulutlu', icon: '☁️' },
    45: { desc: 'Sisli', icon: '🌫️' },
    48: { desc: 'Sisli', icon: '🌫️' },
    51: { desc: 'Çiseleyen Yağmur', icon: '🌦️' },
    53: { desc: 'Çiseleyen Yağmur', icon: '🌦️' },
    55: { desc: 'Çiseleyen Yağmur', icon: '🌦️' },
    61: { desc: 'Yağmurlu', icon: '🌧️' },
    63: { desc: 'Yağmurlu', icon: '🌧️' },
    65: { desc: 'Kuvvetli Yağmur', icon: '🌧️' },
    71: { desc: 'Kar Yağışlı', icon: '❄️' },
    73: { desc: 'Kar Yağışlı', icon: '❄️' },
    75: { desc: 'Yoğun Kar', icon: '🌨️' },
    95: { desc: 'Gök Gürültülü Fırtına', icon: '⛈️' },
    96: { desc: 'Dolu ve Fırtına', icon: '⛈️' },
    99: { desc: 'Şiddetli Fırtına', icon: '⚡' }
};
function wmoCode(c) { return WMO[c] || { desc: 'Bulutlu', icon: '☁️' }; }

// ============================================================
// RENK OYUNU
// ============================================================
let selDiff = 'easy', selTime = '5';
let targetColors = [], userGuesses = [], curRound = 0;
let rafId = null, recallRafId = null;
let curH = 0, curS = 100, curL = 50;

function stopAllTimers() {
    if (rafId)       { cancelAnimationFrame(rafId);       rafId = null; }
    if (recallRafId) { cancelAnimationFrame(recallRafId); recallRafId = null; }
}

function switchStep(id) {
    stopAllTimers();
    ['start-view','reveal-view','recall-view','compare-view','result-view'].forEach(v => document.getElementById(v)?.classList.add('hidden'));
    document.getElementById(id)?.classList.remove('hidden');
}

function getRandColor() {
    if (selDiff==='easy')   return {h:Math.floor(Math.random()*12)*30, s:100, l:50};
    if (selDiff==='medium') return {h:Math.floor(Math.random()*360), s:75+Math.floor(Math.random()*20), l:40+Math.floor(Math.random()*20)};
    return {h:Math.floor(Math.random()*360), s:20+Math.floor(Math.random()*70), l:25+Math.floor(Math.random()*50)};
}
function tooSimilar(a,b) { let dh=Math.abs(a.h-b.h); if(dh>180)dh=360-dh; return dh<45&&Math.abs(a.s-b.s)<15&&Math.abs(a.l-b.l)<15; }
function genColors() {
    const c=[]; let last=null;
    for(let i=0;i<5;i++){let x,n=0;do{x=getRandColor();n++;}while(last&&tooSimilar(x,last)&&n<50);c.push(x);last=x;}
    return c;
}

function runReveal() {
    const rr = document.getElementById('reveal-round');
    const tc = document.getElementById('target-color-display');
    const tb = document.getElementById('timer-bar');
    const rt = document.getElementById('reveal-timer-text');
    if (rr) rr.innerText = curRound+1;
    const col = targetColors[curRound];
    if (tc) tc.style.backgroundColor = `hsl(${col.h},${col.s}%,${col.l}%)`;
    if (tb) tb.style.transform = 'scaleX(1)';
    const dur = 5000, t0 = performance.now();
    function frame(now) {
        const left = Math.max(0, dur-(now-t0));
        if (tb) tb.style.transform = `scaleX(${left/dur})`;
        if (rt) rt.innerText = `${Math.floor(left/1000)}.${String(Math.floor((left%1000)/10)).padStart(2,'0')}`;
        if (left>0) { rafId = requestAnimationFrame(frame); }
        else { cancelAnimationFrame(rafId); switchStep('recall-view'); runRecall(); }
    }
    rafId = requestAnimationFrame(frame);
}

function runRecall() {
    const ro = document.getElementById('recall-timer-overlay');
    const rt = document.getElementById('recall-timer-text');
    const rr = document.getElementById('recall-round');
    if (rr) rr.innerText = curRound+1;
    curH=0; curS=100; curL=50;
    updateThumbs(); updatePreview();
    if (selTime==='infinite') { ro?.classList.add('hidden'); return; }
    ro?.classList.remove('hidden');
    const dur = parseInt(selTime)*1000, t0 = performance.now();
    function frame(now) {
        const left = Math.max(0, dur-(now-t0));
        if (rt) rt.innerText = `${Math.floor(left/1000)}.${String(Math.floor((left%1000)/10)).padStart(2,'0')}`;
        if (left>0) { recallRafId = requestAnimationFrame(frame); }
        else { cancelAnimationFrame(recallRafId); submitGuess(); }
    }
    recallRafId = requestAnimationFrame(frame);
}

function setupSlider(id, cb) {
    const track = document.getElementById(id);
    if (!track) return;
    const pos = y => { const r=track.getBoundingClientRect(); cb(Math.max(0,Math.min(1,1-(y-r.top)/r.height))); };
    track.addEventListener('mousedown', e => {
        pos(e.clientY);
        const mm = e2 => pos(e2.clientY);
        const mu = () => { document.removeEventListener('mousemove',mm); document.removeEventListener('mouseup',mu); };
        document.addEventListener('mousemove',mm); document.addEventListener('mouseup',mu);
    });
    track.addEventListener('touchstart', e => {
        pos(e.touches[0].clientY);
        const tm = e2 => pos(e2.touches[0].clientY);
        const te = () => { document.removeEventListener('touchmove',tm); document.removeEventListener('touchend',te); };
        document.addEventListener('touchmove',tm); document.addEventListener('touchend',te);
    }, {passive:true});
}

function updateThumbs() {
    const tH=document.getElementById('thumb-h'), tS=document.getElementById('thumb-s'), tL=document.getElementById('thumb-l');
    const trS=document.getElementById('track-s'), trL=document.getElementById('track-l');
    if(tH) tH.style.top=`${100-(curH/360)*100}%`;
    if(tS) tS.style.top=`${100-curS}%`;
    if(tL) tL.style.top=`${100-curL}%`;
    if(trS) trS.style.background=`linear-gradient(to top,hsl(${curH},0%,50%),hsl(${curH},100%,50%))`;
    if(trL) trL.style.background=`linear-gradient(to top,#000 0%,hsl(${curH},100%,50%) 50%,#fff 100%)`;
}
function updatePreview() { const el=document.getElementById('user-color-display'); if(el) el.style.backgroundColor=`hsl(${curH},${curS}%,${curL}%)`; }

function submitGuess() {
    stopAllTimers();
    const g = {h:curH,s:curS,l:curL};
    userGuesses.push(g);
    const t = targetColors[curRound];
    const cu=document.getElementById('compare-user-color'), ct=document.getElementById('compare-target-color'), rs=document.getElementById('round-score-val');
    if(cu) cu.style.backgroundColor=`hsl(${g.h},${g.s}%,${g.l}%)`;
    if(ct) ct.style.backgroundColor=`hsl(${t.h},${t.s}%,${t.l}%)`;
    if(rs) rs.innerText=colorScore(t,g).toFixed(1);
    switchStep('compare-view');
}

function colorScore(t,g) {
    const rt=(t.h*Math.PI)/180, rg=(g.h*Math.PI)/180;
    const d=Math.sqrt(Math.pow(t.s/100*Math.cos(rt)-g.s/100*Math.cos(rg),2)+Math.pow(t.s/100*Math.sin(rt)-g.s/100*Math.sin(rg),2)+Math.pow(t.l/100-g.l/100,2));
    const sc=10*Math.pow(Math.max(0,1-d/2),2.5);
    return sc<0.1?0:sc;
}

function showFinalResults() {
    switchStep('result-view');
    let total=0; const hist=document.getElementById('summary-history');
    if(hist) hist.innerHTML='';
    for(let i=0;i<5;i++){
        const sc=colorScore(targetColors[i],userGuesses[i]); total+=sc;
        const item=document.createElement('div'); item.className='history-item';
        item.innerHTML=`<div class="history-circles"><div class="hist-circle" style="background:hsl(${userGuesses[i].h},${userGuesses[i].s}%,${userGuesses[i].l}%)"></div><div class="hist-circle" style="background:hsl(${targetColors[i].h},${targetColors[i].s}%,${targetColors[i].l}%)"></div></div><span class="history-score">${sc.toFixed(1)}</span>`;
        hist?.appendChild(item);
    }
    const ts=document.getElementById('total-score-val'); if(ts) ts.innerText=total.toFixed(2);
}

function setupColorGame() {
    document.querySelectorAll('#color-game-panel .diff-btn').forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('#color-game-panel .diff-btn').forEach(x=>x.classList.remove('active'));
        b.classList.add('active'); selDiff=b.dataset.diff;
    }));
    document.querySelectorAll('#color-game-panel .time-btn').forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('#color-game-panel .time-btn').forEach(x=>x.classList.remove('active'));
        b.classList.add('active'); selTime=b.dataset.time;
    }));
    document.getElementById('start-game-btn')?.addEventListener('click', () => {
        targetColors=genColors(); userGuesses=[]; curRound=0; switchStep('reveal-view'); runReveal();
    });
    document.getElementById('submit-guess-btn')?.addEventListener('click', submitGuess);
    document.getElementById('next-round-btn')?.addEventListener('click', () => {
        curRound++;
        if(curRound<5){switchStep('reveal-view');runReveal();}else showFinalResults();
    });
    document.getElementById('restart-game-btn')?.addEventListener('click', () => switchStep('start-view'));
    setupSlider('track-h', p=>{curH=Math.round(p*360);updateThumbs();updatePreview();});
    setupSlider('track-s', p=>{curS=Math.round(p*100);updateThumbs();updatePreview();});
    setupSlider('track-l', p=>{curL=Math.round(p*100);updateThumbs();updatePreview();});
}

// ============================================================
// ÖZEL SOHBET
// ============================================================
const chatRef = db.collection('sohbet_odalari');
let chatUser = '', chatUnsub = null;

function setupChat() {
    const modal    = document.getElementById('chat-modal');
    const authScr  = document.getElementById('chat-auth-screen');
    const roomScr  = document.getElementById('chat-room-screen');
    const nickIn   = document.getElementById('chat-username-input');
    const passIn   = document.getElementById('chat-password-input');
    const loginBtn = document.getElementById('chat-login-btn');
    const closeBtn = document.getElementById('chat-close-btn');
    const authErr  = document.getElementById('chat-auth-error');
    const form     = document.getElementById('chat-form');
    const msgIn    = document.getElementById('chat-message-input');
    const msgArea  = document.getElementById('chat-messages');

    document.getElementById('chat-toggle-btn')?.addEventListener('click', e => { e.preventDefault(); modal?.classList.remove('hidden'); });
    closeBtn?.addEventListener('click', () => modal?.classList.add('hidden'));
    modal?.addEventListener('click', e => { if(e.target===modal) modal.classList.add('hidden'); });
    passIn?.addEventListener('keydown', e => { if(e.key==='Enter') loginBtn?.click(); });

    loginBtn?.addEventListener('click', async () => {
        const email = nickIn?.value.trim();
        const pass  = passIn?.value.trim();
        if (!email) { toast('E-posta gir!','error'); return; }
        if (!pass)  { toast('Şifre gir!','error');  return; }

        loginBtn.disabled = true;
        loginBtn.textContent = 'Giriş yapılıyor...';

        const result = await fbSignIn(email, pass);
        loginBtn.disabled = false;
        loginBtn.textContent = 'Odaya Katıl';

        if (result.ok) {
            // chatUser = auth.currentUser.email prefix (onAuthStateChanged tarafından set edilir)
            authErr?.classList.add('hidden');
            authScr?.classList.add('hidden');
            roomScr?.classList.remove('hidden');
            startChatListener(msgArea);
        } else {
            if (authErr) authErr.textContent = result.msg || 'Giriş başarısız!';
            authErr?.classList.remove('hidden');
            passIn.value='';
            passIn.style.animation='shake 0.4s ease';
            setTimeout(()=>passIn.style.animation='',400);
        }
    });


    form?.addEventListener('submit', e => {
        e.preventDefault();
        const txt = msgIn?.value.trim(); if(!txt) return;
        chatRef.add({ kullanici:chatUser, mesaj:txt, zaman:firebase.firestore.FieldValue.serverTimestamp() })
            .then(()=>{ if(msgIn) msgIn.value=''; });
    });

    // Admin gizli giriş
    document.querySelector('.platform-yazisi')?.addEventListener('click', async () => {
        const p = prompt('Admin şifresi:'); if(!p) return;
        if (await checkPass(p, ADMIN_SIFRE_HASH)) {
            setAdminLogin(true); toast('Admin yetkisi aktif! 🛡️','success');
            document.querySelectorAll('[id^="rplace-clear"]').forEach(el=>el.style.display='');
        } else { toast('Yanlış şifre!','error'); }
    });
}

function startChatListener(area) {
    if (chatUnsub) chatUnsub();
    chatUnsub = chatRef.orderBy('zaman','asc').limitToLast(100).onSnapshot(snap => {
        if(!area) return;
        area.innerHTML='';
        snap.forEach(doc => {
            const d=doc.data();
            const div=document.createElement('div');
            div.className=`message ${d.kullanici===chatUser?'my-message':'other-message'}`;
            div.style.cssText='display:flex;justify-content:space-between;align-items:flex-start;gap:8px';
            div.innerHTML=`<span><strong>${d.kullanici===chatUser?'Sen':esc(d.kullanici)}:</strong> ${esc(d.mesaj)}</span>`;
            if(isAdminLoggedIn()){
                const del=document.createElement('button');
                del.innerHTML='🗑'; del.style.cssText='background:none;border:none;cursor:pointer;font-size:13px;opacity:0.5;flex-shrink:0';
                del.onclick=()=>{ if(confirm('Sil?')) chatRef.doc(doc.id).delete(); };
                div.appendChild(del);
            }
            area.appendChild(div);
        });
        area.scrollTop=area.scrollHeight;
    });
}

// ============================================================
// R/PLACE — Canvas 2D Transform (Düzeltilmiş)
// ============================================================
const COLS     = 100;
const ROWS     = 60;
const CELL     = 10; // mantıksal piksel boyutu
const COOLDOWN = 5000; // 5 saniye

let rCanvas, rCtx;
let vpX=0, vpY=0, vpScale=1; // viewport (pan/zoom)
let rPanning=false, rPanStart=null;
let rSelectedColor='#000000';
let rUsername='';
let rCooldownEnd=0;
let rPixels={}, rAuthors={};
let rCanvasUnsub=null, rChatUnsub=null;

function setupRplace() {
    const joinBtn    = document.getElementById('rplace-join-btn');
    const userIn     = document.getElementById('rplace-username-input');
    const loginView  = document.getElementById('rplace-login-view');
    const canvasView = document.getElementById('rplace-canvas-view');
    const userDisp   = document.getElementById('rplace-current-user');
    const clearBtn   = document.getElementById('rplace-clear-canvas-btn');
    const chatForm   = document.getElementById('rplace-chat-form');
    const chatIn     = document.getElementById('rplace-chat-input');
    const chatMsgs   = document.getElementById('rplace-chat-messages');

    // Renk butonları
    document.querySelectorAll('.rplace-color-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.rplace-color-btn').forEach(b=>b.classList.remove('active'));
            btn.classList.add('active');
            rSelectedColor = btn.dataset.color;
        });
    });
    document.getElementById('rplace-custom-color')?.addEventListener('input', e => {
        rSelectedColor = e.target.value;
        document.querySelectorAll('.rplace-color-btn').forEach(b=>b.classList.remove('active'));
    });

    // Zoom
    document.getElementById('rplace-zoom-in')?.addEventListener('click',    ()=>rZoom(.25));
    document.getElementById('rplace-zoom-out')?.addEventListener('click',   ()=>rZoom(-.25));
    document.getElementById('rplace-zoom-reset')?.addEventListener('click', ()=>{vpScale=2;rCenterView();rDraw();});

    // Giriş
    userIn?.addEventListener('keydown', e=>{if(e.key==='Enter')joinBtn?.click();});
    joinBtn?.addEventListener('click', () => {
        const nick = userIn?.value.trim();
        if(!nick){toast('Kullanıcı adı gir!','error');return;}
        rUsername=nick;
        if(loginView) loginView.style.display='none';
        if(canvasView){ canvasView.style.display='flex'; }
        if(userDisp) userDisp.innerHTML=`Kullanıcı: <b>${esc(nick)}</b>`;
        if(isAdminLoggedIn() && clearBtn) clearBtn.style.display='block';

        // Canvas'ı DOM'da göründükten sonra init et
        requestAnimationFrame(()=>requestAnimationFrame(()=>{
            initRplaceCanvas();
            loadRplaceData();
            rChatListen(chatMsgs);
        }));
    });

    // Chat
    chatForm?.addEventListener('submit', async e => {
        e.preventDefault();
        const msg = chatIn?.value.trim();
        if (!msg) return;

        const senderName = rUsername || chatUser || (firebaseUser ? firebaseUser.email.split('@')[0] : 'Oyuncu');
        if (!rUsername) rUsername = senderName;

        chatIn.value = '';

        try {
            await db.collection('rplace_canvas').doc('main').collection('chat').add({
                kullanici: senderName,
                mesaj: msg,
                zaman: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (err) {
            console.error('r/place chat gönderme hatası:', err);
            // Firestore kural hatası veya offline ise yerel olarak göster
            if (chatMsgs) {
                const div = document.createElement('div');
                div.className = 'rplace-chat-msg me';
                div.innerHTML = `<div class="author">${esc(senderName)}</div><div>${esc(msg)}</div>`;
                chatMsgs.appendChild(div);
                chatMsgs.scrollTop = chatMsgs.scrollHeight;
            }
        }
    });

    // Clear (admin)
    clearBtn?.addEventListener('click', async()=>{
        if(!confirm('Tüm tuvali temizlemek istediğine emin misin?')) return;
        await db.collection('rplace_canvas').doc('main').set({pixels:{},authors:{}});
        rPixels={}; rAuthors={};
        rDraw();
        toast('Tuval temizlendi!','success');
    });
}

function initRplaceCanvas() {
    const wrapper = document.getElementById('rplace-canvas-wrapper');
    rCanvas = document.getElementById('rplace-grid-canvas');
    if(!rCanvas||!wrapper) return;

    // Canvas boyutunu wrapper'a uydur
    rCanvas.width  = wrapper.clientWidth  || 800;
    rCanvas.height = wrapper.clientHeight || 500;
    rCtx = rCanvas.getContext('2d');

    // Varsayılan: ortalanmış, scale=2
    vpScale = Math.min(rCanvas.width/(COLS*CELL), rCanvas.height/(ROWS*CELL)) * 0.85;
    rCenterView();
    rDraw();

    // Pencere resize
    const ro = new ResizeObserver(()=>{
        if(!wrapper||!rCanvas) return;
        rCanvas.width  = wrapper.clientWidth;
        rCanvas.height = wrapper.clientHeight;
        rCenterView(); rDraw();
    });
    ro.observe(wrapper);

    // ——— Mouse olayları ———
    rCanvas.addEventListener('click', async e=>{
        if(rPanning) return;
        const {gx,gy} = screenToGrid(e.clientX, e.clientY);
        if(gx<0||gy<0||gx>=COLS||gy>=ROWS) return;
        await rPlace(gx,gy);
    });

    // Pan (orta tık veya sağ tık)
    rCanvas.addEventListener('mousedown', e=>{
        if(e.button===1||e.button===2){
            e.preventDefault(); rPanning=false;
            rPanStart={x:e.clientX-vpX, y:e.clientY-vpY};
        }
    });
    document.addEventListener('mousemove', e=>{
        if(rPanStart){
            const dx=e.clientX-rPanStart.x-vpX, dy=e.clientY-rPanStart.y-vpY;
            if(Math.abs(dx)>3||Math.abs(dy)>3) rPanning=true;
            vpX=e.clientX-rPanStart.x; vpY=e.clientY-rPanStart.y; rDraw();
        }
        // Tooltip
        if(rCanvas){
            const {gx,gy}=screenToGrid(e.clientX,e.clientY);
            const tooltip=document.getElementById('rplace-tooltip');
            if(tooltip&&gx>=0&&gy>=0&&gx<COLS&&gy<ROWS){
                const key=`${gx},${gy}`;
                const color=rPixels[key]||'#fff';
                const author=rAuthors[key];
                tooltip.style.cssText=`display:block;position:fixed;left:${e.clientX+14}px;top:${e.clientY+14}px;`;
                tooltip.innerHTML=`<span style="display:inline-block;width:10px;height:10px;background:${color};border-radius:2px;margin-right:6px;"></span>${author?`@${esc(author)}`:'Boş'} (${gx},${gy})`;
            } else if(tooltip){ tooltip.style.display='none'; }
        }
    });
    document.addEventListener('mouseup', e=>{
        if(e.button===1||e.button===2){rPanStart=null;}
    });

    // Wheel zoom
    rCanvas.addEventListener('wheel', e=>{
        e.preventDefault();
        const delta=e.deltaY>0?-.15:.15;
        const rect=rCanvas.getBoundingClientRect();
        const mx=(e.clientX-rect.left)*(rCanvas.width/rect.width);
        const my=(e.clientY-rect.top)*(rCanvas.height/rect.height);
        rZoomAt(delta, mx, my);
    },{passive:false});

    // Touch pan/pinch
    let lastTouch=null, lastDist=0;
    rCanvas.addEventListener('touchstart', e=>{
        if(e.touches.length===1) lastTouch={x:e.touches[0].clientX,y:e.touches[0].clientY};
        if(e.touches.length===2) lastDist=Math.hypot(e.touches[1].clientX-e.touches[0].clientX,e.touches[1].clientY-e.touches[0].clientY);
    },{passive:true});
    rCanvas.addEventListener('touchmove', e=>{
        if(e.touches.length===1&&lastTouch){
            vpX+=e.touches[0].clientX-lastTouch.x; vpY+=e.touches[0].clientY-lastTouch.y;
            lastTouch={x:e.touches[0].clientX,y:e.touches[0].clientY}; rDraw();
        }
        if(e.touches.length===2){
            const dist=Math.hypot(e.touches[1].clientX-e.touches[0].clientX,e.touches[1].clientY-e.touches[0].clientY);
            if(lastDist) rZoom((dist-lastDist)/200);
            lastDist=dist;
        }
    },{passive:true});

    rCanvas.addEventListener('contextmenu', e=>e.preventDefault());
}

function rCenterView() {
    if(!rCanvas) return;
    vpX = (rCanvas.width  - COLS*CELL*vpScale)/2;
    vpY = (rCanvas.height - ROWS*CELL*vpScale)/2;
}

function screenToGrid(clientX, clientY) {
    if(!rCanvas) return {gx:-1,gy:-1};
    const rect = rCanvas.getBoundingClientRect();
    // Canvas element coordinatesi
    const cx = (clientX-rect.left)*(rCanvas.width/rect.width);
    const cy = (clientY-rect.top)*(rCanvas.height/rect.height);
    // Dünya koordinatesi (viewport transform tersi)
    const wx = (cx-vpX)/vpScale;
    const wy = (cy-vpY)/vpScale;
    return { gx:Math.floor(wx/CELL), gy:Math.floor(wy/CELL) };
}

function rZoom(delta) {
    if(!rCanvas) return;
    const cx=rCanvas.width/2, cy=rCanvas.height/2;
    rZoomAt(delta, cx, cy);
}
function rZoomAt(delta, cx, cy) {
    const newScale = Math.max(0.3, Math.min(12, vpScale*(1+delta)));
    const ratio = newScale/vpScale;
    vpX = cx - ratio*(cx-vpX);
    vpY = cy - ratio*(cy-vpY);
    vpScale = newScale;
    rDraw();
}

function rDraw() {
    if(!rCtx||!rCanvas) return;
    rCtx.clearRect(0,0,rCanvas.width,rCanvas.height);
    rCtx.save();
    rCtx.translate(vpX, vpY);
    rCtx.scale(vpScale, vpScale);

    // Beyaz zemin
    rCtx.fillStyle='#ffffff';
    rCtx.fillRect(0,0,COLS*CELL,ROWS*CELL);

    // Pikseller
    Object.entries(rPixels).forEach(([key,color])=>{
        const [x,y]=key.split(',').map(Number);
        rCtx.fillStyle=color;
        rCtx.fillRect(x*CELL, y*CELL, CELL, CELL);
    });

    // Grid (yeterli zoom'da)
    if(vpScale>1.5){
        rCtx.strokeStyle='rgba(0,0,0,0.08)';
        rCtx.lineWidth=0.5/vpScale;
        for(let x=0;x<=COLS;x++){rCtx.beginPath();rCtx.moveTo(x*CELL,0);rCtx.lineTo(x*CELL,ROWS*CELL);rCtx.stroke();}
        for(let y=0;y<=ROWS;y++){rCtx.beginPath();rCtx.moveTo(0,y*CELL);rCtx.lineTo(COLS*CELL,y*CELL);rCtx.stroke();}
    }

    // Border
    rCtx.strokeStyle='rgba(255,255,255,0.15)';
    rCtx.lineWidth=2/vpScale;
    rCtx.strokeRect(0,0,COLS*CELL,ROWS*CELL);

    rCtx.restore();
}

async function rPlace(gx,gy) {
    const now=Date.now();
    if(now<rCooldownEnd){
        const rem=Math.ceil((rCooldownEnd-now)/1000);
        toast(`${rem}s bekle!`,'error',1000); return;
    }
    const key=`${gx},${gy}`;
    const color=rSelectedColor;

    // Optimistik güncelleme
    rPixels[key]=color; rAuthors[key]=rUsername;
    rDraw();

    // Cooldown başlat
    rCooldownEnd=now+COOLDOWN;
    rUpdateCooldownUI();

    // Firestore
    try {
        await db.collection('rplace_canvas').doc('main').update({
            [`pixels.${key}`] : color,
            [`authors.${key}`]: rUsername,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
        // pixel count
        updatePixelCount();
    } catch(err) {
        // Belki doküman yok, set ile dene
        try {
            await db.collection('rplace_canvas').doc('main').set({
                pixels:  rPixels,
                authors: rAuthors,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch(e2) { toast('Bağlantı hatası!','error'); }
    }
}

function rUpdateCooldownUI() {
    const pill=document.getElementById('rplace-cooldown-status');
    if(!pill) return;
    pill.classList.add('cooling');
    const iv=setInterval(()=>{
        const rem=Math.ceil((rCooldownEnd-Date.now())/1000);
        if(rem<=0){
            clearInterval(iv);
            pill.classList.remove('cooling');
            pill.textContent='Hazır ✅';
        } else {
            pill.textContent=`⏳ ${rem}s`;
        }
    }, 200);
}

function updatePixelCount() {
    const el=document.getElementById('rplace-pixel-count');
    if(el) el.textContent=`${Object.keys(rPixels).length} piksel`;
}

function loadRplaceData() {
    if(rCanvasUnsub) rCanvasUnsub();
    // Önce tek seferlik al, sonra dinle
    rCanvasUnsub = db.collection('rplace_canvas').doc('main').onSnapshot(doc=>{
        if(!doc.exists){
            // Dokümanı oluştur
            db.collection('rplace_canvas').doc('main').set({pixels:{},authors:{},lastUpdated:firebase.firestore.FieldValue.serverTimestamp()});
            return;
        }
        const data=doc.data();
        rPixels  = data.pixels  || {};
        rAuthors = data.authors || {};
        rDraw();
        updatePixelCount();
    });
}

function rChatListen(chatMsgs) {
    if(rChatUnsub) rChatUnsub();
    rChatUnsub = db.collection('rplace_canvas').doc('main').collection('chat')
        .orderBy('zaman','asc').limitToLast(100)
        .onSnapshot(snap=>{
            if(!chatMsgs) return;
            chatMsgs.innerHTML='';
            snap.forEach(doc=>{
                const d=doc.data();
                const div=document.createElement('div');
                div.className=`rplace-chat-msg ${d.kullanici===rUsername?'me':'other'}`;
                div.innerHTML=`<div class="author">${esc(d.kullanici)}</div><div>${esc(d.mesaj)}</div>`;
                chatMsgs.appendChild(div);
            });
            chatMsgs.scrollTop=chatMsgs.scrollHeight;
        });
}

// ============================================================
// 101 OKEY & DİNAMİK ODA SİSTEMİ
// ============================================================
let okeyNick         = '';
let curRoomId        = null;
let curRoomLeader    = '';
let curRoomData      = null;
let roomsListUnsub   = null;
let roomUnsub        = null;
let sohbetUnsub      = null;
let rackSlots        = new Array(26).fill(null);
let dragging         = null;
let selectedRoomMode = 'klasik';
let pendingJoinRoom  = null;
let targetActionPlayer = null;
let activeLobbyFilter  = 'all';
let allLoadedRooms     = [];

function setupOkey() {
    const nickIn         = document.getElementById('okey-nickname-input');
    const enterBtn       = document.getElementById('okey-enter-lobby-btn');
    const loginStep      = document.getElementById('okey-login-step');
    const lobbyStep      = document.getElementById('okey-lobby-step');
    const userDisp       = document.getElementById('okey-user-display');
    const leaveBtn       = document.getElementById('okey-leave-room-btn');
    const startBtn       = document.getElementById('okey-start-game-btn');
    const drawBtn        = document.getElementById('okey-draw-tile-btn');
    const perBtn         = document.getElementById('okey-open-per-btn');
    const deckEl         = document.getElementById('okey-draw-deck');
    const chatForm       = document.getElementById('okey-chat-form');
    const chatIn         = document.getElementById('okey-chat-input');
    const chatMsgs       = document.getElementById('okey-chat-messages');

    // Modal elements
    const createModalBtn = document.getElementById('okey-open-create-modal-btn');
    const emptyCreateBtn = document.getElementById('okey-empty-create-btn');
    const createModal    = document.getElementById('okey-create-modal');
    const closeCreateBtn = document.getElementById('okey-close-create-modal');
    const confirmCreate  = document.getElementById('okey-confirm-create-btn');
    const newRoomNameIn  = document.getElementById('new-room-name');
    const newRoomPassIn  = document.getElementById('new-room-pass');

    const passModal      = document.getElementById('okey-pass-prompt-modal');
    const closePassModal = document.getElementById('okey-close-pass-modal');
    const confirmPassBtn = document.getElementById('okey-confirm-pass-btn');
    const passInput      = document.getElementById('okey-room-pass-input');

    const playerActionModal = document.getElementById('okey-player-action-modal');
    const closePlayerModal  = document.getElementById('okey-close-player-modal');
    const actionKickBtn     = document.getElementById('okey-action-kick-btn');
    const actionBanBtn      = document.getElementById('okey-action-ban-btn');

    // Arama ve Filtreler
    const searchInput = document.getElementById('okey-room-search');
    const filterChips = document.querySelectorAll('.okey-chip');

    nickIn?.addEventListener('keydown', e => { if (e.key === 'Enter') enterBtn?.click(); });

    enterBtn?.addEventListener('click', () => {
        const nick = nickIn?.value.trim() || (firebaseUser ? firebaseUser.email.split('@')[0] : '');
        if (!nick) { toast('Lütfen bir oyuncu adı girin!', 'error'); return; }
        okeyNick = nick;
        if (userDisp) userDisp.innerText = `Oyuncu: ${nick}`;
        loginStep?.classList.add('hidden');
        lobbyStep?.classList.remove('hidden');
        listenAllRooms();
    });

    // Modal aç/kapat
    const openCreateModal = () => {
        createModal?.classList.remove('hidden');
        if (newRoomNameIn) { newRoomNameIn.value = `${okeyNick}'in Masası`; newRoomNameIn.focus(); }
        if (newRoomPassIn) newRoomPassIn.value = '';
    };
    createModalBtn?.addEventListener('click', openCreateModal);
    emptyCreateBtn?.addEventListener('click', openCreateModal);
    closeCreateBtn?.addEventListener('click', () => createModal?.classList.add('hidden'));

    // Oyun modu seçimi
    document.querySelectorAll('.okey-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.okey-mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedRoomMode = btn.dataset.mode;
        });
    });

    // Oda oluştur
    confirmCreate?.addEventListener('click', async () => {
        const name = newRoomNameIn?.value.trim();
        const pass = newRoomPassIn?.value.trim() || null;
        if (!name) { toast('Masa adı girin!', 'error'); return; }

        confirmCreate.disabled = true;
        confirmCreate.textContent = 'Masa kuruluyor...';

        try {
            const newRoomRef = db.collection('okey_odalari').doc();
            const roomData = {
                id: newRoomRef.id,
                isim: name,
                lider: okeyNick,
                sifre: pass,
                mod: selectedRoomMode,
                oyuncular: [okeyNick],
                banned: [],
                oyunBasladi: false,
                deste: [],
                eller: {},
                sira: okeyNick,
                atilanTaslar: {},
                olusturulma: firebase.firestore.FieldValue.serverTimestamp()
            };

            await newRoomRef.set(roomData);
            createModal?.classList.add('hidden');
            confirmCreate.disabled = false;
            confirmCreate.textContent = 'Odayı Aç ve Masaya Geç 🚀';

            // Masaya geç
            enterRoomView(newRoomRef.id, roomData);
            toast('Masa başarıyla kuruldu! 👑 Lidersiniz.', 'success');
        } catch (err) {
            console.error('Oda kurma hatası:', err);
            confirmCreate.disabled = false;
            confirmCreate.textContent = 'Odayı Aç ve Masaya Geç 🚀';
            toast('Masa kurulamadı, tekrar deneyin.', 'error');
        }
    });

    // Şifre modalı
    closePassModal?.addEventListener('click', () => { passModal?.classList.add('hidden'); pendingJoinRoom = null; });
    confirmPassBtn?.addEventListener('click', () => {
        if (!pendingJoinRoom) return;
        const entered = passInput?.value.trim();
        if (entered === pendingJoinRoom.sifre) {
            passModal?.classList.add('hidden');
            const target = pendingJoinRoom;
            pendingJoinRoom = null;
            joinRoomDirect(target);
        } else {
            toast('Hatalı masa şifresi!', 'error');
            if (passInput) {
                passInput.value = '';
                passInput.style.animation = 'shake 0.4s ease';
                setTimeout(() => passInput.style.animation = '', 400);
            }
        }
    });

    // Oyuncu Yönetim Modalı (Lider Kick/Ban)
    closePlayerModal?.addEventListener('click', () => { playerActionModal?.classList.add('hidden'); targetActionPlayer = null; });
    actionKickBtn?.addEventListener('click', async () => {
        if (!targetActionPlayer || !curRoomId) return;
        await kickPlayer(targetActionPlayer);
        playerActionModal?.classList.add('hidden');
    });
    actionBanBtn?.addEventListener('click', async () => {
        if (!targetActionPlayer || !curRoomId) return;
        await banPlayer(targetActionPlayer);
        playerActionModal?.classList.add('hidden');
    });

    // Arama ve Filtre Dinleyicileri
    searchInput?.addEventListener('input', () => renderFilteredRooms());
    filterChips.forEach(chip => {
        chip.addEventListener('click', () => {
            filterChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            activeLobbyFilter = chip.dataset.filter;
            renderFilteredRooms();
        });
    });

    // Koltuklara tıklama (Lider oyuncu yönetimi)
    const attachSeatClick = (seatId, seatRole) => {
        const seat = document.getElementById(seatId);
        seat?.addEventListener('click', () => {
            if (curRoomLeader !== okeyNick) return; // Sadece lider yönetebilir
            const nameEl = seat.querySelector('.seat-name');
            const targetName = nameEl?.innerText.trim();
            if (!targetName || targetName === 'Boş' || targetName.includes('(Sen)')) return;

            targetActionPlayer = targetName;
            const targetTitle = document.getElementById('okey-target-player-name');
            if (targetTitle) targetTitle.innerText = `👤 ${targetName}`;
            playerActionModal?.classList.remove('hidden');
        });
    };
    attachSeatClick('seat-top', 'top');
    attachSeatClick('seat-left', 'left');
    attachSeatClick('seat-right', 'right');

    leaveBtn?.addEventListener('click', leaveRoom);
    startBtn?.addEventListener('click', startGame);

    // Taş çek
    const doDrawTile = async () => {
        if (!curRoomId) { toast('Önce bir odaya gir!', 'error'); return; }
        const ref = db.collection('okey_odalari').doc(curRoomId);
        const doc = await ref.get();
        const data = doc.data();
        if (!data?.oyunBasladi) { toast('Oyun henüz başlamadı!', 'error'); return; }
        if (data.sira !== okeyNick) { toast('Sıra sizde değil!', 'error'); return; }
        if (!data.deste?.length) { toast('Destede taş kalmadı!', 'error'); return; }

        const deste = [...data.deste];
        const drawn = deste.shift();
        const empty = rackSlots.findIndex(s => s === null);
        if (empty !== -1) rackSlots[empty] = drawn;
        else rackSlots.push(drawn);

        const eller = { ...(data.eller || {}) };
        eller[okeyNick] = rackSlots.filter(Boolean);

        await ref.update({ deste, eller });
        buildRack();
        showTileAnim(drawn);
        const dc = document.getElementById('okey-deck-count');
        if (dc) dc.innerText = `${deste.length}`;
    };
    drawBtn?.addEventListener('click', doDrawTile);
    deckEl?.addEventListener('click', doDrawTile);

    // Per aç
    perBtn?.addEventListener('click', () => {
        const selSlots = [...document.querySelectorAll('.okey-rack-slot')].filter(s => s.querySelector('.okey-tile.selected'));
        const idxs = selSlots.map(s => parseInt(s.dataset.index));
        const tiles = idxs.map(i => rackSlots[i]).filter(Boolean);
        if (tiles.length < 3) { toast('En az 3 taş seçmelisiniz!', 'error'); return; }
        if (validatePer(tiles)) {
            idxs.forEach(i => rackSlots[i] = null);
            buildRack();
            toast(`🎉 Per açıldı! (${tiles.length} taş)`, 'success');
            if (curRoomId) {
                const ref = db.collection('okey_odalari').doc(curRoomId);
                ref.get().then(doc => {
                    const eller = { ...(doc.data()?.eller || {}) };
                    eller[okeyNick] = rackSlots.filter(Boolean);
                    ref.update({ eller });
                });
            }
        } else {
            toast('Geçersiz per! Seri (aynı renk ardışık) veya takım (aynı sayı farklı renk) olmalıdır.', 'error', 4000);
        }
    });

    // Chat
    chatForm?.addEventListener('submit', async e => {
        e.preventDefault();
        const msg = chatIn?.value.trim();
        if (!msg || !curRoomId) return;
        chatIn.value = '';

        try {
            await db.collection('okey_odalari').doc(curRoomId).collection('sohbet').add({
                kullanici: okeyNick,
                mesaj: msg,
                isLeader: curRoomLeader === okeyNick,
                zaman: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (err) {
            console.error('Masa sohbet hatası:', err);
        }
    });

    setupThrowArea();
}

function listenAllRooms() {
    if (roomsListUnsub) roomsListUnsub();
    const cont = document.getElementById('okey-rooms-container');
    const emptyState = document.getElementById('okey-empty-rooms');

    roomsListUnsub = db.collection('okey_odalari').orderBy('olusturulma', 'desc').onSnapshot(snap => {
        allLoadedRooms = [];
        snap.forEach(doc => {
            allLoadedRooms.push({ id: doc.id, ...doc.data() });
        });
        renderFilteredRooms();
    }, err => {
        console.warn('Odalar listesi dinlenemedi:', err);
    });
}

function renderFilteredRooms() {
    const cont = document.getElementById('okey-rooms-container');
    const emptyState = document.getElementById('okey-empty-rooms');
    const query = document.getElementById('okey-room-search')?.value.toLowerCase().trim() || '';
    if (!cont) return;

    let filtered = allLoadedRooms.filter(r => {
        // Arama filtresi
        if (query && !r.isim?.toLowerCase().includes(query) && !r.lider?.toLowerCase().includes(query)) {
            return false;
        }
        // Chip filtreleri
        if (activeLobbyFilter === 'public' && r.sifre) return false;
        if (activeLobbyFilter === 'locked' && !r.sifre) return false;
        if (activeLobbyFilter === 'available' && (r.oyuncular?.length || 0) >= 4) return false;
        return true;
    });

    cont.innerHTML = '';
    if (filtered.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }
    if (emptyState) emptyState.classList.add('hidden');

    filtered.forEach(room => {
        const count = room.oyuncular?.length || 0;
        const isLocked = !!room.sifre;
        const isFull = count >= 4;
        const card = document.createElement('div');
        card.className = 'okey-room-card';

        card.innerHTML = `
            <div class="okey-room-card-header">
                <div>
                    <h4>${esc(room.isim)} ${isLocked ? '🔒' : ''}</h4>
                    <div class="okey-room-host-info">
                        <span>👑 ${esc(room.lider || 'Bilinmiyor')}</span>
                    </div>
                </div>
                <div class="okey-room-badges">
                    <span class="okey-mode-pill">${room.mod === 'katlamali' ? 'Katlamalı' : 'Klasik'}</span>
                    <span class="okey-room-badge" style="color:${isFull ? '#ef4444' : '#22c55e'}">${count}/4</span>
                </div>
            </div>
            <button class="action-btn okey-join-btn" style="${isFull ? 'opacity:0.5;cursor:not-allowed;' : 'background:var(--text-color);color:var(--card-bg);'}">
                ${isFull ? '⛔ Masa Dolu' : (isLocked ? '🔑 Şifreyle Gir' : '🎲 Masaya Otur')}
            </button>
        `;

        if (!isFull) {
            card.querySelector('.okey-join-btn').onclick = () => requestJoinRoom(room);
        }
        cont.appendChild(card);
    });
}

function requestJoinRoom(room) {
    if (room.banned?.includes(okeyNick)) {
        toast('⛔ Bu masadan yasaklandınız (Ban)!', 'error');
        return;
    }
    if (room.sifre) {
        pendingJoinRoom = room;
        const passModal = document.getElementById('okey-pass-prompt-modal');
        const passName = document.getElementById('okey-pass-room-name');
        const passIn = document.getElementById('okey-room-pass-input');
        if (passName) passName.innerText = `"${room.isim}" masası şifrelidir.`;
        if (passIn) passIn.value = '';
        passModal?.classList.remove('hidden');
    } else {
        joinRoomDirect(room);
    }
}

async function joinRoomDirect(room) {
    try {
        const ref = db.collection('okey_odalari').doc(room.id);
        const doc = await ref.get();
        if (!doc.exists) { toast('Bu masa artık mevcut değil!', 'error'); return; }

        const data = doc.data();
        if (data.banned?.includes(okeyNick)) {
            toast('⛔ Bu masadan yasaklandınız!', 'error'); return;
        }

        let oyuncular = data.oyuncular || [];
        if (oyuncular.length >= 4 && !oyuncular.includes(okeyNick)) {
            toast('Masa az önce doldu!', 'error'); return;
        }

        if (!oyuncular.includes(okeyNick)) {
            oyuncular.push(okeyNick);
            await ref.update({ oyuncular });
        }

        enterRoomView(room.id, data);
    } catch (err) {
        console.error('Odaya girme hatası:', err);
        toast('Odaya girilemedi!', 'error');
    }
}

function enterRoomView(roomId, initialData) {
    curRoomId = roomId;
    curRoomLeader = initialData.lider || '';

    document.getElementById('okey-lobby-step')?.classList.add('hidden');
    document.getElementById('okey-room-step')?.classList.remove('hidden');

    const title = document.getElementById('okey-current-room-title');
    if (title) title.innerText = initialData.isim;

    const modeBadge = document.getElementById('okey-room-mode-badge');
    if (modeBadge) modeBadge.innerText = initialData.mod === 'katlamali' ? 'Katlamalı 101' : 'Klasik 101';

    const hostTag = document.getElementById('okey-chat-host-tag');
    if (hostTag) hostTag.style.display = (curRoomLeader === okeyNick) ? 'inline-block' : 'none';

    listenRoom(roomId);
    listenOkeyChat(roomId);
}

function listenRoom(id) {
    if (roomUnsub) roomUnsub();
    roomUnsub = db.collection('okey_odalari').doc(id).onSnapshot(doc => {
        if (!doc.exists) {
            toast('Masa kapatıldı.', 'info');
            leaveRoomLocally();
            return;
        }
        const data = doc.data();
        curRoomData = data;
        curRoomLeader = data.lider || '';

        // Ban / Kick kontrolü
        if (data.banned?.includes(okeyNick)) {
            toast('⛔ Bu masadan yasaklandınız (Ban)!', 'error');
            leaveRoomLocally();
            return;
        }
        if (!data.oyuncular?.includes(okeyNick)) {
            toast('Masadan çıkarıldınız.', 'error');
            leaveRoomLocally();
            return;
        }

        // Lider değişimi / gösterimi
        const hostTag = document.getElementById('okey-chat-host-tag');
        if (hostTag) hostTag.style.display = (curRoomLeader === okeyNick) ? 'inline-block' : 'none';

        // Sıra yoksa lider başlatır
        if (data.oyuncular?.length > 0 && (!data.sira || !data.oyuncular.includes(data.sira))) {
            if (data.lider === okeyNick) {
                db.collection('okey_odalari').doc(id).update({ sira: data.oyuncular[0] });
            }
            return;
        }

        updateTable(data.oyuncular, curRoomLeader, data.sira, data.atilanTaslar || {});

        // Başlat butonu: Sadece Lider ve 4 kişi varken
        const startBtn = document.getElementById('okey-start-game-btn');
        if (startBtn) {
            const isLeader = curRoomLeader === okeyNick;
            const canStart = data.oyuncular.length === 4 && !data.oyunBasladi;
            startBtn.classList.toggle('hidden', !(isLeader && canStart));
        }

        // Sıra badge
        const tb = document.getElementById('okey-turn-indicator');
        const bb = document.getElementById('bottom-turn-badge');
        if (data.sira) {
            const isMyTurn = data.sira === okeyNick;
            if (tb) {
                tb.innerText = isMyTurn ? '🎯 Sıra Sende!' : `Sıra: ${data.sira}`;
                tb.className = isMyTurn ? 'okey-turn-badge my-turn' : 'okey-turn-badge';
            }
            if (bb) bb.style.display = isMyTurn ? 'block' : 'none';
        }

        // İlk el dağıtımı
        if (data.oyunBasladi && data.eller?.[okeyNick]) {
            if (rackSlots.every(s => s === null)) {
                rackSlots = new Array(26).fill(null);
                data.eller[okeyNick].forEach((t, i) => { if (i < 26) rackSlots[i] = t; });
                buildRack();

                const indEl = document.getElementById('okey-indicator-tile');
                if (indEl && data.gosterge) {
                    indEl.innerText = data.gosterge.sayi;
                    indEl.className = `okey-tile-item tile-${data.gosterge.renk}`;
                }
                const dc = document.getElementById('okey-deck-count');
                if (dc && data.deste) dc.innerText = data.deste.length;

                if (data.gosterge) {
                    const okeySayi = data.gosterge.sayi === 13 ? 1 : parseInt(data.gosterge.sayi) + 1;
                    const info = document.getElementById('okey-info-text');
                    if (info) info.innerText = `Istakan | Okey Taşı: ${data.gosterge.renk} ${okeySayi}`;
                }
            }
        }
    });
}

function updateTable(oyuncular, lider, sira, atilan = {}) {
    const isHost = lider === okeyNick;
    const botName = document.querySelector('#seat-bottom .seat-name');
    if (botName) botName.innerText = `${okeyNick} (Sen)`;

    const botCrown = document.getElementById('bottom-crown');
    if (botCrown) botCrown.classList.toggle('hidden', !isHost);

    updateThrowArea(document.getElementById('throw-bottom'), atilan[okeyNick], 'Taş At');

    const others = oyuncular.filter(n => n !== okeyNick);
    const seats = [
        { s: 'seat-left', t: 'throw-left' },
        { s: 'seat-top', t: 'throw-top' },
        { s: 'seat-right', t: 'throw-right' }
    ];

    seats.forEach(({ s, t }, i) => {
        const seat = document.getElementById(s);
        const nameEl = seat?.querySelector('.seat-name');
        const crownEl = seat?.querySelector('.seat-crown');
        const thrEl = document.getElementById(t);
        const pname = others[i];

        if (pname) {
            if (nameEl) nameEl.innerText = pname;
            if (crownEl) crownEl.classList.toggle('hidden', pname !== lider);
            seat?.classList.add('occupied');
            seat?.classList.toggle('active-turn', sira === pname);
            updateThrowArea(thrEl, atilan[pname], '—');
        } else {
            if (nameEl) nameEl.innerText = 'Boş';
            if (crownEl) crownEl.classList.add('hidden');
            seat?.classList.remove('occupied', 'active-turn');
            if (thrEl) thrEl.innerHTML = '—';
        }
    });

    document.getElementById('seat-bottom')?.classList.toggle('active-turn', sira === okeyNick);
}

function updateThrowArea(el, tile, def) {
    if (!el) return;
    el.innerHTML = '';
    if (tile) {
        const d = document.createElement('div');
        d.className = `okey-tile tile-${tile.isSahte ? 'joker' : tile.renk}`;
        Object.assign(d.style, { position: 'static', width: '32px', height: '46px', fontSize: '14px', boxShadow: 'none', cursor: 'default' });
        d.innerText = tile.isSahte ? '★' : tile.sayi;
        el.appendChild(d);
    } else {
        el.innerText = def;
    }
}

async function kickPlayer(name) {
    if (!curRoomId) return;
    try {
        const ref = db.collection('okey_odalari').doc(curRoomId);
        const doc = await ref.get();
        if (!doc.exists) return;
        const oyuncular = (doc.data().oyuncular || []).filter(p => p !== name);
        await ref.update({ oyuncular });
        toast(`${name} masadan atıldı.`, 'success');
    } catch (err) {
        toast('Oyuncu atılamadı!', 'error');
    }
}

async function banPlayer(name) {
    if (!curRoomId) return;
    try {
        const ref = db.collection('okey_odalari').doc(curRoomId);
        const doc = await ref.get();
        if (!doc.exists) return;
        const data = doc.data();
        const oyuncular = (data.oyuncular || []).filter(p => p !== name);
        const banned = [...(data.banned || []), name];
        await ref.update({ oyuncular, banned });
        toast(`${name} masadan kalıcı olarak banlandı!`, 'success');
    } catch (err) {
        toast('Banlama işlemi başarısız!', 'error');
    }
}

async function leaveRoom() {
    if (!curRoomId) return;
    const roomIdToLeave = curRoomId;
    leaveRoomLocally();

    try {
        const ref = db.collection('okey_odalari').doc(roomIdToLeave);
        const doc = await ref.get();
        if (!doc.exists) return;

        const data = doc.data();
        const oyuncular = (data.oyuncular || []).filter(p => p !== okeyNick);

        if (oyuncular.length === 0) {
            // Son kişi çıktı -> odayı tamamen sil
            await ref.delete();
        } else {
            // Lider çıktıysa liderliği sıradaki kişiye devret
            let newLider = data.lider;
            if (data.lider === okeyNick) {
                newLider = oyuncular[0];
            }
            await ref.update({ oyuncular, lider: newLider });
        }
    } catch (err) {
        console.error('Odadan çıkma hatası:', err);
    }
}

function leaveRoomLocally() {
    if (roomUnsub) roomUnsub();
    if (sohbetUnsub) sohbetUnsub();
    curRoomId = null;
    curRoomLeader = '';
    curRoomData = null;
    rackSlots = new Array(26).fill(null);

    document.getElementById('okey-room-step')?.classList.add('hidden');
    document.getElementById('okey-lobby-step')?.classList.remove('hidden');
    listenAllRooms();
}

async function startGame() {
    if (!curRoomId) return;
    const ref = db.collection('okey_odalari').doc(curRoomId);
    const doc = await ref.get();
    const oyuncular = doc.data().oyuncular;
    if (oyuncular.length !== 4) { toast('101 Okey için masada tam 4 kişi olmalıdır!', 'error'); return; }

    let deste = [], id = 1;
    const renkler = ['red', 'blue', 'black', 'yellow'];
    for (let s = 0; s < 2; s++) {
        renkler.forEach(r => {
            for (let n = 1; n <= 13; n++) deste.push({ id: id++, sayi: n, renk: r, isSahte: false });
        });
    }
    deste.push({ id: id++, sayi: 'S', renk: 'black', isSahte: true });
    deste.push({ id: id++, sayi: 'S', renk: 'red', isSahte: true });

    for (let i = deste.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deste[i], deste[j]] = [deste[j], deste[i]];
    }

    const gosterge = deste.pop();
    const okeySayi = gosterge.sayi === 13 ? 1 : gosterge.sayi + 1;
    const baslayan = Math.floor(Math.random() * oyuncular.length);
    const eller = {};
    oyuncular.forEach((o, i) => { eller[o] = deste.splice(0, i === baslayan ? 22 : 21); });

    await ref.update({
        oyunBasladi: true,
        deste,
        gosterge,
        okeyInfo: { sayi: okeySayi, renk: gosterge.renk },
        eller,
        sira: oyuncular[baslayan],
        atilanTaslar: {}
    });

    document.getElementById('okey-start-game-btn')?.classList.add('hidden');
    toast(`Oyun başladı! İlk sıra: ${oyuncular[baslayan]} 🎲`, 'success');
}

function buildRack() {
    const row1 = document.getElementById('okey-rack-row-1');
    const row2 = document.getElementById('okey-rack-row-2');
    if (!row1 || !row2) return;
    row1.innerHTML = '';
    row2.innerHTML = '';

    rackSlots.forEach((tile, idx) => {
        const slot = document.createElement('div');
        slot.className = 'okey-rack-slot';
        slot.dataset.index = idx;
        if (tile) {
            const el = createTile(tile, idx);
            slot.appendChild(el);
        }
        slot.addEventListener('dragover', e => { e.preventDefault(); slot.classList.add('drag-over'); });
        slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
        slot.addEventListener('drop', e => {
            e.preventDefault();
            slot.classList.remove('drag-over');
            if (dragging !== null) {
                [rackSlots[idx], rackSlots[dragging]] = [rackSlots[dragging], rackSlots[idx]];
                dragging = null;
                buildRack();
            }
        });
        if (idx < 13) row1.appendChild(slot);
        else row2.appendChild(slot);
    });
}

function createTile(tile, idx) {
    const el = document.createElement('div');
    el.className = `okey-tile tile-${tile.isSahte ? 'joker' : tile.renk} tile-drop`;
    el.innerText = tile.isSahte ? '★' : tile.sayi;
    el.setAttribute('draggable', 'true');
    el.onclick = () => el.classList.toggle('selected');
    el.addEventListener('dragstart', e => {
        dragging = idx;
        el.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
        dragging = null;
    });
    return el;
}

function setupThrowArea() {
    const throwBot = document.getElementById('throw-bottom');
    if (!throwBot) return;
    throwBot.addEventListener('dragover', e => { e.preventDefault(); throwBot.classList.add('drag-over'); });
    throwBot.addEventListener('dragleave', () => throwBot.classList.remove('drag-over'));
    throwBot.addEventListener('drop', async e => {
        e.preventDefault();
        throwBot.classList.remove('drag-over');
        if (dragging === null) return;
        const ref = db.collection('okey_odalari').doc(curRoomId);
        const doc = await ref.get();
        const data = doc.data();
        if (!data || data.sira !== okeyNick) { toast('Sıra sende değil!', 'error'); dragging = null; return; }
        const thrown = rackSlots[dragging];
        if (!thrown) return;
        rackSlots[dragging] = null;
        dragging = null;
        buildRack();
        const oyuncular = data.oyuncular;
        const next = oyuncular[(oyuncular.indexOf(okeyNick) + 1) % oyuncular.length];
        const atilan = { ...(data.atilanTaslar || {}), [okeyNick]: thrown };
        const eller = { ...(data.eller || {}), [okeyNick]: rackSlots };
        await ref.update({ sira: next, atilanTaslar: atilan, eller });
    });
}

function listenOkeyChat(id) {
    if (sohbetUnsub) sohbetUnsub();
    const msgs = document.getElementById('okey-chat-messages');
    sohbetUnsub = db.collection('okey_odalari').doc(id).collection('sohbet')
        .orderBy('zaman', 'asc').limitToLast(80)
        .onSnapshot(snap => {
            if (!msgs) return;
            msgs.innerHTML = '';
            snap.forEach(doc => {
                const d = doc.data();
                const isMyMessage = d.kullanici === okeyNick;
                const isHost = curRoomLeader === okeyNick;
                const div = document.createElement('div');
                div.className = `rplace-chat-msg ${isMyMessage ? 'me' : 'other'}`;
                
                div.innerHTML = `
                    <div class="author">
                        ${d.isLeader ? '👑 ' : ''}${esc(d.kullanici)}
                        ${isHost ? `<button class="okey-msg-del-btn" title="Mesajı Sil">🗑️</button>` : ''}
                    </div>
                    <div>${esc(d.mesaj)}</div>
                `;

                if (isHost) {
                    div.querySelector('.okey-msg-del-btn')?.addEventListener('click', (e) => {
                        e.stopPropagation();
                        db.collection('okey_odalari').doc(id).collection('sohbet').doc(doc.id).delete();
                    });
                }

                msgs.appendChild(div);
            });
            msgs.scrollTop = msgs.scrollHeight;
        });
}

window.addEventListener('beforeunload', () => {
    if (curRoomId && okeyNick) {
        leaveRoom();
    }
});

// ============================================================
// ADMİN PANELİ
// ============================================================
function setupAdmin() {
    const passIn  = document.getElementById('admin-password-input');
    const loginBtn= document.getElementById('admin-login-btn');
    const logoutBtn=document.getElementById('admin-logout-btn');
    const errEl   = document.getElementById('admin-error');
    const loginView=document.getElementById('admin-login-view');
    const dash    = document.getElementById('admin-dashboard');

    // Zaten giriş yapılmışsa direkt dashboard
    if(isAdminLoggedIn()){ loginView?.classList.add('hidden'); if(dash) dash.style.display='flex'; loadAdminDash(); }

    passIn?.addEventListener('keydown',e=>{if(e.key==='Enter')loginBtn?.click();});

    loginBtn?.addEventListener('click', async()=>{
        const p=passIn?.value.trim(); if(!p) return;
        if(await checkPass(p, ADMIN_SIFRE_HASH)){
            setAdminLogin(true);
            loginView?.classList.add('hidden');
            if(dash) dash.style.display='flex';
            if(errEl) errEl.classList.add('hidden');
            loadAdminDash();
            toast('Admin girişi başarılı 🛡️','success');
        } else {
            if(errEl) errEl.classList.remove('hidden');
            if(passIn){ passIn.value=''; passIn.style.animation='shake 0.4s ease'; setTimeout(()=>passIn.style.animation='',400); }
        }
    });

    logoutBtn?.addEventListener('click',()=>{
        setAdminLogin(false);
        if(dash) dash.style.display='none';
        loginView?.classList.remove('hidden');
    });

    // Admin r/place temizle
    document.getElementById('admin-clear-rplace')?.addEventListener('click', async()=>{
        if(!confirm('Tüm r/place tuvalini temizle?')) return;
        await db.collection('rplace_canvas').doc('main').set({pixels:{},authors:{},lastUpdated:firebase.firestore.FieldValue.serverTimestamp()});
        toast('Tuval temizlendi!','success');
    });
}

function loadAdminDash() {
    // Stats
    db.collection('rplace_canvas').doc('main').onSnapshot(doc=>{
        const el=document.getElementById('stat-pixels');
        if(el) el.innerText=doc.exists?Object.keys(doc.data()?.pixels||{}).length:'0';
    });
    db.collection('sohbet_odalari').onSnapshot(snap=>{
        const el=document.getElementById('stat-chat'); if(el) el.innerText=snap.size;
    });

    // Chat listesi
    const chatList=document.getElementById('admin-chat-list');
    db.collection('sohbet_odalari').orderBy('zaman','asc').limitToLast(50).onSnapshot(snap=>{
        if(!chatList) return;
        chatList.innerHTML='';
        snap.forEach(doc=>{
            const d=doc.data();
            const div=document.createElement('div'); div.className='admin-msg-item';
            div.innerHTML=`<span class="admin-msg-text"><b>${esc(d.kullanici)}:</b> ${esc(d.mesaj)}</span>`;
            const del=document.createElement('button'); del.className='admin-msg-del'; del.textContent='Sil';
            del.onclick=()=>db.collection('sohbet_odalari').doc(doc.id).delete().then(()=>toast('Mesaj silindi','success'));
            div.appendChild(del); chatList.appendChild(div);
        });
    });

    // Okey odaları (Dinamik liste)
    const okeyList = document.getElementById('admin-okey-list');
    db.collection('okey_odalari').orderBy('olusturulma', 'desc').onSnapshot(snap => {
        let totalPlayers = 0;
        if (okeyList) okeyList.innerHTML = '';
        
        snap.forEach(doc => {
            const data = doc.data();
            const cnt = data.oyuncular?.length || 0;
            totalPlayers += cnt;

            if (okeyList) {
                const el = document.createElement('div');
                el.className = 'admin-room-item';
                el.innerHTML = `
                    <div style="display:flex;flex-direction:column;gap:2px">
                        <span style="font-weight:700">${esc(data.isim || 'İsimsiz Masa')} ${data.sifre ? '🔒' : ''}</span>
                        <span style="font-size:11px;color:var(--text-muted)">Lider: 👑 ${esc(data.lider || 'Yok')}</span>
                    </div>
                    <div style="display:flex;gap:6px;align-items:center">
                        <span class="admin-player-tag">${cnt}/4</span>
                        <button class="admin-msg-del" style="padding:2px 6px" title="Odayı Kapat">Kapat</button>
                    </div>
                `;
                el.querySelector('.admin-msg-del')?.addEventListener('click', () => {
                    if (confirm(`"${data.isim}" masasını kapatmak istediğinize emin misiniz?`)) {
                        db.collection('okey_odalari').doc(doc.id).delete().then(() => toast('Masa kapatıldı', 'success'));
                    }
                });
                okeyList.appendChild(el);
            }
        });

        const statEl = document.getElementById('stat-okey');
        if (statEl) statEl.innerText = totalPlayers;
    });
}

// ============================================================
// UYGULAMA BAŞLATMA
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    // Loading
    const loading=document.getElementById('loading-screen');
    setTimeout(()=>{
        loading?.classList.add('fade-out');
        setTimeout(()=>{if(loading)loading.style.display='none';},500);
    }, 900);

    initParticles();
    setupTheme();

    // Nav (History API)
    const go = (path, e) => { if(e){e.preventDefault();} navigate(path); };
    document.getElementById('brand-logo')     ?.addEventListener('click', ()=>go('/'));
    document.getElementById('home-card-color')?.addEventListener('click', ()=>go('/color'));
    document.getElementById('home-card-weather')?.addEventListener('click',()=>go('/weather'));
    document.getElementById('home-card-rplace')?.addEventListener('click', ()=>go('/rplace'));
    document.getElementById('home-card-okey')?.addEventListener('click',  ()=>go('/okey'));
    document.getElementById('nav-color-btn')  ?.addEventListener('click', e=>go('/color',e));
    document.getElementById('nav-weather-btn')?.addEventListener('click', e=>go('/weather',e));
    document.getElementById('nav-rplace-btn') ?.addEventListener('click', e=>go('/rplace',e));
    document.getElementById('nav-okey-btn')   ?.addEventListener('click', e=>go('/okey',e));
    document.getElementById('refresh-weather-btn')?.addEventListener('click', fetchWeatherData);

    // Admin gizli link
    document.querySelector('.platform-yazisi')?.addEventListener('click', ()=>go('/admin'));

    // Modüller
    setupColorGame();
    setupChat();
    setupRplace();
    setupOkey();
    setupAdmin();

    // İlk rota
    handleRoute();
});