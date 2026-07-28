# TodaysAnt v2.0 설정

## 1. Publishable key 입력

`js/config.js`를 열고 아래 문구를 Supabase의 `sb_publishable_...` 키로 교체하세요.

```js
supabasePublishableKey: '여기에_sb_publishable_키를_붙여넣으세요'
```

Project URL은 현재 프로젝트 주소로 입력되어 있습니다.

## 2. 데이터베이스 만들기

Supabase에서 **SQL Editor → New query**를 열고 `supabase-setup.sql` 전체를 붙여넣은 뒤 **Run**을 누르세요.

이미 같은 정책이 존재한다는 오류가 나면 기존 `app_data` 테이블을 삭제한 뒤 다시 실행하거나, 해당 정책 생성 줄만 건너뛰세요.

## 3. 이메일 인증 주소 설정

Supabase에서 **Authentication → URL Configuration**으로 이동하세요.

- Site URL: `https://uzoofeelfree.github.io/TodaysAnt/`
- Redirect URLs에도 같은 주소를 추가

GitHub 저장소 이름이나 계정명이 다르면 실제 GitHub Pages 주소를 입력해야 합니다.

## 4. GitHub 업로드

이 폴더의 파일을 저장소 최상위에 모두 업로드하세요. 같은 이름의 파일은 교체합니다.

## 5. 테스트

1. PC에서 회원가입 후 이메일 인증
2. 로그인하고 프로젝트 하나 생성
3. 모바일에서 같은 GitHub Pages 주소 접속
4. 같은 계정으로 로그인
5. 프로젝트가 나타나는지 확인

## 동작 방식

- 비로그인: 브라우저 localStorage에만 저장
- 로그인: localStorage + Supabase 클라우드에 자동 저장
- 첫 로그인 시 로컬 기록과 클라우드 기록이 모두 있으면 어느 쪽을 사용할지 선택
- 로그인 상태는 브라우저에 유지

## 보안

`sb_secret_...` 또는 `service_role` 키는 절대 HTML/JavaScript/GitHub에 넣지 마세요. 웹앱에는 Publishable key만 사용합니다. 데이터는 RLS 정책으로 사용자별 분리됩니다.
