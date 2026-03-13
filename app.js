import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabaseUrl, supabaseKey } from './supabase-config.js';

// ============================
// SUPABASE INITIALIZATION
// ============================
const supabase = window.supabase ? window.supabase.createClient(supabaseUrl, supabaseKey) : null;
if (!supabase) console.error("Supabase library not found!");

// ============================
// GEMINI AI INITIALIZATION
// ============================
const GEMINI_API_KEY = 'AIzaSyApvtDWhiSzfiaq49KIootHAfDh_WQwym4';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
console.log('✅ Gemini AI initialized');

// ============================
// STATE
// ============================
let currentUser = null;
let currentImageBase64 = null;

// ============================
// DOM ELEMENTS
// ============================
const landingPage = document.getElementById('landing-page');
const appDashboard = document.getElementById('app-dashboard');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userPhoto = document.getElementById('user-photo');
const userNameDisplay = document.getElementById('user-name');

// Detection
const fileInput = document.getElementById('file-input');
const dropZone = document.getElementById('drop-zone');
const previewImg = document.getElementById('preview-img');
const uploadPlaceholder = document.getElementById('upload-placeholder');
const diagnoseBtn = document.getElementById('diagnose-btn');
const resultPanel = document.getElementById('result-panel');
const resultBadge = document.getElementById('result-badge');
const plantNameText = document.getElementById('plant-name-text');
const resultPlantName = document.getElementById('result-plant-name');
const diseaseName = document.getElementById('disease-name');
const diseaseDescription = document.getElementById('disease-description');
const causesText = document.getElementById('causes-text');
const organicText = document.getElementById('organic-treatment-text');
const chemicalText = document.getElementById('chemical-treatment-text');
const preventionText = document.getElementById('prevention-text');
const confidenceContainer = document.getElementById('confidence-bar-container');
const confidenceFill = document.getElementById('confidence-fill');
const confidenceText = document.getElementById('confidence-text');

// ============================
// AUTH
// ============================

async function checkAuthSession() {
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    handleAuthChange(session?.user || null);

    supabase.auth.onAuthStateChange((_event, session) => {
        handleAuthChange(session?.user || null);
    });
}

function extractUserData(user) {
    // Supabase stores OAuth provider metadata in user.user_metadata
    return {
        id: user.id,
        name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Farmer',
        email: user.email,
        photo: user.user_metadata?.avatar_url || 'https://via.placeholder.com/40'
    };
}

async function handleAuthChange(user) {
    if (user) {
        currentUser = extractUserData(user);
        showDashboard(currentUser);
        await saveUserProfile(currentUser);
    } else {
        currentUser = null;
        showLanding();
    }
}

function showDashboard(user) {
    landingPage.classList.add('hidden');
    appDashboard.classList.remove('hidden');
    userPhoto.src = user.photo;
    userNameDisplay.textContent = user.name;
    loadHistory();
    checkAdmin();
}

function showLanding() {
    landingPage.classList.remove('hidden');
    appDashboard.classList.add('hidden');
}

async function saveUserProfile(user) {
    if (!supabase) return;
    try {
        const { error } = await supabase.from('users').upsert({
            id: user.id,
            name: user.name,
            email: user.email,
            photo: user.photo,
            last_login: new Date().toISOString()
        }, { onConflict: 'id' });
        if (error) throw error;
    } catch (e) { console.error('Error saving user:', e); }
}

async function checkAdmin() {
    if (!supabase || !currentUser) return;
    try {
        const { data, error } = await supabase.from('users').select('role').eq('id', currentUser.id).single();
        if (error) throw error;
        if (data && data.role === 'admin') {
            document.getElementById('admin-nav-btn').style.display = 'flex';
        }
    } catch (e) { console.error('Admin check error:', e); }
}

loginBtn.onclick = async () => {
    if (!supabase) return alert("Supabase not initialized.");
    try {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google'
        });
        if (error) throw error;
    } catch (e) {
        alert(`Login failed: ${e.message}`);
    }
};

logoutBtn.onclick = async () => {
    if (supabase) {
        await supabase.auth.signOut();
    }
};

// Initialize auth check
checkAuthSession();

// ============================
// SIDEBAR NAVIGATION
// ============================
document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
        const section = btn.dataset.section;
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.app-section').forEach(s => s.classList.remove('active'));
        document.getElementById(`sec-${section}`).classList.add('active');

        // Load data on section switch
        if (section === 'history') loadHistory();
        if (section === 'community') loadPosts();
        if (section === 'admin') loadAdminData();
    });
});

// ============================
// 1. DISEASE DETECTION
// ============================
dropZone.onclick = () => fileInput.click();

fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            previewImg.src = event.target.result;
            previewImg.classList.remove('hidden');
            uploadPlaceholder.classList.add('hidden');
            diagnoseBtn.disabled = false;
            currentImageBase64 = event.target.result.split(',')[1];
        };
        reader.readAsDataURL(file);
    }
};

const DIAGNOSIS_PROMPT = `You are an expert agricultural plant pathologist. Analyze the uploaded image and respond ONLY with valid JSON (no markdown, no code fences).

STEP 1: Determine if this image shows a plant, crop, leaf, or vegetation.
If NOT a plant, respond:
{"is_plant": false, "message": "This image does not contain a plant or crop leaf. Please upload a clear photo of the affected plant leaf."}

STEP 2: If it IS a plant, analyze for diseases:
{
  "is_plant": true,
  "plant_name": "Name of the plant/crop (e.g., Tomato, Rice, Potato)",
  "disease_name": "Disease name OR 'Healthy'",
  "confidence": 85,
  "is_healthy": false,
  "description": "Brief one-line description of the disease",
  "causes": "What causes this disease",
  "organic_treatment": "Organic/natural treatment options",
  "chemical_treatment": "Chemical treatment with product names and dosage",
  "prevention": "How to prevent this disease"
}

Rules: confidence 0-100, be specific about treatments, always return valid JSON only.`;

diagnoseBtn.onclick = async () => {
    if (!currentImageBase64) return alert('Upload an image first.');

    diagnoseBtn.disabled = true;
    diagnoseBtn.textContent = 'Analyzing...';
    resultPanel.classList.remove('hidden');
    resultBadge.textContent = 'AI Processing...';
    resultBadge.style.background = '#ff9800';
    diseaseName.textContent = 'Analyzing image...';
    diseaseDescription.textContent = '';
    causesText.textContent = '';
    organicText.textContent = '';
    chemicalText.textContent = '';
    preventionText.textContent = '';
    confidenceContainer.classList.add('hidden');
    resultPlantName.classList.add('hidden');

    try {
        const imagePart = { inlineData: { data: currentImageBase64, mimeType: 'image/jpeg' } };
        const result = await geminiModel.generateContent([DIAGNOSIS_PROMPT, imagePart]);
        let text = result.response.text().trim();
        if (text.startsWith('```')) text = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        const d = JSON.parse(text);

        if (!d.is_plant) {
            resultBadge.textContent = '⚠️ Invalid Image';
            resultBadge.style.background = '#d32f2f';
            diseaseName.textContent = 'No Plant Detected';
            diseaseDescription.textContent = d.message || 'Not a plant image.';
        } else if (d.is_healthy) {
            resultPlantName.classList.remove('hidden');
            plantNameText.textContent = d.plant_name;
            resultBadge.textContent = '✅ Healthy';
            resultBadge.style.background = '#4caf50';
            diseaseName.textContent = 'Healthy — No Disease';
            diseaseDescription.textContent = d.description || 'Plant appears healthy.';
            causesText.textContent = 'No disease detected.';
            organicText.textContent = d.organic_treatment || 'Continue regular care.';
            chemicalText.textContent = d.chemical_treatment || 'N/A';
            preventionText.textContent = d.prevention || 'Maintain proper care.';
            showConfidence(d.confidence || 90);
            saveScan(d);
        } else {
            resultPlantName.classList.remove('hidden');
            plantNameText.textContent = d.plant_name;
            resultBadge.textContent = '🔬 Disease Found';
            resultBadge.style.background = '#ff5722';
            diseaseName.textContent = d.disease_name;
            diseaseDescription.textContent = d.description || '';
            causesText.textContent = d.causes;
            organicText.textContent = d.organic_treatment;
            chemicalText.textContent = d.chemical_treatment;
            preventionText.textContent = d.prevention;
            showConfidence(d.confidence || 0);
            saveScan(d);
        }
    } catch (error) {
        console.error('Diagnosis error:', error);
        resultBadge.textContent = '❌ Error';
        resultBadge.style.background = '#d32f2f';
        const msg = error.message || '';
        if (msg.includes('429') || msg.includes('quota')) {
            diseaseName.textContent = 'Quota Exceeded';
            diseaseDescription.textContent = 'Free tier limit reached. Please wait 30 seconds and try again.';
        } else {
            diseaseName.textContent = 'Analysis Failed';
            diseaseDescription.textContent = `Error: ${msg}`;
        }
    }

    diagnoseBtn.textContent = 'Run AI Diagnosis';
    diagnoseBtn.disabled = false;
};

function showConfidence(value) {
    confidenceContainer.classList.remove('hidden');
    const v = Math.max(0, Math.min(100, value));
    confidenceFill.style.width = `${v}%`;
    confidenceText.textContent = `${v}%`;
    confidenceFill.style.background = v >= 80
        ? 'linear-gradient(90deg, #4caf50, #66bb6a)'
        : v >= 50 ? 'linear-gradient(90deg, #ff9800, #ffb74d)'
            : 'linear-gradient(90deg, #d32f2f, #ef5350)';
}

// ============================
// 2. SAVE SCAN / HISTORY
// ============================
async function saveScan(d) {
    if (!currentUser || !supabase) return;
    try {
        const { error } = await supabase.from('scans').insert([{
            uid: currentUser.id,
            user_name: currentUser.name,
            user_email: currentUser.email,
            plant: d.plant_name,
            disease: d.disease_name,
            confidence: d.confidence,
            description: d.description,
            causes: d.causes,
            organic_treatment: d.organic_treatment,
            chemical_treatment: d.chemical_treatment,
            prevention: d.prevention,
            is_healthy: d.is_healthy || false
        }]);
        if (error) throw error;
    } catch (e) { console.error('Save scan error:', e); }
}

async function loadHistory() {
    if (!supabase || !currentUser) return;
    try {
        const { data: scans, error } = await supabase.from('scans')
            .select('*')
            .eq('uid', currentUser.id)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) throw error;

        const tbody = document.getElementById('history-tbody');
        let total = 0, diseases = 0, healthy = 0;

        if (!scans || scans.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No scan history yet.</td></tr>';
        } else {
            tbody.innerHTML = '';
            scans.forEach(d => {
                total++;
                if (d.is_healthy) healthy++; else diseases++;
                const date = d.created_at ? new Date(d.created_at).toLocaleDateString() : 'Just now';
                tbody.innerHTML += `
                    <tr>
                        <td>${date}</td>
                        <td>${d.plant || '—'}</td>
                        <td>${d.disease || '—'}</td>
                        <td>${d.confidence || 0}%</td>
                        <td><button class="btn-sm" onclick="viewScanDetail('${d.id}')">View</button></td>
                    </tr>`;
            });
        }

        document.getElementById('stat-total').textContent = total;
        document.getElementById('stat-diseases').textContent = diseases;
        document.getElementById('stat-healthy').textContent = healthy;
    } catch (e) { console.error('Load history error:', e); }
}

window.viewScanDetail = async (id) => {
    if (!supabase) return;
    try {
        const { data: d, error } = await supabase.from('scans').select('*').eq('id', id).single();
        if (error) throw error;
        if (!d) return;

        const body = document.getElementById('history-modal-body');
        body.innerHTML = `
            <div class="treatment-block"><h5>🌱 Plant</h5><p>${d.plant || '—'}</p></div>
            <div class="treatment-block"><h5>🦠 Disease</h5><p>${d.disease || '—'} (${d.confidence || 0}% confidence)</p></div>
            <div class="treatment-block"><h5>📝 Description</h5><p>${d.description || '—'}</p></div>
            <div class="treatment-block"><h5>🔍 Cause</h5><p>${d.causes || '—'}</p></div>
            <div class="treatment-block"><h5>🌿 Organic Treatment</h5><p>${d.organic_treatment || '—'}</p></div>
            <div class="treatment-block"><h5>🧪 Chemical Treatment</h5><p>${d.chemical_treatment || '—'}</p></div>
            <div class="treatment-block"><h5>🛡️ Prevention</h5><p>${d.prevention || '—'}</p></div>
        `;
        document.getElementById('history-modal').classList.remove('hidden');
    } catch (e) { console.error('View detail error:', e); }
};

document.getElementById('close-history-modal').onclick = () => {
    document.getElementById('history-modal').classList.add('hidden');
};

// ============================
// 3. PLANT CARE LIBRARY
// ============================
const PLANTS_DB = [
    { name: 'Tomato', emoji: '🍅', water: 'Regular, 1-2 inches/week', fertilizer: 'Balanced NPK 10-10-10', sunlight: 'Full Sun (6-8 hrs)', diseases: ['Late Blight', 'Early Blight', 'Leaf Curl', 'Septoria Leaf Spot'] },
    { name: 'Rice', emoji: '🌾', water: 'Standing water (paddy)', fertilizer: 'Nitrogen-rich (Urea)', sunlight: 'Full Sun', diseases: ['Blast', 'Sheath Blight', 'Brown Spot', 'Bacterial Leaf Blight'] },
    { name: 'Potato', emoji: '🥔', water: 'Moderate, consistent', fertilizer: 'High Potassium', sunlight: 'Full Sun (6+ hrs)', diseases: ['Early Blight', 'Late Blight', 'Black Scurf', 'Common Scab'] },
    { name: 'Wheat', emoji: '🌿', water: '4-6 irrigations per season', fertilizer: 'NPK + Zinc', sunlight: 'Full Sun', diseases: ['Rust', 'Powdery Mildew', 'Loose Smut', 'Karnal Bunt'] },
    { name: 'Cotton', emoji: '☁️', water: 'Regular, drip preferred', fertilizer: 'Nitrogen + Potash', sunlight: 'Full Sun (8+ hrs)', diseases: ['Bollworm', 'Leaf Curl', 'Wilt', 'Grey Mildew'] },
    { name: 'Corn (Maize)', emoji: '🌽', water: '1 inch/week', fertilizer: 'Nitrogen-heavy', sunlight: 'Full Sun', diseases: ['Leaf Blight', 'Rust', 'Stalk Rot', 'Downy Mildew'] },
    { name: 'Sugarcane', emoji: '🎋', water: 'Heavy irrigation', fertilizer: 'NPK + Sulphur', sunlight: 'Full Sun', diseases: ['Red Rot', 'Smut', 'Wilt', 'Grassy Shoot'] },
    { name: 'Chili Pepper', emoji: '🌶️', water: 'Moderate', fertilizer: 'Phosphorus-rich', sunlight: 'Full Sun (6 hrs)', diseases: ['Anthracnose', 'Leaf Curl', 'Bacterial Wilt', 'Powdery Mildew'] },
    { name: 'Grape', emoji: '🍇', water: 'Drip irrigation', fertilizer: 'Potassium + Calcium', sunlight: 'Full Sun', diseases: ['Downy Mildew', 'Powdery Mildew', 'Anthracnose', 'Black Rot'] },
    { name: 'Apple', emoji: '🍎', water: '1 inch/week', fertilizer: 'Balanced orchard mix', sunlight: 'Full Sun (6-8 hrs)', diseases: ['Apple Scab', 'Cedar Rust', 'Fire Blight', 'Black Rot'] },
    { name: 'Mango', emoji: '🥭', water: 'Moderate, less in winter', fertilizer: 'Organic manure + NPK', sunlight: 'Full Sun', diseases: ['Anthracnose', 'Powdery Mildew', 'Die Back', 'Mango Malformation'] },
    { name: 'Banana', emoji: '🍌', water: 'Heavy, consistent', fertilizer: 'Potassium-rich', sunlight: 'Full Sun to Partial', diseases: ['Panama Wilt', 'Sigatoka', 'Bunchy Top', 'Moko Disease'] }
];

function renderLibrary(filter = '') {
    const grid = document.getElementById('library-grid');
    const filtered = PLANTS_DB.filter(p => p.name.toLowerCase().includes(filter.toLowerCase()));

    grid.innerHTML = filtered.map(p => `
        <div class="plant-card glass-card">
            <div class="plant-card-header">
                <span class="plant-emoji">${p.emoji}</span>
                <h4>${p.name}</h4>
            </div>
            <div class="plant-info-grid">
                <div class="plant-info-item"><span class="label">Water</span>${p.water}</div>
                <div class="plant-info-item"><span class="label">Fertilizer</span>${p.fertilizer}</div>
                <div class="plant-info-item"><span class="label">Sunlight</span>${p.sunlight}</div>
                <div class="plant-info-item"><span class="label">Diseases</span>${p.diseases.length} known</div>
            </div>
            <div class="plant-diseases">
                <h5>Common Diseases</h5>
                ${p.diseases.map(d => `<span class="disease-tag">${d}</span>`).join('')}
            </div>
        </div>
    `).join('');
}

renderLibrary();
document.getElementById('library-search-input').addEventListener('input', (e) => {
    renderLibrary(e.target.value);
});

// ============================
// 4. COMMUNITY FORUM
// ============================
const postImageInput = document.getElementById('post-image-input');
const postImagePreview = document.getElementById('post-image-preview');
let postImageBase64 = null;

postImageInput.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            postImageBase64 = ev.target.result;
            postImagePreview.src = ev.target.result;
            postImagePreview.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    }
};

document.getElementById('submit-post-btn').onclick = async () => {
    const text = document.getElementById('post-text').value.trim();
    if (!text) return alert('Write something first.');
    if (!currentUser || !supabase) return alert('Please login.');

    try {
        const { error } = await supabase.from('posts').insert([{
            uid: currentUser.id,
            user_name: currentUser.name,
            user_photo: currentUser.photo,
            text: text,
            image: postImageBase64 || null
        }]);
        if (error) throw error;

        document.getElementById('post-text').value = '';
        postImageBase64 = null;
        postImagePreview.classList.add('hidden');
        loadPosts();
    } catch (e) { console.error('Post error:', e); alert('Failed to post. Check console.'); }
};

async function loadPosts() {
    if (!supabase) return;
    try {
        // Fetch posts
        const { data: posts, error: postsError } = await supabase.from('posts')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);

        if (postsError) throw postsError;

        // Fetch all recent comments to associate with posts
        const { data: comments, error: commentsError } = await supabase.from('comments')
            .select('*')
            .order('created_at', { ascending: true }); // Chronological order for replies

        if (commentsError) throw commentsError;

        const container = document.getElementById('posts-container');

        if (!posts || posts.length === 0) {
            container.innerHTML = '<p class="empty-state">No posts yet. Be the first!</p>';
            return;
        }

        container.innerHTML = '';
        posts.forEach(p => {
            const date = p.created_at ? new Date(p.created_at).toLocaleDateString() : 'Just now';
            const imgHtml = p.image ? `<img src="${p.image}" alt="Post image">` : '';

            // Filter comments for this post
            const postComments = comments.filter(c => c.post_id === p.id);

            const commentsHtml = postComments.map(c => `
                <div class="comment">
                    <img src="${c.photo || 'https://via.placeholder.com/28'}" alt="">
                    <div class="comment-body">
                        <h5>${c.name}</h5>
                        <p>${c.text}</p>
                    </div>
                </div>
            `).join('');

            container.innerHTML += `
                <div class="post-card glass-card">
                    <div class="post-header">
                        <img class="post-avatar" src="${p.user_photo || 'https://via.placeholder.com/36'}" alt="">
                        <div class="post-meta">
                            <h4>${p.user_name || 'Farmer'}</h4>
                            <span>${date}</span>
                        </div>
                    </div>
                    <div class="post-body">
                        <p>${p.text}</p>
                        ${imgHtml}
                    </div>
                    <div class="post-footer">
                        <button onclick="toggleComments('${p.id}')">💬 ${postComments.length} Comments</button>
                    </div>
                    <div class="comments-section" id="comments-${p.id}" style="display:none;">
                        ${commentsHtml}
                        <div class="comment-input-row">
                            <input type="text" id="comment-input-${p.id}" placeholder="Write a comment...">
                            <button class="btn-primary" onclick="addComment('${p.id}')">Send</button>
                        </div>
                    </div>
                </div>
            `;
        });
    } catch (e) { console.error('Load posts error:', e); }
}

window.toggleComments = (id) => {
    const el = document.getElementById(`comments-${id}`);
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
};

window.addComment = async (postId) => {
    if (!currentUser || !supabase) return;
    const input = document.getElementById(`comment-input-${postId}`);
    const text = input.value.trim();
    if (!text) return;

    try {
        const { error } = await supabase.from('comments').insert([{
            post_id: postId,
            uid: currentUser.id,
            name: currentUser.name,
            photo: currentUser.photo,
            text: text
        }]);
        if (error) throw error;

        input.value = '';
        loadPosts();
    } catch (e) { console.error('Comment error:', e); }
};

// ============================
// 5. CROP ADVISOR
// ============================
document.getElementById('recommend-btn').onclick = async () => {
    const soil = document.getElementById('soil-type').value;
    const location = document.getElementById('location-input').value.trim();
    const season = document.getElementById('season-select').value;

    if (!soil || !location) return alert('Please fill soil type and location.');

    const btn = document.getElementById('recommend-btn');
    btn.disabled = true;
    btn.textContent = 'Getting Recommendations...';
    const panel = document.getElementById('recommendations-panel');
    panel.classList.remove('hidden');
    document.getElementById('recommendations-list').innerHTML = '<p>AI is thinking...</p>';

    const prompt = `You are an Indian agricultural expert. A farmer has these conditions:
- Soil Type: ${soil}
- Location: ${location}
- Season: ${season || 'Not specified'}

Recommend 5 suitable crops. Respond ONLY with valid JSON array (no markdown):
[
  {"crop": "Crop Name", "reason": "Why this crop suits", "expected_yield": "Expected yield per acre", "tips": "Key growing tip"}
]`;

    try {
        const result = await geminiModel.generateContent(prompt);
        let text = result.response.text().trim();
        if (text.startsWith('```')) text = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        const crops = JSON.parse(text);

        document.getElementById('recommendations-list').innerHTML = crops.map(c => `
            <div class="rec-card">
                <h4>🌱 ${c.crop}</h4>
                <p><strong>Why:</strong> ${c.reason}</p>
                <p><strong>Expected Yield:</strong> ${c.expected_yield}</p>
                <p><strong>Tip:</strong> ${c.tips}</p>
            </div>
        `).join('');
    } catch (e) {
        console.error('Recommendation error:', e);
        document.getElementById('recommendations-list').innerHTML =
            `<p class="empty-state">Error: ${e.message}. Please try again.</p>`;
    }

    btn.disabled = false;
    btn.textContent = 'Get AI Recommendations';
};

// ============================
// 6. ADMIN DASHBOARD
// ============================
async function loadAdminData() {
    if (!supabase) return;
    try {
        // Recent scans
        const { data: scans, error: scansError } = await supabase.from('scans').select('*').order('created_at', { ascending: false }).limit(10);
        if (scansError) throw scansError;

        const scansTbody = document.getElementById('admin-scans-tbody');
        let totalScans = 0;
        const diseaseCount = {};

        if (!scans || scans.length === 0) {
            scansTbody.innerHTML = '<tr><td colspan="3" class="empty-state">No scans yet.</td></tr>';
        } else {
            scansTbody.innerHTML = '';
            scans.forEach(d => {
                totalScans++;
                if (d.disease && !d.is_healthy) {
                    diseaseCount[d.disease] = (diseaseCount[d.disease] || 0) + 1;
                }
                const date = d.created_at ? new Date(d.created_at).toLocaleDateString() : '—';
                scansTbody.innerHTML += `<tr><td>${d.user_name || '—'}</td><td>${date}</td><td>${d.disease || '—'}</td></tr>`;
            });
        }

        // Users
        const { data: users, error: usersError } = await supabase.from('users').select('*').order('last_login', { ascending: false }).limit(10);
        if (usersError) throw usersError;

        const usersTbody = document.getElementById('admin-users-tbody');
        let totalUsers = 0;

        if (!users || users.length === 0) {
            usersTbody.innerHTML = '<tr><td colspan="4" class="empty-state">No users yet.</td></tr>';
        } else {
            usersTbody.innerHTML = '';
            users.forEach(d => {
                totalUsers++;
                const joined = d.last_login ? new Date(d.last_login).toLocaleDateString() : '—';
                usersTbody.innerHTML += `<tr><td>${d.name || '—'}</td><td>${d.email || '—'}</td><td>${joined}</td><td>${d.role || 'user'}</td></tr>`;
            });
        }

        // Posts count
        const { count: postsCount, error: countError } = await supabase.from('posts').select('*', { count: 'exact', head: true });
        if (countError) throw countError;

        // Stats
        document.getElementById('admin-total-scans').textContent = totalScans;
        document.getElementById('admin-total-users').textContent = totalUsers;
        document.getElementById('admin-total-posts').textContent = postsCount || 0;

        const topDisease = Object.entries(diseaseCount).sort((a, b) => b[1] - a[1])[0];
        document.getElementById('admin-top-disease').textContent = topDisease ? topDisease[0] : '—';

    } catch (e) { console.error('Admin data error:', e); }
}
