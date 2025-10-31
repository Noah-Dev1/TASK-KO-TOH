// ==========================================
// CONFIGURATION - REPLACE WITH YOUR CREDENTIALS
// ==========================================

// Firebase Configuration - Replace with your Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyAg2SFXRGI2QvRmHWAs8P4UWoehtmGlniw",
    authDomain: "task-ko-toh.firebaseapp.com",
    projectId: "task-ko-toh",
    storageBucket: "task-ko-toh.firebasestorage.app",
    messagingSenderId: "333405520584",
    appId: "1:333405520584:web:cf83fb5d8aaf7b1b4d9bfd"
};

// EmailJS Configuration - Replace with your EmailJS credentials
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Initialize EmailJS
emailjs.init(EMAIL_CONFIG.publicKey);

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
    
    // Show loading screen initially
    showLoadingScreen();
    
    // Firebase will handle auth state checking
    setTimeout(() => {
        hideLoadingScreen();
    }, 2000);
});

// ==========================================
// LOADING SCREEN
// ==========================================

function showLoadingScreen() {
    loadingScreen.classList.remove('hidden');
    authScreen.classList.add('hidden');
    dashboardScreen.classList.add('hidden');
}

function hideLoadingScreen() {
    loadingScreen.classList.add('hidden');
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

// Firebase Auth State Observer
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
                // User document doesn't exist, sign out
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
    authScreen.classList.remove('hidden');
    dashboardScreen.classList.add('hidden');
    document.getElementById('userGreeting').classList.add('hidden');
    document.getElementById('logoutBtn').classList.add('hidden');
}

function showDashboard() {
    authScreen.classList.add('hidden');
    dashboardScreen.classList.remove('hidden');
    document.getElementById('userGreeting').textContent = `Hello, ${currentUser.name}!`;
    document.getElementById('userGreeting').classList.remove('hidden');
    document.getElementById('logoutBtn').classList.remove('hidden');
    loadTasks();
    setupDailyEmailCheck();
}

// ==========================================
// EVENT LISTENERS SETUP
// ==========================================

function setupEventListeners() {
    // Auth form toggles
    document.getElementById('showRegister').addEventListener('click', () => {
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
    });

    document.getElementById('showLogin').addEventListener('click', () => {
        registerForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
    });

    // Form submissions
    document.getElementById('loginFormElement').addEventListener('submit', handleLogin);
    document.getElementById('registerFormElement').addEventListener('submit', handleRegister);
    document.getElementById('taskForm').addEventListener('submit', handleTaskSubmit);

    // Button clicks
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    document.getElementById('addTaskBtn').addEventListener('click', () => openTaskModal());
    document.getElementById('checkDeadlinesBtn').addEventListener('click', checkDeadlines);
    document.getElementById('closeModal').addEventListener('click', closeTaskModal);
    document.getElementById('cancelBtn').addEventListener('click', closeTaskModal);

    // Search and filters
    document.getElementById('searchInput').addEventListener('input', filterTasks);
    document.getElementById('priorityFilter').addEventListener('change', filterTasks);
    document.getElementById('statusFilter').addEventListener('change', filterTasks);

    // Modal backdrop click
    taskModal.addEventListener('click', (e) => {
        if (e.target === taskModal) closeTaskModal();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !taskModal.classList.contains('hidden')) {
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
    
    // Show loading state
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
        // Reset button state
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

    // Validation
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
    
    // Show loading state
    registerBtn.disabled = true;
    registerBtnText.textContent = 'Creating Account...';
    registerSpinner.classList.remove('hidden');

    try {
        // Create Firebase Auth user
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;

        // Update display name
        await user.updateProfile({
            displayName: name
        });

        // Save user data to Firestore
        await db.collection('users').doc(user.uid).set({
            name: name,
            email: email,
            grade: grade,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Send welcome email
        try {
            await sendWelcomeEmail(name, email);
        } catch (emailError) {
            console.error('Welcome email failed:', emailError);
            // Don't show error to user, just log it
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
        // Reset button state
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
                dueDate: data.dueDate.toDate().toISOString().slice(0, 16),
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
    
    // Show loading state
    taskSubmitBtn.disabled = true;
    submitBtnText.textContent = editingTaskId ? 'Updating...' : 'Adding...';
    taskSubmitSpinner.classList.remove('hidden');
    
    const taskData = {
        userId: currentUser.id,
        title: document.getElementById('taskTitle').value.trim(),
        description: document.getElementById('taskDescription').value.trim(),
        subject: document.getElementById('taskSubject').value.trim(),
        dueDate: firebase.firestore.Timestamp.fromDate(new Date(document.getElementById('taskDueDate').value)),
        priority: document.getElementById('taskPriority').value,
        status: editingTaskId ? undefined : 'pending', // Don't override status when editing
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // Only set createdAt for new tasks
    if (!editingTaskId) {
        taskData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    }

    try {
        if (editingTaskId) {
            // Update existing task
            await db.collection('tasks').doc(editingTaskId).update(taskData);
            showToast('success', 'Task Updated!', 'Your task has been updated successfully');
        } else {
            // Create new task
            await db.collection('tasks').add(taskData);
            showToast('success', 'Task Added!', 'Your new task has been created');
        }

        await loadTasks(); // Reload from database
        closeTaskModal();
        
    } catch (error) {
        console.error('Error saving task:', error);
        showToast('error', 'Save Failed', 'Could not save task');
    } finally {
        // Reset button state
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
        
        // Populate form
        document.getElementById('taskTitle').value = task.title;
        document.getElementById('taskDescription').value = task.description || '';
        document.getElementById('taskSubject').value = task.subject;
        document.getElementById('taskDueDate').value = task.dueDate;
        document.getElementById('taskPriority').value = task.priority;
        
        openTaskModal();
    }
}

// ==========================================
// MODAL FUNCTIONS
// ==========================================

function openTaskModal() {
    taskModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    document.getElementById('taskTitle').focus();
}

function closeTaskModal() {
    taskModal.classList.add('hidden');
    document.body.style.overflow = 'auto';
    document.getElementById('taskForm').reset();
    editingTaskId = null;
    document.getElementById('modalTitle').textContent = 'Add New Task';
    document.getElementById('submitBtnText').textContent = 'Add Task';
    
    // Reset button state
    const taskSubmitBtn = document.getElementById('taskSubmitBtn');
    const taskSubmitSpinner = document.getElementById('taskSubmitSpinner');
    taskSubmitBtn.disabled = false;
    taskSubmitSpinner.classList.add('hidden');
}

// ==========================================
// RENDERING FUNCTIONS
// ==========================================

function renderTasks() {
    const filteredTasks = getFilteredTasks();
    
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
                        <h3 class="text-lg font-semibold text-gray-900 mb-1 ${task.status === 'completed' ? 'line-through text-gray-500' : ''}">${task.title}</h3>
                        <p class="text-sm text-gray-600 mb-2">${task.subject}</p>
                        ${task.description ? `<p class="text-sm text-gray-500 mb-3">${task.description}</p>` : ''}
                    </div>
                    <div class="flex items-center space-x-2">
                        <span class="px-2 py-1 text-xs font-medium rounded-full priority-badge-${task.priority}">
                            ${task.priority.toUpperCase()}
                        </span>
                        <span class="px-2 py-1 text-xs font-medium rounded-full status-${task.status} ${isOverdue ? 'status-overdue' : ''}">
                            ${isOverdue ? 'OVERDUE' : task.status.toUpperCase()}
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

// ==========================================
// FILTER AND SEARCH FUNCTIONS
// ==========================================

function getFilteredTasks() {
    let filtered = [...tasks];
    
    const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
    const priorityFilter = document.getElementById('priorityFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;

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
        // Sort by status first (pending first), then by due date
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
// STATISTICS FUNCTIONS
// ==========================================

function updateStatistics() {
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const pending = tasks.filter(t => t.status === 'pending').length;
    const overdue = tasks.filter(t => {
        const dueDate = new Date(t.dueDate);
        return dueDate < new Date() && t.status === 'pending';
    }).length;

    document.getElementById('totalTasks').textContent = total;
    document.getElementById('completedTasks').textContent = completed;
    document.getElementById('pendingTasks').textContent = pending;
    document.getElementById('overdueTasks').textContent = overdue;
}

// ==========================================
// EMAIL NOTIFICATION FUNCTIONS
// ==========================================

async function checkDeadlines() {
    if (!isOnline) {
        showToast('error', 'Offline', 'Please check your internet connection');
        return;
    }

    const button = document.getElementById('checkDeadlinesBtn');
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner loading mr-2"></i>Sending...';
    button.disabled = true;

    try {
        const urgentTasks = getUrgentTasks();
        let emailsSent = 0;
        
        if (urgentTasks.overdue.length > 0) {
            await sendOverdueEmail(urgentTasks.overdue);
            emailsSent++;
        }
        
        if (urgentTasks.upcoming.length > 0) {
            await sendUpcomingEmail(urgentTasks.upcoming);
            emailsSent++;
        }
        
        if (emailsSent > 0) {
            showToast('success', 'Emails Sent!', `${emailsSent} notification email(s) sent to ${currentUser.email}`);
        } else {
            showToast('success', 'All Good!', 'No urgent deadlines found');
        }
        
    } catch (error) {
        console.error('Email sending failed:', error);
        showToast('error', 'Email Failed', 'Could not send email notifications');
    } finally {
        button.innerHTML = originalText;
        button.disabled = false;
    }
}

async function sendOverdueEmail(overdueTasks) {
    const templateParams = {
        to_name: currentUser.name,
        to_email: currentUser.email,
        overdue_count: overdueTasks.length,
        task_list: overdueTasks.map(task => 
            `• ${task.title} (${task.subject}) - Due: ${formatDateTime(task.dueDate)}`
        ).join('\n'),
        user_grade: `Grade ${currentUser.grade}`
    };

    await emailjs.send(
        EMAIL_CONFIG.serviceId,
        EMAIL_CONFIG.templates.overdue,
        templateParams,
        EMAIL_CONFIG.publicKey
    );
}

async function sendUpcomingEmail(upcomingTasks) {
    const templateParams = {
        to_name: currentUser.name,
        to_email: currentUser.email,
        upcoming_count: upcomingTasks.length,
        task_list: upcomingTasks.map(task => 
            `• ${task.title} (${task.subject}) - Due: ${formatDateTime(task.dueDate)}`
        ).join('\n'),
        user_grade: `Grade ${currentUser.grade}`
    };

    await emailjs.send(
        EMAIL_CONFIG.serviceId,
        EMAIL_CONFIG.templates.upcoming,
        templateParams,
        EMAIL_CONFIG.publicKey
    );
}

async function sendWelcomeEmail(name, email) {
    const templateParams = {
        to_name: name,
        to_email: email,
        app_name: 'Task Ko To!',
        login_url: window.location.origin
    };

    await emailjs.send(
        EMAIL_CONFIG.serviceId,
        EMAIL_CONFIG.templates.welcome,
        templateParams,
        EMAIL_CONFIG.publicKey
    );
}

function getUrgentTasks() {
    const now = new Date();
    const upcomingTasks = tasks.filter(task => {
        if (task.status === 'completed') return false;
        const dueDate = new Date(task.dueDate);
        const timeDiff = dueDate - now;
        return timeDiff > 0 && timeDiff <= 24 * 60 * 60 * 1000; // Due within 24 hours
    });

    const overdueTasks = tasks.filter(task => {
        if (task.status === 'completed') return false;
        const dueDate = new Date(task.dueDate);
        return dueDate < now;
    });

    return { upcoming: upcomingTasks, overdue: overdueTasks };
}

// Auto-check deadlines daily
function setupDailyEmailCheck() {
    // Check every hour for urgent tasks (in production, you might want to do this less frequently)
    setInterval(() => {
        const urgentTasks = getUrgentTasks();
        if (urgentTasks.overdue.length > 0 || urgentTasks.upcoming.length > 0) {
            // You could automatically send emails here, but it's better to let users control this
            console.log('Urgent tasks detected:', urgentTasks);
        }
    }, 60 * 60 * 1000); // Check every hour
}

// ==========================================
// UTILITY FUNCTIONS
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
    document.getElementById('taskDueDate').min = minDateTime;
}

function showToast(type, title, message) {
    const toast = document.getElementById('toast');
    const toastIcon = document.getElementById('toastIcon');
    const toastTitle = document.getElementById('toastTitle');
    const toastMessage = document.getElementById('toastMessage');

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
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        toast.style.transform = 'translateX(100%)';
    }, 5000);
}

// ==========================================
// ERROR HANDLING
// ==========================================

window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    showToast('error', 'Something went wrong', 'Please refresh the page and try again');
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    showToast('error', 'Something went wrong', 'Please refresh the page and try again');
});