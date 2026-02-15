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
let currentCalendarDate = new Date();
let taskListener = null;  // For real-time listener cleanup

// ==========================================
// SUBJECT COLORS (Auto-Color Feature)
// ==========================================

// Predefined color palette for subjects
const SUBJECT_COLORS = [
    '#6366F1', // Indigo
    '#EC4899', // Pink
    '#8B5CF6', // Purple
    '#14B8A6', // Teal
    '#F59E0B', // Amber
    '#10B981', // Emerald
    '#3B82F6', // Blue
    '#EF4444', // Red
    '#F97316', // Orange
    '#06B6D4', // Cyan
    '#84CC16', // Lime
    '#A855F7', // Violet
];

// Store colors for each unique subject
// Feature 1: Subject Auto-Color + Filter
let subjectColorMap = {};

// Get or generate color for a subject
// Feature 1: Subject Auto-Color + Filter
function generateSubjectColor(subject) {
    if (!subject) return SUBJECT_COLORS[0];
    
    const normalizedSubject = subject.trim().toLowerCase();
    
    // Return existing color if subject already has one
    if (subjectColorMap[normalizedSubject]) {
        return subjectColorMap[normalizedSubject];
    }
    
    // Generate new color based on existing subjects
    const usedColors = Object.values(subjectColorMap);
    let colorIndex = Object.keys(subjectColorMap).length % SUBJECT_COLORS.length;
    
    // Find an unused color if possible
    while (usedColors.includes(SUBJECT_COLORS[colorIndex])) {
        colorIndex = (colorIndex + 1) % SUBJECT_COLORS.length;
    }
    
    subjectColorMap[normalizedSubject] = SUBJECT_COLORS[colorIndex];
    return subjectColorMap[normalizedSubject];
}

// Alias for backward compatibility
function getSubjectColor(subject) {
    return generateSubjectColor(subject);
}

// Get unique subjects from all tasks
function getUniqueSubjects() {
    const subjects = new Set();
    tasks.forEach(task => {
        if (task.subject) {
            subjects.add(task.subject);
        }
    });
    return Array.from(subjects).sort();
}

// Populate subject filter dropdown
function populateSubjectFilter() {
    const subjectFilter = document.getElementById('subjectFilter');
    if (!subjectFilter) return;
    
    const currentValue = subjectFilter.value;
    const uniqueSubjects = getUniqueSubjects();
    
    // Keep the first option (All Subjects)
    subjectFilter.innerHTML = '<option value="">All Subjects</option>';
    
    // Add each unique subject as an option
    uniqueSubjects.forEach(subject => {
        const option = document.createElement('option');
        option.value = subject;
        option.textContent = subject;
        subjectFilter.appendChild(option);
    });
    
    // Restore selected value if it still exists
    if (currentValue && uniqueSubjects.includes(currentValue)) {
        subjectFilter.value = currentValue;
    }
}

// ==========================================
// DOM ELEMENTS
// ==========================================

const loadingScreen = document.getElementById('loadingScreen');
const authScreen = document.getElementById('authScreen');
const dashboardScreen = document.getElementById('dashboardScreen');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const taskModal = document.getElementById('taskModal');
const calendarModal = document.getElementById('calendarModal');
const taskDetailsModal = document.getElementById('taskDetailsModal');
const tasksContainer = document.getElementById('tasksContainer');
const emptyState = document.getElementById('emptyState');
const subjectStatsModal = document.getElementById('subjectStatsModal');

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

    loadTasks();
    
    // Setup automatic email reminders (checks every hour)
    setupAutomaticReminders();

    // Setup calendar event listeners after dashboard is shown
    setupCalendarEventListeners();
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

    // Use event delegation for calendar button since it's in the dashboard
    document.addEventListener('click', function(e) {
        if (e.target.closest('#calendarBtn')) openCalendarModal();
    });

    const closeCalendarModalBtn = document.getElementById('closeCalendarModal');
    if (closeCalendarModalBtn) closeCalendarModalBtn.addEventListener('click', closeCalendarModal);

    const closeTaskDetailsModalBtn = document.getElementById('closeTaskDetailsModal');
    if (closeTaskDetailsModalBtn) closeTaskDetailsModalBtn.addEventListener('click', closeTaskDetailsModal);

    // Subject Stats Modal
    const closeSubjectStatsModalBtn = document.getElementById('closeSubjectStatsModal');
    if (closeSubjectStatsModalBtn) closeSubjectStatsModalBtn.addEventListener('click', closeSubjectStatsModal);

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

    // Subject filter
    const subjectFilter = document.getElementById('subjectFilter');
    if (subjectFilter) subjectFilter.addEventListener('change', filterTasks);

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
        // Detach the task listener if it exists
        if (taskListener) {
            taskListener();  // This stops the listener
            taskListener = null;
        }
        await auth.signOut();
        showToast('info', 'Logged Out', 'See you next time!');
    } catch (error) {
        console.error('Logout error:', error);
        showToast('error', 'Logout Failed', 'Could not log out');
    }
}

// ==========================================
// TASK MANAGEMENT
// ==========================================

// ==========================================
// TASK LOADING
// ==========================================

async function loadTasks() {
    if (!currentUser) return;

    // Clean up existing listener if any
    if (taskListener) {
        taskListener();
        taskListener = null;
    }

    try {
        // Set up real-time listener for tasks
        taskListener = db.collection('tasks')
            .where('userId', '==', currentUser.id)
            .orderBy('dueDate', 'asc')
            .onSnapshot((snapshot) => {
                tasks = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    // Convert Firestore Timestamp to JavaScript Date for dueDate
                    dueDate: doc.data().dueDate ? doc.data().dueDate.toDate() : null,
                    completedAt: doc.data().completedAt ? doc.data().completedAt.toDate() : null,
                    createdAt: doc.data().createdAt ? doc.data().createdAt.toDate() : null,
                    updatedAt: doc.data().updatedAt ? doc.data().updatedAt.toDate() : null
                }));

                // Also process any tasks that might have dueDate as string (from manual input)
                tasks = tasks.map(task => {
                    if (task.dueDate && typeof task.dueDate === 'string') {
                        task.dueDate = new Date(task.dueDate);
                    }
                    return task;
                });

                renderTasks();
                updateStatistics();
            }, (error) => {
                console.error('Error listening to tasks:', error);
                showToast('error', 'Error', 'Failed to load tasks');
            });

    } catch (error) {
        console.error('Error loading tasks:', error);
        showToast('error', 'Error', 'Failed to load tasks');
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
        
        // Fix: Convert Date object to ISO string format for datetime-local input
        let dueDateValue = '';
        if (task.dueDate) {
            const dueDate = new Date(task.dueDate);
            // Format as YYYY-MM-DDTHH:mm for datetime-local input
            dueDateValue = dueDate.toISOString().slice(0, 16);
        }
        document.getElementById('taskDueDate').value = dueDateValue;
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
                    ${task.completedAt? `<div class="flex items-center text-sm text-green-600 mt-2"><i class="fas fa-check mr-2"></i><span>Completed: ${formatDateTime(task.completedAt)}</span></div>` : ''}
                </div>

                <div class="flex justify-between items-center">
<button onclick="toggleTaskStatus('${task.id}')" class="flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${task.status === 'completed' ? 'bg-gray-200 text-gray-700 hover:bg-gray-300 hover:scale-105' : 'bg-green-600 text-white hover:bg-green-700 hover:scale-105 shadow-md hover:shadow-lg'}">
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
        .replace(/'/g, "&#39;");
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
    const subjectFilterEl = document.getElementById('subjectFilter');
    const subjectFilter = subjectFilterEl ? subjectFilterEl.value : '';

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
        if (statusFilter === 'overdue') {
            // For overdue filter, check if due date is in the past and status is pending
            filtered = filtered.filter(task => {
                const dueDate = new Date(task.dueDate);
                return dueDate < new Date() && task.status === 'pending';
            });
        } else {
            filtered = filtered.filter(task => task.status === statusFilter);
        }
    }

    // Feature 1: Subject filter
    if (subjectFilter) {
        filtered = filtered.filter(task => task.subject === subjectFilter);
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
// CALENDAR
// ==========================================

function openCalendarModal() {
    if (calendarModal) {
        calendarModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        renderCalendar();
    }
}

function closeCalendarModal() {
    if (calendarModal) {
        calendarModal.classList.add('hidden');
        document.body.style.overflow = 'auto';
    }
}

function closeTaskDetailsModal() {
    if (taskDetailsModal) {
        taskDetailsModal.classList.add('hidden');
        document.body.style.overflow = 'auto';
    }
}

function navigateMonth(direction) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + direction);
    renderCalendar();
}

function renderCalendar() {
    const calendarDays = document.getElementById('calendarDays');
    const calendarMonthYear = document.getElementById('calendarMonthYear');

    if (!calendarDays || !calendarMonthYear) return;

    // Update month/year header
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];
    calendarMonthYear.textContent = `${monthNames[currentCalendarDate.getMonth()]} ${currentCalendarDate.getFullYear()}`;

    // Clear previous calendar
    calendarDays.innerHTML = '';

    // Get first day of month and last day of month
    const firstDay = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), 1);
    const lastDay = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay()); // Start from Sunday

    // Generate calendar days
    const currentDate = new Date(startDate);
    for (let i = 0; i < 42; i++) { // 6 weeks * 7 days
        const dayDate = new Date(currentDate); // Create a copy for this day
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day p-2 border border-gray-200 min-h-[80px] cursor-pointer hover:bg-gray-50 transition-colors';

        const dayNumber = dayDate.getDate();
        const isCurrentMonth = dayDate.getMonth() === currentCalendarDate.getMonth();
        const isToday = dayDate.toDateString() === new Date().toDateString();

        // Add day number
        const dayNumberDiv = document.createElement('div');
        dayNumberDiv.className = `text-sm font-medium mb-1 ${isCurrentMonth ? 'text-gray-900' : 'text-gray-400'} ${isToday ? 'bg-indigo-600 text-white rounded-full w-6 h-6 flex items-center justify-center' : ''}`;
        dayNumberDiv.textContent = dayNumber;
        dayDiv.appendChild(dayNumberDiv);

        // Add tasks for this day
        const dayTasks = getTasksForDate(dayDate);
        if (dayTasks.length > 0) {
            const tasksDiv = document.createElement('div');
            tasksDiv.className = 'space-y-1';

            dayTasks.slice(0, 3).forEach(task => {
                const taskDiv = document.createElement('div');
                taskDiv.className = `text-xs p-1 rounded truncate ${
                    task.status === 'completed' ? 'bg-green-100 text-green-800' :
                    task.priority === 'high' ? 'bg-red-100 text-red-800' :
                    task.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-blue-100 text-blue-800'
                }`;
                taskDiv.textContent = task.title;
                taskDiv.title = task.title; // Full title on hover
                tasksDiv.appendChild(taskDiv);
            });

            if (dayTasks.length > 3) {
                const moreDiv = document.createElement('div');
                moreDiv.className = 'text-xs text-gray-500 text-center';
                moreDiv.textContent = `+${dayTasks.length - 3} more`;
                tasksDiv.appendChild(moreDiv);
            }

            dayDiv.appendChild(tasksDiv);

            // Make clickable if there are tasks
            dayDiv.onclick = () => showTaskDetails(dayDate);
        }

        calendarDays.appendChild(dayDiv);
        currentDate.setDate(currentDate.getDate() + 1);
    }
}

function getTasksForDate(date) {
    // Use local date to avoid timezone issues (UTC conversion was causing date shifts)
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${day}`; // YYYY-MM-DD format in local time
    
    return tasks.filter(task => {
        // Also use local date for task comparison
        const taskDueDate = new Date(task.dueDate);
        const taskYear = taskDueDate.getFullYear();
        const taskMonth = String(taskDueDate.getMonth() + 1).padStart(2, '0');
        const taskDay = String(taskDueDate.getDate()).padStart(2, '0');
        const taskDate = `${taskYear}-${taskMonth}-${taskDay}`;
        return taskDate === dateString;
    });
}

function showTaskDetails(date) {
    const dayTasks = getTasksForDate(date);
    const taskDetailsDate = document.getElementById('taskDetailsDate');
    const taskDetailsContent = document.getElementById('taskDetailsContent');

    if (!taskDetailsDate || !taskDetailsContent) return;

    // Format date for display
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    taskDetailsDate.textContent = date.toLocaleDateString('en-US', options);

    if (dayTasks.length === 0) {
        taskDetailsContent.innerHTML = '<p class="text-gray-500 text-center">No tasks for this date</p>';
    } else {
        taskDetailsContent.innerHTML = dayTasks.map(task => {
            const dueDate = new Date(task.dueDate);
            const now = new Date();
            const isOverdue = dueDate < now && task.status === 'pending';

            return `
                <div class="bg-white rounded-lg border border-gray-200 p-4 mb-3">
                    <div class="flex justify-between items-start mb-2">
                        <h4 class="font-semibold text-gray-900 ${task.status === 'completed' ? 'line-through text-gray-500' : ''}">${escapeHtml(task.title)}</h4>
                        <span class="px-2 py-1 text-xs font-medium rounded-full ${
                            task.status === 'completed' ? 'bg-green-100 text-green-800' :
                            task.priority === 'high' ? 'bg-red-100 text-red-800' :
                            task.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-blue-100 text-blue-800'
                        }">
                            ${task.status === 'completed' ? 'COMPLETED' : task.priority.toUpperCase()}
                        </span>
                    </div>
                    <p class="text-sm text-gray-600 mb-1">${escapeHtml(task.subject)}</p>
                    ${task.description ? `<p class="text-sm text-gray-500 mb-2">${escapeHtml(task.description)}</p>` : ''}
                    <div class="flex items-center text-sm text-gray-600 mb-2">
                        <i class="fas fa-clock mr-2"></i>
                        <span>Due: ${formatDateTime(task.dueDate)}</span>
                    </div>
                    ${isOverdue ? '<div class="flex items-center text-sm text-red-600"><i class="fas fa-exclamation-triangle mr-2"></i><span>Overdue!</span></div>' : ''}
                    <div class="flex justify-end space-x-2 mt-3">
                        <button onclick="editTask('${task.id}'); closeTaskDetailsModal(); closeCalendarModal();" class="text-indigo-600 hover:text-indigo-700 text-sm transition-colors">
                            <i class="fas fa-edit mr-1"></i>Edit
                        </button>
<button onclick="toggleTaskStatus('${task.id}'); closeTaskDetailsModal(); renderCalendar();" class="flex items-center justify-center px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 ${task.status === 'completed' ? 'bg-gray-200 text-gray-700 hover:bg-gray-300 hover:scale-105' : 'bg-green-600 text-white hover:bg-green-700 hover:scale-105 shadow-sm hover:shadow-md'}">
                            <i class="fas ${task.status === 'completed' ? 'fa-undo' : 'fa-check-circle'} mr-1"></i>
                            ${task.status === 'completed' ? 'Mark Pending' : 'Mark Complete'}
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    if (taskDetailsModal) {
        taskDetailsModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
}

// ==========================================
// CALENDAR EVENT LISTENERS
// ==========================================

function setupCalendarEventListeners() {
    const calendarBtn = document.getElementById('calendarBtn');
    if (calendarBtn) calendarBtn.addEventListener('click', openCalendarModal);

    const prevMonthBtn = document.getElementById('prevMonth');
    if (prevMonthBtn) prevMonthBtn.addEventListener('click', () => navigateMonth(-1));

    const nextMonthBtn = document.getElementById('nextMonth');
    if (nextMonthBtn) nextMonthBtn.addEventListener('click', () => navigateMonth(1));

    const closeCalendarModalBtn = document.getElementById('closeCalendarModal');
    if (closeCalendarModalBtn) closeCalendarModalBtn.addEventListener('click', closeCalendarModal);

    const closeTaskDetailsModalBtn = document.getElementById('closeTaskDetailsModal');
    if (closeTaskDetailsModalBtn) closeTaskDetailsModalBtn.addEventListener('click', closeTaskDetailsModal);
}

// ==========================================
// FEATURE 2: SMART PRIORITY SCORE SYSTEM
// ==========================================

/**
 * Calculate priority score for a task
 * Combines priority level with days until due date
 * Higher score = more urgent
 */
function calculatePriorityScore(task) {
    if (!task) return 0;
    
    // Priority values
    const priorityValues = {
        'low': 1,
        'medium': 2,
        'high': 3
    };
    
    const priorityValue = priorityValues[task.priority] || 1;
    
    // Calculate days until due date
    const now = new Date();
    const dueDate = new Date(task.dueDate);
    const diffTime = dueDate - now;
    const daysLeft = diffTime / (1000 * 60 * 60 * 24);
    
    // Urgency calculation based on days left
    let urgencyScore = 0;
    
    if (daysLeft < 0) {
        // Overdue: maximum urgency
        urgencyScore = 100;
    } else if (daysLeft <= 1) {
        // Due today or tomorrow
        urgencyScore = 80 + (20 * (1 - daysLeft));
    } else if (daysLeft <= 3) {
        // Due in 2-3 days
        urgencyScore = 60 + (20 * (1 - (daysLeft - 1) / 2));
    } else if (daysLeft <= 7) {
        // Due this week
        urgencyScore = 40 + (20 * (1 - (daysLeft - 3) / 4));
    } else if (daysLeft <= 14) {
        // Due in 1-2 weeks
        urgencyScore = 20 + (20 * (1 - (daysLeft - 7) / 7));
    } else {
        // Due later
        urgencyScore = 10 * (1 - Math.min((daysLeft - 14) / 30, 1));
    }
    
    // Combine priority weight (40%) with urgency (60%)
    const priorityWeight = priorityValue * 40;
    const urgencyWeight = urgencyScore * 0.6;
    
    return Math.round(priorityWeight + urgencyWeight);
}

/**
 * Get priority badge info based on score
 */
function getPriorityBadgeInfo(score) {
    if (score >= 80) {
        return {
            label: 'CRITICAL',
            class: 'priority-score-critical',
            icon: 'fa-exclamation-circle'
        };
    } else if (score >= 50) {
        return {
            label: 'HIGH',
            class: 'priority-score-high',
            icon: 'fa-arrow-up'
        };
    } else {
        return {
            label: 'NORMAL',
            class: 'priority-score-normal',
            icon: 'fa-minus'
        };
    }
}

/**
 * Sort tasks by priority score (highest first)
 */
function sortTasksByPriorityScore(tasksArray) {
    return [...tasksArray].sort((a, b) => {
        const scoreA = calculatePriorityScore(a);
        const scoreB = calculatePriorityScore(b);
        return scoreB - scoreA; // Descending order
    });
}

// ==========================================
// FEATURE 3: PRODUCTIVITY ANALYTICS DASHBOARD
// ==========================================

// Chart instance
let analyticsChart = null;

/**
 * Update analytics dashboard with task data
 * Call this function from onSnapshot or loadTasks
 */
function updateAnalytics(tasksArray) {
    if (!tasksArray || tasksArray.length === 0) {
        clearAnalytics();
        return;
    }
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfWeek = new Date(today);
    endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
    
    // Calculate analytics
    const totalTasks = tasksArray.length;
    const completedTasks = tasksArray.filter(t => t.status === 'completed').length;
    const pendingTasks = tasksArray.filter(t => t.status === 'pending').length;
    const overdueTasks = tasksArray.filter(t => {
        const dueDate = new Date(t.dueDate);
        return dueDate < now && t.status === 'pending';
    }).length;
    
    // Completion rate
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    
    // Tasks due this week
    const dueThisWeek = tasksArray.filter(t => {
        const dueDate = new Date(t.dueDate);
        return dueDate >= today && dueDate <= endOfWeek && t.status === 'pending';
    }).length;
    
    // Subject with most tasks
    const subjectCounts = {};
    tasksArray.forEach(task => {
        const subject = task.subject || 'Uncategorized';
        subjectCounts[subject] = (subjectCounts[subject] || 0) + 1;
    });
    
    let topSubject = 'None';
    let maxCount = 0;
    for (const [subject, count] of Object.entries(subjectCounts)) {
        if (count > maxCount) {
            maxCount = count;
            topSubject = subject;
        }
    }
    
    // Update DOM elements
    const totalEl = document.getElementById('totalTasks');
    const completedEl = document.getElementById('completedTasks');
    const pendingEl = document.getElementById('pendingTasks');
    const overdueEl = document.getElementById('overdueTasks');
    
    if (totalEl) totalEl.textContent = totalTasks;
    if (completedEl) completedEl.textContent = completedTasks;
    if (pendingEl) pendingEl.textContent = pendingTasks;
    if (overdueEl) overdueEl.textContent = overdueTasks;
    
    // Update extended analytics if elements exist
    updateExtendedAnalytics({
        completionRate,
        dueThisWeek,
        topSubject
    });
}

/**
 * Update extended analytics display
 */
function updateExtendedAnalytics(data) {
    // Determine color based on completion rate
    let colorClass, strokeColor, iconName;
    if (data.completionRate < 30) {
        colorClass = 'completion-rate-low';
        strokeColor = '#EF4444'; // Red
        iconName = 'fa-tired';
    } else if (data.completionRate < 70) {
        colorClass = 'completion-rate-medium';
        strokeColor = '#F59E0B'; // Yellow/Amber
        iconName = 'fa-meh';
    } else {
        colorClass = 'completion-rate-high';
        strokeColor = '#10B981'; // Green
        iconName = 'fa-grin-stars';
    }
    
    // Calculate stroke dasharray for SVG circle
    const radius = 55;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (data.completionRate / 100) * circumference;
    
    // Create or update extended stats if container exists
    let extendedContainer = document.getElementById('extendedAnalytics');
    if (!extendedContainer) {
        // Create extended analytics section with ONLY the completion rate display
        // (Subject analytics are handled by static HTML cards updated by updateSubjectAnalytics)
        extendedContainer = document.createElement('div');
        extendedContainer.id = 'extendedAnalytics';
        extendedContainer.className = 'grid grid-cols-1 md:grid-cols-1 gap-6 mb-8';
        extendedContainer.innerHTML = `
            <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
                <div class="text-center">
                    <div class="completion-rate-container animate" id="completionRateContainer">
                        <svg class="completion-rate-svg completion-rate-shadow" viewBox="0 0 140 140">
                            <circle class="completion-rate-bg" cx="70" cy="70" r="${radius}"></circle>
                            <circle class="completion-rate-progress ${data.completionRate >= 70 ? 'pulsing' : ''}" 
                                id="completionRateProgress"
                                cx="70" cy="70" r="${radius}"
                                stroke="${strokeColor}"
                                style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${offset};">
                            </circle>
                        </svg>
                        <div class="completion-rate-inner">
                            <i id="completionRateIcon" class="fas ${iconName} completion-rate-icon ${colorClass}"></i>
                            <span id="completionRatePercent" class="completion-rate-percent ${colorClass}">${data.completionRate}%</span>
                            <span class="completion-rate-label">Complete</span>
                        </div>
                        <div class="completion-celebration" id="completionCelebration"></div>
                    </div>
                    <p class="text-sm font-medium text-gray-600 mt-4">Completion Rate</p>
                </div>
            </div>
        `;
        
        // Insert after the basic statistics cards
        const statsCards = document.querySelector('.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-5');
        if (statsCards && statsCards.nextSibling) {
            statsCards.parentNode.insertBefore(extendedContainer, statsCards.nextSibling);
        }
        
        // Trigger celebration if 100%
        if (data.completionRate === 100) {
            setTimeout(() => triggerCelebration(), 600);
        }
    } else {
        // Update existing elements
        const completionProgress = document.getElementById('completionRateProgress');
        const completionPercent = document.getElementById('completionRatePercent');
        const completionIcon = document.getElementById('completionRateIcon');
        const completionContainer = document.getElementById('completionRateContainer');
        
        if (completionProgress) {
            completionProgress.style.strokeDashoffset = offset;
            completionProgress.setAttribute('stroke', strokeColor);
            
            // Toggle pulse animation based on completion rate
            if (data.completionRate >= 70) {
                completionProgress.classList.add('pulsing');
            } else {
                completionProgress.classList.remove('pulsing');
            }
        }
        if (completionPercent) {
            completionPercent.textContent = `${data.completionRate}%`;
            completionPercent.className = `completion-rate-percent ${colorClass}`;
        }
        if (completionIcon) {
            completionIcon.className = `fas ${iconName} completion-rate-icon ${colorClass}`;
        }
        
        // Re-trigger animation on update
        if (completionContainer) {
            completionContainer.classList.remove('animate');
            void completionContainer.offsetWidth; // Trigger reflow
            completionContainer.classList.add('animate');
        }
        
        // Trigger celebration if 100%
        if (data.completionRate === 100) {
            setTimeout(() => triggerCelebration(), 300);
        }
    }
}

/**
 * Trigger celebration effect when completion reaches 100%
 */
function triggerCelebration() {
    const celebrationContainer = document.getElementById('completionCelebration');
    if (!celebrationContainer) return;
    
    const colors = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899'];
    const particleCount = 12;
    
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'completion-particle';
        
        // Random position around the circle
        const angle = (i / particleCount) * 2 * Math.PI;
        const distance = 60 + Math.random() * 20;
        const tx = Math.cos(angle) * distance;
        const ty = Math.sin(angle) * distance;
        
        particle.style.cssText = `
            left: 50%;
            top: 50%;
            background-color: ${colors[i % colors.length]};
            --tx: ${tx}px;
            --ty: ${ty}px;
            animation-delay: ${i * 0.05}s;
        `;
        
        celebrationContainer.appendChild(particle);
    }
    
    // Clean up particles after animation
    setTimeout(() => {
        celebrationContainer.innerHTML = '';
    }, 1500);
}

/**
 * Clear analytics display
 */
function clearAnalytics() {
    const totalEl = document.getElementById('totalTasks');
    const completedEl = document.getElementById('completedTasks');
    const pendingEl = document.getElementById('pendingTasks');
    const overdueEl = document.getElementById('overdueTasks');
    
    if (totalEl) totalEl.textContent = '0';
    if (completedEl) completedEl.textContent = '0';
    if (pendingEl) pendingEl.textContent = '0';
    if (overdueEl) overdueEl.textContent = '0';
    
    if (analyticsChart) {
        analyticsChart.destroy();
        analyticsChart = null;
    }
}

// ==========================================
// FEATURE 4: AUTOMATIC EMAIL REMINDER SYSTEM
// ==========================================

// Store interval ID for cleanup
let emailReminderInterval = null;

/**
 * Setup automatic email reminder check (runs every hour)
 */
function setupAutomaticReminders() {
    // Clear any existing interval
    if (emailReminderInterval) {
        clearInterval(emailReminderInterval);
    }
    
    // Check immediately on load
    checkAndSendReminders();
    
    // Then check every hour (60 minutes * 60 seconds * 1000ms)
    emailReminderInterval = setInterval(() => {
        checkAndSendReminders();
    }, 60 * 60 * 1000);
    
    console.log('Automatic reminder system started');
}

/**
 * Check tasks and send automatic reminders
 */
async function checkAndSendReminders() {
    if (!currentUser || !isOnline) return;
    
    try {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(23, 59, 59, 999);
        
        // Find tasks due tomorrow that haven't been completed
        // and haven't had a reminder sent yet
        const tasksToRemind = tasks.filter(task => {
            if (task.status === 'completed') return false;
            if (task.reminderSent === true) return false;
            
            const dueDate = new Date(task.dueDate);
            return dueDate <= tomorrow && dueDate > now;
        });
        
        if (tasksToRemind.length === 0) {
            console.log('No tasks need reminders');
            return;
        }
        
        console.log(`Found ${tasksToRemind.length} tasks needing reminders`);
        
        // Send reminder email
        await sendReminderEmail(tasksToRemind);
        
        // Update Firestore to mark reminders as sent
        for (const task of tasksToRemind) {
            await db.collection('tasks').doc(task.id).update({
                reminderSent: true,
                reminderSentAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        showToast('success', 'Reminders Sent', `${tasksToRemind.length} reminder(s) sent for tomorrow's tasks`);
        
    } catch (error) {
        console.error('Error checking reminders:', error);
    }
}

/**
 * Send reminder email for tasks due tomorrow
 */
async function sendReminderEmail(reminderTasks) {
    if (!EMAIL_CONFIG.serviceId || !currentUser || !currentUser.email) {
        console.log('Email not configured or no user');
        return;
    }
    
    const templateParams = {
        student_name: currentUser.name,
        task_count: reminderTasks.length,
        task_titles: reminderTasks.map(t => t.title).join(', '),
        due_date: reminderTasks.length === 1 
            ? formatDateTime(reminderTasks[0].dueDate)
            : 'tomorrow',
        to_email: currentUser.email
    };
    
    try {
        await emailjs.send(
            EMAIL_CONFIG.serviceId,
            EMAIL_CONFIG.templates.upcoming,
            templateParams
        );
        console.log('Reminder email sent successfully');
    } catch (error) {
        console.error('Failed to send reminder email:', error);
    }
}

/**
 * Stop automatic reminders (for cleanup)
 */
function stopAutomaticReminders() {
    if (emailReminderInterval) {
        clearInterval(emailReminderInterval);
        emailReminderInterval = null;
        console.log('Automatic reminders stopped');
    }
}

// ==========================================
// FEATURE 5: STUDY LOAD WARNING BANNER
// ==========================================

/**
 * Check study load and show warning banner
 * Call this function whenever tasks change
 */
function checkStudyLoad(tasksArray) {
    const banner = document.getElementById('studyLoadBanner');
    if (!banner) return;
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Count tasks due tomorrow (not completed)
    const tasksDueTomorrow = tasksArray.filter(task => {
        if (task.status === 'completed') return false;
        
        const dueDate = new Date(task.dueDate);
        return dueDate >= today && dueDate < tomorrow;
    }).length;
    
    // Get elements
    const icon = document.getElementById('studyLoadIcon');
    const title = document.getElementById('studyLoadTitle');
    const message = document.getElementById('studyLoadMessage');
    
    // Reset classes
    banner.classList.remove('hidden', 'warning', 'danger');
    
    if (tasksDueTomorrow >= 5) {
        // Red danger banner
        banner.classList.add('danger');
        if (icon) icon.className = 'mr-3 text-xl fas fa-exclamation-triangle';
        if (title) title.textContent = `⚠️ Heavy Workload: ${tasksDueTomorrow} tasks due tomorrow!`;
        if (message) message.textContent = 'You have a lot of tasks due tomorrow. Consider starting early!';
        banner.classList.remove('hidden');
    } else if (tasksDueTomorrow >= 3) {
        // Yellow warning banner
        banner.classList.add('warning');
        if (icon) icon.className = 'mr-3 text-xl fas fa-exclamation-circle';
        if (title) title.textContent = `📚 ${tasksDueTomorrow} tasks due tomorrow`;
        if (message) message.textContent = 'You have several tasks due tomorrow. Plan accordingly!';
        banner.classList.remove('hidden');
    } else {
        // Less than 3 - hide banner
        banner.classList.add('hidden');
    }
}

// ==========================================
// ENHANCED RENDERING WITH NEW FEATURES
// ==========================================

/**
 * Enhanced renderTasks with subject colors and priority scores
 * This replaces the existing renderTasks function
 */
function renderTasks() {
    const filteredTasks = getFilteredTasks();
    
    // Sort by priority score (highest first)
    const sortedTasks = sortTasksByPriorityScore(filteredTasks);

    if (!tasksContainer) return;

    if (sortedTasks.length === 0) {
        tasksContainer.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }

    tasksContainer.classList.remove('hidden');
    emptyState.classList.add('hidden');

    tasksContainer.innerHTML = sortedTasks.map(task => {
        const dueDate = new Date(task.dueDate);
        const now = new Date();
        const isOverdue = dueDate < now && task.status === 'pending';
        const isDueSoon = dueDate - now < 24 * 60 * 60 * 1000 && dueDate > now && task.status === 'pending';
        
        // Get subject color
        const subjectColor = getSubjectColor(task.subject);
        
        // Calculate priority score
        const priorityScore = calculatePriorityScore(task);
        const priorityBadge = getPriorityBadgeInfo(priorityScore);

        return `
            <div class="task-card bg-white rounded-xl shadow-sm border border-gray-200 p-6 priority-${task.priority} fade-in" style="border-left-color: ${subjectColor} !important;">
                <div class="flex justify-between items-start mb-4">
                    <div class="flex-1">
                        <h3 class="text-lg font-semibold text-gray-900 mb-1 ${task.status === 'completed' ? 'line-through text-gray-500' : ''}">${escapeHtml(task.title)}</h3>
                        <div class="flex items-center mb-2">
                            <span class="subject-badge" style="background-color: ${subjectColor};">
                                ${escapeHtml(task.subject)}
                            </span>
                        </div>
                        ${task.description ? `<p class="text-sm text-gray-500 mb-3">${escapeHtml(task.description)}</p>` : ''}
                    </div>
                    <div class="flex flex-col items-end space-y-2">
                        <span class="px-2 py-1 text-xs font-medium rounded-full priority-badge-${task.priority}">
                            ${escapeHtml(task.priority.toUpperCase())}
                        </span>
                        <span class="px-2 py-1 text-xs font-medium rounded-full ${priorityBadge.class}">
                            <i class="fas ${priorityBadge.icon} mr-1"></i>${priorityBadge.label}
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
                    <button onclick="toggleTaskStatus('${task.id}')" class="flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${task.status === 'completed' ? 'bg-gray-200 text-gray-700 hover:bg-gray-300 hover:scale-105' : 'bg-green-600 text-white hover:bg-green-700 hover:scale-105 shadow-md hover:shadow-lg'}">
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

/**
 * Enhanced updateStatistics - now calls analytics too
 */
function updateStatistics() {
    // Call the basic statistics update
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
    
    // Update Due This Week subjects
    updateDueThisWeek();
    
    // Call enhanced analytics
    updateAnalytics(tasks);
    
    // Call subject analytics - updates Top Subject, Most Urgent, and All Subjects cards
    updateSubjectAnalytics();
    
    // Call study load check
    checkStudyLoad(tasks);
    
    // Update subject filter
    populateSubjectFilter();
}

/**
 * Get unique subjects due this week with task counts
 * Returns an object with subject names as keys and task counts as values
 */
function getSubjectsDueThisWeek() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfWeek = new Date(today);
    endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
    endOfWeek.setHours(23, 59, 59, 999);

    // Get pending tasks due this week
    const tasksDueThisWeek = tasks.filter(t => {
        if (t.status === 'completed') return false;
        const dueDate = new Date(t.dueDate);
        return dueDate >= today && dueDate <= endOfWeek;
    });

    // Get subjects with their task counts
    const subjectCounts = {};
    tasksDueThisWeek.forEach(task => {
        if (task.subject) {
            if (!subjectCounts[task.subject]) {
                subjectCounts[task.subject] = 0;
            }
            subjectCounts[task.subject]++;
        }
    });

    // Sort by subject name
    const sortedSubjects = Object.keys(subjectCounts).sort();
    
    // Create an array of objects with subject and count
    return sortedSubjects.map(subject => ({
        name: subject,
        count: subjectCounts[subject]
    }));
}

/**
 * Update the Due This Week card with subjects
 */
function updateDueThisWeek() {
    const dueThisWeekEl = document.getElementById('dueThisWeekSubjects');
    if (!dueThisWeekEl) return;

    const subjectsDueThisWeek = getSubjectsDueThisWeek();

    if (subjectsDueThisWeek.length === 0) {
        dueThisWeekEl.innerHTML = '<span class="text-gray-400 text-xs">No tasks due</span>';
        return;
    }

    // Create badges for each subject with task count
    const badgesHTML = subjectsDueThisWeek.slice(0, 4).map(subject => {
        const color = getSubjectColor(subject.name);
        return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mr-1 mb-1" style="background-color: ${color}20; color: ${color};">${escapeHtml(subject.name)} <span class="ml-1 bg-opacity-30 bg-white px-1 rounded">${subject.count}</span></span>`;
    }).join('');

    const moreText = subjectsDueThisWeek.length > 4 ? `<span class="text-gray-500 text-xs">+${subjectsDueThisWeek.length - 4} more</span>` : '';

    dueThisWeekEl.innerHTML = badgesHTML + moreText;
}

// ==========================================
// SUBJECT ANALYTICS FUNCTIONS
// ==========================================

/**
 * Open the Subject Stats Modal
 */
function openSubjectStatsModal() {
    if (subjectStatsModal) {
        subjectStatsModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        renderSubjectStats();
    }
}

/**
 * Close the Subject Stats Modal
 */
function closeSubjectStatsModal() {
    if (subjectStatsModal) {
        subjectStatsModal.classList.add('hidden');
        document.body.style.overflow = 'auto';
    }
}

/**
 * Filter tasks by subject
 * @param {string} subject - Subject name, 'top' for top subject, or 'urgent' for most urgent subject
 */
function filterBySubject(subject) {
    const subjectFilter = document.getElementById('subjectFilter');
    if (!subjectFilter) return;
    
    let targetSubject = subject;
    
    if (subject === 'top') {
        // Get the subject with most tasks
        const stats = getSubjectStats();
        if (stats.length > 0) {
            targetSubject = stats[0].name;
        }
    } else if (subject === 'urgent') {
        // Get the subject with most urgent/overdue tasks
        const stats = getSubjectStats();
        const urgentSubject = stats.find(s => s.overdueCount > 0 || s.urgentCount > 0);
        if (urgentSubject) {
            targetSubject = urgentSubject.name;
        } else if (stats.length > 0) {
            targetSubject = stats[0].name;
        }
    }
    
    // Set the filter value
    subjectFilter.value = targetSubject;
    
    // Apply the filter
    filterTasks();
    
    // Show toast notification
    showToast('info', 'Filter Applied', `Showing tasks for: ${targetSubject}`);
}

/**
 * Get statistics for all subjects
 * @returns {Array} Array of subject statistics objects
 */
function getSubjectStats() {
    const subjectMap = {};
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);
    
    // Calculate stats for each subject
    tasks.forEach(task => {
        const subject = task.subject || 'Uncategorized';
        
        if (!subjectMap[subject]) {
            subjectMap[subject] = {
                name: subject,
                total: 0,
                completed: 0,
                pending: 0,
                overdue: 0,
                urgent: 0,
                color: getSubjectColor(subject)
            };
        }
        
        const stats = subjectMap[subject];
        stats.total++;
        
        if (task.status === 'completed') {
            stats.completed++;
        } else {
            stats.pending++;
            
            const dueDate = new Date(task.dueDate);
            
            // Check if overdue
            if (dueDate < now) {
                stats.overdue++;
            }
            // Check if urgent (due within 24 hours)
            else if (dueDate <= tomorrow) {
                stats.urgent++;
            }
        }
    });
    
    // Convert to array and sort by total tasks (descending)
    const statsArray = Object.values(subjectMap).sort((a, b) => b.total - a.total);
    
    // Add completion rate
    statsArray.forEach(stats => {
        stats.completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
    });
    
    return statsArray;
}

/**
 * Update the subject analytics cards in the dashboard
 */
function updateSubjectAnalytics() {
    const stats = getSubjectStats();
    
    // Update Top Subject card
    const topSubjectEl = document.getElementById('topSubject');
    const topSubjectCountEl = document.getElementById('topSubjectCount');
    
    if (stats.length > 0) {
        const topSubject = stats[0];
        if (topSubjectEl) topSubjectEl.textContent = topSubject.name;
        if (topSubjectCountEl) topSubjectCountEl.textContent = `${topSubject.total} tasks (${topSubject.completionRate}% complete)`;
    } else {
        if (topSubjectEl) topSubjectEl.textContent = '-';
        if (topSubjectCountEl) topSubjectCountEl.textContent = '0 tasks';
    }
    
    // Update Most Urgent Subject card
    const urgentSubjectEl = document.getElementById('urgentSubject');
    const urgentSubjectCountEl = document.getElementById('urgentSubjectCount');
    
    // Find subject with most overdue/urgent tasks
    const urgentSubject = stats.find(s => s.overdue > 0 || s.urgent > 0);
    
    if (urgentSubject) {
        if (urgentSubjectEl) urgentSubjectEl.textContent = urgentSubject.name;
        const urgentCount = urgentSubject.overdue + urgentSubject.urgent;
        if (urgentSubjectCountEl) urgentSubjectCountEl.textContent = `${urgentCount} urgent/overdue`;
    } else if (stats.length > 0) {
        // If no urgent tasks, show the top subject
        if (urgentSubjectEl) urgentSubjectEl.textContent = stats[0].name;
        if (urgentSubjectCountEl) urgentSubjectCountEl.textContent = '0 urgent/overdue';
    } else {
        if (urgentSubjectEl) urgentSubjectEl.textContent = '-';
        if (urgentSubjectCountEl) urgentSubjectCountEl.textContent = '0 urgent/overdue';
    }
    
    // Update Total Subjects card
    const totalSubjectsEl = document.getElementById('totalSubjects');
    if (totalSubjectsEl) totalSubjectsEl.textContent = stats.length;
}

/**
 * Render the subject stats modal content
 */
function renderSubjectStats() {
    const subjectStatsContent = document.getElementById('subjectStatsContent');
    const subjectList = document.getElementById('subjectList');
    
    if (!subjectStatsContent || !subjectList) return;
    
    const stats = getSubjectStats();
    
    if (stats.length === 0) {
        subjectStatsContent.innerHTML = '<p class="text-gray-500 text-center">No subjects found</p>';
        subjectList.innerHTML = '';
        return;
    }
    
    // Calculate overall stats
    const totalTasks = stats.reduce((sum, s) => sum + s.total, 0);
    const totalCompleted = stats.reduce((sum, s) => sum + s.completed, 0);
    const totalPending = stats.reduce((sum, s) => sum + s.pending, 0);
    const totalOverdue = stats.reduce((sum, s) => sum + s.overdue, 0);
    
    // Create summary cards
    subjectStatsContent.innerHTML = `
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div class="bg-indigo-50 rounded-lg p-4 text-center">
                <p class="text-2xl font-bold text-indigo-600">${stats.length}</p>
                <p class="text-sm text-gray-600">Subjects</p>
            </div>
            <div class="bg-green-50 rounded-lg p-4 text-center">
                <p class="text-2xl font-bold text-green-600">${totalCompleted}</p>
                <p class="text-sm text-gray-600">Completed</p>
            </div>
            <div class="bg-amber-50 rounded-lg p-4 text-center">
                <p class="text-2xl font-bold text-amber-600">${totalPending}</p>
                <p class="text-sm text-gray-600">Pending</p>
            </div>
            <div class="bg-red-50 rounded-lg p-4 text-center">
                <p class="text-2xl font-bold text-red-600">${totalOverdue}</p>
                <p class="text-sm text-gray-600">Overdue</p>
            </div>
        </div>
    `;
    
    // Create subject list
    subjectList.innerHTML = stats.map(subject => `
        <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer" onclick="filterBySubject('${subject.name.replace(/'/g, "\\'")}'); closeSubjectStatsModal();">
            <div class="flex items-center">
                <div class="w-4 h-4 rounded-full mr-3" style="background-color: ${subject.color};"></div>
                <div>
                    <p class="font-medium text-gray-900">${escapeHtml(subject.name)}</p>
                    <p class="text-sm text-gray-500">${subject.total} tasks • ${subject.completionRate}% complete</p>
                </div>
            </div>
            <div class="flex items-center space-x-3">
                ${subject.overdue > 0 ? `<span class="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">${subject.overdue} overdue</span>` : ''}
                ${subject.urgent > 0 ? `<span class="px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-800">${subject.urgent} urgent</span>` : ''}
                ${subject.pending === 0 && subject.total > 0 ? `<span class="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800"><i class="fas fa-check mr-1"></i>Done</span>` : ''}
            </div>
        </div>
    `).join('');
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
function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
