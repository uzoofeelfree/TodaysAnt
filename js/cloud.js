(() => {
  'use strict';
  const cfg = window.TODAYSANT_CONFIG || {};
  const configured = /^https:\/\/.+\.supabase\.co$/.test(cfg.supabaseUrl || '') &&
    /^(sb_publishable_|eyJ)/.test(cfg.supabasePublishableKey || '');
  const els = Object.fromEntries([
    'authPanel','authCopy','authUser','authEmail','syncBadge','logoutBtn','authOpenBtn',
    'authModalBg','authCloseBtn','authForm','authEmailInput','authPasswordInput','signupBtn',
    'authMessage','guestBtn','migrationModalBg','migrationSummary','migrationUploadBtn','migrationCloudBtn'
  ].map(id => [id, document.getElementById(id)]));

  let client = null;
  let session = null;
  let channel = null;
  let saveTimer = null;
  let applyingRemote = false;
  let lastCloudUpdatedAt = '';
  let pendingLocal = null;
  let beginSessionId = '';
  let beginInFlight = null;

  const migrationKey = userId => `todaysant:migration-resolved:v1:${userId}`;
  const accountCacheKey = userId => `todaysant:account-cache:v1:${userId}`;
  const emptyData = () => ({
    projects: [],
    activeId: null,
    profile: { nickname: '', greeting: '안녕하세요! 개미는 오늘도 일합니다 🐜', projectSort: 'urgent' }
  });
  const migrationResolved = userId => Boolean(localStorage.getItem(migrationKey(userId)));
  const rememberMigration = (userId, choice) => {
    localStorage.setItem(migrationKey(userId), JSON.stringify({ choice, resolvedAt: new Date().toISOString() }));
  };

  const setMessage = (message, type = '') => {
    els.authMessage.textContent = message || '';
    els.authMessage.dataset.type = type;
  };
  const setSync = (label, state = '') => {
    els.syncBadge.textContent = label;
    els.syncBadge.dataset.state = state;
  };
  const showAuth = (show) => {
    els.authModalBg.classList.toggle('show', show);
    els.authModalBg.setAttribute('aria-hidden', show ? 'false' : 'true');
    if (show) setTimeout(() => els.authEmailInput.focus(), 50);
  };
  const showMigration = (show) => {
    els.migrationModalBg.classList.toggle('show', show);
    els.migrationModalBg.setAttribute('aria-hidden', show ? 'false' : 'true');
  };
  const hasLocalData = (value) => Boolean(
    value && ((value.projects && value.projects.length) || value.profile?.nickname ||
      (value.profile?.greeting && !value.profile.greeting.includes('안녕하세요!')))
  );
  const cloneData = value => JSON.parse(JSON.stringify(value));
  const applyData = value => {
    if (!value || typeof value !== 'object') return;
    applyingRemote = true;
    data = value;
    normalize?.();
    localStorage.setItem(KEY, JSON.stringify(data));
    if (session?.user?.id) localStorage.setItem(accountCacheKey(session.user.id), JSON.stringify(data));
    selectedId = data.projects?.some(p => p.id === selectedId) ? selectedId : (data.projects?.[0]?.id || null);
    render?.();
    applyingRemote = false;
  };

  async function fetchCloud() {
    if (!session) return null;
    const { data: row, error } = await client.from('app_data').select('data,updated_at').eq('user_id', session.user.id).maybeSingle();
    if (error) throw error;
    if (row?.updated_at) lastCloudUpdatedAt = row.updated_at;
    return row;
  }

  async function writeCloud(value, quiet = false) {
    if (!session || applyingRemote) return;
    setSync('저장 중…', 'saving');
    const { data: row, error } = await client.from('app_data').upsert({
      user_id: session.user.id,
      data: cloneData(value),
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' }).select('updated_at').single();
    if (error) {
      console.error(error);
      setSync('동기화 오류', 'error');
      if (!quiet) toast?.('클라우드 저장에 실패했어요. 인터넷 연결과 설정을 확인해주세요.');
      return;
    }
    lastCloudUpdatedAt = row.updated_at;
    setSync('동기화 완료', 'ok');
  }

  function queueSave(value) {
    if (!session || applyingRemote) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => writeCloud(value, true), 700);
  }

  function stopRealtime() {
    if (channel && client) client.removeChannel(channel);
    channel = null;
  }

  function startRealtime() {
    stopRealtime();
    if (!session) return;
    channel = client.channel(`todaysant-${session.user.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'app_data', filter: `user_id=eq.${session.user.id}`
      }, payload => {
        const row = payload.new;
        if (!row?.data || row.updated_at === lastCloudUpdatedAt) return;
        lastCloudUpdatedAt = row.updated_at || '';
        applyData(row.data);
        setSync('다른 기기 기록 반영', 'ok');
      }).subscribe();
  }

  async function beginSignedIn(nextSession) {
    const userId = nextSession?.user?.id;
    if (!userId) return;

    // Supabase가 초기화 과정에서 같은 세션 이벤트를 두 번 보낼 수 있어요.
    // 동일 사용자의 동기화 시작을 한 번으로 합쳐 팝업 중복 표시를 막습니다.
    if (beginSessionId === userId && beginInFlight) return beginInFlight;
    beginSessionId = userId;

    beginInFlight = (async () => {
      session = nextSession;
      els.authCopy.hidden = true;
      els.authOpenBtn.hidden = true;
      els.authUser.hidden = false;
      els.authEmail.textContent = session.user.email || '로그인됨';
      setSync('불러오는 중…', 'saving');
      const cached = localStorage.getItem(accountCacheKey(userId));
      let cachedData = null;
      try { cachedData = cached ? JSON.parse(cached) : null; } catch (_) {}
      pendingLocal = hasLocalData(data) ? cloneData(data) : (cachedData || cloneData(data));

      try {
        const cloud = await fetchCloud();
        const differs = cloud?.data && hasLocalData(pendingLocal) &&
          JSON.stringify(cloud.data) !== JSON.stringify(pendingLocal);

        if (differs && !migrationResolved(userId)) {
          els.migrationSummary.textContent = `이 기기에 프로젝트 ${pendingLocal.projects?.length || 0}개가 있어요. 한 번 선택하면 이 기기에서는 다시 묻지 않아요.`;
          showMigration(true);
        } else if (cloud?.data) {
          // 최초 선택이 끝난 기기는 클라우드를 기준으로 조용히 동기화합니다.
          applyData(cloud.data);
          setSync('동기화 완료', 'ok');
        } else if (hasLocalData(pendingLocal)) {
          await writeCloud(pendingLocal, true);
          rememberMigration(userId, 'local');
        } else {
          await writeCloud(data, true);
          rememberMigration(userId, 'cloud');
        }
        startRealtime();
      } catch (error) {
        console.error(error);
        setSync('설정 필요', 'error');
        toast?.('Supabase 테이블 설정을 확인해주세요.');
      }
    })();

    try {
      await beginInFlight;
    } finally {
      beginInFlight = null;
    }
  }

  function signedOut() {
    session = null;
    beginSessionId = '';
    beginInFlight = null;
    stopRealtime();
    els.authCopy.hidden = false;
    els.authOpenBtn.hidden = false;
    els.authUser.hidden = true;
    setSync('동기화 준비');
  }

  async function login(email, password) {
    setMessage('로그인 중…');
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) return setMessage(error.message, 'error');
    setMessage('로그인됐어요.', 'ok');
    showAuth(false);
  }

  async function signup(email, password) {
    setMessage('계정을 만드는 중…');
    const { data: result, error } = await client.auth.signUp({
      email, password,
      options: { emailRedirectTo: `${location.origin}${location.pathname}` }
    });
    if (error) return setMessage(error.message, 'error');
    if (result.session) {
      setMessage('계정이 만들어졌어요.', 'ok');
      showAuth(false);
    } else {
      setMessage('확인 이메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해주세요.', 'ok');
    }
  }

  els.authOpenBtn.onclick = () => {
    if (!configured) {
      showAuth(true);
      return setMessage('js/config.js에 Supabase Publishable key를 먼저 입력해주세요.', 'error');
    }
    showAuth(true);
  };
  els.authCloseBtn.onclick = () => showAuth(false);
  els.guestBtn.onclick = () => showAuth(false);
  els.authModalBg.onclick = event => { if (event.target === els.authModalBg) showAuth(false); };
  els.authForm.onsubmit = event => {
    event.preventDefault();
    if (!configured) return setMessage('js/config.js의 Publishable key 설정이 필요해요.', 'error');
    login(els.authEmailInput.value.trim(), els.authPasswordInput.value);
  };
  els.signupBtn.onclick = () => {
    if (!configured) return setMessage('js/config.js의 Publishable key 설정이 필요해요.', 'error');
    signup(els.authEmailInput.value.trim(), els.authPasswordInput.value);
  };
  els.logoutBtn.onclick = async () => {
    const userId = session?.user?.id;
    if (userId) {
      // 계정 기록은 복구용 사용자 전용 캐시에 보관하고, 가능하면 로그아웃 전에 클라우드에도 저장합니다.
      localStorage.setItem(accountCacheKey(userId), JSON.stringify(data));
      await writeCloud(data, true);
    }

    const { error } = await client?.auth.signOut();
    if (error) {
      console.error(error);
      return toast?.('로그아웃하지 못했어요. 잠시 후 다시 시도해주세요.');
    }

    // 공용 기기에서 이전 사용자의 프로젝트와 일지가 보이지 않도록 화면용 로컬 데이터를 비웁니다.
    data = emptyData();
    selectedId = null;
    editingId = null;
    currentView = 'dashboard';
    localStorage.removeItem(KEY);
    normalize?.();
    render?.();
    showAuth(true);
    setMessage('안전하게 로그아웃했어요.', 'ok');
    toast?.('로그아웃했어요. 다시 로그인하면 계정 기록을 불러와요.');
  };
  els.migrationUploadBtn.onclick = async () => {
    showMigration(false);
    await writeCloud(pendingLocal || data);
    if (session?.user?.id) rememberMigration(session.user.id, 'local');
    pendingLocal = null;
    setSync('기존 기록 업로드 완료', 'ok');
  };
  els.migrationCloudBtn.onclick = async () => {
    showMigration(false);
    try {
      const cloud = await fetchCloud();
      if (cloud?.data) applyData(cloud.data);
      if (session?.user?.id) rememberMigration(session.user.id, 'cloud');
      pendingLocal = null;
      setSync('클라우드 기록 사용 중', 'ok');
    } catch (error) {
      console.error(error);
      setSync('불러오기 오류', 'error');
    }
  };

  window.TodaysAntCloud = { queueSave, writeCloud };

  if (!configured || !window.supabase?.createClient) {
    els.authPanel.classList.add('needs-config');
    els.authCopy.textContent = '로그인 설정이 아직 끝나지 않았어요. config.js에 Publishable key를 입력해주세요.';
    return;
  }

  client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  client.auth.onAuthStateChange((_event, nextSession) => {
    if (nextSession) beginSignedIn(nextSession);
    else signedOut();
  });

  client.auth.getSession().then(({ data: result }) => {
    if (result.session) beginSignedIn(result.session);
    else signedOut();
  });
})();
