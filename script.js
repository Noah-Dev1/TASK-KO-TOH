// ==========================================
// CONFIGURATION
// ==========================================

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
    templates: { overdue: 'template_ea6ejpe', upcoming: 'template_p3w05gl' }
};

// ==========================================
// FIREBASE INITIALIZATION
// ==========================================

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

if (typeof emailjs !== 'undefined' && EMAIL_CONFIG.publicKey) {
    emailjs.init(EMAIL_CONFIG.publicKey);
}

// ==========================================
// STATE & DOM ELEMENTS
// ==========================================

let currentUser = null, tasks = [], editingTaskId = null, isOnline = navigator.onLine;

const loadingScreen = document.getElementById('loadingScreen');
const authScreen = document.getElementById('authScreen');
const dashboardScreen = document.getElementById('dashboardScreen');
const tasksContainer = document.getElementById('tasksContainer');
const emptyState = document.getElementById('emptyState');
const taskModal = document.getElementById('taskModal');

// ==========================================
// INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    setupNetworkListeners();
    setMinDateTime();
    showLoadingScreen();
    setTimeout(hideLoadingScreen, 1000);
});

// ==========================================
// LOADING SCREEN
// ==========================================

function showLoadingScreen() {
    loadingScreen?.classList.remove('hidden');
    authScreen?.classList.add('hidden');
    dashboardScreen?.classList.add('hidden');
}

function hideLoadingScreen() { loadingScreen?.classList.add('hidden'); }

// ==========================================
// NETWORK MONITORING
// ==========================================

function setupNetworkListeners() {
    window.addEventListener('online', () => { isOnline = true; hideOfflineIndicator(); showToast('success','Back Online','Connection restored'); });
    window.addEventListener('offline', () => { isOnline = false; showOfflineIndicator(); showToast('warning','Offline','Some features may be limited'); });
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

function hideOfflineIndicator() { document.getElementById('offlineIndicator')?.classList.remove('show'); }

// ==========================================
// AUTHENTICATION
// ==========================================

auth.onAuthStateChanged(async user => {
    hideLoadingScreen();
    if (user) {
        try {
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (!userDoc.exists) { await auth.signOut(); return; }
            const data = userDoc.data();
            currentUser = { id: user.uid, name: data.name, email: data.email, grade: data.grade };
            showDashboard();
        } catch (err) { console.error(err); showToast('error','Error','Failed to load user data'); await auth.signOut(); }
    } else { currentUser = null; tasks = []; showAuthScreen(); }
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
    greeting && (greeting.textContent = `Hello, ${currentUser.name}!`, greeting.classList.remove('hidden'));
    document.getElementById('logoutBtn')?.classList.remove('hidden');
    loadTasks();
    setupDailyEmailCheck();
}

// ==========================================
// EVENT LISTENERS
// ==========================================

function setupEventListeners() {
    document.getElementById('showRegister')?.addEventListener('click', () => { loginForm.classList.add('hidden'); registerForm.classList.remove('hidden'); });
    document.getElementById('showLogin')?.addEventListener('click', () => { registerForm.classList.add('hidden'); loginForm.classList.remove('hidden'); });
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

    taskModal?.addEventListener('click', e => { if (e.target === taskModal) closeTaskModal(); });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && taskModal && !taskModal.classList.contains('hidden')) closeTaskModal();
        if (e.ctrlKey && e.key === 'n') { e.preventDefault(); currentUser && openTaskModal(); }
    });
}

// ==========================================
// LOGIN / REGISTER / LOGOUT
// ==========================================

async function handleLogin(e) {
    e.preventDefault(); if (!isOnline) return showToast('error','Offline','Check internet');

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    const loginBtn = document.getElementById('loginBtn');
    loginBtn.disabled = true;

    try { await auth.signInWithEmailAndPassword(email, password); showToast('success','Welcome back!','Logged in'); }
    catch (error) {
        let msg='Invalid email or password';
        if(error.code==='auth/user-not-found') msg='No account found with this email';
        if(error.code==='auth/wrong-password') msg='Incorrect password';
        if(error.code==='auth/invalid-email') msg='Invalid email';
        if(error.code==='auth/too-many-requests') msg='Too many attempts, try later';
        showToast('error','Login Failed',msg);
    } finally { loginBtn.disabled = false; }
}

async function handleRegister(e) {
    e.preventDefault(); if (!isOnline) return showToast('error','Offline','Check internet');

    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const grade = document.getElementById('registerGrade').value;
    const password = document.getElementById('registerPassword').value;

    if (name.length<2) return showToast('error','Invalid Name','Name must be ≥2 chars');
    if (!['11','12'].includes(grade)) return showToast('error','Invalid Grade','Grade must be 11 or 12');
    if (password.length<6) return showToast('error','Weak Password','Password ≥6 chars');

    const registerBtn = document.getElementById('registerBtn'); registerBtn.disabled=true;

    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email,password);
        const user = userCredential.user;
        await user.updateProfile({ displayName: name });
        await db.collection('users').doc(user.uid).set({ name, email, grade, createdAt: firebase.firestore.FieldValue.serverTimestamp(), lastLogin: firebase.firestore.FieldValue.serverTimestamp() });
        showToast('success','Account Created!','Welcome to Task Ko To!');
    } catch (error) {
        let msg='Failed to create account';
        if(error.code==='auth/email-already-in-use') msg='Email already registered';
        if(error.code==='auth/invalid-email') msg='Invalid email';
        if(error.code==='auth/weak-password') msg='Weak password';
        showToast('error','Registration Failed',msg);
    } finally { registerBtn.disabled=false; }
}

async function handleLogout() {
    try { await auth.signOut(); showToast('info','Logged Out','See you next time!'); }
    catch { showToast('error','Logout Failed','Try again'); }
}

// ==========================================
// TASK CRUD
// ==========================================

async function loadTasks() {
    if (!currentUser || !isOnline) return;
    try {
        const snapshot = await db.collection('tasks').where('userId','==',currentUser.id).orderBy('dueDate','asc').get();
        tasks = snapshot.docs.map(doc => {
            const data = doc.data();
            return { id:doc.id, ...data, dueDate:data.dueDate?.toDate().toISOString(), createdAt:data.createdAt?.toDate().toISOString(), completedAt:data.completedAt?.toDate().toISOString()||null };
        });
        renderTasks(); updateStatistics();
    } catch { showToast('error','Load Failed','Could not load tasks'); }
}

async function handleTaskSubmit(e) {
    e.preventDefault(); if (!isOnline) return showToast('error','Offline','Check internet');

    const taskSubmitBtn=document.getElementById('taskSubmitBtn'); taskSubmitBtn.disabled=true;

    const title=document.getElementById('taskTitle').value.trim();
    const description=document.getElementById('taskDescription').value.trim();
    const subject=document.getElementById('taskSubject').value.trim();
    const dueDateRaw=document.getElementById('taskDueDate').value;
    const priority=document.getElementById('taskPriority').value;
    const dueDateTimestamp=firebase.firestore.Timestamp.fromDate(new Date(dueDateRaw));

    if(!title||!dueDateRaw) { showToast('error','Missing Fields','Title and Due Date are required'); taskSubmitBtn.disabled=false; return; }

    const taskData={ title, description, subject, dueDate:dueDateTimestamp, priority, status:'Pending', userId:currentUser.id, createdAt:firebase.firestore.FieldValue.serverTimestamp() };

    try {
        if(editingTaskId){
            await db.collection('tasks').doc(editingTaskId).update(taskData);
            showToast('success','Task Updated','Your task has been updated');
        } else {
            await db.collection('tasks').add(taskData);
            showToast('success','Task Added','Your task has been added');
        }
        closeTaskModal(); loadTasks(); editingTaskId=null;
    } catch { showToast('error','Failed','Could not save task'); } 
    finally { taskSubmitBtn.disabled=false; }
}

function openTaskModal(task=null){
    if(task){ editingTaskId=task.id; document.getElementById('taskTitle').value=task.title; document.getElementById('taskDescription').value=task.description||''; document.getElementById('taskSubject').value=task.subject||''; document.getElementById('taskDueDate').value=task.dueDate?.slice(0,16); document.getElementById('taskPriority').value=task.priority||'Medium'; }
    else { editingTaskId=null; document.getElementById('taskForm').reset(); }
    taskModal?.classList.remove('hidden'); 
}

function closeTaskModal(){ taskModal?.classList.add('hidden'); editingTaskId=null; }

async function deleteTask(taskId){
    if(!confirm('Delete this task?')) return;
    try { await db.collection('tasks').doc(taskId).delete(); showToast('info','Deleted','Task removed'); loadTasks(); }
    catch { showToast('error','Delete Failed','Could not delete task'); }
}

async function toggleTaskCompletion(task){
    if(!task) return; 
    try{
        const newStatus=task.status==='Completed'?'Pending':'Completed';
        const updateData={ status:newStatus };
        if(newStatus==='Completed') updateData.completedAt=firebase.firestore.FieldValue.serverTimestamp();
        else updateData.completedAt=null;
        await db.collection('tasks').doc(task.id).update(updateData); 
        loadTasks();
    } catch { showToast('error','Update Failed','Could not update task'); }
}

// ==========================================
// TASK RENDERING
// ==========================================

function renderTasks(){
    tasksContainer.innerHTML='';
    if(!tasks.length){ emptyState?.classList.remove('hidden'); return; } 
    else emptyState?.classList.add('hidden');

    const searchTerm=document.getElementById('searchInput')?.value.toLowerCase();
    const priorityFilter=document.getElementById('priorityFilter')?.value;
    const statusFilter=document.getElementById('statusFilter')?.value;

    tasks.filter(t=>{
        if(searchTerm&&!t.title.toLowerCase().includes(searchTerm)&&!t.subject?.toLowerCase().includes(searchTerm)) return false;
        if(priorityFilter&&priorityFilter!=='All'&&t.priority!==priorityFilter) return false;
        if(statusFilter&&statusFilter!=='All'&&t.status!==statusFilter) return false;
        return true;
    }).forEach(task=>{
        const card=document.createElement('div'); card.className=`task-card card-hover fade-in priority-${task.priority.toLowerCase()} p-4 mb-4 rounded-lg shadow-md`;
        card.innerHTML=`
            <div class="flex justify-between items-start">
                <div>
                    <h3 class="font-bold text-lg">${task.title}</h3>
                    <p class="text-sm text-gray-500">${task.subject||''}</p>
                </div>
                <div class="flex items-center gap-2">
                    <span class="px-2 py-1 rounded text-xs ${task.status==='Completed'?'status-completed':task.status==='Pending'?'status-pending':'status-overdue'}">${task.status}</span>
                    <span class="px-2 py-1 rounded text-xs ${task.priority==='High'?'priority-badge-high':task.priority==='Medium'?'priority-badge-medium':'priority-badge-low'}">${task.priority}</span>
                </div>
            </div>
            <p class="mt-2 text-sm">${task.description||''}</p>
            <p class="mt-1 text-xs text-gray-400">Due: ${new Date(task.dueDate).toLocaleString()}</p>
            <div class="mt-3 flex gap-2">
                <button onclick="toggleTaskCompletion(tasks.find(t=>t.id==='${task.id}'))" class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm">${task.status==='Completed'?'Mark Pending':'Complete'}</button>
                <button onclick="openTaskModal(tasks.find(t=>t.id==='${task.id}'))" class="bg-yellow-400 hover:bg-yellow-500 text-white px-3 py-1 rounded text-sm">Edit</button>
                <button onclick="deleteTask('${task.id}')" class="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm">Delete</button>
            </div>`;
        tasksContainer.appendChild(card);
    });
}

// ==========================================
// STATISTICS
// ==========================================

function updateStatistics(){
    document.getElementById('totalTasks')?.textContent=tasks.length;
    document.getElementById('completedTasks')?.textContent=tasks.filter(t=>t.status==='Completed').length;
    document.getElementById('pendingTasks')?.textContent=tasks.filter(t=>t.status==='Pending').length;
}

// ==========================================
// FILTERING
// ==========================================

function filterTasks(){ renderTasks(); }

// ==========================================
// DEADLINE CHECK & EMAILS
// ==========================================

function setupDailyEmailCheck(){ setInterval(checkDeadlines, 60*60*1000); } 

function checkDeadlines(){
    if(!isOnline||!currentUser) return;
    const now=new Date();
    tasks.forEach(task=>{
        const due=new Date(task.dueDate);
        const diff=(due-now)/(1000*60*60); // in hours
        if(diff<=24 && task.status==='Pending') sendEmail(task,'upcoming');
        if(diff<0 && task.status!=='Completed') sendEmail(task,'overdue');
    });
}

function sendEmail(task,type){
    if(typeof emailjs==='undefined'||!EMAIL_CONFIG.templates[type]) return;
    const templateParams={
        user_name: currentUser.name,
        user_email: currentUser.email,
        task_title: task.title,
        due_date: new Date(task.dueDate).toLocaleString(),
        task_status: task.status
    };
    emailjs.send(EMAIL_CONFIG.serviceId, EMAIL_CONFIG.templates[type], templateParams).then(()=>console.log(`${type} email sent`)).catch(err=>console.error(err));
}

// ==========================================
// TOASTS
// ==========================================

function showToast(type,title,message){
    let toast=document.getElementById('toast');
    if(!toast){
        toast=document.createElement('div');
        toast.id='toast';
        document.body.appendChild(toast);
    }
    toast.className=`fade-in ${type}`;
    toast.innerHTML=`<strong>${title}</strong><p>${message}</p>`;
    toast.style.transform='translateX(0)';
    setTimeout(()=>{ toast.style.transform='translateX(100%)'; },3000);
}

// ==========================================
// DATE-TIME MIN SET
// ==========================================

function setMinDateTime(){
    const dtInput=document.getElementById('taskDueDate');
    if(dtInput){ dtInput.min=new Date().toISOString().slice(0,16); }
}

