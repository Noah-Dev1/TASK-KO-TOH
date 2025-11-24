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

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

if (typeof emailjs !== 'undefined' && EMAIL_CONFIG.publicKey) {
    emailjs.init(EMAIL_CONFIG.publicKey);
}

let currentUser = null;
let tasks = [];
let editingTaskId = null;
let isOnline = navigator.onLine;

const loadingScreen = document.getElementById('loadingScreen');
const authScreen = document.getElementById('authScreen');
const dashboardScreen = document.getElementById('dashboardScreen');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const taskModal = document.getElementById('taskModal');
const tasksContainer = document.getElementById('tasksContainer');
const emptyState = document.getElementById('emptyState');

document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    setupNetworkListeners();
    setMinDateTime();
    showLoadingScreen();
    setTimeout(() => hideLoadingScreen(), 1000);
});

function showLoadingScreen() {
    if (loadingScreen) loadingScreen.classList.remove('hidden');
    if (authScreen) authScreen.classList.add('hidden');
    if (dashboardScreen) dashboardScreen.classList.add('hidden');
}

function hideLoadingScreen() {
    if (loadingScreen) loadingScreen.classList.add('hidden');
}

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
    if (indicator) indicator.classList.remove('show');
}

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
        if (e.key === 'Escape' && taskModal && !taskModal.classList.contains('hidden')) closeTaskModal();
        if (e.ctrlKey && e.key === 'n') {
            e.preventDefault();
            if (currentUser) openTaskModal();
        }
    });
}

async function handleLogin(e) {
    e.preventDefault();
    if (!isOnline) return showToast('error', 'Offline', 'Check your internet connection');

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
            case 'auth/user-not-found': errorMessage = 'No account found'; break;
            case 'auth/wrong-password': errorMessage = 'Incorrect password'; break;
            case 'auth/invalid-email': errorMessage = 'Invalid email'; break;
            case 'auth/too-many-requests': errorMessage = 'Too many attempts'; break;
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
    if (!isOnline) return showToast('error', 'Offline', 'Check your internet connection');

    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const grade = document.getElementById('registerGrade').value;
    const password = document.getElementById('registerPassword').value;

    if (name.length < 2) return showToast('error', 'Invalid Name', 'Name must be 2+ chars');
    if (grade !== "11" && grade !== "12") return showToast('error', 'Invalid Grade', 'Only 11/12 allowed');
    if (password.length < 6) return showToast('error', 'Weak Password', 'Password must be 6+ chars');

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

        try {
            if (EMAIL_CONFIG.publicKey) await sendWelcomeEmail(name, email);
        } catch (emailError) { console.error('Welcome email failed:', emailError); }

        showToast('success', 'Account Created!', 'Welcome to Task Ko To!');
    } catch (error) {
        console.error('Registration error:', error);
        let errorMessage = 'Failed to create account';
        switch (error.code) {
            case 'auth/email-already-in-use': errorMessage = 'Email already registered'; break;
            case 'auth/invalid-email': errorMessage = 'Invalid email'; break;
            case 'auth/weak-password': errorMessage = 'Password too weak'; break;
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
        showToast('error', 'Logout Failed', 'Try again');
    }
}

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
    if (!isOnline) return showToast('error', 'Offline', 'Check internet');

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
        title,
        description,
        subject,
        dueDate: dueDateTimestamp,
        priority,
        status: editingTaskId ? undefined : 'pending',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (!editingTaskId) taskData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    if (editingTaskId) delete taskData.status;

    try {
        if (editingTaskId) {
            await db.collection('tasks').doc(editingTaskId).update(taskData);
            showToast('success', 'Task Updated!', 'Task updated successfully');
        } else {
            await db.collection('tasks').add(taskData);
            showToast('success', 'Task Added!', 'New task created');
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

