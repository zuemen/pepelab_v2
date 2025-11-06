import React, { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { QRCodeCanvas } from 'qrcode.react';

const DEFAULT_DISCLOSURES = {
  MEDICAL_RECORD: [
    'condition.code.coding[0].code',
    'condition.recordedDate',
    'managing_organization.value',
  ],
  MEDICATION_PICKUP: [
    'medication_dispense[0].medicationCodeableConcept.coding[0].code',
    'medication_dispense[0].days_supply',
    'medication_dispense[0].pickup_window_end',
  ],
  RESEARCH_ANALYTICS: ['condition.code.coding[0].code', 'encounter_summary_hash'],
};

const PRIMARY_SCOPE_OPTIONS = [
  {
    value: 'MEDICAL_RECORD',
    label: '病歷卡（MEDICAL_RECORD）－7 天後自動封存',
  },
  {
    value: 'MEDICATION_PICKUP',
    label: '領藥卡（MEDICATION_PICKUP）－3 天後自動刪除',
  },
  {
    value: 'RESEARCH_ANALYTICS',
    label: '研究卡（RESEARCH_ANALYTICS）－30 天匿名化保留',
  },
];

const SCOPE_TO_VC_UID = {
  MEDICAL_RECORD: '00000000_vc_cond',
  MEDICATION_PICKUP: '00000000_vc_rx',
  RESEARCH_ANALYTICS: '00000000_vc_cons',
};

const INITIAL_CONDITION = {
  id: `cond-${Math.random().toString(36).slice(2, 8)}`,
  system: 'http://hl7.org/fhir/sid/icd-10',
  code: 'K29.7',
  display: 'Gastritis, unspecified',
  recordedDate: dayjs().format('YYYY-MM-DD'),
  encounter: 'enc-001',
  subject: 'did:example:patient-001',
  managingOrg: 'org:tph-001',
};

const INITIAL_MEDICATION = {
  id: `med-${Math.random().toString(36).slice(2, 8)}`,
  system: 'http://www.whocc.no/atc',
  code: 'A02BC05',
  display: 'Omeprazole 20mg',
  quantityText: '30 capsules',
  daysSupply: 30,
  pickupWindowEnd: dayjs().add(7, 'day').format('YYYY-MM-DD'),
  performer: 'did:example:rx-unit-01',
};

function buildPayload({
  condition,
  includeMedication,
  medication,
  encounterHash,
  issuedOn,
  consentExpiry,
}) {
  return {
    fhir_profile: 'https://profiles.iisigroup.com.tw/StructureDefinition/medssi-bundle',
    condition: {
      resourceType: 'Condition',
      id: condition.id,
      code: {
        coding: [
          {
            system: condition.system,
            code: condition.code,
            display: condition.display || undefined,
          },
        ],
        text: condition.display || undefined,
      },
      recordedDate: condition.recordedDate,
      encounter: {
        system: 'urn:medssi:encounter-id',
        value: condition.encounter,
      },
      subject: {
        system: 'did:example',
        value: condition.subject,
      },
    },
    encounter_summary_hash: encounterHash,
    managing_organization: {
      system: 'urn:medssi:org',
      value: condition.managingOrg,
    },
    issued_on: issuedOn,
    consent_expires_on: consentExpiry || undefined,
    medication_dispense: includeMedication
      ? [
          {
            resourceType: 'MedicationDispense',
            id: medication.id,
            medicationCodeableConcept: {
              coding: [
                {
                  system: medication.system,
                  code: medication.code,
                  display: medication.display || undefined,
                },
              ],
              text: medication.display || undefined,
            },
            quantity_text: medication.quantityText,
            days_supply: Number(medication.daysSupply) || 0,
            performer: medication.performer
              ? {
                  system: 'did:example',
                  value: medication.performer,
                }
              : undefined,
            pickup_window_end: medication.pickupWindowEnd || undefined,
          },
        ]
      : [],
  };
}

function parseQuantityParts(quantityText) {
  if (!quantityText) {
    return { value: '', unit: '' };
  }
  const match = quantityText.match(/^[^0-9]*([0-9]+(?:\.[0-9]+)?)\s*(.*)$/);
  if (match) {
    return { value: match[1] ?? '', unit: (match[2] ?? '').trim() };
  }
  return { value: '', unit: quantityText.trim() };
}

function resolveExpiry(scope, consentExpiry) {
  if (consentExpiry) {
    const parsed = dayjs(consentExpiry);
    if (parsed.isValid()) {
      return parsed;
    }
  }
  switch (scope) {
    case 'MEDICATION_PICKUP':
      return dayjs().add(3, 'day');
    case 'RESEARCH_ANALYTICS':
      return dayjs().add(180, 'day');
    default:
      return dayjs().add(7, 'day');
  }
}

function convertToGovFormat({
  payload,
  scope,
  medication,
  consentScope,
  consentPurpose,
  consentExpiry,
}) {
  const vcUid = SCOPE_TO_VC_UID[scope] || '00000000_vc_cond';
  const issuanceDate = dayjs().format('YYYYMMDD');
  const expiry = resolveExpiry(scope, consentExpiry);
  const expiredDate = expiry.isValid()
    ? expiry.format('YYYYMMDD')
    : dayjs().add(90, 'day').format('YYYYMMDD');

  const fields = [];

  if (scope === 'MEDICAL_RECORD' && payload?.condition) {
    const coding = payload.condition.code?.coding?.[0] ?? {};
    fields.push(
      { ename: 'cond_code', content: coding.code || '' },
      { ename: 'cond_display', content: coding.display || payload.condition.code?.text || '' },
      { ename: 'cond_onset', content: payload.condition.recordedDate || '' }
    );
  }

  if (scope === 'MEDICATION_PICKUP' && medication) {
    const quantityParts = parseQuantityParts(medication.quantityText);
    fields.push(
      { ename: 'med_code', content: medication.code || '' },
      { ename: 'med_name', content: medication.display || '' },
      {
        ename: 'dose_text',
        content: medication.quantityText || `${medication.display || ''} ${medication.daysSupply || ''}`.trim(),
      },
      {
        ename: 'qty_value',
        content: quantityParts.value || (medication.daysSupply ? String(medication.daysSupply) : ''),
      },
      { ename: 'qty_unit', content: quantityParts.unit || '日份' }
    );
  }

  if (scope === 'RESEARCH_ANALYTICS') {
    fields.push(
      { ename: 'cons_scope', content: consentScope || 'MEDSSI_RESEARCH' },
      { ename: 'cons_purpose', content: consentPurpose || '胃炎風險研究' },
      { ename: 'cons_end', content: expiry.format('YYYY-MM-DD') }
    );
  }

  const filtered = fields.filter((field) => field.content !== undefined && field.content !== null && field.content !== '');

  return {
    vcUid,
    issuanceDate,
    expiredDate,
    fields: filtered,
  };
}

export function IssuerPanel({ client, issuerToken, baseUrl }) {
  const [issuerId, setIssuerId] = useState('did:example:hospital-001');
  const [holderDid, setHolderDid] = useState('did:example:patient-001');
  const [holderHint, setHolderHint] = useState('張小華 1962/07/18');
  const [ial, setIal] = useState('NHI_CARD_PIN');
  const [validMinutes, setValidMinutes] = useState(5);
  const [primaryScope, setPrimaryScope] = useState('MEDICAL_RECORD');
  const [condition, setCondition] = useState(INITIAL_CONDITION);
  const [includeMedication, setIncludeMedication] = useState(true);
  const [medication, setMedication] = useState(INITIAL_MEDICATION);
  const [encounterHash, setEncounterHash] = useState(
    'urn:sha256:3a1f0c98c5d4a4efed2d4dfe58e8'
  );
  const [consentExpiry, setConsentExpiry] = useState('');
  const [consentScopeCode, setConsentScopeCode] = useState('MEDSSI_RESEARCH');
  const [consentPurpose, setConsentPurpose] = useState('胃炎風險研究');
  const [medicalFields, setMedicalFields] = useState(
    DEFAULT_DISCLOSURES.MEDICAL_RECORD.join(', ')
  );
  const [medicationFields, setMedicationFields] = useState(
    DEFAULT_DISCLOSURES.MEDICATION_PICKUP.join(', ')
  );
  const [researchFields, setResearchFields] = useState(
    DEFAULT_DISCLOSURES.RESEARCH_ANALYTICS.join(', ')
  );
  const [mode, setMode] = useState('WITH_DATA');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    if (primaryScope === 'MEDICATION_PICKUP' && !includeMedication) {
      setIncludeMedication(true);
    }
  }, [primaryScope, includeMedication]);

  const disclosurePolicies = useMemo(() => {
    const entries = [
      ['MEDICAL_RECORD', medicalFields],
      ['MEDICATION_PICKUP', medicationFields],
      ['RESEARCH_ANALYTICS', researchFields],
    ];
    return entries
      .map(([scope, value]) => ({
        scope,
        fields: value
          .split(',')
          .map((field) => field.trim())
          .filter(Boolean),
      }))
      .filter((item) => item.fields.length);
  }, [medicalFields, medicationFields, researchFields]);

  const payloadTemplate = useMemo(
    () =>
      buildPayload({
        condition,
        includeMedication: includeMedication || primaryScope === 'MEDICATION_PICKUP',
        medication,
        encounterHash,
        issuedOn: dayjs().format('YYYY-MM-DD'),
        consentExpiry: consentExpiry || null,
      }),
    [
      condition,
      includeMedication,
      medication,
      encounterHash,
      consentExpiry,
      primaryScope,
    ]
  );

  function updateCondition(field, value) {
    setCondition((prev) => ({ ...prev, [field]: value }));
  }

  function updateMedication(field, value) {
    setMedication((prev) => ({ ...prev, [field]: value }));
  }

  async function submit() {
    setLoading(true);
    setError(null);
    setSuccess(null);

    const govPayload = convertToGovFormat({
      payload: payloadTemplate,
      scope: primaryScope,
      medication:
        includeMedication || primaryScope === 'MEDICATION_PICKUP' ? medication : null,
      consentScope: consentScopeCode,
      consentPurpose,
      consentExpiry,
    });

    if (!govPayload.fields.length && mode === 'WITH_DATA') {
      setLoading(false);
      setError('缺少必要欄位，請確認診斷／領藥或同意書欄位是否完整。');
      return;
    }

    try {
      let response;
      if (mode === 'WITH_DATA') {
        response = await client.issueWithData(govPayload, issuerToken);
      } else {
        response = await client.issueWithoutData(
          { vcUid: govPayload.vcUid },
          issuerToken
        );
      }
      setLoading(false);

      if (!response.ok) {
        setError(`(${response.status}) ${response.detail}`);
        return;
      }

      const data = response.data || {};
      const normalized = {
        transactionId:
          data.transactionId || data.verifier_transaction_id || data.transaction_id || '',
        qrCode:
          data.qrCode || data.qrcodeImage || data.qrcode_image || data.qr_payload || '',
        deepLink: data.deepLink || data.authUri || data.auth_uri || '',
        raw: data,
      };
      setSuccess(normalized);
    } catch (err) {
      setLoading(false);
      setError(err.message || '發卡失敗，請稍後再試');
    }
  }

  function loadSample() {
    setCondition(INITIAL_CONDITION);
    setMedication(INITIAL_MEDICATION);
    setIncludeMedication(true);
    setEncounterHash('urn:sha256:3a1f0c98c5d4a4efed2d4dfe58e8');
    setConsentExpiry(dayjs().add(90, 'day').format('YYYY-MM-DD'));
    setConsentScopeCode('MEDSSI_RESEARCH');
    setConsentPurpose('胃炎風險研究');
    setMedicalFields(DEFAULT_DISCLOSURES.MEDICAL_RECORD.join(', '));
    setMedicationFields(DEFAULT_DISCLOSURES.MEDICATION_PICKUP.join(', '));
    setResearchFields(DEFAULT_DISCLOSURES.RESEARCH_ANALYTICS.join(', '));
  }

  const qrSource = success?.qrCode || success?.deepLink || '';
  const shouldRenderImage = success?.qrCode?.startsWith('data:image');

  return (
    <section aria-labelledby="issuer-heading">
      <h2 id="issuer-heading">Step 1 – 醫院發行端</h2>
      <p className="badge">API Base URL：{baseUrl}</p>
      <div className="alert info">
        根據醫療法與個資法規範，請先驗證身分再簽發病歷／領藥卡。QR Code 僅有效 5 分鐘，
        逾期會自動失效並需重新發行。
      </div>

      <div className="grid two">
        <div className="card">
          <label htmlFor="issuer-token">發行端 Access Token</label>
          <input id="issuer-token" type="text" value={issuerToken} readOnly aria-readonly="true" />
          <small className="helper">
            測試環境預設為 koreic2ZEFZ2J4oo2RaZu58yGVXiqDQy，正式系統請以 Vault 或 HSM 安全保存。
          </small>

          <label htmlFor="issuer-id">發行者 DID</label>
          <input
            id="issuer-id"
            value={issuerId}
            onChange={(event) => setIssuerId(event.target.value)}
          />

          <label htmlFor="holder-did">預期持卡者 DID</label>
          <input
            id="holder-did"
            value={holderDid}
            onChange={(event) => setHolderDid(event.target.value)}
          />

          <label htmlFor="holder-hint">錢包顯示提示</label>
          <input
            id="holder-hint"
            value={holderHint}
            onChange={(event) => setHolderHint(event.target.value)}
          />

          <label htmlFor="primary-scope">憑證主用途</label>
          <select
            id="primary-scope"
            value={primaryScope}
            onChange={(event) => setPrimaryScope(event.target.value)}
          >
            {PRIMARY_SCOPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <label htmlFor="ial">身份保證等級</label>
          <select id="ial" value={ial} onChange={(event) => setIal(event.target.value)}>
            <option value="MYDATA_LIGHT">MYDATA_LIGHT – 行動化驗證</option>
            <option value="NHI_CARD_PIN">NHI_CARD_PIN – 健保卡 + PIN</option>
            <option value="MOICA_CERT">MOICA_CERT – 自然人憑證</option>
          </select>

          <label htmlFor="valid">QR 有效分鐘 (1-5)</label>
          <input
            id="valid"
            type="number"
            min="1"
            max="5"
            value={validMinutes}
            onChange={(event) => setValidMinutes(event.target.value)}
          />

          <div className="stack" role="radiogroup" aria-labelledby="mode-label">
            <span id="mode-label">發卡模式</span>
            <label>
              <input
                type="radio"
                name="mode"
                value="WITH_DATA"
                checked={mode === 'WITH_DATA'}
                onChange={() => setMode('WITH_DATA')}
              />
              含資料：醫院直接提供 FHIR 病歷摘要
            </label>
            <label>
              <input
                type="radio"
                name="mode"
                value="WITHOUT_DATA"
                checked={mode === 'WITHOUT_DATA'}
                onChange={() => setMode('WITHOUT_DATA')}
              />
              無資料：僅定義欄位，由錢包補齊
            </label>
          </div>

          <button type="button" onClick={submit} disabled={loading}>
            {loading
              ? '發卡中…'
              : mode === 'WITH_DATA'
              ? '建立含資料 QR Code'
              : '建立空白 QR Code'}
          </button>
          <button type="button" className="secondary" onClick={loadSample} disabled={loading}>
            載入示例資料
          </button>

          {error ? <div className="alert error">{error}</div> : null}
          {success ? (
            <div className="alert success" role="status">
              已取得政府沙盒 QR Code（交易序號：{success.transactionId || '未知'}）。
            </div>
          ) : null}
        </div>

        <div className="card">
          <fieldset>
            <legend>FHIR Condition 摘要</legend>
            <label htmlFor="condition-code">ICD-10 Code</label>
            <input
              id="condition-code"
              value={condition.code}
              onChange={(event) => updateCondition('code', event.target.value)}
            />
            <label htmlFor="condition-display">診斷說明</label>
            <input
              id="condition-display"
              value={condition.display}
              onChange={(event) => updateCondition('display', event.target.value)}
            />
            <label htmlFor="condition-date">紀錄日期</label>
            <input
              id="condition-date"
              type="date"
              value={condition.recordedDate}
              onChange={(event) => updateCondition('recordedDate', event.target.value)}
            />
            <label htmlFor="encounter-id">就醫紀錄 ID</label>
            <input
              id="encounter-id"
              value={condition.encounter}
              onChange={(event) => updateCondition('encounter', event.target.value)}
            />
            <label htmlFor="subject-did">病患 DID</label>
            <input
              id="subject-did"
              value={condition.subject}
              onChange={(event) => updateCondition('subject', event.target.value)}
            />
            <label htmlFor="org-id">院所代碼</label>
            <input
              id="org-id"
              value={condition.managingOrg}
              onChange={(event) => updateCondition('managingOrg', event.target.value)}
            />
            <label htmlFor="hash">病歷摘要雜湊</label>
            <input
              id="hash"
              value={encounterHash}
              onChange={(event) => setEncounterHash(event.target.value)}
            />
            <label htmlFor="consent-expire">授權到期日（可空白）</label>
            <input
              id="consent-expire"
              type="date"
              value={consentExpiry}
              onChange={(event) => setConsentExpiry(event.target.value)}
            />
            <label htmlFor="consent-scope">授權範圍代碼（cons_scope）</label>
            <input
              id="consent-scope"
              value={consentScopeCode}
              onChange={(event) => setConsentScopeCode(event.target.value)}
            />
            <label htmlFor="consent-purpose">授權目的（cons_purpose）</label>
            <input
              id="consent-purpose"
              value={consentPurpose}
              onChange={(event) => setConsentPurpose(event.target.value)}
            />
          </fieldset>

          <fieldset>
            <legend>
              領藥摘要
              <span className="helper" style={{ display: 'block' }}>
                {primaryScope === 'MEDICATION_PICKUP'
                  ? '此類卡片預設保留 3 天後自動刪除。'
                  : '可選擇是否附上領藥資訊。'}
              </span>
            </legend>
            <label htmlFor="include-med">
              <input
                id="include-med"
                type="checkbox"
                checked={includeMedication || primaryScope === 'MEDICATION_PICKUP'}
                onChange={(event) => setIncludeMedication(event.target.checked)}
                disabled={primaryScope === 'MEDICATION_PICKUP'}
              />
              加入領藥資訊
            </label>
            <label htmlFor="med-code">ATC Code</label>
            <input
              id="med-code"
              value={medication.code}
              onChange={(event) => updateMedication('code', event.target.value)}
              disabled={!includeMedication && primaryScope !== 'MEDICATION_PICKUP'}
            />
            <label htmlFor="med-display">藥品名稱</label>
            <input
              id="med-display"
              value={medication.display}
              onChange={(event) => updateMedication('display', event.target.value)}
              disabled={!includeMedication && primaryScope !== 'MEDICATION_PICKUP'}
            />
            <label htmlFor="quantity-text">劑量資訊</label>
            <input
              id="quantity-text"
              value={medication.quantityText}
              onChange={(event) => updateMedication('quantityText', event.target.value)}
              disabled={!includeMedication && primaryScope !== 'MEDICATION_PICKUP'}
            />
            <label htmlFor="days-supply">用藥天數</label>
            <input
              id="days-supply"
              type="number"
              value={medication.daysSupply}
              onChange={(event) => updateMedication('daysSupply', event.target.value)}
              disabled={!includeMedication && primaryScope !== 'MEDICATION_PICKUP'}
            />
            <label htmlFor="pickup-end">取藥期限</label>
            <input
              id="pickup-end"
              type="date"
              value={medication.pickupWindowEnd}
              onChange={(event) => updateMedication('pickupWindowEnd', event.target.value)}
              disabled={!includeMedication && primaryScope !== 'MEDICATION_PICKUP'}
            />
          </fieldset>

          <fieldset>
            <legend>選擇性揭露欄位</legend>
            <label htmlFor="medical-fields">跨院病歷欄位 (MEDICAL_RECORD)</label>
            <textarea
              id="medical-fields"
              value={medicalFields}
              onChange={(event) => setMedicalFields(event.target.value)}
            />
            <label htmlFor="medication-fields">領藥欄位 (MEDICATION_PICKUP)</label>
            <textarea
              id="medication-fields"
              value={medicationFields}
              onChange={(event) => setMedicationFields(event.target.value)}
            />
            <label htmlFor="research-fields">研究欄位 (RESEARCH_ANALYTICS)</label>
            <textarea
              id="research-fields"
              value={researchFields}
              onChange={(event) => setResearchFields(event.target.value)}
            />
          </fieldset>
        </div>
      </div>

      {success ? (
        <div className="card" aria-live="polite">
          <h3>政府沙盒回應</h3>
          <p>Transaction ID：{success.transactionId || '尚未提供'}</p>
          {qrSource ? (
            shouldRenderImage ? (
              <div className="qr-container" aria-label="發卡 QR Code">
                <img src={success.qrCode} alt="發卡 QR Code" width={192} height={192} />
              </div>
            ) : (
              <div className="qr-container" aria-label="發卡 QR Code">
                <QRCodeCanvas value={qrSource} size={192} includeMargin />
              </div>
            )
          ) : (
            <p>尚未取得 QR Code 圖片，請稍後重試。</p>
          )}
          {success.deepLink ? (
            <p>
              Deep Link：
              <a href={success.deepLink}>{success.deepLink}</a>
            </p>
          ) : null}
          <pre>{JSON.stringify(success.raw, null, 2)}</pre>
        </div>
      ) : null}
    </section>
  );
}
