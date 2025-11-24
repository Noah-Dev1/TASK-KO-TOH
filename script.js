// =========================================
// CONFIGURATION 
// =========================================

const firebaseConfig = {
    apiKey: "AIzaSyAg2SFXRGI2QvRmHWAs8P4UWoehtmGlniw",
    authDomain: "task-ko-toh.firebaseapp.com",
    projectId: "task-ko-toh",
    storageBucket: "task-ko-toh.firebasestorage.app",
    messagingSenderId: "333405520584",
    appId: "1:333405520584:web:cf83fb5d8aaf7b1b4d9bfd"
};

const EMAIL_CONFIG = {
    serviceId: 'service_5108w0i',
    publicKey: 'sGzOV8JPW3Pr3hNX3',
    templates: {
        overdue: 'template_ea6ejpe',
        upcoming: 'template_p3w05gl',
    }
};

// ==========================================
// FIREBASE INITIALIZATION
// ==========================================

firebase.initializeApp(firebaseConfig);

const db = firebase.firestore();
const auth = firebase.auth();

if (typeof emailjs !== 'undefined' && EMAIL_CONFIG.publicKey && EMAIL_CONFIG.publicKey !== 'YOUR_EMAILJS_PUBLIC_KEY') {
    emailjs.init(EMAIL_CONFIG.publicKey);
}

// ==========================================
// APPLICATION STATE
// ==========================================

let currentUser = null;
let tasks = [];
let editingTaskId = null;
let isOnline = navigator.onLine;

// ==========================================
// DOM ELEMENTS
// ==========================================

const loadingScreen = document.getElementById('loadingScreen');
const authScreen = document.getElementById('authScreen');
const dashboardScreen = document.getElementById('dashboardScreen');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const taskModal = document.getElementById('taskModal');
const tasksContainer = document.getElementById('tasksContainer');
const emptyState = document.getElementById('emptyState');

// ==========================================
// INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    setupNetworkListeners();
    setMinDateTime();
    showLoadingScreen();

    setTimeout(() => {
        hideLoadingScreen();
    }, 1000);
});

// ==========================================
// LOADING SCREEN
// ==========================================

function showLoadingScreen() {
    if (loadingScreen) loadingScreen.classList.remove('hidden');
    if (authScreen) authScreen.classList.add('hidden');
    if (dashboardScreen) dashboardScreen.classList.add('hidden');
}

function hideLoadingScreen() {
    if (loadingScreen) loadingScreen.classList.add('hidden');
}

// ==========================================
// NETWORK MONITORING
// ==========================================

function setupNetworkListeners() {
    window.addEventListener('online', () => {
        isOnline = true;
        hideOfflineIndicator();
        showToast('success', 'Back Online', 'Connection restored');
    });

    window.addEventListener('offline', () => {
        isOnline = false;
        showOfflineIndicator();
        showToast('warning', 'Offline', 'Some features may be limited');
    });
}

function showOfflineIndicator() {
    let indicator = document.getElementById('offlineIndicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'offlineIndicator';
        indicator.className = 'offline-indicator';
        indicator.innerHTML = '<i class="fas fa-wifi-slash mr-2"></i>Offline';
        document.body.appendChild(indicator);
    }
    indicator.classList.add('show');
}

function hideOfflineIndicator() {
    const indicator = document.getElementById('offlineIndicator');
    if (indicator) {
        indicator.classList.remove('show');
    }
}

// ==========================================
// AUTHENTICATION
// ==========================================

auth.onAuthStateChanged(async (user) => {
    hideLoadingScreen();

    if (user) {
        try {
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                currentUser = {
                    id: user.uid,
                    name: userData.name,
                    email: userData.email,
                    grade: userData.grade
                };
                showDashboard();
            } else {
                await auth.signOut();
            }
        } catch (error) {
            console.error('Error fetching user data:', error);
            showToast('error', 'Error', 'Failed to load user data');
            await auth.signOut();
        }
    } else {
        currentUser = null;
        tasks = [];
        showAuthScreen();
    }
});

function showAuthScreen() {
    if (authScreen) authScreen.classList.remove('hidden');
    if (dashboardScreen) dashboardScreen.classList.add('hidden');
    const greeting = document.getElementById('userGreeting');
    const logoutBtn = document.getElementById('logoutBtn');
    if (greeting) greeting.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');
}

function showDashboard() {
    if (authScreen) authScreen.classList.add('hidden');
    if (dashboardScreen) dashboardScreen.classList.remove('hidden');
    const greeting = document.getElementById('userGreeting');
    const logoutBtn = document.getElementById('logoutBtn');
    if (greeting) {
        greeting.textContent = `Hello, ${currentUser.name}!`;
        greeting.classList.remove('hidden');
    }
    if (logoutBtn) logoutBtn.classList.remove('hidden');

    loadTasks();
    setupDailyEmailCheck();
}

// ==========================================
// EVENT LISTENERS SETUP
// ==========================================

function setupEventListeners() {
    const showRegisterBtn = document.getElementById('showRegister');
    const showLoginBtn = document.getElementById('showLogin');
    if (showRegisterBtn) showRegisterBtn.addEventListener('click', () => {
        document.getElementById('loginForm').classList.add('hidden');
        document.getElementById('registerForm').classList.remove('hidden');
    });
    if (showLoginBtn) showLoginBtn.addEventListener('click', () => {
        document.getElementById('registerForm').classList.add('hidden');
        document.getElementById('loginForm').classList.remove('hidden');
    });

    const loginEl = document.getElementById('loginFormElement');
    const registerEl = document.getElementById('registerFormElement');
    const taskForm = document.getElementById('taskForm');
    if (loginEl) loginEl.addEventListener('submit', handleLogin);
    if (registerEl) registerEl.addEventListener('submit', handleRegister);
    if (taskForm) taskForm.addEventListener('submit', handleTaskSubmit);

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

    const addTaskBtn = document.getElementById('addTaskBtn');
    if (addTaskBtn) addTaskBtn.addEventListener('click', () => openTaskModal());

    const checkDeadlinesBtn = document.getElementById('checkDeadlinesBtn');
    if (checkDeadlinesBtn) checkDeadlinesBtn.addEventListener('click', checkDeadlines);

    const closeModalBtn = document.getElementById('closeModal');
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeTaskModal);

    const cancelBtn = document.getElementById('cancelBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', closeTaskModal);

    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.addEventListener('input', filterTasks);

    const priorityFilter = document.getElementById('priorityFilter');
    if (priorityFilter) priorityFilter.addEventListener('change', filterTasks);

    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter) statusFilter.addEventListener('change', filterTasks);

    if (taskModal) taskModal.addEventListener('click', (e) => {
        if (e.target === taskModal) closeTaskModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && taskModal && !taskModal.classList.contains('hidden')) {
            closeTaskModal();
        }
        if (e.ctrlKey && e.key === 'n') {
            e.preventDefault();
            if (currentUser) openTaskModal();
        }
    });
}
// ==========================================
// AUTHENTICATION HANDLERS
// ==========================================

async function handleLogin(e) {
    e.preventDefault();
    if (!isOnline) { showToast('error', 'Offline', 'Please check your internet connection'); return; }

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    const loginBtn = document.getElementById('loginBtn');
    const loginBtnText = document.getElementById('loginBtnText');
    const loginSpinner = document.getElementById('loginSpinner');

    loginBtn.disabled = true;
    loginBtnText.textContent = 'Signing In...';
    loginSpinner.classList.remove('hidden');

    try {
        await auth.signInWithEmailAndPassword(email, password);
        showToast('success', 'Welcome back!', 'Successfully logged in');
    } catch (error) {
        console.error('Login error:', error);
        let errorMessage = 'Invalid email or password';
        switch (error.code) {
            case 'auth/user-not-found': errorMessage = 'No account found with this email'; break;
            case 'auth/wrong-password': errorMessage = 'Incorrect password'; break;
            case 'auth/invalid-email': errorMessage = 'Invalid email address'; break;
            case 'auth/too-many-requests': errorMessage = 'Too many failed attempts. Please try again later'; break;
        }
        showToast('error', 'Login Failed', errorMessage);
    } finally {
        loginBtn.disabled = false;
        loginBtnText.textContent = 'Sign In';
        loginSpinner.classList.add('hidden');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    if (!isOnline) { showToast('error', 'Offline', 'Please check your internet connection'); return; }

    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const grade = document.getElementById('registerGrade').value;
    const password = document.getElementById('registerPassword').value;

    if (name.length < 2) { showToast('error', 'Invalid Name', 'Name must be at least 2 characters'); return; }
    if (grade !== "11" && grade !== "12") { showToast('error', 'Invalid Grade', 'Only Grade 11 and Grade 12 are allowed'); return; }
    if (password.length < 6) { showToast('error', 'Weak Password', 'Password must be at least 6 characters'); return; }

    const registerBtn = document.getElementById('registerBtn');
    const registerBtnText = document.getElementById('registerBtnText');
    const registerSpinner = document.getElementById('registerSpinner');

    registerBtn.disabled = true;
    registerBtnText.textContent = 'Creating Account...';
    registerSpinner.classList.remove('hidden');

    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        await user.updateProfile({ displayName: name });
        await db.collection('users').doc(user.uid).set({
            name, email, grade,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
        });

        try { if (EMAIL_CONFIG.publicKey) await sendWelcomeEmail(name, email); } catch(e){ console.error('Welcome email failed:', e); }

        showToast('success', 'Account Created!', 'Welcome to Task Ko To!');
    } catch (error) {
        console.error('Registration error:', error);
        let errorMessage = 'Failed to create account';
        switch (error.code) {
            case 'auth/email-already-in-use': errorMessage = 'Email already registered'; break;
            case 'auth/invalid-email': errorMessage = 'Invalid email address'; break;
            case 'auth/weak-password': errorMessage = 'Password is too weak'; break;
        }
        showToast('error', 'Registration Failed', errorMessage);
    } finally {
        registerBtn.disabled = false;
        registerBtnText.textContent = 'Create Account';
        registerSpinner.classList.add('hidden');
    }
}

async function handleLogout() {
    try {
        await auth.signOut();
        showToast('info', 'Logged Out', 'See you next time!');
    } catch (error) {
        console.error('Logout error:', error);
        showToast('error', 'Logout Failed', 'Please try again');
    }
}

// ==========================================
// TASK MANAGEMENT
// ==========================================

async function loadTasks() {
    if (!currentUser || !isOnline) return;
    try {
        const snapshot = await db.collection('tasks')
            .where('userId', '==', currentUser.id)
            .orderBy('dueDate', 'asc')
            .get();

        tasks = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                dueDate: data.dueDate ? data.dueDate.toDate().toISOString() : new Date().toISOString(),
                createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
                completedAt: data.completedAt ? data.completedAt.toDate().toISOString() : null,
                status: data.status || 'pending'
            };
        });

        renderTasks();
        updateStatistics();
    } catch (error) {
        console.error('Error loading tasks:', error);
        showToast('error', 'Load Failed', 'Could not load tasks');
    }
}

async function handleTaskSubmit(e) {
    e.preventDefault();
    if (!isOnline) { showToast('error', 'Offline', 'Please check your internet connection'); return; }

    const taskSubmitBtn = document.getElementById('taskSubmitBtn');
    const submitBtnText = document.getElementById('submitBtnText');
    const taskSubmitSpinner = document.getElementById('taskSubmitSpinner');

    taskSubmitBtn.disabled = true;
    submitBtnText.textContent = editingTaskId ? 'Updating...' : 'Adding...';
    taskSubmitSpinner.classList.remove('hidden');

    const title = document.getElementById('taskTitle').value.trim();
    const description = document.getElementById('taskDescription').value.trim();
    const subject = document.getElementById('taskSubject').value.trim();
    const dueDateRaw = document.getElementById('taskDueDate').value;
    const priority = document.getElementById('taskPriority').value;
    const dueDateTimestamp = firebase.firestore.Timestamp.fromDate(new Date(dueDateRaw));

    const taskData = {
        userId: currentUser.id,
        title, description, subject,
        dueDate: dueDateTimestamp,
        priority,
        status: editingTaskId ? undefined : 'pending',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (!editingTaskId) { taskData.createdAt = firebase.firestore.FieldValue.serverTimestamp(); }

    try {
        if (editingTaskId) {
            const updateData = { ...taskData };
            delete updateData.status; // prevent undefined error
            await db.collection('tasks').doc(editingTaskId).update(updateData);
            showToast('success', 'Task Updated!', 'Your task has been updated successfully');
        } else {
            await db.collection('tasks').add(taskData);
            showToast('success', 'Task Added!', 'Your new task has been created');
        }
        await loadTasks();
        closeTaskModal();
    } catch (error) {
        console.error('Error saving task:', error);
        showToast('error', 'Save Failed', 'Could not save task');
    } finally {
        taskSubmitBtn.disabled = false;
        submitBtnText.textContent = editingTaskId ? 'Update Task' : 'Add Task';
        taskSubmitSpinner.classList.add('hidden');
    }
}

async function deleteTask(taskId) {
    if (!confirm('Are you sure you want to delete this task?')) return;
    if (!isOnline) { showToast('error', 'Offline', 'Please check your internet connection'); return; }
    try {
        await db.collection('tasks').doc(taskId).delete();
        showToast('info', 'Task Deleted', 'Task has been removed');
        await loadTasks();
    } catch (error) {
        console.error('Error deleting task:', error);
        showToast('error', 'Delete Failed', 'Could not delete task');
    }
}

async function toggleTaskStatus(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task || !isOnline) return;

    const newStatus = task.status === 'pending' ? 'completed' : 'pending';
    const updateData = {
        status: newStatus,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (newStatus === 'completed') {
        updateData.completedAt = firebase.firestore.FieldValue.serverTimestamp();
    } else {
        updateData.completedAt = firebase.firestore.FieldValue.delete();
    }

    try {
        await db.collection('tasks').doc(taskId).update(updateData);
        showToast('success', 'Status Updated', `Task marked as ${newStatus}`);
        await loadTasks();
    } catch (error) {
        console.error('Error updating task:', error);
        showToast('error', 'Update Failed', 'Could not update task status');
    }
}

function editTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
        editingTaskId = taskId;
        document.getElementById('modalTitle').textContent = 'Edit Task';
        document.getElementById('submitBtnText').textContent = 'Update Task';
        document.getElementById('taskTitle').value = task.title;
        document.getElementById('taskDescription').value = task.description || '';
        document.getElementById('taskSubject').value = task.subject;
        document.getElementById('taskDueDate').value = task.dueDate.slice(0, 16);
        document.getElementById('taskPriority').value = task.priority || '';
        openTaskModal();
    }
}

// ==========================================
// MODAL HANDLERS
// ==========================================

function openTaskModal() {
    if (taskModal) {
        taskModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        document.getElementById('taskTitle').focus();
    }
}

function closeTaskModal() {
    if (taskModal) taskModal.classList.add('hidden');
    document.body.style.overflow = 'auto';
    const form = document.getElementById('taskForm');
    if (form) form.reset();
    editingTaskId = null;
    document.getElementById('modalTitle').textContent = 'Add New Task';
    document.getElementById('submitBtnText').textContent = 'Add Task';
    const taskSubmitBtn = document.getElementById('taskSubmitBtn');
    const taskSubmitSpinner = document.getElementById('taskSubmitSpinner');
    if (taskSubmitBtn) taskSubmitBtn.disabled = false;
    if (taskSubmitSpinner) taskSubmitSpinner.classList.add('hidden');
}

// ==========================================
// TASK RENDERING
// ==========================================

function renderTasks() {
    const filteredTasks = getFilteredTasks();
    if (!tasksContainer) return;

    if (filteredTasks.length === 0) {
        tasksContainer.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }

    tasksContainer.classList.remove('hidden');
    emptyState.classList.add('hidden');

    tasksContainer.innerHTML = filteredTasks.map(task => {
        const dueDate = new Date(task.dueDate);
        const now = new Date();
        const isOverdue = dueDate < now && task.status === 'pending';
        const isDueSoon = dueDate - now < 24*60*60*1000 && dueDate > now && task.status === 'pending';

        return `
        <div class="task-card bg-white rounded-xl shadow-sm border border-gray-200 p-6 priority-${task.priority} fade-in">
            <div class="flex justify-between items-start mb-4">
                <div class="flex-1">
                    <h3 class="text-lg font-semibold text-gray-900 mb-1 ${task.status==='completed'?'line-through text-gray-500':''}">${escapeHtml(task.title)}</h3>
                    <p class="text-sm text-gray-600 mb-2">${escapeHtml(task.subject)}</p>
                    ${task.description?`<p class="text-sm text-gray-500 mb-3">${escapeHtml(task.description)}</p>`:''}
                </div>
                <div class="flex items-center space-x-2">
                    <span class="px-2 py-1 text-xs font-medium rounded-full priority-badge-${task.priority}">${escapeHtml(task.priority.toUpperCase())}</span>
                    <span class="px-2 py-1 text-xs font-medium rounded-full status-${task.status} ${isOverdue?'status-overdue':''}">${isOverdue?'OVERDUE':escapeHtml(task.status.toUpperCase())}</span>
                </div>
            </div>
            <div class="mb-4">
                <div class="flex items-center text-sm text-gray-600 mb-2">
                    <i class="fas fa-calendar-alt mr-2"></i>
                    <span>Due: ${formatDateTime(task.dueDate)}</span>
                </div>
                ${isOverdue?'<div class="flex items-center text-sm text-red-600"><i class="fas fa-exclamation-triangle mr-2"></i><span>This task is overdue!</span></div>':''}
                ${isDueSoon?'<div class="flex items-center text-sm text-amber-600"><i class="fas fa-clock mr-2"></i><span>Due within 24 hours!</span></div>':''}
                ${task.completedAt?`<div class="flex items-center text-sm text-green-600 mt-2"><i class="fas fa-check mr-2"></i><span>Completed: ${formatDateTime(task.completedAt)}</span></div>`:''}
            </div>
            <div class="flex justify-between items-center">
                <button onclick="toggleTaskStatus('${task.id}')" class="flex items-center text-sm ${task.status==='completed'?'text-green-600 hover:text-green-700':'text-gray-600 hover:text-gray-700'} transition-colors">
                    <i class="fas ${task.status==='completed'?'fa-undo':'fa-check-circle'} mr-2"></i>${task.status==='completed'?'Mark Pending':'Mark Complete'}
                </button>
                <div class="flex space-x-2">
                    <button onclick="editTask('${task.id}')" class="text-indigo-600 hover:text-indigo-700 transition-colors p-2 rounded-lg hover:bg-indigo-50" title="Edit Task"><i class="fas fa-edit"></i></button>
                    <button onclick="deleteTask('${task.id}')" class="text-red-600 hover:text-red-700 transition-colors p-2 rounded-lg hover:bg-red-50" title="Delete Task"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        </div>`;
    }).join('');
}

function escapeHtml(unsafe){
    if(unsafe===null||unsafe===undefined) return '';
    return String(unsafe).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}
// ==========================================
// FILTERS & SEARCH
// ==========================================

let currentFilter = 'all';
let currentSearch = '';

function setFilter(filter) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.filter-btn[data-filter="${filter}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    renderTasks();
}

function setSearch(query) {
    currentSearch = query.trim().toLowerCase();
    renderTasks();
}

function getFilteredTasks() {
    return tasks.filter(task => {
        let matchFilter = true;
        if (currentFilter === 'pending') matchFilter = task.status === 'pending';
        else if (currentFilter === 'completed') matchFilter = task.status === 'completed';
        else if (currentFilter === 'overdue') matchFilter = {
            status: task.status === 'pending',
            dueDate: new Date(task.dueDate) < new Date()
        }.status && new Date(task.dueDate) < new Date();

        let matchSearch = currentSearch === '' || (
            task.title.toLowerCase().includes(currentSearch) ||
            (task.description && task.description.toLowerCase().includes(currentSearch)) ||
            (task.subject && task.subject.toLowerCase().includes(currentSearch))
        );

        return matchFilter && matchSearch;
    });
}

// ==========================================
// STATISTICS
// ==========================================

function updateStatistics() {
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const pending = tasks.filter(t => t.status === 'pending').length;
    const overdue = tasks.filter(t => t.status === 'pending' && new Date(t.dueDate) < new Date()).length;

    document.getElementById('statTotal').textContent = total;
    document.getElementById('statCompleted').textContent = completed;
    document.getElementById('statPending').textContent = pending;
    document.getElementById('statOverdue').textContent = overdue;
}

// ==========================================
// EMAIL NOTIFICATIONS
// ==========================================

async function sendDeadlineEmail(task) {
    if (!EMAIL_CONFIG.publicKey || !EMAIL_CONFIG.templateId) return;

    const params = {
        to_name: currentUser.name,
        to_email: currentUser.email,
        task_title: task.title,
        task_due: formatDateTime(task.dueDate)
    };

    try {
        const response = await emailjs.send(
            EMAIL_CONFIG.serviceId,
            EMAIL_CONFIG.templateId,
            params,
            EMAIL_CONFIG.publicKey
        );
        console.log('Email sent', response.status, response.text);
    } catch (error) {
        console.error('Email sending failed:', error);
    }
}

function checkDeadlines() {
    tasks.forEach(task => {
        if (task.status === 'pending') {
            const now = new Date();
            const due = new Date(task.dueDate);
            const timeDiff = due - now;

            if (timeDiff > 0 && timeDiff <= 24*60*60*1000) sendDeadlineEmail(task);
        }
    });
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function formatDateTime(dateStr) {
    const date = new Date(dateStr);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function debounce(fn, delay = 300) {
    let timeout;
    return function(...args){
        clearTimeout(timeout);
        timeout = setTimeout(()=>fn.apply(this, args), delay);
    };
}

// ==========================================
// ONLINE/OFFLINE HANDLING
// ==========================================

let isOnline = navigator.onLine;
window.addEventListener('online', () => { isOnline = true; showToast('success', 'Online', 'You are back online'); loadTasks(); });
window.addEventListener('offline', () => { isOnline = false; showToast('error', 'Offline', 'You are offline'); });

// ==========================================
// GLOBAL TOAST NOTIFICATION
// ==========================================

function showToast(type='info', title='', message='') {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type} fade-in`;
    toast.innerHTML = `
        <strong>${title}</strong>
        <p>${message}</p>
    `;

    toastContainer.appendChild(toast);

    setTimeout(()=> {
        toast.classList.add('fade-out');
        toast.addEventListener('transitionend', ()=> toast.remove());
    }, 4000);
}

// ==========================================
// GLOBAL ERROR HANDLING
// ==========================================

window.addEventListener('unhandledrejection', event => {
    console.error('Unhandled promise rejection:', event.reason);
    showToast('error', 'Error', 'An unexpected error occurred');
});

window.addEventListener('error', event => {
    console.error('Global error:', event.message, event.filename, event.lineno);
    showToast('error', 'Error', 'An unexpected error occurred');
});

// ==========================================
// INITIALIZATION
// ==========================================

auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = {
            id: user.uid,
            name: user.displayName || '',
            email: user.email || ''
        };
        loadTasks();
        checkDeadlines();
    } else {
        currentUser = null;
        tasks = [];
        renderTasks();
    }
});
