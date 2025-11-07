# MedSSI Sandbox v2 – FHIR 病歷授權與領藥流程

本版本依照最新需求重構了 API 與前端介面：

- **身份保證等級（IAL）貼近 MyData / 健保規範**：提供 `MYDATA_LIGHT`、`NHI_CARD_PIN`、`MOICA_CERT` 三個層級，不再使用生物辨識。
- **FHIR 結構化 Payload**：Credential 內含 `Condition`、`MedicationDispense` 與匿名研究摘要，並以 FHIR path 定義選擇性揭露欄位。
- **流程分流**：後端以 `DisclosureScope`（`MEDICAL_RECORD`、`MEDICATION_PICKUP`、`RESEARCH_ANALYTICS`）區分主要情境，前端提供 `vc_cond`、`vc_cons1`、`vc_algy`、`vc_rx1`、`vc_pid` 五種卡片切換，完整涵蓋官方沙盒目前開放的 VC 模板。
- **可遺忘權、Session 與沙盒重設**：錢包可呼叫 `/v2/api/wallet/{holder_did}/forget` 清除資料，驗證端可刪除 session，並新增 `/v2/api/system/reset` 快速還原沙盒。
- **長者友善介面**：分步驟面板、示例按鈕、自動填入日期與 ARIA live 區域，降低操作複雜度並方便陪同家屬示範。
- **Access Token 與 5 分鐘 QR 有效期**：所有發行端／錢包／驗證端 API 需附帶 `Authorization: Bearer <token>`，並強制 5 分鐘內使用 QR code。

## 系統架構
```
Issuer (Hospital) ──QR──> Wallet (Patient) ──VP──> Verifier (Research / Pharmacy)
             │                        │                           │
             │                        │                           ├─ AI Insight Engine
             │                        └─ 可遺忘權 API                │
             └─ FastAPI Issuance ──────┴─ Verification Session Store
```

後端採 FastAPI + in-memory store（`backend/main.py`、`backend/store.py`）。選擇性揭露政策以 `DisclosurePolicy` 列表儲存，欄位使用 FHIR 路徑；驗證流程檢查 IAL、scope、欄位範圍與資料一致性，再交由 `InsightEngine` 輸出胃炎趨勢或領藥提醒。

前端改以 React + Vite 重構（`frontend/`），提供高對比、大字體的三步驟導覽：
1. **發行端**：填寫 FHIR Condition / MedicationDispense 欄位、設定 scope 與欄位，並將 `modadigitalwallet://credential_offer?...` Deep Link 轉為可掃描的 QR Code。
2. **病患錢包**：查詢 nonce、補齊 FHIR Payload、接受或拒絕憑證、檢視錢包列表、執行可遺忘權。
3. **驗證端**：依照病歷或領藥情境選擇 scope，要求指定 IAL，產生 QR Code、送出 VP 並查看 AI Insight。

## 後端 API
| Method | Path | 說明 |
| --- | --- | --- |
| `POST` | `/v2/api/qrcode/data` | 發行含 FHIR 資料的憑證，需指定 `primary_scope` 與 disclosure policies。 |
| `POST` | `/v2/api/qrcode/nodata` | （開發模式）產生空白憑證範本供本地測試；官方沙盒目前未開放無個資發卡。 |
| `GET` | `/v2/api/credential/nonce?transactionId=...` | 錢包以交易 ID 取得 nonce、模式、揭露欄位與（若提供）FHIR template。 |
| `PUT` | `/v2/api/credential/{credential_id}/action` | 錢包接受、拒絕、撤銷或更新憑證資料，可一併送出選擇性揭露欄位。 |
| `GET` | `/v2/api/wallet/{holder_did}/credentials` | 查詢某 Holder DID 持有的憑證列表。 |
| `DELETE` | `/v2/api/wallet/{holder_did}/forget` | 清除某 Holder 的所有憑證／VP／驗證結果（可遺忘權）。 |
| `POST` | `/v2/api/credentials/{credential_id}/revoke` | 醫院主動撤銷憑證。 |
| `DELETE` | `/v2/api/credentials/{credential_id}` | 從系統移除指定憑證（搭配資料封存）。 |
| `GET` | `/v2/api/did/vp/code` | 驗證端取得 QR Code，需指定 scope、IAL 最低需求與欄位。 |
| `POST` | `/v2/api/did/vp/result` | 接收 VP，驗證欄位與 FHIR 值後回傳 AI insight。 |
| `DELETE` | `/v2/api/did/vp/session/{session_id}` | 清除驗證 session 及其結果。 |
| `POST` | `/v2/api/system/reset` | 重新初始化沙盒（清除憑證、VP、Session）。 |

### MODA Sandbox 相容端點

為了在不直接呼叫官方服務的情況下模擬「數位憑證皮夾」沙盒流程，後端新增 `/api/*` 相容層，回傳欄位與官方 Swagger 介面一致（含 `transactionId`、`qrcodeImage` / `qrCode`、`authUri` / `deepLink` 等）。【F:README.md†L52-L72】

| Method | Path | 說明 |
| --- | --- | --- |
| `POST` | `/api/qrcode/data`、`/api/medical/card/issue` | 發卡並回傳可直接放入 `<img>` 的 QR Code Data URI、`deepLink` 與 `qrPayload`。 |
| `POST` | `/api/qrcode/nodata` | 本地模擬無個資 QR（官方沙盒尚未提供）；若呼叫政府端將回傳 `400`。 |
| `GET` | `/api/credential/nonce/{transactionId}` | 依交易序號取得 nonce、選擇性揭露欄位與模擬的 VC JWT。 |
| `PUT` | `/api/credential/{cid}/revocation` | 將電子卡狀態更新為撤銷。 |
| `GET` / `POST` | `/api/oidvp/qrcode` | 生成驗證 QR Code，支援自訂 `transactionId`（預設為 UUIDv4），GET 版本遵循官方沙盒參數格式。 |
| `GET` | `/api/medical/verification/code` | 與官方 `qr-code` 端點對齊的查詢式參數（`ref`、`transactionId`、`allowed_fields`）。 |
| `POST` | `/api/oidvp/result`、`/api/medical/verification/result` | 以交易序號查詢 VP 上傳結果與揭露欄位值。 |
| `GET` | `/api/medical/verification/session/{sessionId}` | 依 Session ID 取得允許欄位、IAL 與有效期限資訊。 |

> 📋 若需要逐項確認環境是否符合政府沙盒要求，可參考 [`docs/SANDBOX_CHECKLIST.md`](docs/SANDBOX_CHECKLIST.md) 取得申請 Token、設定專案機密與常見錯誤排查的完整清單。

這些相容端點仍套用相同的 Bearer token、5 分鐘有效期限與 IAL 驗證，方便與 React 示範介面或外部測試工具（Postman、Swagger UI）串接。【F:README.md†L52-L90】

- `vcUid` / `fields` 結構會自動轉換為 FHIR VC payload，同時保留 MODA 欄位別名（例如 `cond_code`、`cons_scope`），錢包與驗證端可直接沿用官方沙盒的欄位設定。
- 內建 `vc_cons1`、`vc_cond`、`vc_algy`、`vc_rx1`、`vc_pid` 等樣板欄位與範例值（依官方截圖整理），若呼叫端未傳入 `fields` 也會自動補齊對應欄位與內容，避免掃描後顯示「資料格式錯誤」。
- 欄位會對照政府沙盒公布的模板規格：
  - **vc_cons1**：輸出 `cons_scope`、`cons_purpose`、`cons_end` 及可選的 `cons_path`，欄位僅接受中英文與數字、日期需為 `YYYY-MM-DD`，`cons_path` 會自動限制為大寫英數與底線／短橫線。
  - **vc_cond**：維持 `cond_code`、`cond_display`、`cond_onset` 做為診斷摘要必填欄位，`cond_code` 會強制轉為大寫英數避免出現 `.` 等不符規範字元。
  - **vc_algy**：提供 `algy_code`、`algy_name`、`algy_severity` 以描述過敏原與嚴重程度，後端預設以數字（1–3）回填嚴重度。
  - **vc_rx1**：產生 `med_code`、`med_name`、`dose_text`、`qty_value`、`qty_unit` 等處方資訊，藥品代碼與名稱會轉成大寫英數，`qty_value` 僅保留數字、`qty_unit` 允許中英文單位。
  - **vc_pid**：整理 `pid_hash`、`pid_type`、`pid_ver`、`pid_issuer`、`pid_valid_to`、`wallet_id` 等欄位，會強制僅保留數字並確保日期符合 `YYYY-MM-DD` 格式，避免官方沙盒回傳 `400`。

> ℹ️ 發行端端點需附帶 `Authorization: Bearer koreic2ZEFZ2J4oo2RaZu58yGVXiqDQy`（可用環境變數 `MEDSSI_ISSUER_TOKEN` 覆寫）；錢包端使用 `wallet-sandbox-token`；驗證端則使用 `J3LdHEiVxmHBYJ6iStnmATLblzRkz2AC`。若需暫時允許多組 Token，可在環境變數中以逗號分隔（例如 `MEDSSI_ISSUER_TOKEN="tokenA,tokenB"`），FastAPI 會自動接受其中任一值。若沿用官方 sandbox 範例以 `access-token` header 傳遞，也會自動轉換為 Bearer Token 無須修改程式。

> 📡 驗證端會依 `DisclosureScope` 自動對應政府沙盒的 VP 範本：`MEDICAL_RECORD` → `00000000_vp_consent`（授權驗證，聚焦 `vc_cond` + `vc_cons1`）、`RESEARCH_ANALYTICS` → `00000000_vp_research`（研究揭露）、`MEDICATION_PICKUP` → `00000000_vp_rx_pickup`（領藥驗證）。若需替換，可設定 `MEDSSI_VERIFIER_REF_DEFAULT` 與 `MEDSSI_VERIFIER_REF_CONSENT`／`MEDSSI_VERIFIER_REF_RESEARCH`／`MEDSSI_VERIFIER_REF_RX`，或在 `node-server/config.js` 的 `verifier_refs` 指定不同 `ref`。

> 🌐 `/api/*` MODA 相容端點現已直接呼叫政府沙盒：發卡流程會透過 `https://issuer-sandbox.wallet.gov.tw` 的 `/api/qrcode/data` 取得官方 QR Code（`/api/qrcode/nodata` 僅供本地模擬），驗證流程則向 `https://verifier-sandbox.wallet.gov.tw/api/oidvp/*` 查詢。若需指向自架測試環境，可設定 `MEDSSI_GOV_ISSUER_BASE` 與 `MEDSSI_GOV_VERIFIER_BASE` 來覆寫預設網址；所有請求都會沿用使用者提交的 `access-token` 轉送給遠端沙盒，方便交叉驗證呼叫是否成功。

### 官方沙盒呼叫步驟速查

依照數位憑證皮夾沙盒的最新說明，整合人員可按照下列流程逐一檢查設定：

1. **前置準備** – 於發行端、驗證端沙盒後台分別建立帳號並取得 `access-token`，再依樣板建立 VC (`vc_cond`、`vc_cons1`、`vc_algy`、`vc_rx1`、`vc_pid`) 與 VP 範本 (`ref`)。建議把憑證序號 (`vcId`)、樣板代號 (`vcCid`) 及 API Key 寫入 `config.js` 或環境變數，避免硬編碼於程式。
   - 後端已內建 `MEDSSI_MODA_VC_IDENTIFIERS` 環境變數，可用 JSON 指定各模板的 `vcUid`／`vcId`／`vcCid`／`apiKey`，例如：

     ```bash
     export MEDSSI_MODA_VC_IDENTIFIERS='{"vc_cond":{"vcUid":"00000000_vc_cond","vcCid":"vc_cond","vcId":"YOUR_VC_ID"}}'
     ```

     未設定時會套用 README 上方列出的預設 `vcUid` / `vcCid`，其餘欄位則維持空白，確保送往政府 API 的 payload 與官方樣板一致。
2. **發行端呼叫順序** – 以 `POST /api/qrcode/data` 取得官方 QR Code 與 `transactionId`（無個資發卡僅能於本地模擬），必要時使用 `GET /api/credential/nonce/{transactionId}` 追蹤領卡狀態，最後可藉由 `PUT /api/credential/{cid}/revocation` 撤銷卡片。
3. **驗證端呼叫順序** – 透過 `GET /api/oidvp/qrcode?ref=<...>&transactionId=<...>` 生成授權 QR（或使用 `POST` 版本），等待錢包完成上傳後以 `POST /api/oidvp/result` 搭配同一筆 `transactionId` 查詢揭露結果；若需要醫療流程資訊，可再呼叫 `/api/medical/verification/session/{sessionId}` 取得 IAL 與欄位紀錄。 
4. **錯誤排查重點** – `403` 通常代表 token 未帶入或格式錯誤，`400` 則多因日期／欄位名稱未符合模板。React 示範面板與 `node-server/` 範例會自動補齊欄位及日期格式，並將 sandbox 回應逐字呈現，方便核對官方 Swagger。 

完成上述檢查後，即可確認前後端確實透過官方 API 取得 QR Code 與 VP 驗證結果；若需更動測試環境，只要更新 access token 與 `MEDSSI_GOV_*` 參數即可維持相同行為。

> 🔧 Deep Link 與 request_uri 參數可透過環境變數調整：`MEDSSI_WALLET_SCHEME`（預設 `modadigitalwallet://`）、`MEDSSI_OID4VCI_REQUEST_BASE`、`MEDSSI_OID4VCI_CLIENT_ID`、`MEDSSI_OIDVP_REQUEST_BASE`、`MEDSSI_OIDVP_CLIENT_ID`。若需對接不同沙盒或自家 OIDC4VC 服務，可修改這些 URL 以符合實際部署。

## 快速操作
1. **啟動後端**
   ```bash
   uvicorn backend.main:app --reload
   ```
   - 若前端與後端不在同一網域，可透過環境變數 `MEDSSI_ALLOWED_ORIGINS`
     （以逗號分隔）設定允許的 CORS 來源，預設已涵蓋 `http://localhost:5173`
     與 `http://localhost:5174` 等常用開發埠；也可用 `MEDSSI_ALLOWED_ORIGIN_REGEX`
     （預設允許 `localhost`、`127.0.0.1` 與 `192.168.*.*`）快速放行區網裝置。
2. **開啟前端**
   ```bash
   cd frontend
   # 👀 確認此處能看到 package.json、vite.config.js 等檔案
   ls
   npm install
   npm run dev -- --host
   ```
   - 若命令列顯示 `ENOENT: no such file or directory, open '.../frontend/package.json'`，代表目前所在目錄錯誤（常見於誤多下了一次 `cd frontend`）；請先輸入 `pwd` 或 `dir` 確認路徑僅包含一次 `frontend/`，再重新執行上述命令。
   - 預設會在 `http://localhost:5173` 提供介面，如需更換埠號可在啟動前設定
     `VITE_DEV_SERVER_PORT`（或 `PORT`）環境變數，例如：`VITE_DEV_SERVER_PORT=5180 npm run dev -- --host`。
   - 介面預設連向 `http://localhost:8000`，可在頁面頂部調整 API Base URL 與 Access Token。
- React UI 內建 `qrcode.react`，即時顯示可掃描 QR 影像，方便實機驗證。
- 發卡面板提供「政府 vcUid / vcId / vcCid / API Key」欄位，可輸入發行端沙盒後台提供的模板資訊；系統會暫存於瀏覽器 localStorage，
  並自動帶入官方 API 需要的欄位，避免因缺少卡片序號而得到 `400` 回應。
  - 若需以官方 Node.js 範例串接，可複製 `node-server/config.sample.js` 為 `config.js`，並填入後台取得的 `apiKey`、`verifier_accessToken` 等值；樣板內已列出五種 VC (`vc_cons1`、`vc_cond`、`vc_algy`、`vc_rx1`、`vc_pid`) 的預設 payload，可直接套用或覆寫，並可透過 `verifier_refs` 指定 `consent`／`research`／`pickup` 三種場景，呼叫 `/getQRCode` 時以 `scenario` 欄位選擇對應的官方 `ref`。
3. **快速重設沙盒資料**
   ```bash
   python scripts/reset_sandbox.py
   ```
   - 可傳入自訂後端位址與發行端 token：`python scripts/reset_sandbox.py http://localhost:8000 my-token`。
   - 腳本會呼叫 `/v2/api/system/reset`，確保每次示範前從乾淨狀態開始。
4. **建議 demo 流程**
   1. 在 Step 1 按「載入示例」，挑選主用途（病歷／領藥／同意），送出「含資料」發卡並掃描 QR。
   2. Step 2 以發行端回傳的 `transaction_id` 取得 nonce，按「載入示例 Payload」後執行 `ACCEPT`，錢包即會儲存憑證並顯示揭露欄位。
   3. Step 3 產生驗證 QR Code（可切換三種 scope），照欄位提示填入 VP 後送出，並觀察 AI Insight 與稽核資訊。
   4. 於 Step 2 使用「行使可遺忘權」清除資料，或在頁首按「重設沙盒資料」快速還原初始狀態。

## 程式檔案總覽

- `backend/main.py`：FastAPI 進入點，集中 `/v2/*` 沙盒端點與 `/api/*` MODA 相容層，並處理 Token 驗證、QR payload 產出、欄位別名
  轉換與 Problem+JSON 錯誤格式。
- `backend/models.py`：Pydantic 模型與列舉，覆蓋 FHIR Payload、DisclosurePolicy、VerificationSession、OIDVP 等結構。
- `backend/store.py`：記錄憑證／Session／Presentation／驗證結果的 in-memory 儲存層，同時執行過期清除與可遺忘權統計。
- `backend/analytics.py`：模擬 AI Insight 引擎，依據揭露欄位產生病歷、領藥、研究三種統計訊息。
- `frontend/src/api/client.js`：封裝 axios 呼叫與錯誤格式化；其餘 React components (`IssuerPanel`, `WalletPanel`, `VerifierPanel`) 建立三
  個角色的操作面板並渲染 QR Code。
- `scripts/reset_sandbox.py`：簡單 CLI，可快速呼叫 `/v2/api/system/reset` 重新整理沙盒狀態。

## 身分驗證與授權對應（健保快易通 vs. MyData）
- **雙軌身分驗證**：健保快易通提供「本人月租型手機門號 + 健保卡號末四碼」或「健保卡 / 自然人憑證裝置綁定」兩種路徑，分別對應遠端 IAL2 與接近 IAL3 的強度，呼應本系統的 `MYDATA_LIGHT` 與 `NHI_CARD_PIN` 等級設計。【F:README.md†L66-L74】
- **MyData 雙因素註冊**：首次使用 MyData 需選擇兩種不同實名驗證工具（例如健保 IC 卡 + 簡訊 OTP 或自然人憑證 + 行動化驗證），達到政府規範的 IAL2 要求，也與 `MOICA_CERT` 等級相呼應。【F:README.md†L75-L83】
- **授權最小化**：兩平台皆遵循「最小必要」原則，使用者僅授權本次必要欄位，本原型亦限制每個 disclosure scope 的欄位並提供一次性 VP 驗證流程。【F:README.md†L84-L90】

| IAL 等級 | 實務對應 | 強度說明 |
| --- | --- | --- |
| `MYDATA_LIGHT` | MyData 行動化驗證（手機門號 + 健保卡號） | 遠端多因素，達 IAL2 | 
| `NHI_CARD_PIN` | 健保快易通：健保卡 + PIN 綁定裝置 | IAL2，結合政府登記資料比對 |
| `MOICA_CERT` | 自然人憑證 / 醫事人員卡臨櫃核發 | IAL3，高度身分保證 |

## FHIR 可驗證憑證模型
- **FHIR Bundle 作為 VC 主體**：Credential payload 以 FHIR Bundle（type `collection`）封裝 Patient、Condition、MedicationDispense 等資源，維持跨院互通性。【F:README.md†L94-L99】
- **最小資料集**：每張 VC 僅包含該用途必要的臨床與身份欄位，例如診斷碼、紀錄日期與院所代碼，避免曝露額外資訊。【F:README.md†L99-L103】
- **簽章與來源驗證**：Credential 透過發行端私鑰簽署，驗證端可比對 FHIR 欄位與 VP 中的選擇性揭露欄位，確保內容未被竄改並符合病患授權範圍。【F:README.md†L103-L108】

## 法規遵循重點
- **電子簽章法**：新版電子簽章法承認數位簽章與電子同意的法律效力，發行端簽章的 VC 與錢包中的授權操作視同紙本簽名。【F:README.md†L112-L117】
- **醫療法第72條**：跨院分享病歷資料必須取得病患明示授權，本原型以 VP 產出記錄病患同意，並提供可稽核的交易 ID 與撤銷機制。【F:README.md†L117-L122】
- **個資法最小蒐集**：系統限制欄位範圍、採一次性傳輸、不長期留存原始 VC，並提供遺忘權 API，符合目的限定與資料刪除要求。【F:README.md†L122-L127】

## 驗證端實務守則
- **資料用畢即刪**：驗證端僅保留驗證結果與必要稽核紀錄，不保存完整 VC 檔案，並在日誌中紀錄查閱者與時間以備稽核。【F:README.md†L131-L136】
- **信任鍊管理**：建議定期同步發行端公鑰、檢查 VC 有效期與吊銷狀態，必要時啟動金鑰輪替或撤銷流程。【F:README.md†L136-L141】
- **零信任控制**：透過角色權限、TLS、速率限制與異常偵測落實「Never Trust, Always Verify」，並提醒前端使用者勿在公開場域暴露 Access Token 或 QR 字串。【F:README.md†L141-L146】

## QR Code 產製提醒
後端現在直接回傳符合數位憑證皮夾格式的 Deep Link（例如 `modadigitalwallet://credential_offer?...`、`modadigitalwallet://authorize?...`），React 介面以 `qrcode.react` 即時轉換為可掃描圖像，方便於手機或藥局實機示範。

## 安全性對齊重點
- **Bearer Access Token**：模擬數位發展部沙盒流程，需先在 Swagger Authorize 中輸入發行端或驗證端 Access Token 才能呼叫對應 API，可透過環境變數替換預設值。
- **TLS 與速率限制建議**：原型以 FastAPI 本地執行；實務部署時應透過 API Gateway 提供 TLS 1.3、每小時 3600 次限流與異常偵測。
- **QR 有效 5 分鐘**：Credential offer 與 verification session 均限定 5 分鐘內使用，逾時需重新產生，以符合沙盒規範。
- **UUIDv4 交易序號**：`transaction_id` 採標準 UUIDv4，方便稽核與跨系統追蹤。
- **稽核與清除機制**：保留遺忘權、session purge 與撤銷 API，示範異常處理與資料清除流程。

## 延伸與實務考量
- **Trust Registry**：可在 `get_verification_code` 之前檢查 verifier 是否於政府註冊。
- **MyData 串接**：`CredentialPayload` 已保留 hash 與 Profile 欄位，可改以 MyData API 取得實際報告。
- **長期領藥**：可透過 `pickup_window_end` 與 `days_supply` 延伸為慢性處方續領提醒。
- **合規紀錄**：若需上鏈或寫入審計系統，可擴充 `store.py` 的持久化與稽核欄位。
