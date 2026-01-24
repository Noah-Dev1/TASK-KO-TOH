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

// DOM Elements
const loadingScreen = document.getElementById('loadingScreen');
const authScreen = document.getElementById('authScreen');
const dashboardScreen = document.getElementById('dashboardScreen');
const tasksContainer = document.getElementById('tasksContainer');
const emptyState = document.getElementById('emptyState');
const taskModal = document.getElementById('taskModal');

// =========================================
// NAVBAR USER DISPLAY
// =========================================
function updateNavbarUser(user) {
    const userGreeting = document.getElementById('userGreeting');
    const logoutBtn = document.getElementById('logoutBtn');

    if (user) {
        userGreeting.textContent = `Hello, ${user.name || user.displayName || user.email}`;
        userGreeting.classList.remove('hidden');
        logoutBtn.classList.remove('hidden');
    } else {
        userGreeting.classList.add('hidden');
        logoutBtn.classList.add('hidden');
    }
}

// =========================================
// EVENT LISTENERS
// =========================================
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    setupNetworkListeners();
    setMinDateTime();
    showLoadingScreen();
    setTimeout(hideLoadingScreen, 1000);
});

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
    taskModal?.addEventListener('click', e => { if (e.target === taskModal) closeTaskModal(); });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && taskModal && !taskModal.classList.contains('hidden')) closeTaskModal();
        if (e.ctrlKey && e.key === 'n') { e.preventDefault(); if (currentUser) openTaskModal(); }
    });
}

// =========================================
// AUTHENTICATION
// =========================================
auth.onAuthStateChanged(async user => {
    hideLoadingScreen();
    if (user) {
        try {
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (userDoc.exists) {
                const data = userDoc.data();
                currentUser = { id: user.uid, name: data.name, email: data.email, grade: data.grade };
                
                // ✅ Show user in navbar
                updateNavbarUser(currentUser);

                showDashboard();
            } else await auth.signOut();
        } catch (error) { console.error(error); await auth.signOut(); }
    } else {
        currentUser = null;
        tasks = [];
        showAuthScreen();
        updateNavbarUser(null); // ✅ hide navbar user info
    }
});

async function handleLogin(e) {
    e.preventDefault();
    if (!isOnline) { showToast('error','Offline','Check your internet'); return; }
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const btn = document.getElementById('loginBtn'); btn.disabled = true;
    try { await auth.signInWithEmailAndPassword(email,password); showToast('success','Welcome!','Logged in'); }
    catch (err) { console.error(err); showToast('error','Login Failed','Invalid credentials'); }
    finally { btn.disabled = false; }
}

async function handleRegister(e) {
    e.preventDefault();
    if (!isOnline) { showToast('error','Offline','Check your internet'); return; }
    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const grade = document.getElementById('registerGrade').value;
    const password = document.getElementById('registerPassword').value;
    if (name.length<2||!['11','12'].includes(grade)||password.length<6){ showToast('error','Invalid Input','Check name, grade, or password'); return; }
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email,password);
        const user = userCredential.user;
        await user.updateProfile({displayName:name});
        await db.collection('users').doc(user.uid).set({name,email,grade,createdAt:firebase.firestore.FieldValue.serverTimestamp(),lastLogin:firebase.firestore.FieldValue.serverTimestamp()});
        showToast('success','Account Created','Welcome to Task Ko To!');
    } catch(err){ console.error(err); showToast('error','Registration Failed','Could not create account'); }
}

async function handleLogout() {
    try {
        await auth.signOut();
        showToast('info','Logged Out','See you next time!');
        updateNavbarUser(null); // ✅ hide navbar user info
    } catch(err){
        console.error(err);
        showToast('error','Logout Failed','Try again');
    }
}

function showAuthScreen() { authScreen?.classList.remove('hidden'); dashboardScreen?.classList.add('hidden'); }
function showDashboard() { authScreen?.classList.add('hidden'); dashboardScreen?.classList.remove('hidden'); loadTasks(); setupDailyEmailCheck(); }

// =========================================
// TASK MANAGEMENT
// =========================================
async function loadTasks() {
    if (!currentUser || !isOnline) return;
    try {
        const snapshot = await db.collection('tasks').where('userId','==',currentUser.id).orderBy('dueDate','asc').get();
        tasks = snapshot.docs.map(doc=>{ const data=doc.data(); return { id:doc.id,...data,dueDate:data.dueDate?data.dueDate.toDate().toISOString():new Date().toISOString(),createdAt:data.createdAt?data.createdAt.toDate().toISOString():new Date().toISOString(),completedAt:data.completedAt?data.completedAt.toDate().toISOString():null }; });
        renderTasks(); updateStatistics();
    } catch(err){ console.error(err); showToast('error','Load Failed','Could not load tasks'); }
}

async function handleTaskSubmit(e) {
    e.preventDefault();
    if(!isOnline){ showToast('error','Offline','Check your internet'); return; }
    const title=document.getElementById('taskTitle').value.trim();
    const description=document.getElementById('taskDescription').value.trim();
    const subject=document.getElementById('taskSubject').value.trim();
    const dueDateRaw=document.getElementById('taskDueDate').value;
    const priority=document.getElementById('taskPriority').value;
    const dueDateTimestamp = firebase.firestore.Timestamp.fromDate(new Date(dueDateRaw));
    const taskData={userId:currentUser.id,title,description,subject,dueDate:dueDateTimestamp,priority,updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
    if(!editingTaskId){ taskData.status="pending"; taskData.createdAt=firebase.firestore.FieldValue.serverTimestamp(); }
    try{
        if(editingTaskId){ const updatePayload={...taskData}; delete updatePayload.status; await db.collection('tasks').doc(editingTaskId).update(updatePayload); showToast('success','Task Updated','Your task has been updated'); }
        else { await db.collection('tasks').add(taskData); showToast('success','Task Added','Your new task has been created'); }
        await loadTasks(); closeTaskModal();
    } catch(err){ console.error(err); showToast('error','Save Failed','Could not save task'); }
}

async function deleteTask(taskId) { if(!confirm('Delete this task?')) return; if(!isOnline){ showToast('error','Offline','Check internet'); return; } try{ await db.collection('tasks').doc(taskId).delete(); showToast('info','Task Deleted','Task removed'); await loadTasks(); } catch(err){ console.error(err); showToast('error','Delete Failed','Could not delete task'); } }

async function toggleTaskStatus(taskId) {
    const task=tasks.find(t=>t.id===taskId); if(!task||!isOnline) return;
    const newStatus=task.status==='pending'?'completed':'pending';
    const updateData={status:newStatus,updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
    if(newStatus==='completed') updateData.completedAt=firebase.firestore.FieldValue.serverTimestamp(); else updateData.completedAt=firebase.firestore.FieldValue.delete();
    try{ await db.collection('tasks').doc(taskId).update(updateData); showToast('success','Status Updated',`Task marked as ${newStatus}`); await loadTasks(); } catch(err){ console.error(err); showToast('error','Update Failed','Could not update status'); }
}

function editTask(taskId){
    const task=tasks.find(t=>t.id===taskId);
    if(task){
        editingTaskId=taskId;
        document.getElementById('modalTitle').textContent='Edit Task';
        document.getElementById('submitBtnText').textContent='Update Task';
        document.getElementById('taskTitle').value=task.title;
        document.getElementById('taskDescription').value=task.description||'';
        document.getElementById('taskSubject').value=task.subject;
        document.getElementById('taskDueDate').value=task.dueDate.slice(0,16);
        document.getElementById('taskPriority').value=task.priority||'';
        openTaskModal();
    }
}

// =========================================
// MODAL HANDLING
// =========================================
function openTaskModal(){ if(taskModal){ taskModal.classList.remove('hidden'); document.body.style.overflow='hidden'; document.getElementById('taskTitle').focus(); } }
function closeTaskModal(){ if(taskModal){ taskModal.classList.add('hidden'); document.body.style.overflow='auto'; } document.getElementById('taskForm')?.reset(); editingTaskId=null; document.getElementById('modalTitle').textContent='Add New Task'; document.getElementById('submitBtnText').textContent='Add Task'; }

// =========================================
// RENDERING & FILTERS
// =========================================
function renderTasks(){
    const filteredTasks=getFilteredTasks();
    if(!tasksContainer) return;
    if(filteredTasks.length===0){ tasksContainer.classList.add('hidden'); emptyState.classList.remove('hidden'); return; }
    tasksContainer.classList.remove('hidden'); emptyState.classList.add('hidden');
    tasksContainer.innerHTML=filteredTasks.map(task=>{
        const due=new Date(task.dueDate),now=new Date();
        const overdue=due<now&&task.status==='pending';
        const dueSoon=due-now<24*60*60*1000&&due>now&&task.status==='pending';
        return `<div class="task-card bg-white rounded-xl shadow-sm border border-gray-200 p-6 priority-${task.priority} fade-in">
            <div class="flex justify-between items-start mb-4">
                <div class="flex-1">
                    <h3 class="text-lg font-semibold text-gray-900 mb-1 ${task.status==='completed'?'line-through text-gray-500':''}">${escapeHtml(task.title)}</h3>
                    <p class="text-sm text-gray-600 mb-2">${escapeHtml(task.subject)}</p>
                    ${task.description?`<p class="text-sm text-gray-500 mb-3">${escapeHtml(task.description)}</p>`:''}
                </div>
                <div class="flex items-center space-x-2">
                    <span class="px-2 py-1 text-xs font-medium rounded-full priority-badge-${task.priority}">${escapeHtml(task.priority.toUpperCase())}</span>
                    <span class="px-2 py-1 text-xs font-medium rounded-full status-${task.status} ${overdue?'status-overdue':''}">${overdue?'OVERDUE':escapeHtml(task.status.toUpperCase())}</span>
                </div>
            </div>
            <div class="mb-4">
                <div class="flex items-center text-sm text-gray-600 mb-2"><i class="fas fa-calendar-alt mr-2"></i><span>Due: ${formatDateTime(task.dueDate)}</span></div>
                ${overdue?'<div class="flex items-center text-sm text-red-600"><i class="fas fa-exclamation-triangle mr-2"></i><span>This task is overdue!</span></div>':''}
                ${dueSoon?'<div class="flex items-center text-sm text-amber-600"><i class="fas fa-clock mr-2"></i><span>Due within 24 hours!</span></div>':''}
                ${task.completedAt?`<div class="flex items-center text-sm text-green-600 mt-2"><i class="fas fa-check mr-2"></i><span>Completed: ${formatDateTime(task.completedAt)}</span></div>`:''}
            </div>
            <div class="flex justify-between items-center">
                <button onclick="toggleTaskStatus('${task.id}')" class="flex items-center text-sm ${task.status==='completed'?'text-green-600 hover:text-green-700':'text-gray-600 hover:text-gray-700'} transition-colors">
                    <i class="fas ${task.status==='completed'?'fa-undo':'fa-check-circle'} mr-2"></i>${task.status==='completed'?'Mark Pending':'Mark Complete'}
                </button>
                <div class="flex space-x-2">
                    <button onclick="editTask('${task.id}')" class="text-indigo-600 hover:text-indigo-700 transition-colors p-2 rounded-lg hover:bg-indigo-50"><i class="fas fa-edit"></i></button>
                    <button onclick="deleteTask('${task.id}')" class="text-red-600 hover:text-red-700 transition-colors p-2 rounded-lg hover:bg-red-50"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        </div>`;
    }).join('');
}

function escapeHtml(unsafe){ if(!unsafe) return ''; return String(unsafe).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"); }

function getFilteredTasks(){
    let filtered=[...tasks];
    const searchTerm=document.getElementById('searchInput')?.value.toLowerCase().trim()||'';
    const priority=document.getElementById('priorityFilter')?.value||'';
    const status=document.getElementById('statusFilter')?.value||'';
    if(searchTerm) filtered=filtered.filter(t=>t.title.toLowerCase().includes(searchTerm)||(t.description&&t.description.toLowerCase().includes(searchTerm))||t.subject.toLowerCase().includes(searchTerm));
    if(priority) filtered=filtered.filter(t=>t.priority===priority);
    if(status) filtered=filtered.filter(t=>t.status===status);
    return filtered.sort((a,b)=>{ if(a.status!==b.status)return a.status==='pending'?-1:1; return new Date(a.dueDate)-new Date(b.dueDate); });
}

function filterTasks(){ renderTasks(); }

// =========================================
// STATISTICS
// =========================================
function updateStatistics(){
    const total=tasks.length;
    const completed=tasks.filter(t=>t.status==='completed').length;
    const pending=tasks.filter(t=>t.status==='pending').length;
    const overdue=tasks.filter(t=>new Date(t.dueDate)<new Date()&&t.status==='pending').length;
    document.getElementById('totalTasks')&&(document.getElementById('totalTasks').textContent=total);
    document.getElementById('completedTasks')&&(document.getElementById('completedTasks').textContent=completed);
    document.getElementById('pendingTasks')&&(document.getElementById('pendingTasks').textContent=pending);
    document.getElementById('overdueTasks')&&(document.getElementById('overdueTasks').textContent=overdue);
}

// =========================================
// EMAIL NOTIFICATIONS
// =========================================
function getUrgentTasks(){
    const now=new Date();
    const upcoming=tasks.filter(t=>t.status!=='completed'&&new Date(t.dueDate)-now>0&&new Date(t.dueDate)-now<=24*60*60*1000);
    const overdue=tasks.filter(t=>t.status!=='completed'&&new Date(t.dueDate)<now);
    return {upcoming,overdue};
}

async function checkDeadlines(){
    if(!isOnline){ showToast('error','Offline','Check internet'); return; }
    if(!currentUser?.email){ showToast('error','Email Failed','No recipient email'); return; }
    const button=document.getElementById('checkDeadlinesBtn'); const orig=button?.innerHTML||''; if(button){ button.innerHTML='<i class="fas fa-spinner loading mr-2"></i>Sending...'; button.disabled=true; }
    try{
        const urgent=getUrgentTasks(); let sent=0;
        if(urgent.overdue.length>0 && EMAIL_CONFIG.serviceId && EMAIL_CONFIG.templates.overdue){ await sendOverdueEmail(urgent.overdue); sent++; }
        if(urgent.upcoming.length>0 && EMAIL_CONFIG.serviceId && EMAIL_CONFIG.templates.upcoming){ await sendUpcomingEmail(urgent.upcoming); sent++; }
        showToast('success', sent>0?'Emails Sent!':'All Good!', sent>0?`${sent} email(s) sent to ${currentUser.email}`:'No urgent deadlines');
    }catch(err){ console.error(err); showToast('error','Email Failed','Could not send email'); }
    finally{ if(button){ button.innerHTML=orig; button.disabled=false; } }
}

async function sendOverdueEmail(tasks){
    if(!EMAIL_CONFIG.serviceId||!EMAIL_CONFIG.templates.overdue||!currentUser?.email) return;
    return emailjs.send(EMAIL_CONFIG.serviceId,EMAIL_CONFIG.templates.overdue,{
        student_name:currentUser.name,
        task_title:tasks.map(t=>t.title).join(', '),
        subject_name:tasks.map(t=>t.subject).join(', '),
        due_date:tasks.map(t=>formatDateTime(t.dueDate)).join(', '),
        to_email:currentUser.email
    });
}

async function sendUpcomingEmail(tasks){
    if(!EMAIL_CONFIG.serviceId||!EMAIL_CONFIG.templates.upcoming||!currentUser?.email) return;
    return emailjs.send(EMAIL_CONFIG.serviceId,EMAIL_CONFIG.templates.upcoming,{
        student_name:currentUser.name,
        task_title:tasks.map(t=>t.title).join(', '),
        subject_name:tasks.map(t=>t.subject).join(', '),
        due_date:tasks.map(t=>formatDateTime(t.dueDate)).join(', '),
        to_email:currentUser.email
    });
}

function setupDailyEmailCheck(){ setInterval(()=>{ const urgent=getUrgentTasks(); if(urgent.overdue.length>0||urgent.upcoming.length>0) console.log('Urgent tasks:',urgent); },60*60*1000); }

// =========================================
// UTILITIES
// =========================================
function formatDateTime(dt){ const d=new Date(dt); return d.toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}); }
function setMinDateTime(){ const now=new Date(); const min=now.toISOString().slice(0,16); const el=document.getElementById('taskDueDate'); if(el) el.min=min; }

function showToast(type,title,message){
    const toast=document.getElementById('toast');
    const icon=document.getElementById('toastIcon');
    const tTitle=document.getElementById('toastTitle');
    const tMsg=document.getElementById('toastMessage');
    if(!toast||!icon||!tTitle||!tMsg) return;
    const icons={success:'<i class="fas fa-check-circle text-green-500"></i>',error:'<i class="fas fa-exclamation-circle text-red-500"></i>',warning:'<i class="fas fa-exclamation-triangle text-amber-500"></i>',info:'<i class="fas fa-info-circle text-blue-500"></i>'};
    icon.innerHTML=icons[type]||icons.info; tTitle.textContent=title; tMsg.textContent=message;
    toast.style.transform='translateX(0)';
    setTimeout(()=>{ toast.style.transform='translateX(100%)'; },5000);
}

// =========================================
// OFFLINE INDICATOR
// =========================================
function showOfflineIndicator(){ let ind=document.getElementById('offlineIndicator'); if(!ind){ ind=document.createElement('div'); ind.id='offlineIndicator'; ind.className='offline-indicator'; ind.innerHTML='<i class="fas fa-wifi-slash mr-2"></i>Offline'; document.body.appendChild(ind);} ind.classList.add('show'); }
function hideOfflineIndicator(){ document.getElementById('offlineIndicator')?.classList.remove('show'); }

// =========================================
// LOADING SCREEN
// =========================================
function showLoadingScreen(){ loadingScreen?.classList.remove('hidden'); authScreen?.classList.add('hidden'); dashboardScreen?.classList.add('hidden'); }
function hideLoadingScreen(){ loadingScreen?.classList.add('hidden'); }

// =========================================
// GLOBAL ERROR HANDLING
// =========================================
window.addEventListener('error', e=>{ console.error('Global error:',e.error); showToast('error','Something went wrong','Refresh the page'); });
window.addEventListener('unhandledrejection', e=>{ console.error('Unhandled promise rejection:',e.reason); showToast('error','Something went wrong','Refresh the page'); });
