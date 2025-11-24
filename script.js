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
        welcome: 'template_welcome'
    }
};

// =========================================
// INITIALIZATION
// =========================================
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
if (typeof emailjs !== 'undefined' && EMAIL_CONFIG.publicKey) emailjs.init(EMAIL_CONFIG.publicKey);

let currentUser = null;
let tasks = [];
let editingTaskId = null;
let isOnline = navigator.onLine;

// =========================================
// DOM ELEMENTS
// =========================================
const loadingScreen = document.getElementById('loadingScreen');
const authScreen = document.getElementById('authScreen');
const dashboardScreen = document.getElementById('dashboardScreen');
const tasksContainer = document.getElementById('tasksContainer');
const emptyState = document.getElementById('emptyState');

// =========================================
// INITIAL SETUP
// =========================================
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    setupNetworkListeners();
    setMinDateTime();
    showLoadingScreen();
    setTimeout(hideLoadingScreen, 1000);
});

// =========================================
// LOADING SCREEN
// =========================================
function showLoadingScreen() {
    loadingScreen?.classList.remove('hidden');
    authScreen?.classList.add('hidden');
    dashboardScreen?.classList.add('hidden');
}
function hideLoadingScreen() {
    loadingScreen?.classList.add('hidden');
}

// =========================================
// NETWORK
// =========================================
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
    document.getElementById('offlineIndicator')?.classList.remove('show');
}

// =========================================
// AUTH
// =========================================
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
            } else await auth.signOut();
        } catch (error) {
            console.error(error);
            await auth.signOut();
        }
    } else {
        currentUser = null;
        tasks = [];
        showAuthScreen();
    }
});
function showAuthScreen() {
    authScreen?.classList.remove('hidden');
    dashboardScreen?.classList.add('hidden');
    document.getElementById('userGreeting')?.classList.add('hidden');
    document.getElementById('logoutBtn')?.classList.add('hidden');
}
function showDashboard() {
    authScreen?.classList.add('hidden');
    dashboardScreen?.classList.remove('hidden');
    const greeting = document.getElementById('userGreeting');
    greeting.textContent = `Hello, ${currentUser.name}!`;
    greeting.classList.remove('hidden');
    document.getElementById('logoutBtn')?.classList.remove('hidden');
    loadTasks();
    setupDailyEmailCheck();
}

// =========================================
// EVENT LISTENERS
// =========================================
function setupEventListeners() {
    document.getElementById('showRegister')?.addEventListener('click', () => {
        document.getElementById('loginForm').classList.add('hidden');
        document.getElementById('registerForm').classList.remove('hidden');
    });
    document.getElementById('showLogin')?.addEventListener('click', () => {
        document.getElementById('registerForm').classList.add('hidden');
        document.getElementById('loginForm').classList.remove('hidden');
    });
    document.getElementById('loginFormElement')?.addEventListener('submit', handleLogin);
    document.getElementById('registerFormElement')?.addEventListener('submit', handleRegister);
    document.getElementById('taskForm')?.addEventListener('submit', handleTaskSubmit);
    document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
    document.getElementById('addTaskBtn')?.addEventListener('click', () => openTaskModal());
    document.getElementById('checkDeadlinesBtn')?.addEventListener('click', checkDeadlines);
    document.getElementById('closeModal')?.addEventListener('click', closeTaskModal);
    document.getElementById('cancelBtn')?.addEventListener('click', closeTaskModal);
    document.getElementById('searchInput')?.addEventListener('input', filterTasks);
    document.getElementById('priorityFilter')?.addEventListener('change', filterTasks);
    document.getElementById('statusFilter')?.addEventListener('change', filterTasks);

    taskModal?.addEventListener('click', (e) => {
        if (e.target === taskModal) closeTaskModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !taskModal.classList.contains('hidden')) closeTaskModal();
        if (e.ctrlKey && e.key === 'n' && currentUser) {
            e.preventDefault();
            openTaskModal();
        }
    });
}

// =========================================
// AUTH HANDLERS
// =========================================
async function handleLogin(e) {
    e.preventDefault();
    if (!isOnline) return showToast('error', 'Offline', 'Please check your internet connection');
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const loginBtn = document.getElementById('loginBtn');
    loginBtn.disabled = true;
    try {
        await auth.signInWithEmailAndPassword(email, password);
        showToast('success', 'Welcome back!', 'Successfully logged in');
    } catch (error) {
        console.error(error);
        showToast('error', 'Login Failed', 'Invalid email or password');
    } finally { loginBtn.disabled = false; }
}
async function handleRegister(e) {
    e.preventDefault();
    if (!isOnline) return showToast('error', 'Offline', 'Please check your internet connection');
    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const grade = document.getElementById('registerGrade').value;
    const password = document.getElementById('registerPassword').value;
    const registerBtn = document.getElementById('registerBtn');
    registerBtn.disabled = true;
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        await user.updateProfile({ displayName: name });
        await db.collection('users').doc(user.uid).set({
            name, email, grade,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
        });
        await sendWelcomeEmail(name, email);
        showToast('success', 'Account Created!', 'Welcome to Task Ko To!');
    } catch (error) {
        console.error(error);
        showToast('error', 'Registration Failed', 'Could not create account');
    } finally { registerBtn.disabled = false; }
}
async function handleLogout() {
    try { await auth.signOut(); showToast('info', 'Logged Out', 'See you next time!'); }
    catch (error) { console.error(error); showToast('error', 'Logout Failed', 'Please try again'); }
}

// =========================================
// TASK MANAGEMENT
// =========================================
async function loadTasks() {
    if (!currentUser || !isOnline) return;
    try {
        const snapshot = await db.collection('tasks')
            .where('userId', '==', currentUser.id)
            .orderBy('dueDate', 'asc').get();
        tasks = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                dueDate: data.dueDate?.toDate().toISOString() || new Date().toISOString(),
                createdAt: data.createdAt?.toDate().toISOString() || new Date().toISOString(),
                completedAt: data.completedAt?.toDate().toISOString() || null,
                status: data.status || 'pending'
            };
        });
        renderTasks();
        updateStatistics();
    } catch (error) { console.error(error); showToast('error', 'Load Failed', 'Could not load tasks'); }
}
async function handleTaskSubmit(e) {
    e.preventDefault();
    if (!isOnline) return showToast('error', 'Offline', 'Please check your internet connection');

    const taskSubmitBtn = document.getElementById('taskSubmitBtn');
    taskSubmitBtn.disabled = true;

    const title = document.getElementById('taskTitle').value.trim();
    const description = document.getElementById('taskDescription').value.trim();
    const subject = document.getElementById('taskSubject').value.trim();
    const dueDateRaw = document.getElementById('taskDueDate').value;
    const priority = document.getElementById('taskPriority').value;
    const dueDateTimestamp = firebase.firestore.Timestamp.fromDate(new Date(dueDateRaw));

    let currentTaskStatus = 'pending';
    if (editingTaskId) {
        const existingTask = tasks.find(t => t.id === editingTaskId);
        if (existingTask?.status) currentTaskStatus = existingTask.status;
    }

    const taskData = {
        userId: currentUser.id,
        title, description, subject,
        dueDate: dueDateTimestamp,
        priority,
        status: currentTaskStatus,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (!editingTaskId) taskData.createdAt = firebase.firestore.FieldValue.serverTimestamp();

    try {
        if (editingTaskId) await db.collection('tasks').doc(editingTaskId).update(taskData);
        else await db.collection('tasks').add(taskData);
        await loadTasks();
        closeTaskModal();
    } catch (error) { console.error(error); showToast('error', 'Save Failed', 'Could not save task'); }
    finally { taskSubmitBtn.disabled = false; }
}

// =========================================
// TASK ACTIONS
// =========================================
function renderTasks() {
    if (!tasksContainer) return;
    const filteredTasks = getFilteredTasks();
    if (filteredTasks.length === 0) {
        tasksContainer.classList.add('hidden');
        emptyState?.classList.remove('hidden');
        return;
    }
    tasksContainer.classList.remove('hidden');
    emptyState?.classList.add('hidden');
    tasksContainer.innerHTML = filteredTasks.map(task => {
        const dueDate = new Date(task.dueDate);
        const now = new Date();
        const isOverdue = dueDate < now && task.status === 'pending';
        const isDueSoon = dueDate - now < 24 * 60 * 60 * 1000 && dueDate > now && task.status === 'pending';
        return `
        <div class="task-card bg-white rounded-xl shadow-sm border border-gray-200 p-6 priority-${task.priority}">
            <div class="flex justify-between items-start mb-4">
                <div class="flex-1">
                    <h3 class="text-lg font-semibold ${task.status==='completed'?'line-through text-gray-500':''}">${escapeHtml(task.title)}</h3>
                    <p class="text-sm text-gray-600 mb-2">${escapeHtml(task.subject)}</p>
                    ${task.description? `<p class="text-sm text-gray-500 mb-3">${escapeHtml(task.description)}</p>`: ''}
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
                <button onclick="toggleTaskStatus('${task.id}')" class="flex items-center text-sm ${task.status==='completed'?'text-green-600':'text-gray-600'}">
                    <i class="fas ${task.status==='completed'?'fa-undo':'fa-check-circle'} mr-2"></i>
                    ${task.status==='completed'?'Mark Pending':'Mark Complete'}
                </button>
                <div class="flex space-x-2">
                    <button onclick="editTask('${task.id}')" class="text-indigo-600 p-2 rounded-lg"><i class="fas fa-edit"></i></button>
                    <button onclick="deleteTask('${task.id}')" class="text-red-600 p-2 rounded-lg"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        </div>`;
    }).join('');
}
// =========================================
// TASK ACTION HANDLERS
// =========================================
async function toggleTaskStatus(taskId) {
    if (!isOnline) return showToast('error', 'Offline', 'Cannot update task while offline');
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    const updateData = { status: newStatus };
    if (newStatus === 'completed') updateData.completedAt = firebase.firestore.FieldValue.serverTimestamp();
    else updateData.completedAt = null;
    try {
        await db.collection('tasks').doc(taskId).update(updateData);
        await loadTasks();
        showToast('success', 'Task Updated', `Status set to ${newStatus}`);
    } catch (error) { console.error(error); showToast('error', 'Update Failed', 'Could not update task status'); }
}

async function deleteTask(taskId) {
    if (!isOnline) return showToast('error', 'Offline', 'Cannot delete task while offline');
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
        await db.collection('tasks').doc(taskId).delete();
        tasks = tasks.filter(t => t.id !== taskId);
        renderTasks();
        showToast('success', 'Task Deleted', 'Task successfully deleted');
    } catch (error) { console.error(error); showToast('error', 'Delete Failed', 'Could not delete task'); }
}

function editTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    editingTaskId = taskId;
    document.getElementById('taskTitle').value = task.title;
    document.getElementById('taskDescription').value = task.description || '';
    document.getElementById('taskSubject').value = task.subject || '';
    document.getElementById('taskPriority').value = task.priority || 'medium';
    document.getElementById('taskDueDate').value = task.dueDate.slice(0,16);
    openTaskModal(true);
}

// =========================================
// TASK MODAL
// =========================================
const taskModal = document.getElementById('taskModal');
function openTaskModal(editing=false) {
    if (!taskModal) return;
    taskModal.classList.remove('hidden');
    if (editing) document.getElementById('taskSubmitBtn').textContent = 'Update Task';
    else {
        document.getElementById('taskSubmitBtn').textContent = 'Add Task';
        editingTaskId = null;
        document.getElementById('taskForm').reset();
        setMinDateTime();
    }
}
function closeTaskModal() {
    taskModal?.classList.add('hidden');
}

// =========================================
// FILTER AND SEARCH
// =========================================
function getFilteredTasks() {
    const searchValue = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const priorityFilter = document.getElementById('priorityFilter')?.value || '';
    const statusFilter = document.getElementById('statusFilter')?.value || '';
    return tasks.filter(task => {
        const matchesSearch = task.title.toLowerCase().includes(searchValue) || (task.subject?.toLowerCase()?.includes(searchValue) || false);
        const matchesPriority = priorityFilter ? task.priority === priorityFilter : true;
        const matchesStatus = statusFilter ? task.status === statusFilter : true;
        return matchesSearch && matchesPriority && matchesStatus;
    });
}
function filterTasks() { renderTasks(); }

// =========================================
// STATISTICS
// =========================================
function updateStatistics() {
    const total = tasks.length;
    const completed = tasks.filter(t => t.status==='completed').length;
    const pending = total - completed;
    document.getElementById('totalTasks')?.textContent = total;
    document.getElementById('completedTasks')?.textContent = completed;
    document.getElementById('pendingTasks')?.textContent = pending;
}

// =========================================
// EMAIL NOTIFICATIONS
// =========================================
async function checkDeadlines() {
    if (!isOnline) return showToast('error', 'Offline', 'Cannot send emails while offline');
    const now = new Date();
    const upcomingTasks = tasks.filter(t => t.status==='pending' && (new Date(t.dueDate) - now) <= 24*60*60*1000 && (new Date(t.dueDate) - now) > 0);
    const overdueTasks = tasks.filter(t => t.status==='pending' && new Date(t.dueDate) < now);
    try {
        if (upcomingTasks.length) await sendEmail(EMAIL_CONFIG.templates.upcoming, currentUser.email, { tasks: upcomingTasks });
        if (overdueTasks.length) await sendEmail(EMAIL_CONFIG.templates.overdue, currentUser.email, { tasks: overdueTasks });
        showToast('success', 'Emails Sent', 'Deadline reminders sent');
    } catch (error) { console.error(error); showToast('error', 'Email Failed', 'Could not send reminders'); }
}

async function sendWelcomeEmail(name, email) { await sendEmail(EMAIL_CONFIG.templates.welcome, email, { name }); }

async function sendEmail(templateId, toEmail, templateParams) {
    if (typeof emailjs === 'undefined') return;
    return emailjs.send(EMAIL_CONFIG.serviceId, templateId, { ...templateParams, to_email: toEmail });
}

function setupDailyEmailCheck() { setInterval(checkDeadlines, 1000*60*60*24); }

// =========================================
// UTILITIES
// =========================================
function escapeHtml(text) { return text?.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) || ''; }
function formatDateTime(dateStr) { const d = new Date(dateStr); return d.toLocaleString([], {dateStyle:'short', timeStyle:'short'}); }
function setMinDateTime() { const dt = new Date().toISOString().slice(0,16); document.getElementById('taskDueDate')?.setAttribute('min', dt); }

// =========================================
// TOAST
// =========================================
function showToast(type, title, message) {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<strong>${title}</strong><p>${message}</p>`;
    toastContainer.appendChild(toast);
    setTimeout(()=>toast.remove(), 4000);
}
