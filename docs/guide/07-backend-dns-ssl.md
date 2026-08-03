# 백엔드 DNS 및 SSL 설정 가이드

이 문서는 운영 백엔드 서버에 도메인과 HTTPS를 적용하는 전체 과정을 안내합니다.

---

## 1. 왜 이 설정이 필요한가?

### 1.1 로컬 개발 환경과 운영 환경의 차이

| 항목 | 로컬 개발 | 운영 서버 |
|---|---|---|
| **프론트엔드 URL** | `http://localhost:5500` | `https://teojabi.com` |
| **백엔드 URL** | `http://localhost:3001` | `http://49.50.130.137:3001` ← **문제!** |
| **프로토콜** | 둘 다 HTTP | 프론트는 HTTPS, 백엔드는 HTTP |
| **HTTPS** | 불필요 | 필수 |

로컬에서는 프론트엔드와 백엔드 모두 `http://localhost`를 사용하므로 아무 문제가 없습니다.

하지만 운영 환경에서는:
- 프론트엔드: `https://teojabi.com` (HTTPS + 도메인)
- 백엔드: `http://49.50.130.137:3001` (HTTP + IP)

이렇게 **프로토콜(https ↔ http)과 주소(도메인 ↔ IP)가 불일치**합니다.

### 1.2 이로 인해 발생하는 문제들

#### ① Mixed Content 차단

HTTPS 페이지(`https://teojabi.com`)에서 HTTP API(`http://49.50.130.137:3001`)를 호출하면 브라우저가 **보안 위험으로 판단하여 요청을 차단**합니다.

```
Mixed Content: The page at 'https://teojabi.com' was loaded over HTTPS,
but requested an insecure resource 'http://49.50.130.137:3001/api/v1/...'
This request has been blocked.
```

#### ② 소셜 로그인 콜백 실패

소셜 로그인(Google, Kakao, Naver) 후 콜백 URL로 리다이렉트될 때, HTTPS 페이지에서 HTTP URL로 이동하면 브라우저가 차단합니다.

```
Unsafe attempt to load URL http://49.50.130.137:3001/api/v1/auth/google
from frame with URL chrome-error://chromewebdata/
```

#### ③ 쿠키/세션 문제

HTTPS 환경에서 설정된 쿠키는 HTTP 요청에 포함되지 않아 인증이 유지되지 않습니다.

### 1.3 해결 방법 요약

백엔드에도 **도메인 + HTTPS**를 적용하면 모든 문제가 해결됩니다.

| 변경 전 | 변경 후 |
|---|---|
| `http://49.50.130.137:3001` | `https://api.teojabi.com` |

---

## 2. 전체 작업 순서

1. DNS에 백엔드 서브도메인 등록 (`api.teojabi.com`)
2. NCP 서버에 Nginx 설치 (리버스 프록시)
3. SSL 인증서 발급 (Let's Encrypt)
4. 환경변수 및 콜백 URL 변경
5. 소셜 로그인 개발자 콘솔 콜백 URL 변경
6. 동작 확인

---

## 3. Step 1: DNS에 백엔드 서브도메인 등록

Porkbun DNS 설정에서 A 레코드를 추가합니다.

### 3.1 Porkbun DNS 설정 페이지 이동

1. [Porkbun](https://porkbun.com) 로그인
2. **Domain Management** 클릭
3. `teojabi.com` 도메인의 **DNS** 버튼 클릭

### 3.2 A 레코드 추가

아래와 같이 입력합니다:

| 항목 | 값 |
|---|---|
| **Type** | `A` |
| **Host** | `api` |
| **Answer** | `49.50.130.137` (NCP 서버 IP) |
| **TTL** | 기본값 (600) |

**Add** 버튼을 클릭합니다.

### 3.3 DNS 전파 확인

DNS 전파에는 수 분 ~ 최대 48시간이 걸릴 수 있습니다. 아래 명령어로 확인합니다:

```bash
# 로컬 PC 또는 NCP 서버에서 실행
nslookup api.teojabi.com
```

NCP 서버 IP(`49.50.130.137`)가 응답되면 DNS 전파가 완료된 것입니다.

---

## 4. Step 2: NCP 서버에 Nginx 설치

Nginx는 **리버스 프록시** 역할을 합니다. 외부에서 `https://api.teojabi.com`으로 들어오는 요청을 내부의 `http://127.0.0.1:3001`(NestJS 서버)로 전달합니다.

```
[클라이언트] → https://api.teojabi.com:443 → [Nginx] → http://127.0.0.1:3001 → [NestJS]
```

### 4.1 Nginx 설치

NCP 서버에 SSH 접속 후 아래 명령어를 실행합니다:

```bash
sudo apt update
sudo apt install -y nginx
```

### 4.2 설치 확인

```bash
nginx -v
# nginx version: nginx/1.x.x 출력되면 성공

sudo systemctl status nginx
# active (running) 상태면 성공
```

> **⚠️ Nginx 시작 실패 시 (IPv6 관련 에러)**
>
> NCP 서버는 IPv6가 비활성화되어 있어, Nginx 설치 직후 아래와 같은 에러가 발생할 수 있습니다:
>
> ```
> nginx: [emerg] socket() [::]:80 failed (97: Address family not supported by protocol)
> ```
>
> 이 경우 Nginx 기본 설정에서 IPv6 리슨을 주석 처리해야 합니다:
>
> ```bash
> sudo nano /etc/nginx/sites-enabled/default
> ```
>
> 아래 줄을 찾아서 주석 처리합니다:
>
> ```nginx
> # 변경 전
> listen [::]:80 default_server;
>
> # 변경 후
> # listen [::]:80 default_server;
> ```
>
> 저장 후 Nginx를 다시 시작합니다:
>
> ```bash
> sudo nginx -t        # 설정 테스트
> sudo systemctl start nginx
> sudo systemctl status nginx   # active (running) 확인
> ```

### 4.3 Nginx 설정 파일 생성

```bash
sudo nano /etc/nginx/sites-available/teojabi-backend
```

아래 내용을 붙여넣습니다:

```nginx
server {
    listen 80;
    server_name api.teojabi.com;

    client_max_body_size 10M;  # 파일 업로드 최대 크기 (기본값 1MB → 10MB로 변경)

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

> **각 설정 설명:**
> - `client_max_body_size 10M`: 클라이언트 요청 본문 최대 크기. Nginx 기본값은 1MB로, 이미지 업로드 시 `413 Request Entity Too Large` 에러가 발생할 수 있어 10MB로 설정
> - `proxy_pass`: 요청을 NestJS 서버(3001 포트)로 전달
> - `proxy_set_header Host`: 원래 요청의 호스트 정보 유지
> - `X-Real-IP`, `X-Forwarded-For`: 클라이언트의 실제 IP 전달
> - `X-Forwarded-Proto`: 원래 프로토콜(https) 정보 전달

### 4.4 설정 활성화

```bash
# 심볼릭 링크 생성 (설정 활성화)
sudo ln -s /etc/nginx/sites-available/teojabi-backend /etc/nginx/sites-enabled/

# 기본 설정과 충돌 방지 (선택사항)
sudo rm -f /etc/nginx/sites-enabled/default

# 설정 문법 검사
sudo nginx -t
```

아래와 같이 출력되면 정상입니다:
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

### 4.5 Nginx 재시작

```bash
sudo systemctl restart nginx
```

### 4.6 동작 확인 (HTTP)

```bash
curl http://api.teojabi.com/api/v1/properties
```

NestJS 서버의 응답이 오면 Nginx 리버스 프록시가 정상 동작하는 것입니다.

> **참고**: NCP 서버의 방화벽(ACG)에서 **80번 포트(HTTP)**와 **443번 포트(HTTPS)**가 열려 있어야 합니다.
> NCP 콘솔 → Server → ACG → Inbound 규칙에서 확인하세요.

---

## 5. Step 3: SSL 인증서 발급 (Let's Encrypt)

Let's Encrypt는 **무료 SSL 인증서**를 제공합니다. Certbot을 사용하면 자동으로 발급 및 Nginx 설정까지 해줍니다.

### 5.1 Certbot 설치

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 5.2 SSL 인증서 발급

```bash
sudo certbot --nginx -d api.teojabi.com
```

실행하면 아래와 같은 질문이 나옵니다:

1. **이메일 주소 입력**: 인증서 만료 알림을 받을 이메일 (예: `teojabi@gmail.com`)
2. **이용약관 동의**: `Y` 입력
3. **이메일 공유 동의**: `N` 입력 (선택사항)

성공하면 아래와 같은 메시지가 출력됩니다:
```
Successfully received certificate.
Certificate is saved at: /etc/letsencrypt/live/api.teojabi.com/fullchain.pem
Key is saved at: /etc/letsencrypt/live/api.teojabi.com/privkey.pem
```

> Certbot이 자동으로 Nginx 설정 파일을 수정하여 HTTPS 리다이렉트와 SSL 설정을 추가합니다.

### 5.3 HTTPS 동작 확인

```bash
curl https://api.teojabi.com/api/v1/properties
```

정상 응답이 오면 SSL 적용이 완료된 것입니다.

브라우저에서 `https://api.teojabi.com`에 접속하여 자물쇠 아이콘이 표시되는지도 확인합니다.

### 5.4 인증서 자동 갱신 확인

Let's Encrypt 인증서는 **90일마다 만료**됩니다. Certbot은 자동 갱신 타이머를 설치합니다.

```bash
# 자동 갱신 타이머 확인
sudo systemctl status certbot.timer

# 갱신 테스트 (실제 갱신하지 않고 시뮬레이션)
sudo certbot renew --dry-run
```

`Congratulations, all simulated renewals succeeded` 메시지가 나오면 자동 갱신이 정상 설정된 것입니다.

---

## 6. Step 4: 환경변수 및 콜백 URL 변경

### 6.1 변경이 필요한 환경변수

| 변수 | 변경 전 | 변경 후 |
|---|---|---|
| `NAVER_CALLBACK_URL` | `http://49.50.130.137:3001/api/v1/auth/naver/callback` | `https://api.teojabi.com/api/v1/auth/naver/callback` |
| `KAKAO_CALLBACK_URL` | `http://49.50.130.137:3001/api/v1/auth/kakao/callback` | `https://api.teojabi.com/api/v1/auth/kakao/callback` |
| `GOOGLE_CALLBACK_URL` | `http://49.50.130.137:3001/api/v1/auth/google/callback` | `https://api.teojabi.com/api/v1/auth/google/callback` |

### 6.2 GitHub Secrets 변경

1. GitHub 저장소 → **Settings** → **Secrets and variables** → **Actions**
2. 아래 3개 Secret의 값을 업데이트:
   - `NAVER_CALLBACK_URL` → `https://api.teojabi.com/api/v1/auth/naver/callback`
   - `KAKAO_CALLBACK_URL` → `https://api.teojabi.com/api/v1/auth/kakao/callback`
   - `GOOGLE_CALLBACK_URL` → `https://api.teojabi.com/api/v1/auth/google/callback`

### 6.3 NCP 서버 .env 파일 직접 변경 (즉시 반영용)

자동배포를 기다리지 않고 바로 적용하려면 NCP 서버에서 직접 수정합니다:

```bash
cd ~/teojabi-service/backend
nano .env
```

위 3개 콜백 URL을 변경한 후 저장하고 서버를 재시작합니다:

```bash
pm2 restart teojabi-backend
```

### 6.4 프론트엔드 API URL 확인

`frontend/js/config.js`에서 API 기본 URL이 `https://api.teojabi.com`으로 설정되어 있는지 확인합니다.

---

## 7. Step 5: 소셜 로그인 개발자 콘솔 콜백 URL 변경

각 소셜 로그인 서비스의 개발자 콘솔에서 콜백 URL을 변경해야 합니다.

> **중요**: 로컬 개발용 콜백 URL은 삭제하지 말고, 운영용 URL을 **추가 등록**합니다.
> 이렇게 하면 로컬 개발과 운영 모두 정상 동작합니다.

### 7.1 Google

1. [Google Cloud Console](https://console.cloud.google.com) 접속
2. **API 및 서비스** → **사용자 인증 정보** 클릭
3. 사용 중인 **OAuth 2.0 클라이언트 ID** 클릭
4. **승인된 리디렉션 URI**에 추가:
   ```
   https://api.teojabi.com/api/v1/auth/google/callback
   ```
5. **저장** 클릭

### 7.2 Kakao

1. [Kakao Developers](https://developers.kakao.com) 접속
2. **내 애플리케이션** → 해당 앱 클릭
3. **카카오 로그인** → **Redirect URI**에 추가:
   ```
   https://api.teojabi.com/api/v1/auth/kakao/callback
   ```
4. **저장** 클릭

### 7.3 Naver

1. [Naver Developers](https://developers.naver.com) 접속
2. **내 애플리케이션** → 해당 앱 클릭
3. **API 설정** → **Callback URL**에 추가:
   ```
   https://api.teojabi.com/api/v1/auth/naver/callback
   ```
4. **수정** 클릭

---

## 8. Step 6: 최종 동작 확인

### 8.1 API 응답 확인

```bash
curl https://api.teojabi.com/api/v1/properties
```

### 8.2 Swagger 문서 확인

브라우저에서 접속:
```
https://api.teojabi.com/api
```

### 8.3 소셜 로그인 테스트

1. `https://teojabi.com`에서 각 소셜 로그인(Google, Kakao, Naver) 시도
2. 로그인 후 정상적으로 콜백되는지 확인
3. 브라우저 개발자 도구(F12) → Console 탭에서 Mixed Content 에러가 없는지 확인

---

## 9. 로컬 개발은 어떻게 되나요?

**로컬 개발은 지금과 완전히 동일하게 진행합니다.** 이 가이드의 모든 설정은 운영서버(NCP)에만 적용됩니다.

### 로컬과 운영의 환경 분리

| 항목 | 로컬 `.env` | 운영 `.env` |
|---|---|---|
| **DB** | `postgresql://...@127.0.0.1:54322/...` | `postgresql://...@aws-1-...supabase.com:6543/...` |
| **프론트엔드 URL** | `http://localhost:5500` | `https://teojabi.com` |
| **콜백 URL** | `http://localhost:3001/api/v1/auth/.../callback` | `https://api.teojabi.com/api/v1/auth/.../callback` |
| **HTTPS** | 불필요 | Nginx + Let's Encrypt |

`.env` 파일의 값만 환경에 맞게 다르게 설정하면, **하나의 코드베이스로 로컬/운영 모두 동작**합니다.

소셜 로그인 개발자 콘솔에서도 로컬용과 운영용 콜백 URL을 **모두 등록**해두면 양쪽 환경에서 모두 소셜 로그인이 동작합니다.

---

## 10. 문제 해결 (Troubleshooting)

### Nginx 502 Bad Gateway

NestJS 서버가 실행 중이 아닐 때 발생합니다.

```bash
pm2 status
# teojabi-backend가 online 상태인지 확인

pm2 restart teojabi-backend
```

### SSL 인증서 발급 실패

- DNS 전파가 완료되었는지 확인: `nslookup api.teojabi.com`
- NCP 방화벽에서 80번 포트가 열려 있는지 확인 (Certbot이 HTTP 검증을 사용)

### 소셜 로그인 콜백 에러

- `.env`의 콜백 URL과 소셜 로그인 개발자 콘솔의 콜백 URL이 **정확히 일치**하는지 확인
- `https://`와 `http://`를 혼동하지 않았는지 확인
- URL 끝에 `/`가 있거나 없는 차이도 에러를 유발할 수 있음

### NCP 방화벽(ACG) 설정

NCP 콘솔 → **Server** → **ACG** → Inbound 규칙에 아래 포트가 열려 있어야 합니다:

| 포트 | 용도 |
|---|---|
| 22 | SSH 접속 |
| 80 | HTTP (Certbot 검증 + HTTPS 리다이렉트) |
| 443 | HTTPS |
| 3001 | NestJS 직접 접속 (Nginx 적용 후에는 선택사항) |
