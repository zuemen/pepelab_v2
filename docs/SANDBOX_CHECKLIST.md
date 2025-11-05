# 政府沙盒整合檢查清單

此文件彙整與數位憑證皮夾沙盒對接時需要完成的動作，對照專案中的實作位置，協助快速確認環境與 API 設定是否完整。

## 1. 申請與管理 Access Token
- 至官方沙盒後台為 **發行端 (Issuer)** 與 **驗證端 (Verifier)** 申請帳號並換發 Access Token。
- 專案後端預設使用下列環境變數載入 Token：
  - `MEDSSI_ISSUER_TOKEN`
  - `MEDSSI_VERIFIER_TOKEN`
  - `MEDSSI_WALLET_TOKEN`
- 若未覆寫，FastAPI 會落回 `backend/main.py` 中的預設值，方便離線展示；實際整合務必以環境變數或祕密管理服務覆蓋。

## 2. 專案機密配置
- 以 **.env**、Docker secret 或主機環境變數提供 Token，不要將真實值寫入版控。
- `node-server/config.sample.js` 提供完整欄位樣板，可複製為 `config.js` 並填入沙盒提供的值（`vcId`、`vcCid`、`vcUid`、`apiKey`、`verifier_ref`、`verifier_accessToken`）。
- `.gitignore` 已排除 `node-server/config.js`，避免不小心提交真實金鑰。

## 3. 後端驗證流程
- FastAPI 以 `require_issuer_token`、`require_verifier_token`、`require_wallet_token` 依路由自動驗證 Token，並允許 `Authorization` 或 `access-token` 標頭。
- `_normalize_authorization_header` 會將純 Token 自動轉換成 `Bearer <token>`，與官方 Swagger Authorize 輸出一致。
- CORS 預設允許 `http://localhost:5173`、`http://localhost:5174` 等開發來源，可用 `MEDSSI_ALLOWED_ORIGINS` 覆寫，或藉由 `MEDSSI_ALLOWED_ORIGIN_REGEX` 允許整個區網（預設涵蓋 `localhost`、`127.0.0.1` 與 `192.168.*.*`）。

## 4. 發行端 API 檢查
- `/api/qrcode/data`：產生含資料的 QR Code，回傳 `qrcodeImage`、`authUri`、`transactionId`。
- `/api/qrcode/nodata`：發出無個資 QR，用於流程測試。
- `/api/credential/nonce/{transactionId}`：在 Holder 掃描後提供 nonce 與模擬 VC JWT。
- `/api/credential/{cid}/revocation`：撤銷指定憑證。
- 所有請求必須帶上 Issuer Token，否則伺服器會回傳 401/403。

## 5. 驗證端 API 檢查
- `/api/oidvp/qrcode` 或 `/api/medical/verification/code`：產生驗證 QR，支援 `ref`、`transactionId`、`allowed_fields`。
- `/api/oidvp/result`：使用 `transactionId` 查詢 Holder 是否上傳 VP；若尚未上傳，會回傳 400。
- `/api/medical/verification/session/{sessionId}`：取得 Session 欄位與有效期限資訊。
- 驗證端 Token 支援 `Authorization` 與 `access-token` 兩種表單。

## 6. 前端操作重點
- React 介面預設於 `http://localhost:5173`，啟動指令：`npm install`、`npm run dev -- --host`。
- 首頁上方可調整 API Base URL 與三種 Token；修改後立即套用。
- QR Code 使用 `qrcode.react` 動態生成，可直接以手機掃描測試。

## 7. 快速驗證指令
```bash
# 發行端 - 無個資
curl -X POST "http://localhost:8000/api/qrcode/nodata" \
  -H "access-token: <ISSUER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{}'

# 發行端 - 含資料
curl -X POST "http://localhost:8000/api/qrcode/data" \
  -H "access-token: <ISSUER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"vcId":"YOUR_VC_ID","vcCid":"YOUR_VC_CID","issuanceDate":"20251105","expiredDate":"20261105","fields":[{"type":"NORMAL","ename":"nickname","cname":"暱稱","value":"Alice"}]}'

# 驗證端 - 產生 QR
curl -G "http://localhost:8000/api/oidvp/qrcode" \
  -H "access-token: <VERIFIER_TOKEN>" \
  --data-urlencode "ref=YOUR_VERIFIER_REF" \
  --data-urlencode "transactionId=$(uuidgen)"

# 驗證端 - 查詢結果
curl -X POST "http://localhost:8000/api/oidvp/result" \
  -H "access-token: <VERIFIER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"transactionId":"<UUID_FROM_PREVIOUS_STEP>"}'
```

## 8. 常見錯誤排查
- **403 Access token rejected**：確認是否以逗號分隔的環境變數載入了正確 Token，或是否在前端表單遺漏更新。
- **400 Bad Request**：檢查日期格式為 `YYYYMMDD`、`fields` 為陣列且欄位名稱與樣板一致。
- **CORS 預檢 400**：確保自建前端只呼叫本地 FastAPI，而非直接打官方域名；必要時擴充 `MEDSSI_ALLOWED_ORIGINS` 或調整 `MEDSSI_ALLOWED_ORIGIN_REGEX`。
- **QR 過期**：所有 Session 預設 5 分鐘有效，過期需重新產生。

完成上述檢查後，即可確認本地沙盒環境與官方流程保持一致，避免在接軌政府系統時出現 403 或欄位格式錯誤等問題。
