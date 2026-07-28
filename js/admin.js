(() => {
'use strict';
const cfg=window.TODAYSANT_CONFIG||{};
const $=id=>document.getElementById(id);
const configured=/^https:\/\/.+\.supabase\.co$/.test(cfg.supabaseUrl||'')&&/^(sb_publishable_|eyJ)/.test(cfg.supabasePublishableKey||'');
let client=null, users=[];
const fmtDate=value=>value?new Date(value).toLocaleString('ko-KR',{year:'2-digit',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'-';
const fmtHours=value=>`${Number(value||0).toLocaleString('ko-KR',{maximumFractionDigits:1})}시간`;
const setMessage=(text,error=false)=>{ $('loginMessage').textContent=text||''; $('loginMessage').className=`message${error?' error':''}`; };
function activityStatus(value){if(!value)return ['기록 없음','old'];const hours=(Date.now()-new Date(value).getTime())/3600000;if(hours<24)return ['오늘 활동','active'];if(hours<168)return ['이번 주 활동','idle'];return ['휴면','old'];}
function renderRows(){const q=$('searchInput').value.trim().toLowerCase();const rows=users.filter(u=>(u.email||'').toLowerCase().includes(q));$('emptyState').hidden=rows.length>0;$('userRows').innerHTML=rows.map(u=>{const [label,cls]=activityStatus(u.last_activity_at);return `<tr><td><strong>${escapeHtml(u.email||'(이메일 없음)')}</strong><div class="sub">${u.email_confirmed_at?'인증 완료':'미인증'}</div></td><td>${fmtDate(u.created_at)}</td><td>${fmtDate(u.last_sign_in_at)}</td><td>${fmtDate(u.last_activity_at)}</td><td>${Number(u.project_count||0).toLocaleString('ko-KR')}개</td><td>${fmtHours(u.total_hours)}</td><td><span class="status ${cls}">${label}</span></td></tr>`}).join('');}
function escapeHtml(v){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
async function loadDashboard(){
 $('refreshBtn').disabled=true;
 const [{data:stats,error:statsError},{data:list,error:listError}]=await Promise.all([client.rpc('admin_dashboard_stats'),client.rpc('admin_user_list')]);
 $('refreshBtn').disabled=false;
 if(statsError||listError){console.error(statsError||listError);throw statsError||listError;}
 const s=Array.isArray(stats)?stats[0]:stats;
 $('totalUsers').textContent=Number(s?.total_users||0).toLocaleString('ko-KR');$('dau').textContent=Number(s?.active_today||0).toLocaleString('ko-KR');$('wau').textContent=Number(s?.active_7d||0).toLocaleString('ko-KR');$('mau').textContent=Number(s?.active_30d||0).toLocaleString('ko-KR');$('totalProjects').textContent=Number(s?.total_projects||0).toLocaleString('ko-KR');$('totalHours').textContent=fmtHours(s?.total_hours);
 users=list||[];renderRows();$('updatedAt').textContent=`마지막 갱신 ${new Date().toLocaleTimeString('ko-KR')}`;
}
async function showForSession(session){
 if(!session){$('loginCard').hidden=false;$('dashboard').hidden=true;$('logoutBtn').hidden=true;return;}
 try{const {data:isAdmin,error}=await client.rpc('is_admin');if(error)throw error;if(!isAdmin){await client.auth.signOut();setMessage('이 계정은 관리자 권한이 없어요.',true);return;}
 $('loginCard').hidden=true;$('dashboard').hidden=false;$('logoutBtn').hidden=false;$('adminEmail').textContent=session.user.email||'관리자';await loadDashboard();
 }catch(e){console.error(e);setMessage('관리자 SQL 설정을 확인해주세요.',true);$('loginCard').hidden=false;$('dashboard').hidden=true;}
}
$('loginForm').onsubmit=async e=>{e.preventDefault();if(!configured)return setMessage('js/config.js 설정이 필요해요.',true);setMessage('로그인 중…');const {error}=await client.auth.signInWithPassword({email:$('emailInput').value.trim(),password:$('passwordInput').value});if(error)setMessage(error.message,true);};
$('logoutBtn').onclick=()=>client.auth.signOut();$('refreshBtn').onclick=()=>loadDashboard().catch(()=>alert('통계를 불러오지 못했어요.'));$('searchInput').oninput=renderRows;
if(!configured||!window.supabase?.createClient){setMessage('js/config.js에 Supabase 설정을 먼저 입력해주세요.',true);return;}
client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
client.auth.onAuthStateChange((_e,s)=>setTimeout(()=>showForSession(s),0));client.auth.getSession().then(({data})=>showForSession(data.session));
})();
