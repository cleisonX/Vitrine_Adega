// ===== REMOVER SERVICE WORKERS =====
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for (let registration of registrations) {
            registration.unregister();
            console.log('✅ Service Worker desregistrado');
        }
    });
}

// ------------------- CONFIGURAÇÕES QUE VOCÊ PODE EDITAR -------------------
const WHATSAPP_NUMBER = "5551998559124"; // Seu número

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyAqXgUkflVFcZptI36ZT1j8e_2WYHWbJN8",
    authDomain: "vitrine-adega.firebaseapp.com",
    projectId: "vitrine-adega",
    storageBucket: "vitrine-adega.firebasestorage.app",
    messagingSenderId: "919658366165",
    appId: "1:919658366165:web:b027a8ac52eb748a69ce5c"
};
// ---------------------------------------------------------------------------

const isFirebaseConfigured = !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);

let PRODUCTS = [];
let activeCategory = "Todos";
let searchTerm = "";
let isAdmin = false;
let pendingImageData = null;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function toast(msg, type = "ok") {
    const box = document.getElementById("toastBox");
    if (!box) return;
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => el.remove(), 3200);
}

function money(v) {
    return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function compressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                const maxSize = 800;
                let width = img.width;
                let height = img.height;
                
                if (width > height && width > maxSize) {
                    height = height * (maxSize / width);
                    width = maxSize;
                } else if (height > maxSize) {
                    width = width * (maxSize / height);
                    height = maxSize;
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);
                
                resolve(canvas.toDataURL("image/jpeg", 0.6));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

let dataLayer;

if (isFirebaseConfigured) {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
    const {
        getFirestore, collection, onSnapshot, addDoc, deleteDoc, doc, orderBy, query
    } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    const {
        getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
    } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");

    const app = initializeApp(FIREBASE_CONFIG);
    const db = getFirestore(app);
    const auth = getAuth(app);
    const productsCol = collection(db, "products");

    dataLayer = {
        mode: "firebase",
        subscribe(cb) {
            const q = query(productsCol, orderBy("createdAt", "desc"));
            onSnapshot(q, (snap) => {
                cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            });
        },
        async addProduct(product, imageFile) {
            let imageUrl = "";
            if (imageFile) {
                imageUrl = await compressImage(imageFile);
            }
            await addDoc(productsCol, { ...product, imageUrl, createdAt: Date.now() });
        },
        async deleteProduct(id) {
            await deleteDoc(doc(db, "products", id));
        },
        async login(email, password) {
            await signInWithEmailAndPassword(auth, email, password);
        },
        async logout() { await signOut(auth); },
        onAuth(cb) { onAuthStateChanged(auth, (u) => cb(!!u)); }
    };
} else {
    const LS_PRODUCTS = "vitrine_products";
    const LS_ADMIN = "vitrine_admin_session";
    const DEMO_PASSWORD = "admin123";

    function readLS() {
        try { return JSON.parse(localStorage.getItem(LS_PRODUCTS)) || []; } catch { return []; }
    }
    function writeLS(list) { localStorage.setItem(LS_PRODUCTS, JSON.stringify(list)); }

    let listeners = [];
    dataLayer = {
        mode: "demo",
        subscribe(cb) {
            listeners.push(cb);
            cb(readLS());
        },
        notify() { const list = readLS(); listeners.forEach(cb => cb(list)); },
        async addProduct(product, imageFile) {
            let imageUrl = "";
            if (imageFile) imageUrl = await compressImage(imageFile);
            const list = readLS();
            list.unshift({ id: String(Date.now()), ...product, imageUrl, createdAt: Date.now() });
            writeLS(list);
            this.notify();
        },
        async deleteProduct(id) {
            writeLS(readLS().filter(p => p.id !== id));
            this.notify();
        },
        async login(email, password) {
            if (password !== DEMO_PASSWORD) throw new Error("Senha incorreta.");
            sessionStorage.setItem(LS_ADMIN, "1");
        },
        async logout() { sessionStorage.removeItem(LS_ADMIN); this._authCb && this._authCb(false); },
        onAuth(cb) { this._authCb = cb; cb(sessionStorage.getItem(LS_ADMIN) === "1"); }
    };
}

// ===== DEMO BANNER =====
if (!isFirebaseConfigured) {
    const bannerWrap = document.getElementById("demoBannerWrap");
    if (bannerWrap) {
        bannerWrap.innerHTML = `
            <div class="demo-banner">
                <span>⚠️</span>
                <div>
                    <b>Modo demonstração ativo.</b> Os produtos estão salvos apenas neste navegador.
                    Para publicar, preencha o FIREBASE_CONFIG no código.
                    <br>
                    <small>Para gerenciar produtos, adicione <code>?adm</code> ao final da URL.</small>
                </div>
            </div>`;
    }
}

// ===== LOGIN POR URL =====
const currentUrl = window.location.href;

if (currentUrl.includes('adm') || currentUrl.includes('?adm') || currentUrl.includes('&adm')) {
    document.body.classList.add('admin-mode');
    
    const badge = document.getElementById('adminBadge');
    if (badge) {
        badge.style.display = 'flex';
        const panelBtn = document.getElementById('openPanelBtn');
        if (panelBtn) panelBtn.style.display = 'none';
    }
    
    setTimeout(() => {
        openModal('loginModal');
        toast('Faça login para acessar o painel admin', 'ok');
    }, 500);
}

// ===== LOGIN FORM =====
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const msg = document.getElementById('loginMsg');
        if (msg) msg.className = 'form-msg';
        
        const email = document.getElementById('loginEmail');
        const password = document.getElementById('loginPassword');
        
        if (!email || !password) return;
        
        try {
            await dataLayer.login(email.value, password.value);
            closeModal('loginModal');
            
            isAdmin = true;
            document.body.classList.add('admin-mode');
            
            const panelBtn = document.getElementById('openPanelBtn');
            if (panelBtn) panelBtn.style.display = 'flex';
            
            const badge = document.getElementById('adminBadge');
            if (badge) badge.style.display = 'flex';
            
            renderAll();
            toast('🛠️ Painel admin disponível!', 'ok');
            
            loginForm.reset();
        } catch (err) {
            if (msg) {
                msg.textContent = err.message || 'Erro ao fazer login. Verifique os dados.';
                msg.classList.add('show', 'error');
            }
        }
    });
}

function getCategories() {
    const cats = new Set(PRODUCTS.map(p => p.category).filter(Boolean));
    return ["Todos", ...Array.from(cats).sort()];
}

function renderCategories() {
    const list = document.getElementById("categoryList");
    if (!list) return;
    const cats = getCategories();
    list.innerHTML = cats.map(cat => {
        const count = cat === "Todos" ? PRODUCTS.length : PRODUCTS.filter(p => p.category === cat).length;
        return `<li>
            <button class="cat-btn ${cat === activeCategory ? "active" : ""}" data-cat="${escapeHtml(cat)}">
                <span>${escapeHtml(cat)}</span><span class="count">${count}</span>
            </button>
        </li>`;
    }).join("");
    document.querySelectorAll(".cat-btn").forEach(btn => btn.addEventListener("click", () => {
        activeCategory = btn.dataset.cat;
        if (window.innerWidth <= 1023) {
            closeSidebar();
        }
        renderAll();
    }));
}

function filteredProducts() {
    return PRODUCTS.filter(p => {
        const matchCat = activeCategory === "Todos" || p.category === activeCategory;
        const matchSearch = !searchTerm || p.name.toLowerCase().includes(searchTerm.toLowerCase());
        return matchCat && matchSearch;
    });
}

// ============================================================
// ===== CARRINHO DE COMPRAS =====
// ============================================================

let cart = [];
const CART_STORAGE_KEY = 'vitrine_cart';

function loadCart() {
    try {
        const saved = localStorage.getItem(CART_STORAGE_KEY);
        cart = saved ? JSON.parse(saved) : [];
    } catch {
        cart = [];
    }
    updateCartUI();
}

function saveCart() {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    updateCartUI();
}

function placeholderImg() {
    return "data:image/svg+xml;utf8," + encodeURIComponent(`
        <svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'>
            <rect width='100%' height='100%' fill='#171412'/>
            <text x='50%' y='50%' fill='#ff8a1e' font-size='20' font-family='sans-serif' text-anchor='middle' dy='.3em'>Sem foto</text>
        </svg>`);
}

function renderCartModal() {
    const container = document.getElementById('cartItems');
    const summary = document.getElementById('cartSummary');
    const totalEl = document.getElementById('cartTotal');
    if (!container) return;
    
    if (cart.length === 0) {
        container.innerHTML = `<p style="color:var(--muted);text-align:center;padding:20px 0;">🛒 Seu carrinho está vazio.</p>`;
        if (summary) summary.style.display = 'none';
        return;
    }
    
    let total = 0;
    container.innerHTML = cart.map(item => {
        const subtotal = item.price * item.qty;
        total += subtotal;
        return `
            <div class="cart-item">
                <img src="${item.image}" alt="${escapeHtml(item.name)}" class="cart-item-img">
                <div class="cart-item-info">
                    <div class="cart-item-name">${escapeHtml(item.name)}</div>
                    <div class="cart-item-price">${money(item.price)}</div>
                </div>
                <div class="cart-item-actions">
                    <button onclick="window.removeFromCart('${item.id}')" title="Remover um">−</button>
                    <span class="cart-item-qty">${item.qty}</span>
                    <button onclick="window.addToCart('${item.id}', '${escapeHtml(item.name)}', ${item.price}, '${item.image}', true)" title="Adicionar mais">+</button>
                    <button onclick="window.removeItemCompletely('${item.id}')" style="color:var(--danger);border-color:rgba(230,67,47,0.3);" title="Remover tudo">✕</button>
                </div>
            </div>
        `;
    }).join('');
    
    if (totalEl) totalEl.textContent = money(total);
    if (summary) summary.style.display = 'block';
    
    // Garante que os campos de entrega/pagamento estão visíveis
    toggleDeliveryFields();
    togglePaymentFields();
}

// ===== FUNÇÕES DE TOGGLE PARA ENTREGA E PAGAMENTO =====
function toggleDeliveryFields() {
    const deliveryType = document.getElementById('deliveryType');
    const addressField = document.getElementById('addressField');
    if (deliveryType && addressField) {
        addressField.style.display = deliveryType.value === 'tele' ? 'block' : 'none';
    }
}

function togglePaymentFields() {
    const paymentMethod = document.getElementById('paymentMethod');
    const changeField = document.getElementById('changeField');
    if (paymentMethod && changeField) {
        changeField.style.display = paymentMethod.value === 'dinheiro' ? 'block' : 'none';
    }
}

window.toggleDeliveryFields = toggleDeliveryFields;
window.togglePaymentFields = togglePaymentFields;

function checkoutCart() {
    if (cart.length === 0) {
        toast('🛒 Carrinho vazio!', 'error');
        return;
    }
    
    const deliveryType = document.getElementById('deliveryType');
    const deliveryAddress = document.getElementById('deliveryAddress');
    const paymentMethod = document.getElementById('paymentMethod');
    const changeAmount = document.getElementById('changeAmount');
    
    if (!deliveryType || !paymentMethod) {
        toast('Erro: campos de entrega/pagamento não encontrados!', 'error');
        return;
    }
    
    // Valida endereço se for tele-entrega
    if (deliveryType.value === 'tele') {
        if (!deliveryAddress || !deliveryAddress.value.trim()) {
            toast('Digite o endereço de entrega!', 'error');
            if (deliveryAddress) deliveryAddress.focus();
            return;
        }
    }
    
    // Valida troco se for dinheiro
    let changeMessage = '';
    if (paymentMethod.value === 'dinheiro' && changeAmount && changeAmount.value) {
        changeMessage = `Troco para: ${money(parseFloat(changeAmount.value))}`;
    }
    
    let total = 0;
    let message = 'Novo Pedido - Vitrine Adega e Tabacaria\n\n';
    message += 'Itens do pedido:\n';
    
    cart.forEach((item, index) => {
        const subtotal = item.price * item.qty;
        total += subtotal;
        message += `${index + 1}. ${item.name} - ${item.qty}x ${money(item.price)} = ${money(subtotal)}\n`;
    });
    
    message += `\nTotal: ${money(total)}\n\n`;
    
    // Tipo de entrega
    const deliveryLabel = deliveryType.value === 'tele' ? 'Tele-entrega' : 'Retirar no local';
    message += `Entrega: ${deliveryLabel}\n`;
    
    if (deliveryType.value === 'tele') {
        message += `Endereço: ${deliveryAddress.value.trim()}\n`;
    }
    
    // Forma de pagamento
    const paymentLabels = {
        'pix': 'Pix',
        'credito': 'Cartão de Crédito',
        'debito': 'Cartão de Débito',
        'dinheiro': 'Dinheiro'
    };
    const paymentLabel = paymentLabels[paymentMethod.value] || paymentMethod.value;
    message += `Pagamento: ${paymentLabel}\n`;
    
    if (changeMessage) {
        message += `${changeMessage}\n`;
    }
    
    message += `\nObrigado!`;
    
    const encodedMsg = encodeURIComponent(message);
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodedMsg}`;
    window.open(url, '_blank');
    
    setTimeout(() => {
        cart = [];
        saveCart();
        renderCartModal();
        closeModal('cartModal');
        toast('✅ Pedido enviado! Carrinho esvaziado.', 'ok');
    }, 1000);
}

function updateCartUI() {
    const count = cart.reduce((sum, item) => sum + item.qty, 0);
    const floatBadge = document.getElementById('cartFloatBadge');
    if (floatBadge) {
        floatBadge.textContent = count;
        floatBadge.style.display = count > 0 ? 'flex' : 'none';
    }
}

// ===== FUNÇÕES GLOBAIS DO CARRINHO =====
window.addToCart = function(productId, productName, productPrice, productImage, fromModal = false) {
    const existing = cart.find(item => item.id === productId);
    if (existing) {
        existing.qty += 1;
    } else {
        cart.push({
            id: productId,
            name: productName,
            price: productPrice,
            image: productImage || placeholderImg(),
            qty: 1
        });
    }
    saveCart();
    
    if (fromModal) {
        renderCartModal();
    } else {
        toast(`✅ ${productName} adicionado ao carrinho!`, 'ok');
    }
};

window.removeFromCart = function(productId) {
    const existing = cart.find(item => item.id === productId);
    if (existing) {
        if (existing.qty > 1) {
            existing.qty -= 1;
        } else {
            cart = cart.filter(item => item.id !== productId);
        }
    }
    saveCart();
    renderCartModal();
};

window.removeItemCompletely = function(productId) {
    cart = cart.filter(item => item.id !== productId);
    saveCart();
    renderCartModal();
};

window.clearCart = function() {
    if (cart.length === 0) return;
    if (confirm('Esvaziar carrinho?')) {
        cart = [];
        saveCart();
        toast('🛒 Carrinho esvaziado', 'ok');
    }
};

window.renderCartModal = renderCartModal;
window.checkoutCart = checkoutCart;
window.closeModal = closeModal;

// EVENTOS DO CARRINHO
document.getElementById('cartFloat')?.addEventListener('click', function(e) {
    e.preventDefault();
    renderCartModal();
    openModal('cartModal');
});

document.getElementById('cartCheckout')?.addEventListener('click', checkoutCart);

document.getElementById('cartClear')?.addEventListener('click', function() {
    clearCart();
    renderCartModal();
});

// ============================================================
// ===== RENDER GRID =====
// ============================================================

function renderGrid() {
    const grid = document.getElementById("productGrid");
    if (!grid) return;
    const list = filteredProducts();
    const title = document.getElementById("gridTitle");
    const count = document.getElementById("gridCount");
    const empty = document.getElementById("emptyState");
    
    if (title) title.textContent = activeCategory === "Todos" ? "Todos os produtos" : activeCategory;
    if (count) count.textContent = `${list.length} produto${list.length === 1 ? "" : "s"}`;
    if (empty) empty.hidden = list.length > 0;

    grid.innerHTML = list.map(p => {
        const safeName = escapeHtml(p.name);
        const safeDesc = escapeHtml(p.description || "");
        const safeCategory = escapeHtml(p.category || "Geral");
        const imageUrl = p.imageUrl || placeholderImg();
        return `
            <article class="card">
                <button class="card-del" data-del="${p.id}" title="Excluir produto">🗑</button>
                <div class="card-img-wrap" data-zoom="${imageUrl}" data-name="${safeName}">
                    <img src="${imageUrl}" alt="${safeName}" loading="lazy">
                    <span class="card-zoom-icon">🔍</span>
                </div>
                <div class="card-body">
                    <span class="card-category">${safeCategory}</span>
                    <h3 class="card-name">${safeName}</h3>
                    ${safeDesc ? `<p class="card-desc">${safeDesc}</p>` : ""}
                    <p class="card-price">${money(p.price)}</p>
                    <button class="btn-add-cart" onclick="window.addToCart('${p.id}', '${safeName}', ${p.price}, '${imageUrl}')">
                        Adicionar ao Carrinho
                    </button>
                </div>
            </article>
        `;
    }).join("");

    document.querySelectorAll("[data-zoom]").forEach(el => el.addEventListener("click", () => {
        const src = el.dataset.zoom;
        if (!src) return;
        const zoomImg = document.getElementById("zoomImg");
        const zoomOverlay = document.getElementById("zoomOverlay");
        if (zoomImg && zoomOverlay) {
            zoomImg.src = src;
            zoomImg.alt = el.dataset.name || "Produto";
            zoomOverlay.classList.add("open");
        }
    }));
    document.querySelectorAll("[data-del]").forEach(btn => btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("Excluir este produto do catálogo?")) return;
        await dataLayer.deleteProduct(btn.dataset.del);
        toast("Produto excluído.", "ok");
    }));
}

function renderAdminList() {
    const box = document.getElementById("adminProductList");
    const count = document.getElementById("adminListCount");
    if (!box) return;
    if (count) count.textContent = `Produtos cadastrados (${PRODUCTS.length})`;
    box.innerHTML = PRODUCTS.map(p => {
        const safeName = escapeHtml(p.name);
        const safeCategory = escapeHtml(p.category || "Geral");
        return `
            <div class="admin-row">
                <img src="${p.imageUrl || placeholderImg()}" alt="${safeName}">
                <div class="info">
                    <div class="n">${safeName}</div>
                    <div class="c">${safeCategory} • ${money(p.price)}</div>
                </div>
                <button class="btn btn-danger btn-sm" data-del2="${p.id}">Excluir</button>
            </div>
        `;
    }).join("") || `<p class="hint">Nenhum produto cadastrado ainda.</p>`;

    document.querySelectorAll("[data-del2]").forEach(btn => btn.addEventListener("click", async () => {
        if (!confirm("Excluir este produto do catálogo?")) return;
        await dataLayer.deleteProduct(btn.dataset.del2);
        toast("Produto excluído.", "ok");
    }));
}

function renderCategorySelect() {
    const sel = document.getElementById("productCategorySelect");
    if (!sel) return;
    const cats = Array.from(new Set(PRODUCTS.map(p => p.category).filter(Boolean))).sort();
    sel.innerHTML = cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("") + `<option value="__new__">+ Nova categoria</option>`;
    sel.value = cats.length ? cats[0] : "__new__";
    toggleNewCategoryField();
}

function toggleNewCategoryField() {
    const sel = document.getElementById("productCategorySelect");
    const field = document.getElementById("newCategoryField");
    if (!sel || !field) return;
    const isNew = sel.value === "__new__";
    field.style.display = isNew ? "block" : "none";
}

function renderAll() {
    renderCategories();
    renderGrid();
    if (isAdmin) { renderAdminList(); renderCategorySelect(); }
}

dataLayer.subscribe((list) => {
    PRODUCTS = list;
    renderAll();
});

// ===== SIDEBAR =====
function openSidebar() {
    document.body.classList.add("sidebar-open");
    const sidebar = document.getElementById("sidebar");
    if (sidebar) sidebar.classList.add("open");
}

function closeSidebar() {
    document.body.classList.remove("sidebar-open");
    const sidebar = document.getElementById("sidebar");
    if (sidebar) sidebar.classList.remove("open");
}

const menuToggleBtn = document.getElementById("menuToggle");
const sidebarOverlayEl = document.getElementById("sidebarOverlay");

if (menuToggleBtn) {
    menuToggleBtn.addEventListener("click", function(e) {
        e.preventDefault();
        e.stopPropagation();
        const sidebar = document.getElementById("sidebar");
        if (sidebar) {
            if (sidebar.classList.contains("open")) {
                closeSidebar();
            } else {
                openSidebar();
            }
        }
    });
}

if (sidebarOverlayEl) {
    sidebarOverlayEl.addEventListener("click", closeSidebar);
}

document.addEventListener("click", function(e) {
    const catBtn = e.target.closest(".cat-btn");
    if (catBtn && window.innerWidth <= 1023) {
        closeSidebar();
    }
});

// Sincroniza buscas
const searchInputMobile = document.getElementById("searchInput");
const searchInputDesktop = document.getElementById("searchInputDesktop");

if (searchInputMobile) {
    searchInputMobile.addEventListener("input", (e) => {
        searchTerm = e.target.value;
        if (searchInputDesktop) searchInputDesktop.value = e.target.value;
        renderGrid();
    });
}

if (searchInputDesktop) {
    searchInputDesktop.addEventListener("input", (e) => {
        searchTerm = e.target.value;
        if (searchInputMobile) searchInputMobile.value = e.target.value;
        renderGrid();
    });
}

// ===== ZOOM =====
const zoomClose = document.getElementById("zoomClose");
const zoomOverlay = document.getElementById("zoomOverlay");
if (zoomClose) {
    zoomClose.addEventListener("click", () => {
        if (zoomOverlay) zoomOverlay.classList.remove("open");
    });
}
if (zoomOverlay) {
    zoomOverlay.addEventListener("click", (e) => {
        if (e.target.id === "zoomOverlay") zoomOverlay.classList.remove("open");
    });
}

// ===== MODALS =====
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.add("open");
        modal.style.display = "flex";
        document.body.style.overflow = "hidden";
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.remove("open");
        modal.style.display = "none";
        document.body.style.overflow = "auto";
    }
}

document.querySelectorAll("[data-close]").forEach(btn => {
    btn.addEventListener("click", () => closeModal(btn.dataset.close));
});

document.querySelectorAll(".modal-overlay").forEach(ov => {
    ov.addEventListener("click", (e) => {
        if (e.target === ov) {
            ov.classList.remove("open");
            ov.style.display = "none";
            document.body.style.overflow = "auto";
        }
    });
});

// ===== LOGIN HINT =====
const loginHint = document.getElementById("loginHint");
if (loginHint) {
    loginHint.textContent = isFirebaseConfigured
        ? "Use o e-mail e senha do administrador cadastrado no Firebase Authentication."
        : "Modo demonstração: informe qualquer e-mail e a senha demo (admin123).";
}

// ===== LOGOUT =====
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
    logoutBtn.addEventListener("click", async function() {
        await dataLayer.logout();
        isAdmin = false;
        document.body.classList.remove('admin-mode');
        const badge = document.getElementById('adminBadge');
        if (badge) badge.style.display = 'none';
        let url = window.location.href;
        url = url.replace('adm', '').replace('?adm', '').replace('&adm', '');
        window.history.replaceState({}, '', url);
        toast('Sessão encerrada.', 'ok');
    });
}

// ===== AUTH =====
dataLayer.onAuth((authed) => {
    isAdmin = authed;
    document.body.classList.toggle("admin-mode", isAdmin);
    if (isAdmin) renderAll();
});

// ===== PAINEL ADMIN =====
const openPanelBtn = document.getElementById("openPanelBtn");
if (openPanelBtn) {
    openPanelBtn.addEventListener("click", function(e) {
        e.preventDefault();
        e.stopPropagation();
        abrirPainelAdmin();
    });
    openPanelBtn.addEventListener("touchstart", function(e) {
        e.preventDefault();
        e.stopPropagation();
        abrirPainelAdmin();
    });
}

function abrirPainelAdmin() {
    renderCategorySelect();
    renderAdminList();
    openModal("panelModal");
}

// ===== PRODUCT FORM =====
const productCategorySelect = document.getElementById("productCategorySelect");
if (productCategorySelect) {
    productCategorySelect.addEventListener("change", toggleNewCategoryField);
}

const productForm = document.getElementById("productForm");
if (productForm) {
    productForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const msg = document.getElementById("productMsg");
        if (msg) msg.className = "form-msg";

        const name = document.getElementById("productName");
        const price = document.getElementById("productPrice");
        const categorySelect = document.getElementById("productCategorySelect");
        const categoryNew = document.getElementById("productCategoryNew");
        const desc = document.getElementById("productDesc");

        if (!name || !price || !categorySelect) return;

        const nameValue = name.value.trim();
        const priceValue = parseFloat(price.value);
        let categoryValue = categorySelect.value;
        if (categoryValue === "__new__" && categoryNew) categoryValue = categoryNew.value.trim();
        const descriptionValue = desc ? desc.value.trim() : "";

        if (!nameValue || !priceValue || !categoryValue) {
            if (msg) {
                msg.textContent = "Preencha nome, preço e categoria.";
                msg.classList.add("show", "error");
            }
            return;
        }

        const btn = document.getElementById("saveProductBtn");
        if (btn) { btn.disabled = true; btn.textContent = "Salvando..."; }
        try {
            await dataLayer.addProduct({ name: nameValue, price: priceValue, category: categoryValue, description: descriptionValue }, pendingImageData);
            toast("Produto salvo com sucesso!", "ok");
            if (productForm) productForm.reset();
            pendingImageData = null;
            const imgDrop = document.getElementById("imgDrop");
            if (imgDrop) {
                imgDrop.classList.remove("has-img");
                imgDrop.innerHTML = `<span id="imgDropText">Toque para escolher uma foto</span><input type="file" id="productImage" accept="image/*">`;
            }
            bindImageInput();
            renderCategorySelect();
            renderAdminList();
        } catch (err) {
            if (msg) {
                msg.textContent = "Erro ao salvar: " + (err.message || err);
                msg.classList.add("show", "error");
            }
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = "Salvar produto"; }
        }
    });
}

// ===== IMAGE INPUT =====
function bindImageInput() {
    const input = document.getElementById("productImage");
    if (input) {
        input.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (!file) return;
            pendingImageData = file;
            const reader = new FileReader();
            reader.onload = (ev) => {
                const imgDrop = document.getElementById("imgDrop");
                if (imgDrop) {
                    imgDrop.classList.add("has-img");
                    imgDrop.innerHTML = `<img src="${ev.target.result}" alt="Pré-visualização"><input type="file" id="productImage" accept="image/*">`;
                }
                bindImageInput();
            };
            reader.readAsDataURL(file);
        });
    }
}
bindImageInput();

// ===== INICIAR CARRINHO =====
loadCart();

console.log("🚀 Site carregado com sucesso!");
console.log("📱 Modo admin:", isAdmin ? "ATIVADO" : "DESATIVADO");
console.log("💡 Para ativar, adicione ?adm na URL");