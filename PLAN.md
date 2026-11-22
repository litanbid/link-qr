# LinkQR 구현 계획서

구현 계획 · 2026-11-22

LinkQR은 기존 웹페이지 주소를 정적 QR 코드에 직접 담는 서비스다. 사용자와 연동 프로그램이 같은 Node.js 서버에서 PNG를 받는다. 서버는 이미지와 입력 URL을 저장하지 않는다. 첫 운영 환경은 인터넷에서 접속할 수 있는 홈서버다. 같은 Node.js 서버를 Docker와 npm으로 배포하고, 회사 Mac에서도 나중에 Docker 없이 직접 실행할 수 있게 구성한다.

## 첫 버전

- 웹 화면 한 장에서 URL을 붙여넣고 **QR 생성**을 누르면 결과를 미리 볼 수 있다. 생성에 성공하면 **PNG 다운로드**로 화면에 표시된 이미지를 저장한다. 잘못된 주소는 입력란 근처에서 안내한다.
- 연동 프로그램은 HTTP API를 호출해 PNG 바이트를 받는다. 스캔하면 원래 URL로 바로 이동한다.
- 앱을 실행하는 동안 요청 데이터는 메모리에서 처리한다. QR 코드가 생성된 뒤에는 LinkQR이 종료되어도 다운로드한 이미지의 QR은 읽을 수 있다. 링크가 열리는지는 대상 사이트와 사용자의 접근 권한에 달려 있다.
- 첫 버전은 PNG 한 형식과 고정 크기로 시작한다. SVG, 스타일 편집, 생성 이력, 스캔 통계, 대상 URL을 나중에 바꾸는 기능은 후속 범위다.

## 웹 화면과 API

| 요청 | 동작 |
| --- | --- |
| `GET /` | URL 입력, 생성, 미리보기, PNG 다운로드 화면 |
| `POST /api/v1/qr` | JSON으로 URL을 받아 `image/png` 바이트 반환 |
| `GET /healthz` | 서비스 프로세스 상태를 `200 OK`로 응답 |

```bash
curl --fail --silent --show-error \
  http://127.0.0.1:3000/api/v1/qr \
  -H 'Content-Type: application/json' \
  --data '{"url":"https://example.com/page?lang=ko#intro"}' \
  --output link-qr.png
```

위 예시의 `--output`은 호출하는 쪽에서 파일을 만든다. 웹 화면에서는 같은 API 응답을 `Blob`으로 받아 미리보기와 다운로드에 함께 사용한다. 다운로드 시 재생성 요청이 필요 없다.

- 입력은 절대 `http://` 또는 `https://` URL이다. 바깥 공백을 제거하고 URL 구조를 확인한 뒤 문자열을 그대로 담는다. 쿼리, 프래그먼트와 퍼센트 인코딩을 보존한다. URL에 포함된 사용자명과 비밀번호는 거부한다. 생성 과정에서 대상 웹페이지에 접속하거나 DNS를 조회하지 않는다.
- 초기값은 흑백 PNG 512×512픽셀, 오류 정정 M, 여백 4모듈로 제안한다. URL은 UTF-8 기준 1,024바이트까지, 요청 본문은 8 KiB까지 받는다. 실제 휴대폰에서 긴 주소의 스캔 품질을 확인한 뒤 기준을 확정한다. [node-qrcode 옵션과 QR 용량](https://github.com/soldair/node-qrcode#error-correction-level)
- 성공 응답은 `200 OK`, `Content-Type: image/png`, `Cache-Control: no-store`로 보낸다. 오류 응답은 정해진 JSON 코드와 메시지를 반환한다. 잘못된 JSON과 URL은 `400`, 본문 제한 초과는 `413`, 잘못된 콘텐츠 유형은 `415`로 처리한다.
- 앱과 운영 프록시의 로그에서 요청 본문, 입력 URL, 인증 헤더를 수집하지 않는다. 프록시의 QR 응답 캐시를 끈다. QR 이미지 자체에는 URL이 들어 있으므로 내부 URL이 담긴 이미지를 공유할 때도 접근 범위를 고려한다.

## 코드와 배포 구조

단일 npm 패키지에서 QR 생성, HTTP 서버, 정적 웹 화면, 실행 명령을 관리한다. 구현은 JavaScript ESM과 Node.js 내장 HTTP 서버로 시작한다. QR 생성 후보는 PNG를 메모리 버퍼로 반환하는 `qrcode`의 `toBuffer()`다. 공개 인터페이스는 서버 실행 CLI와 HTTP API다. [node-qrcode 서버 구현](https://github.com/soldair/node-qrcode/blob/v1.5.4/lib/server.js#L613-L621)

| 실행 환경 | 설치와 실행 |
| --- | --- |
| 일반 npm 사용자 | 공개 패키지의 `link-qr serve` 명령으로 같은 웹과 API를 실행한다. 기본 주소는 `127.0.0.1:3000`이다. |
| 홈서버 Docker | Dockerfile과 Compose 설정으로 첫 운영 인스턴스를 실행한다. 컨테이너 내부에서는 `0.0.0.0:3000`에서 수신하고, 예시의 호스트 공개 포트는 `127.0.0.1:3000`에 묶는다. 권한이 제한된 사용자로 실행하며 QR용 볼륨은 필요 없다. |
| 회사 Mac 후보 | 나중에 필요한 경우 회사에서 승인한 Node와 버전을 고정한 npm 패키지로 직접 실행한다. |

npm 공개 후 체험 명령은 `npm exec --package=@litanbid/link-qr@0.1.0 -- link-qr serve`를 기준으로 문서화한다.

Docker 배포용 이미지는 `linux/amd64`와 `linux/arm64`를 목표로 한다. 개발용 Compose는 소스에서 빌드한다. GitHub Actions가 GitHub Container Registry에 버전별 이미지를 게시하며, 운영용 Compose는 공개 이미지를 내려받아 실행한다. [Docker 포트 매핑](https://docs.docker.com/engine/network/port-publishing/) · [멀티 플랫폼 빌드](https://docs.docker.com/build/building/multi-platform/)

## Node.js LTS와 보안 업데이트

개발, CI, Docker는 최신 Node.js LTS를 기준으로 맞춘다. 2026-11-22 기준 최신 LTS는 `26.13.1`(Lithium)이며, 11월 11일 보안 패치 릴리스다. 최초 빌드에서 공식 이미지 `node:26.13.1-trixie-slim`을 기준으로 버전을 고정한다. 첫 배포 직전에 최신 LTS 패치가 나왔는지 다시 확인한다. [Node.js 다운로드](https://nodejs.org/en/download) · [26.13.1 릴리스](https://nodejs.org/en/blog/release/v26.13.1/) · [공식 Node Docker 이미지 태그](https://github.com/docker-library/official-images/blob/master/library/node)

Node 보안 패치가 나오면 버전을 갱신하고 컨테이너를 다시 빌드한다. CI에서 QR 디코딩과 API를 확인한 뒤 배포하고, 실행 중인 컨테이너에서도 `node --version`을 확인한다. 회사 Mac에 도입할 경우에도 배포 당시 최신 보안 패치가 적용된 LTS를 기준으로 한다.

## 홈서버 첫 배포

홈서버에서 Docker Compose로 LinkQR 컨테이너 하나를 실행한다. 외부 접속은 HTTPS 프록시를 통한다. 프록시가 같은 호스트에서 실행되면 루프백으로 연결하고, 같은 Docker 네트워크에 있으면 컨테이너 이름으로 연결한다. 외부 공개 주소는 기존 홈서비스 도메인의 LinkQR 전용 서브도메인을 사용한다.

웹 화면과 QR 생성 API를 로그인 없이 공개한다. 공개 운영에서는 프록시에서 클라이언트별 생성 요청을 제한하고 초과 시 `429`를 반환한다. 서버에도 요청 시간과 동시 생성 수 한도를 둔다. 프록시는 QR 응답을 캐시하지 않고 앱 포트는 외부에 직접 노출하지 않는다.

실제 배포 확인은 홈서비스 주소에서 페이지를 열어 QR 생성·다운로드를 해보고, 연동 프로그램에서 같은 주소로 API를 호출하는 것까지 포함한다. 컨테이너 재시작 후에도 같은 흐름이 동작하는지 확인한다. 버전이 바뀌면 이미지 태그를 고정하고, 문제가 생기면 직전 태그로 되돌린다.

## 회사 Mac에서 나중에 실행

동일 CLI를 Node.js로 직접 실행할 수 있도록 npm 설치를 검증한다. 향후 회사 적용을 결정할 때 접속 대상, 회사에서 승인한 Node 버전, 프록시 또는 직접 접속 정책을 확인한다. 자동 시작이 필요하면 사용자 로그인 이후에는 `LaunchAgent`, 로그인 전 시작에는 `LaunchDaemon`을 검토한다. [Apple launchd 시작 방식](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html)

## GitHub 저장소와 npm 릴리스

소스는 GitHub 공개 저장소에서 MIT 라이선스로 관리한다. 저장소 이름은 `link-qr`로 잡고 소유 계정과 이름 사용 가능 여부는 생성 시 확인한다. README에는 npm 설치, Docker Compose 실행, HTTP API 예제를 넣는다. 홈서버의 실제 도메인, 배포 설정과 인증 정보는 운영 환경에서 별도로 관리한다.

GitHub Actions는 PR과 `main` 변경에서 고정한 Node.js LTS로 `npm ci`를 실행하고 QR 디코딩, HTTP API, npm 패키지 설치, Docker 빌드를 검증한다. 변경사항은 PR로 검토하고 CI를 통과한 뒤 병합한다. 버그와 기능 요청은 GitHub Issues에서 관리한다. [GitHub Actions Node.js 검증](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs)

npm은 `@litanbid/link-qr`로 공개하고 CLI 이름은 `link-qr`로 유지한다. 게시 전에 npm 스코프의 사용 권한과 패키지명 등록 가능 여부를 확인한다. 배포 파일은 `npm pack --dry-run`으로 확인하고, 실제 tarball을 빈 디렉터리에 설치해 CLI, 웹 화면, API가 함께 동작하는지 확인한다. [npm 스코프](https://docs.npmjs.com/about-scopes/) · [npm pack](https://docs.npmjs.com/cli/v11/commands/npm-pack/)

첫 버전은 `v0.1.0` 태그로 관리한다. 태그의 코드로 만든 패키지를 소유 계정에서 `npm publish --access public`으로 게시하고, 레지스트리 설치를 확인한 뒤 GitHub Release에 변경 내용과 설치 방법을 남긴다. 후속 버전은 GitHub Actions와 npm Trusted Publishing을 연결해 검증을 통과한 버전 태그에서 게시한다. 홈서버의 버전 전환은 운영 환경에서 별도로 수행한다. [공개 npm 패키지 게시](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/) · [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/) · [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)

## 구현 순서와 완료 기준

1. **GitHub 저장소와 CI** · 공개 저장소에 MIT 라이선스와 기본 문서를 두고, PR 검증 워크플로를 구성한다.
2. **QR 생성과 HTTP API** · 테스트용 URL을 전송하고 PNG를 실제로 디코딩해 원래 URL이 나오는지 확인한다. 한글이 포함된 검증용 URL, 쿼리와 프래그먼트, 길이 초과, 잘못된 스킴을 확인한다.
3. **웹 화면** · 모바일과 데스크톱에서 미리보기와 다운로드를 확인한다. 화면과 다운로드 이미지 모두 카메라로 스캔한다. 동일 요청의 응답을 사용하며, 서버 파일과 앱 로그에 QR 데이터가 남지 않는지 확인한다.
4. **npm 설치와 Docker 실행** · 깨끗한 환경에서 tarball을 설치해 CLI로 띄우고, Docker 이미지에서도 같은 요청과 응답을 확인한다. Docker 이미지 아키텍처와 외부에 노출되는 포트를 점검한다.
5. **홈서버 첫 배포** · 선택한 홈서비스 주소에서 웹 생성·다운로드와 API 호출이 모두 되는지 확인하고, 외부 네트워크에서 HTTPS 접속, 요청 한도, 재시작을 검증한다.
6. **`0.1.0` 공개** · GitHub에 `v0.1.0` 태그를 만들고 검증한 패키지를 npm에 게시한다. 레지스트리에서 설치해 README대로 실행하고 GitHub Release를 공개한다.

## 확정한 사항

- 홈서버에 Docker Compose로 먼저 배포한다. 회사 Mac에서 Node.js로 직접 실행하는 방식은 나중에 검토한다.
- 기존 홈서비스 도메인의 전용 서브도메인에서 웹 화면과 QR API를 로그인 없이 제공한다. 생성 요청에는 호출 제한을 적용한다.
- npm 패키지는 `@litanbid/link-qr`이며 등록 가능 여부와 스코프 사용 권한을 게시 전에 확인한다. `link-qr serve`와 HTTP API를 제공한다.
- 공개 소스는 GitHub에서 MIT 라이선스로 관리한다.
- 개발, CI, 배포에는 그 시점의 최신 Node.js LTS 보안 패치를 적용한다.
