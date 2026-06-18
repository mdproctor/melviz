// Melviz Examples Gallery Application
let samplesData = null;
let currentDashboard = null;
let currentSite = null;

// DOM Elements
const categoriesNav = document.getElementById('categories-nav');
const searchInput = document.getElementById('search');
const welcomeScreen = document.getElementById('welcome-screen');
const dashboardContainer = document.getElementById('dashboard-container');
const dashboardTarget = document.getElementById('dashboard-target');
const currentDashboardName = document.getElementById('current-dashboard-name');
const dashboardCount = document.getElementById('dashboard-count');
const statsContainer = document.getElementById('stats');
const openNewWindowBtn = document.getElementById('open-new-window');
const reloadDashboardBtn = document.getElementById('reload-dashboard');
const sidebar = document.getElementById('sidebar');
const sidebarToggleBtn = document.getElementById('sidebar-toggle');
const codeSidebar = document.getElementById('code-sidebar');
const codeToggleBtn = document.getElementById('code-toggle');
const sourceCodeElement = document.getElementById('source-code');

// Load samples.json
async function loadSamples() {
    try {
        const response = await fetch('samples.json');
        samplesData = await response.json();
        initializeApp();
    } catch (error) {
        console.error('Error loading samples:', error);
        categoriesNav.innerHTML = '<div style="padding: 20px; color: red;">Error loading samples.json</div>';
    }
}

// Initialize the application
function initializeApp() {
    dashboardCount.textContent = `${samplesData.totalDashboards} dashboards`;
    renderCategories();
    renderStats();
    setupEventListeners();

    // Check if there's a dashboard in the URL hash
    const hash = window.location.hash.slice(1);
    if (hash) {
        const [category, dashboardPath] = hash.split('/');
        loadDashboardFromHash(category, dashboardPath);
    }
}

// Render categories and dashboards
function renderCategories() {
    categoriesNav.innerHTML = '';

    samplesData.categories.forEach(category => {
        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'category';

        const categoryHeader = document.createElement('div');
        categoryHeader.className = 'category-header';
        categoryHeader.innerHTML = `
            <span>${category.category}</span>
            <span class="category-toggle">▼</span>
        `;

        const categoryItems = document.createElement('div');
        categoryItems.className = 'category-items';

        category.dashboards.forEach(dashboard => {
            const dashboardItem = document.createElement('div');
            dashboardItem.className = 'dashboard-item';
            dashboardItem.textContent = dashboard.name;
            dashboardItem.dataset.path = dashboard.path;
            dashboardItem.dataset.name = dashboard.name;
            dashboardItem.dataset.category = category.category;

            dashboardItem.addEventListener('click', () => {
                loadDashboard(dashboard);
            });

            categoryItems.appendChild(dashboardItem);
        });

        categoryHeader.addEventListener('click', () => {
            categoryDiv.classList.toggle('collapsed');
        });

        categoryDiv.appendChild(categoryHeader);
        categoryDiv.appendChild(categoryItems);
        categoriesNav.appendChild(categoryDiv);
    });
}

// Render statistics
function renderStats() {
    const categoryCount = samplesData.categories.length;
    const totalDashboards = samplesData.totalDashboards;

    statsContainer.innerHTML = `
        <div class="stat-card">
            <h3>Total Dashboards</h3>
            <div class="value">${totalDashboards}</div>
        </div>
        <div class="stat-card">
            <h3>Categories</h3>
            <div class="value">${categoryCount}</div>
        </div>
    `;
}

// Load a dashboard
function loadDashboard(dashboard) {
    currentDashboard = dashboard;
    propertyOverrides = {};

    // Update active state
    document.querySelectorAll('.dashboard-item').forEach(item => {
        item.classList.remove('active');
    });
    const activeItem = document.querySelector(`[data-path="${dashboard.path}"]`);
    if (activeItem) {
        activeItem.classList.add('active');
    }

    // Update URL hash
    window.location.hash = `${dashboard.category}/${encodeURIComponent(dashboard.path)}`;

    // Show dashboard container
    welcomeScreen.style.display = 'none';
    dashboardContainer.style.display = 'flex';
    currentDashboardName.textContent = dashboard.name;

    // Load dashboard in target div
    loadDashboardInTarget(dashboard.path);

    // Load dashboard source code
    loadDashboardSourceCode(dashboard.path);
}

// Load dashboard from URL hash
function loadDashboardFromHash(category, dashboardPath) {
    const decodedPath = decodeURIComponent(dashboardPath);

    for (const cat of samplesData.categories) {
        for (const dashboard of cat.dashboards) {
            if (dashboard.path === decodedPath) {
                loadDashboard(dashboard);
                return;
            }
        }
    }
}

// Property overrides from the config bar
let propertyOverrides = {};

function extractUrlProperties(yamlText) {
    const props = {};
    const match = yamlText.match(/^properties:\s*\n((?:[ \t]+\S.*\n)*)/m);
    if (!match) return props;
    for (const line of match[1].split('\n')) {
        const kv = line.match(/^\s+(\w+):\s*(.+)/);
        if (kv && (kv[2].includes('http') || kv[2].includes('localhost') || kv[1].toLowerCase().includes('url') || kv[2].includes('data/') || kv[2].includes('metrics') || kv[2].includes('/api/'))) {
            props[kv[1]] = kv[2].trim();
        }
    }
    return props;
}

function renderConfigBar(urlProps, dashboardPath) {
    const configBar = document.getElementById('config-bar');
    const keys = Object.keys(urlProps);
    if (keys.length === 0) {
        configBar.style.display = 'none';
        return;
    }
    configBar.style.display = 'flex';
    configBar.innerHTML = '';
    for (const key of keys) {
        const defaultVal = urlProps[key];
        const override = propertyOverrides[key] || '';
        const field = document.createElement('div');
        field.className = 'config-field';
        field.innerHTML = `<label>${key}</label><input type="text" data-prop="${key}" value="${override.replace(/"/g, '&quot;')}" placeholder="${defaultVal.replace(/"/g, '&quot;')}" />`;
        configBar.appendChild(field);
    }
    const applyBtn = document.createElement('button');
    applyBtn.className = 'config-apply';
    applyBtn.textContent = 'Apply';
    applyBtn.addEventListener('click', () => {
        for (const input of configBar.querySelectorAll('input[data-prop]')) {
            const val = input.value.trim();
            if (val) propertyOverrides[input.dataset.prop] = val;
            else delete propertyOverrides[input.dataset.prop];
        }
        loadDashboardInTarget(dashboardPath);
    });
    configBar.appendChild(applyBtn);
    if (Object.keys(propertyOverrides).length > 0) {
        const status = document.createElement('span');
        status.className = 'config-status';
        status.textContent = 'Using custom URLs';
        configBar.appendChild(status);
    }
}

function applyPropertyOverrides(yamlText) {
    let result = yamlText;
    for (const [key, value] of Object.entries(propertyOverrides)) {
        const re = new RegExp(`(^\\s+${key}:\\s*).+`, 'm');
        result = result.replace(re, `$1${value}`);
    }
    return result;
}

// Load dashboard in target div using casehub loadSite
async function loadDashboardInTarget(dashboardPath) {
    try {
        const response = await fetch(`dashboards/${dashboardPath}`);
        let yamlText = await response.text();

        const urlProps = extractUrlProperties(yamlText);
        renderConfigBar(urlProps, dashboardPath);
        yamlText = applyPropertyOverrides(yamlText);

        if (currentSite) {
            currentSite.dispose();
            currentSite = null;
        }

        dashboardTarget.innerHTML = "";
        dashboardTarget.className = "";

        // Resolve base URL for relative dataset paths (e.g. url: metrics)
        const dashboardDir = dashboardPath.substring(0, dashboardPath.lastIndexOf('/') + 1);
        const baseUrl = `${window.location.origin}/dashboards/${dashboardDir}`;

        // Fallback fetch: when the real fetch fails (CORS, missing infra, unresolved
        // ${property} vars), serve mock Prometheus metrics so the gallery always shows
        // something useful.
        const galleryFetch = async (url, init) => {
            try {
                const urlStr = typeof url === 'string' ? url : url.toString();
                if (urlStr.includes('${')) {
                    throw new Error('Unresolved property variable');
                }
                const resp = await fetch(url, init);
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                return resp;
            } catch {
                const urlStr = typeof url === 'string' ? url : url.toString();
                const isRangeQuery = urlStr.includes('[') || urlStr.includes('%5B');
                let mockFile = 'prometheus-metrics.txt';
                if (urlStr.includes('/images/json')) mockFile = 'podman-images.json';
                else if (urlStr.includes('/containers/json')) mockFile = 'podman-containers.json';
                else if (urlStr.includes('/api/v1/query') && isRangeQuery) mockFile = 'prometheus-api-matrix.json';
                else if (urlStr.includes('/api/v1/query')) mockFile = 'prometheus-api-response.json';
                const mockResp = await fetch(`${window.location.origin}/mock-data/${mockFile}`);
                return mockResp;
            }
        };

        currentSite = await window.casehub.loadSite(dashboardTarget, yamlText, { baseUrl, fetch: galleryFetch });
    } catch (error) {
        console.error('Error loading dashboard:', error);
        dashboardTarget.innerHTML = `
            <div style="padding: 24px; color: #d32f2f; background: #fce4ec; border-radius: 8px; margin: 16px;">
                <strong>Error loading dashboard</strong>
                <p style="margin-top: 8px; font-family: monospace; font-size: 13px;">${error.message || error}</p>
            </div>
        `;
    }
}

// Load and display dashboard source code
async function loadDashboardSourceCode(dashboardPath) {
    try {
        const response = await fetch(`dashboards/${dashboardPath}`);
        const sourceCode = await response.text();
        sourceCodeElement.textContent = sourceCode;

        // Show the code toggle button
        codeToggleBtn.style.display = 'flex';
    } catch (error) {
        console.error('Error loading dashboard source:', error);
        sourceCodeElement.textContent = 'Error loading source code';
    }
}


// Toggle sidebar collapsed state
function toggleSidebar() {
    sidebar.classList.toggle('collapsed');
    sidebarToggleBtn.classList.toggle('collapsed');
}


// Toggle code sidebar collapsed state
function toggleCodeSidebar() {
    codeSidebar.classList.toggle('collapsed');
    codeToggleBtn.classList.toggle('collapsed');
}

// Setup event listeners
function setupEventListeners() {
    // Sidebar toggle
    sidebarToggleBtn.addEventListener('click', toggleSidebar);

    // Code sidebar toggle
    codeToggleBtn.addEventListener('click', toggleCodeSidebar);

    // Search functionality
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();

        document.querySelectorAll('.dashboard-item').forEach(item => {
            const name = item.dataset.name.toLowerCase();
            const category = item.dataset.category.toLowerCase();

            if (name.includes(searchTerm) || category.includes(searchTerm)) {
                item.classList.remove('hidden');
            } else {
                item.classList.add('hidden');
            }
        });

        // Hide empty categories
        document.querySelectorAll('.category').forEach(category => {
            const visibleItems = category.querySelectorAll('.dashboard-item:not(.hidden)');
            if (visibleItems.length === 0 && searchTerm !== '') {
                category.style.display = 'none';
            } else {
                category.style.display = 'block';
            }
        });
    });

    // Open in new window
    openNewWindowBtn.addEventListener('click', () => {
        if (currentDashboard) {
            const url = `${window.location.origin}${window.location.pathname}#${currentDashboard.category}/${encodeURIComponent(currentDashboard.path)}`;
            window.open(url, '_blank');
        }
    });

    // Reload dashboard
    reloadDashboardBtn.addEventListener('click', () => {
        if (currentDashboard) {
            loadDashboard(currentDashboard);
        }
    });

    // Handle browser back/forward
    window.addEventListener('hashchange', () => {
        const hash = window.location.hash.slice(1);
        if (hash) {
            const [category, dashboardPath] = hash.split('/');
            loadDashboardFromHash(category, dashboardPath);
        } else {
            welcomeScreen.style.display = 'flex';
            dashboardContainer.style.display = 'none';
            codeToggleBtn.style.display = 'none';
            sourceCodeElement.textContent = 'Select a dashboard to view its source code';
            document.querySelectorAll('.dashboard-item').forEach(item => {
                item.classList.remove('active');
            });
        }
    });
}

// Load samples when page loads
loadSamples();
