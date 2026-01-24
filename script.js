// =========================================
// CONFIGURATION 
// =========================================

// Firebase Configuration - 
const firebaseConfig = {
    apiKey: "AIzaSyAg2SFXRGI2QvRmHWAs8P4UWoehtmGlniw",
    authDomain: "task-ko-toh.firebaseapp.com",
    projectId: "task-ko-toh",
    storageBucket: "task-ko-toh.firebasestorage.app",
    messagingSenderId: "333405520584",
    appId: "1:333405520584:web:cf83fb5d8aaf7b1b4d9bfd"
};

// EmailJS Configuration 
const EMAIL_CONFIG = {
    serviceId: 'service_5108w0i',
    publicKey: 'sGzOV8JPW3Pr3hNX3',
    templates: {
        overdue: 'template_ea6ejpe',
        upcoming: 'template_p3w05gl',
    }
};

// ==========================================
// FIREBASE INITIALIZATION (Compat API)
// ==========================================

// Initialize Firebase (compat)
firebase.initializeApp(firebaseConfig);

// Firestore & Auth (compat)
const db = firebase.firestore();
const auth = firebase.auth();

// Initialize EmailJS (public key)
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

    // Wait a little and hide loader (auth observer will show dashboard if signed in)
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

// Auth state observer
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
                // If no user doc, sign out
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

    loadTasks().then(() => {
    autoInAppNotifications();
    autoEmailNotifications();
});

setupDailyEmailCheck();
    setInterval(() => {
    autoInAppNotifications();
    autoEmailNotifications();
}, 60 * 60 * 1000);

}

// ==========================================
// EVENT LISTENERS SETUP
// ==========================================

function setupEventListeners() {
    // Auth form toggles
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

    // Form submissions
    const loginEl = document.getElementById('loginFormElement');
    const registerEl = document.getElementById('registerFormElement');
    const taskForm = document.getElementById('taskForm');
    if (loginEl) loginEl.addEventListener('submit', handleLogin);
    if (registerEl) registerEl.addEventListener('submit', handleRegister);
    if (taskForm) taskForm.addEventListener('submit', handleTaskSubmit);

    // Buttons
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

    // Search and filters
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.addEventListener('input', filterTasks);

    const priorityFilter = document.getElementById('priorityFilter');
    if (priorityFilter) priorityFilter.addEventListener('change', filterTasks);

    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter) statusFilter.addEventListener('change', filterTasks);

    // Modal backdrop click
    if (taskModal) taskModal.addEventListener('click', (e) => {
        if (e.target === taskModal) closeTaskModal();
    });

    // Keyboard shortcuts
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

    if (!isOnline) {
        showToast('error', 'Offline', 'Please check your internet connection');
        return;
    }

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
            case 'auth/user-not-found':
                errorMessage = 'No account found with this email';
                break;
            case 'auth/wrong-password':
                errorMessage = 'Incorrect password';
                break;
            case 'auth/invalid-email':
                errorMessage = 'Invalid email address';
                break;
            case 'auth/too-many-requests':
                errorMessage = 'Too many failed attempts. Please try again later';
                break;
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

    if (!isOnline) {
        showToast('error', 'Offline', 'Please check your internet connection');
        return;
    }

    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const grade = document.getElementById('registerGrade').value;
    const password = document.getElementById('registerPassword').value;

    if (name.length < 2) {
        showToast('error', 'Invalid Name', 'Name must be at least 2 characters');
        return;
    }

    if (grade !== "11" && grade !== "12") {
        showToast('error', 'Invalid Grade', 'Only Grade 11 and Grade 12 are allowed');
        return;
    }

    if (password.length < 6) {
        showToast('error', 'Weak Password', 'Password must be at least 6 characters');
        return;
    }

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
            name: name,
            email: email,
            grade: grade,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Send welcome email (if emailjs configured)
        try {
            if (EMAIL_CONFIG.publicKey && EMAIL_CONFIG.publicKey !== 'YOUR_EMAILJS_PUBLIC_KEY') {
                await sendWelcomeEmail(name, email);
            }
        } catch (emailError) {
            console.error('Welcome email failed:', emailError);
        }

        showToast('success', 'Account Created!', 'Welcome to Task Ko To!');
    } catch (error) {
        console.error('Registration error:', error);
        let errorMessage = 'Failed to create account';

        switch (error.code) {
            case 'auth/email-already-in-use':
                errorMessage = 'Email already registered';
                break;
            case 'auth/invalid-email':
                errorMessage = 'Invalid email address';
                break;
            case 'auth/weak-password':
                errorMessage = 'Password is too weak';
                break;
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
                // store ISO strings for consistent rendering
                dueDate: data.dueDate ? data.dueDate.toDate().toISOString() : new Date().toISOString(),
                createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
                completedAt: data.completedAt ? data.completedAt.toDate().toISOString() : null
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

    if (!isOnline) {
        showToast('error', 'Offline', 'Please check your internet connection');
        return;
    }

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

    // FIX: removed status to avoid undefined
    const taskData = {
        userId: currentUser.id,
        title,
        description,
        subject,
        dueDate: dueDateTimestamp,
        priority,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (!editingTaskId) {
        // FIX: Add status only when creating
        taskData.status = "pending";
        taskData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    }

    try {
        if (editingTaskId) {
            // FIX: Never send status when editing
            const updatePayload = { ...taskData };
            delete updatePayload.status;

            await db.collection('tasks').doc(editingTaskId).update(updatePayload);

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

    if (!isOnline) {
        showToast('error', 'Offline', 'Please check your internet connection');
        return;
    }

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
        // Ensure input value format compatible with datetime-local if needed
        document.getElementById('taskDueDate').value = task.dueDate.slice(0, 16);
        document.getElementById('taskPriority').value = task.priority || '';

        openTaskModal();
    }
}

// ==========================================
// MODAL
// ==========================================

function openTaskModal() {
    if (taskModal) {
        taskModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        document.getElementById('taskTitle').focus();
    }
}

function closeTaskModal() {
    if (taskModal) {
        taskModal.classList.add('hidden');
        document.body.style.overflow = 'auto';
    }
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
// RENDERING
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
        const isDueSoon = dueDate - now < 24 * 60 * 60 * 1000 && dueDate > now && task.status === 'pending';

        return `
            <div class="task-card bg-white rounded-xl shadow-sm border border-gray-200 p-6 priority-${task.priority} fade-in">
                <div class="flex justify-between items-start mb-4">
                    <div class="flex-1">
                        <h3 class="text-lg font-semibold text-gray-900 mb-1 ${task.status === 'completed' ? 'line-through text-gray-500' : ''}">${escapeHtml(task.title)}</h3>
                        <p class="text-sm text-gray-600 mb-2">${escapeHtml(task.subject)}</p>
                        ${task.description ? `<p class="text-sm text-gray-500 mb-3">${escapeHtml(task.description)}</p>` : ''}
                    </div>
                    <div class="flex items-center space-x-2">
                        <span class="px-2 py-1 text-xs font-medium rounded-full priority-badge-${task.priority}">
                            ${escapeHtml(task.priority.toUpperCase())}
                        </span>
                        <span class="px-2 py-1 text-xs font-medium rounded-full status-${task.status} ${isOverdue ? 'status-overdue' : ''}">
                            ${isOverdue ? 'OVERDUE' : escapeHtml(task.status.toUpperCase())}
                        </span>
                    </div>
                </div>
                
                <div class="mb-4">
                    <div class="flex items-center text-sm text-gray-600 mb-2">
                        <i class="fas fa-calendar-alt mr-2"></i>
                        <span>Due: ${formatDateTime(task.dueDate)}</span>
                    </div>
                    ${isOverdue ? '<div class="flex items-center text-sm text-red-600"><i class="fas fa-exclamation-triangle mr-2"></i><span>This task is overdue!</span></div>' : ''}
                    ${isDueSoon ? '<div class="flex items-center text-sm text-amber-600"><i class="fas fa-clock mr-2"></i><span>Due within 24 hours!</span></div>' : ''}
                    ${task.completedAt ? `<div class="flex items-center text-sm text-green-600 mt-2"><i class="fas fa-check mr-2"></i><span>Completed: ${formatDateTime(task.completedAt)}</span></div>` : ''}
                </div>

                <div class="flex justify-between items-center">
                    <button onclick="toggleTaskStatus('${task.id}')" class="flex items-center text-sm ${task.status === 'completed' ? 'text-green-600 hover:text-green-700' : 'text-gray-600 hover:text-gray-700'} transition-colors">
                        <i class="fas ${task.status === 'completed' ? 'fa-undo' : 'fa-check-circle'} mr-2"></i>
                        ${task.status === 'completed' ? 'Mark Pending' : 'Mark Complete'}
                    </button>
                    <div class="flex space-x-2">
                        <button onclick="editTask('${task.id}')" class="text-indigo-600 hover:text-indigo-700 transition-colors p-2 rounded-lg hover:bg-indigo-50" title="Edit Task">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="deleteTask('${task.id}')" class="text-red-600 hover:text-red-700 transition-colors p-2 rounded-lg hover:bg-red-50" title="Delete Task">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Helper to avoid XSS in inserted HTML
function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
}

// ==========================================
// FILTERS
// ==========================================

function getFilteredTasks() {
    let filtered = [...tasks];

    const searchTermEl = document.getElementById('searchInput');
    const searchTerm = searchTermEl ? searchTermEl.value.toLowerCase().trim() : '';
    const priorityFilterEl = document.getElementById('priorityFilter');
    const priorityFilter = priorityFilterEl ? priorityFilterEl.value : '';
    const statusFilterEl = document.getElementById('statusFilter');
    const statusFilter = statusFilterEl ? statusFilterEl.value : '';

    if (searchTerm) {
        filtered = filtered.filter(task =>
            task.title.toLowerCase().includes(searchTerm) ||
            (task.description && task.description.toLowerCase().includes(searchTerm)) ||
            task.subject.toLowerCase().includes(searchTerm)
        );
    }

    if (priorityFilter) {
        filtered = filtered.filter(task => task.priority === priorityFilter);
    }

    if (statusFilter) {
        filtered = filtered.filter(task => task.status === statusFilter);
    }

    return filtered.sort((a, b) => {
        if (a.status !== b.status) {
            return a.status === 'pending' ? -1 : 1;
        }
        return new Date(a.dueDate) - new Date(b.dueDate);
    });
}

function filterTasks() {
    renderTasks();
}

// ==========================================
// STATISTICS
// ==========================================

function updateStatistics() {
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const pending = tasks.filter(t => t.status === 'pending').length;
    const overdue = tasks.filter(t => {
        const dueDate = new Date(t.dueDate);
        return dueDate < new Date() && t.status === 'pending';
    }).length;

    const totalEl = document.getElementById('totalTasks');
    const completedEl = document.getElementById('completedTasks');
    const pendingEl = document.getElementById('pendingTasks');
    const overdueEl = document.getElementById('overdueTasks');

    if (totalEl) totalEl.textContent = total;
    if (completedEl) completedEl.textContent = completed;
    if (pendingEl) pendingEl.textContent = pending;
    if (overdueEl) overdueEl.textContent = overdue;
}

// ==========================================
// EMAIL NOTIFICATIONS (EmailJS)
// ==========================================

async function checkDeadlines() {
    if (!isOnline) {
        showToast('error', 'Offline', 'Please check your internet connection');
        return;
    }

    if (!currentUser || !currentUser.email) {
        showToast('error', 'Email Failed', 'No recipient email configured.');
        return;
    }

    const button = document.getElementById('checkDeadlinesBtn');
    const originalText = button ? button.innerHTML : '';
    if (button) {
        button.innerHTML = '<i class="fas fa-spinner loading mr-2"></i>Sending...';
        button.disabled = true;
    }

    try {
        const urgentTasks = getUrgentTasks();
        let emailsSent = 0;

        if (urgentTasks.overdue.length > 0 && EMAIL_CONFIG.serviceId && EMAIL_CONFIG.templates.overdue) {
            await sendOverdueEmail(urgentTasks.overdue);
            emailsSent++;
        }

        if (urgentTasks.upcoming.length > 0 && EMAIL_CONFIG.serviceId && EMAIL_CONFIG.templates.upcoming) {
            await sendUpcomingEmail(urgentTasks.upcoming);
            emailsSent++;
        }

        if (emailsSent > 0) {
            showToast('success', 'Emails Sent!', `${emailsSent} notification email(s) sent to ${currentUser.email}`);
        } else {
            showToast('success', 'All Good!', 'No urgent deadlines found or EmailJS not configured');
        }

    } catch (error) {
        console.error('Email sending failed:', error);
        showToast('error', 'Email Failed', 'Could not send email notifications');
    } finally {
        if (button) {
            button.innerHTML = originalText;
            button.disabled = false;
        }
    }
}

async function sendOverdueEmail(overdueTasks) {
    if (!EMAIL_CONFIG.serviceId || !EMAIL_CONFIG.templates.overdue || !currentUser || !currentUser.email) return;

    const templateParams = {
        student_name: currentUser.name,
        task_title: overdueTasks.map(task => task.title).join(', '),
        subject_name: overdueTasks.map(task => task.subject).join(', '),
        due_date: overdueTasks.map(task => formatDateTime(task.dueDate)).join(', '),
        to_email: currentUser.email
    };

    console.log('Sending overdue email with params:', templateParams);

    return emailjs.send(
        EMAIL_CONFIG.serviceId,
        EMAIL_CONFIG.templates.overdue,
        templateParams
    );
}

async function sendUpcomingEmail(upcomingTasks) {
    if (!EMAIL_CONFIG.serviceId || !EMAIL_CONFIG.templates.upcoming || !currentUser || !currentUser.email) return;

    const templateParams = {
        student_name: currentUser.name,
        task_title: upcomingTasks.map(task => task.title).join(', '),
        subject_name: upcomingTasks.map(task => task.subject).join(', '),
        due_date: upcomingTasks.map(task => formatDateTime(task.dueDate)).join(', '),
        to_email: currentUser.email
    };

    console.log('Sending upcoming email with params:', templateParams);

    return emailjs.send(
        EMAIL_CONFIG.serviceId,
        EMAIL_CONFIG.templates.upcoming,
        templateParams
    );
}

function getUrgentTasks() {
    const now = new Date();
    const upcomingTasks = tasks.filter(task => {
        if (task.status === 'completed') return false;
        const dueDate = new Date(task.dueDate);
        const timeDiff = dueDate - now;
        return timeDiff > 0 && timeDiff <= 24 * 60 * 60 * 1000;
    });

    const overdueTasks = tasks.filter(task => {
        if (task.status === 'completed') return false;
        const dueDate = new Date(task.dueDate);
        return dueDate < now;
    });
// =======================
// AUTOMATIC NOTIFICATION HELPERS
// =======================
function hasNotifiedToday(taskId, type) {
    const key = `notify_${type}_${taskId}`;
    const today = new Date().toDateString();

    if (localStorage.getItem(key) === today) return true;

    localStorage.setItem(key, today);
    return false;
}

function autoInAppNotifications() {
    const { overdue, upcoming } = getUrgentTasks();

    overdue.forEach(task => {
        if (!hasNotifiedToday(task.id, 'overdue_toast')) {
            showToast(
                'error',
                'Task Overdue',
                `${task.title} (${task.subject}) was due on ${formatDateTime(task.dueDate)}`
            );
        }
    });

    upcoming.forEach(task => {
        if (!hasNotifiedToday(task.id, 'upcoming_toast')) {
            showToast(
                'info',
                'Upcoming Deadline',
                `${task.title} (${task.subject}) is due within 24 hours`
            );
        }
    });
}

async function autoEmailNotifications() {
    if (!currentUser || !currentUser.email || !isOnline) return;

    const { overdue, upcoming } = getUrgentTasks();

    if (overdue.length > 0 && !hasNotifiedToday(overdue[0].id, 'overdue_email')) {
        await sendOverdueEmail(overdue);
    }

    if (upcoming.length > 0 && !hasNotifiedToday(upcoming[0].id, 'upcoming_email')) {
        await sendUpcomingEmail(upcoming);
    }
}

    return { upcoming: upcomingTasks, overdue: overdueTasks };
}

function setupDailyEmailCheck() {
    setInterval(() => {
        const urgentTasks = getUrgentTasks();
        if (urgentTasks.overdue.length > 0 || urgentTasks.upcoming.length > 0) {
            console.log('Urgent tasks detected:', urgentTasks);
        }
    }, 60 * 60 * 1000);
}

// ==========================================
// UTILITIES
// ==========================================

function formatDateTime(dateTimeString) {
    const date = new Date(dateTimeString);
    const options = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    return date.toLocaleDateString('en-US', options);
}

function setMinDateTime() {
    const now = new Date();
    const minDateTime = now.toISOString().slice(0, 16);
    const el = document.getElementById('taskDueDate');
    if (el) el.min = minDateTime;
}

function showToast(type, title, message) {
    const toast = document.getElementById('toast');
    const toastIcon = document.getElementById('toastIcon');
    const toastTitle = document.getElementById('toastTitle');
    const toastMessage = document.getElementById('toastMessage');

    if (!toast || !toastIcon || !toastTitle || !toastMessage) return;

    const icons = {
        success: '<i class="fas fa-check-circle text-green-500"></i>',
        error: '<i class="fas fa-exclamation-circle text-red-500"></i>',
        warning: '<i class="fas fa-exclamation-triangle text-amber-500"></i>',
        info: '<i class="fas fa-info-circle text-blue-500"></i>'
    };

    toastIcon.innerHTML = icons[type] || icons.info;
    toastTitle.textContent = title;
    toastMessage.textContent = message;

    toast.style.transform = 'translateX(0)';

    setTimeout(() => {
        toast.style.transform = 'translateX(100%)';
    }, 5000);
}

// ==========================================
// GLOBAL ERROR HANDLING
// ==========================================

window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    showToast('error', 'Something went wrong', 'Please refresh the page and try again');
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    showToast('error', 'Something went wrong', 'Please refresh the page and try again');
});
