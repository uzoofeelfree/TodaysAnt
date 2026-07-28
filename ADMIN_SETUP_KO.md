# TodaysAnt 관리자 대시보드 설정

1. `supabase-setup.sql` 맨 아래의 `ADMIN_EMAIL@example.com`을 실제 관리자 이메일로 변경합니다.
2. Supabase **SQL Editor**에서 전체 SQL 또는 관리자 대시보드 부분만 실행합니다.
3. GitHub에 새 파일(`admin.html`, `css/admin.css`, `js/admin.js`)과 수정된 SQL을 업로드합니다.
4. `https://todaysant.com/admin.html`에서 관리자 계정으로 로그인합니다.

## 표시되는 정보
- 전체 회원 수
- 오늘/7일/30일 활성 사용자
- 전체 프로젝트 수와 누적 작업시간
- 사용자 이메일, 가입일, 최근 로그인, 최근 데이터 활동

`최근 활동`은 사용자의 앱 데이터가 Supabase에 마지막으로 동기화된 시각입니다. 현재 접속 중 여부를 실시간으로 뜻하지는 않습니다.

## 보안
브라우저에 Service Role Key를 넣지 않습니다. 관리자 데이터는 권한 확인을 거치는 Supabase RPC 함수로만 조회합니다.
