/*
  SECURITY NOTE:
  Client-side code is publicly visible on GitHub Pages.
  Real security is enforced by:
  - Backend Authorization header check (ADMIN_SECRET)
  - Backend rate limiting (5 admin requests/min per IP)
  - sessionStorage (cleared on tab close, not persistent like localStorage)
*/
const API_BASE_URL = "https://wsamiaw.onrender.com";

function getToken() {
    return sessionStorage.getItem("adminToken");
}

function setToken(t) {
    sessionStorage.setItem("adminToken", t);
}

function clearToken() {
    sessionStorage.removeItem("adminToken");
}

async function api(path, method, body) {
    const opts = {
        method,
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + getToken()
        }
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(API_BASE_URL + path, opts);
    const data = await res.json().catch(() => null);
    if (res.status === 429) throw new Error("Rate limited. Try again later.");
    if (res.status === 401) throw new Error("Unauthorized. Check your secret.");
    if (!res.ok) throw new Error(data && data.error ? data.error : "Request failed (" + res.status + ")");
    return data;
}

const loginScreen = document.getElementById("loginScreen");
const panel = document.getElementById("panel");
const loginForm = document.getElementById("loginForm");
const passwordInput = document.getElementById("passwordInput");
const loginError = document.getElementById("loginError");
const logoutBtn = document.getElementById("logoutBtn");
const generateForm = document.getElementById("generateForm");
const genDuration = document.getElementById("genDuration");
const genResets = document.getElementById("genResets");
const generatedKey = document.getElementById("generatedKey");
const genKeyText = document.getElementById("genKeyText");
const copyKeyBtn = document.getElementById("copyKeyBtn");
const refreshBtn = document.getElementById("refreshBtn");
const keyTableBody = document.getElementById("keyTableBody");

function showPanel() {
    loginScreen.style.display = "none";
    panel.style.display = "block";
    loadKeys();
}

function showLogin() {
    loginScreen.style.display = "flex";
    panel.style.display = "none";
}

loginForm.addEventListener("submit", async function(e) {
    e.preventDefault();
    loginError.textContent = "";
    const pw = passwordInput.value.trim();
    if (!pw) { loginError.textContent = "Enter a secret."; return; }
    setToken(pw);
    try {
        await api("/admin/list", "GET");
        showPanel();
    } catch (err) {
        clearToken();
        loginError.textContent = err.message;
        passwordInput.value = "";
        passwordInput.focus();
    }
});

logoutBtn.addEventListener("click", function() {
    clearToken();
    showLogin();
    passwordInput.value = "";
});

generateForm.addEventListener("submit", async function(e) {
    e.preventDefault();
    generatedKey.style.display = "none";
    const duration = genDuration.value.trim() || "lifetime";
    const resets = parseInt(genResets.value) || 3;
    try {
        const data = await api("/admin/generate", "POST", { duration: duration, count: 1 });
        if (data.success && data.keys && data.keys.length > 0) {
            const k = data.keys[0];
            genKeyText.textContent = k.key;
            generatedKey.style.display = "flex";
            loadKeys();
        }
    } catch (err) {
        alert("Generate failed: " + err.message);
    }
});

copyKeyBtn.addEventListener("click", function() {
    navigator.clipboard.writeText(genKeyText.textContent).then(function() {
        copyKeyBtn.textContent = "Copied!";
        setTimeout(function() { copyKeyBtn.textContent = "Copy"; }, 1500);
    });
});

refreshBtn.addEventListener("click", function() {
    loadKeys();
});

async function loadKeys() {
    try {
        const data = await api("/admin/list", "GET");
        renderKeys(data.keys || []);
    } catch (err) {
        keyTableBody.innerHTML = '<tr><td colspan="6" class="empty">Failed to load: ' + err.message + '</td></tr>';
    }
}

function renderKeys(keys) {
    if (!keys.length) {
        keyTableBody.innerHTML = '<tr><td colspan="6" class="empty">No keys found.</td></tr>';
        return;
    }
    var html = "";
    for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var shortKey = k.key.substring(0, 12) + "...";
        var hwidCell = k.hwid
            ? '<span class="hwid-yes">Bound</span>'
            : '<span class="hwid-no">None</span>';
        var expiresCell = k.expires_at || "lifetime";
        if (expiresCell !== "lifetime") {
            var expDate = new Date(k.expires_at);
            var now = new Date();
            var days = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
            expiresCell = days > 0 ? days + "d left" : "Expired";
        }
        var resetsLeft = (k.max_resets || 3) - (k.reset_count || 0);
        html += '<tr>';
        html += '<td class="key-cell" title="' + k.key + '">' + shortKey + '</td>';
        html += '<td>' + (k.username || '-') + '</td>';
        html += '<td>' + hwidCell + '</td>';
        html += '<td>' + expiresCell + '</td>';
        html += '<td>' + resetsLeft + '/' + (k.max_resets || 3) + '</td>';
        html += '<td class="actions">';
        html += '<button class="btn btn-sm btn-danger" onclick="deleteKey(\'' + k.key + '\')">Delete</button>';
        if (k.hwid) {
            html += '<button class="btn btn-sm btn-warn" onclick="resetHwid(\'' + k.key + '\')">Reset HWID</button>';
        }
        html += '</td>';
        html += '</tr>';
    }
    keyTableBody.innerHTML = html;
}

window.deleteKey = async function(key) {
    if (!confirm("Delete this key?")) return;
    try {
        await api("/admin/remove", "POST", { key: key });
        loadKeys();
    } catch (err) {
        alert("Delete failed: " + err.message);
    }
};

window.resetHwid = async function(key) {
    if (!confirm("Reset HWID for this key?")) return;
    try {
        await api("/admin/reset-hwid", "POST", { key: key });
        loadKeys();
    } catch (err) {
        alert("HWID reset failed: " + err.message);
    }
};

if (getToken()) {
    api("/admin/list", "GET").then(function() {
        showPanel();
    }).catch(function() {
        clearToken();
        showLogin();
    });
} else {
    showLogin();
}
