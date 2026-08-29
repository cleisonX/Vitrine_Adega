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
    const box = $("#toastBox");
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

if (!isFirebaseConfigured) {
    $("#demoBannerWrap").innerHTML = `
        <div class="demo-banner">
            <span>⚠️</span>
            <div>
                <b>Modo demonstração ativo.</b> Os produtos estão salvos apenas neste navegador.
                Para publicar, preencha o FIREBASE_CONFIG no código.
            </div>
        </div>`;
}

function getCategories() {
    const cats = new Set(PRODUCTS.map(p => p.category).filter(Boolean));
    return ["Todos", ...Array.from(cats).sort()];
}

function renderCategories() {
    const list = $("#categoryList");
    const cats = getCategories();
    list.innerHTML = cats.map(cat => {
        const count = cat === "Todos" ? PRODUCTS.length : PRODUCTS.filter(p => p.category === cat).length;
        return `<li>
            <button class="cat-btn ${cat === activeCategory ? "active" : ""}" data-cat="${escapeHtml(cat)}">
                <span>${escapeHtml(cat)}</span><span class="count">${count}</span>
            </button>
        </li>`;
    }).join("");
    $$(".cat-btn").forEach(btn => btn.addEventListener("click", () => {
        activeCategory = btn.dataset.cat;
        closeSidebar();
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

function waLink(p) {
    const msg = `Olá! Vi na Vitrine Adega e Tabacaria e tenho interesse em:\n*${p.name}*\nPreço: ${money(p.price)}\n\nPoderia me passar mais informações?`;
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
}

function renderGrid() {
    const grid = $("#productGrid");
    const list = filteredProducts();
    $("#gridTitle").textContent = activeCategory === "Todos" ? "Todos os produtos" : activeCategory;
    $("#gridCount").textContent = `${list.length} produto${list.length === 1 ? "" : "s"}`;
    $("#emptyState").hidden = list.length > 0;

    grid.innerHTML = list.map(p => {
        const safeName = escapeHtml(p.name);
        const safeDesc = escapeHtml(p.description || "");
        const safeCategory = escapeHtml(p.category || "Geral");
        return `
            <article class="card">
                <button class="card-del" data-del="${p.id}" title="Excluir produto">🗑</button>
                <div class="card-img-wrap" data-zoom="${p.imageUrl || ""}" data-name="${safeName}">
                    <img src="${p.imageUrl || placeholderImg()}" alt="${safeName}" loading="lazy">
                    <span class="card-zoom-icon">🔍</span>
                </div>
                <div class="card-body">
                    <span class="card-category">${safeCategory}</span>
                    <h3 class="card-name">${safeName}</h3>
                    ${safeDesc ? `<p class="card-desc">${safeDesc}</p>` : ""}
                    <p class="card-price">${money(p.price)}</p>
                    <a class="btn btn-whatsapp" target="_blank" rel="noopener" href="${waLink(p)}">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.29-1.39a9.9 9.9 0 0 0 4.75 1.21h.01c5.46 0 9.9-4.45 9.9-9.91C21.96 6.45 17.5 2 12.04 2Zm0 18.02h-.01a8.1 8.1 0 0 1-4.13-1.13l-.3-.17-3.14.82.84-3.06-.19-.32a8.08 8.08 0 0 1-1.24-4.25c0-4.48 3.65-8.12 8.14-8.12 2.17 0 4.21.85 5.75 2.39a8.06 8.06 0 0 1 2.38 5.75c0 4.48-3.65 8.09-8.1 8.09Zm4.44-6.06c-.24-.12-1.43-.7-1.65-.79-.22-.08-.38-.12-.55.12-.16.24-.63.79-.77.95-.14.16-.28.18-.52.06-.24-.12-1.02-.38-1.94-1.2-.72-.64-1.2-1.43-1.35-1.67-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.55-1.32-.75-1.8-.2-.48-.4-.42-.55-.42-.14 0-.3-.02-.46-.02-.16 0-.42.06-.64.3-.22.24-.85.83-.85 2.02 0 1.19.87 2.34 1 2.5.12.16 1.71 2.61 4.14 3.66.58.25 1.03.4 1.38.51.58.18 1.11.16 1.53.1.47-.07 1.43-.58 1.63-1.15.2-.56.2-1.04.14-1.15-.06-.1-.22-.16-.46-.28Z"/></svg>
                        Pedir no WhatsApp
                    </a>
                </div>
            </article>
        `;
    }).join("");

    $$("[data-zoom]").forEach(el => el.addEventListener("click", () => {
        const src = el.dataset.zoom;
        if (!src) return;
        $("#zoomImg").src = src;
        $("#zoomImg").alt = el.dataset.name || "Produto";
        $("#zoomOverlay").classList.add("open");
    }));
    $$("[data-del]").forEach(btn => btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("Excluir este produto do catálogo?")) return;
        await dataLayer.deleteProduct(btn.dataset.del);
        toast("Produto excluído.", "ok");
    }));
}

function placeholderImg() {
    return "data:image/svg+xml;utf8," + encodeURIComponent(`
        <svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'>
            <rect width='100%' height='100%' fill='#171412'/>
            <text x='50%' y='50%' fill='#ff8a1e' font-size='20' font-family='sans-serif' text-anchor='middle' dy='.3em'>Sem foto</text>
        </svg>`);
}

function renderAdminList() {
    const box = $("#adminProductList");
    $("#adminListCount").textContent = `Produtos cadastrados (${PRODUCTS.length})`;
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

    $$("[data-del2]").forEach(btn => btn.addEventListener("click", async () => {
        if (!confirm("Excluir este produto do catálogo?")) return;
        await dataLayer.deleteProduct(btn.dataset.del2);
        toast("Produto excluído.", "ok");
    }));
}

function renderCategorySelect() {
    const sel = $("#productCategorySelect");
    const cats = Array.from(new Set(PRODUCTS.map(p => p.category).filter(Boolean))).sort();
    sel.innerHTML = cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("") + `<option value="__new__">+ Nova categoria</option>`;
    sel.value = cats.length ? cats[0] : "__new__";
    toggleNewCategoryField();
}

function toggleNewCategoryField() {
    const isNew = $("#productCategorySelect").value === "__new__";
    $("#newCategoryField").style.display = isNew ? "block" : "none";
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

function openSidebar() { document.body.classList.add("sidebar-open"); $("#sidebar").classList.add("open"); }
function closeSidebar() { document.body.classList.remove("sidebar-open"); $("#sidebar").classList.remove("open"); }
$("#menuToggle").addEventListener("click", openSidebar);
$("#sidebarClose").addEventListener("click", closeSidebar);
$("#sidebarOverlay").addEventListener("click", closeSidebar);

// Sincroniza as duas buscas (mobile e desktop)
const searchInputMobile = $("#searchInput");
const searchInputDesktop = $("#searchInputDesktop");

searchInputMobile.addEventListener("input", (e) => {
    searchTerm = e.target.value;
    searchInputDesktop.value = e.target.value;
    renderGrid();
});

searchInputDesktop.addEventListener("input", (e) => {
    searchTerm = e.target.value;
    searchInputMobile.value = e.target.value;
    renderGrid();
});

$("#zoomClose").addEventListener("click", () => $("#zoomOverlay").classList.remove("open"));
$("#zoomOverlay").addEventListener("click", (e) => { if (e.target.id === "zoomOverlay") $("#zoomOverlay").classList.remove("open"); });

function openModal(id) { $("#" + id).classList.add("open"); }
function closeModal(id) { $("#" + id).classList.remove("open"); }
$$("[data-close]").forEach(btn => btn.addEventListener("click", () => closeModal(btn.dataset.close)));
$$(".modal-overlay").forEach(ov => ov.addEventListener("click", (e) => { if (e.target === ov) ov.classList.remove("open"); }));

$("#loginHint").textContent = isFirebaseConfigured
    ? "Use o e-mail e senha do administrador cadastrado no Firebase Authentication."
    : "Modo demonstração: informe qualquer e-mail e a senha demo (admin123).";

$("#loginBtn").addEventListener("click", () => openModal("loginModal"));

$("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#loginMsg");
    msg.className = "form-msg";
    try {
        await dataLayer.login($("#loginEmail").value, $("#loginPassword").value);
        closeModal("loginModal");
        toast("Login realizado com sucesso!", "ok");
        $("#loginForm").reset();
    } catch (err) {
        msg.textContent = err.message || "Não foi possível entrar. Verifique os dados.";
        msg.classList.add("show", "error");
    }
});

$("#logoutBtn").addEventListener("click", async () => {
    await dataLayer.logout();
    toast("Sessão encerrada.", "ok");
});

dataLayer.onAuth((authed) => {
    isAdmin = authed;
    document.body.classList.toggle("admin-mode", isAdmin);
    if (isAdmin) renderAll();
});

$("#openPanelBtn").addEventListener("click", () => {
    renderCategorySelect();
    renderAdminList();
    openModal("panelModal");
});

$("#productCategorySelect").addEventListener("change", toggleNewCategoryField);

$("#productForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#productMsg");
    msg.className = "form-msg";

    const name = $("#productName").value.trim();
    const price = parseFloat($("#productPrice").value);
    let category = $("#productCategorySelect").value;
    if (category === "__new__") category = $("#productCategoryNew").value.trim();
    const description = $("#productDesc").value.trim();

    if (!name || !price || !category) {
        msg.textContent = "Preencha nome, preço e categoria.";
        msg.classList.add("show", "error");
        return;
    }

    const btn = $("#saveProductBtn");
    btn.disabled = true; btn.textContent = "Salvando...";
    try {
        await dataLayer.addProduct({ name, price, category, description }, pendingImageData);
        toast("Produto salvo com sucesso!", "ok");
        $("#productForm").reset();
        pendingImageData = null;
        $("#imgDrop").classList.remove("has-img");
        $("#imgDrop").innerHTML = `<span id="imgDropText">Toque para escolher uma foto</span><input type="file" id="productImage" accept="image/*">`;
        bindImageInput();
        renderCategorySelect();
    } catch (err) {
        msg.textContent = "Erro ao salvar: " + (err.message || err);
        msg.classList.add("show", "error");
    } finally {
        btn.disabled = false; btn.textContent = "Salvar produto";
    }
});

function bindImageInput() {
    const input = $("#productImage");
    input.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        pendingImageData = file;
        const reader = new FileReader();
        reader.onload = (ev) => {
            $("#imgDrop").classList.add("has-img");
            $("#imgDrop").innerHTML = `<img src="${ev.target.result}" alt="Pré-visualização"><input type="file" id="productImage" accept="image/*">`;
            bindImageInput();
        };
        reader.readAsDataURL(file);
    });
}
bindImageInput();