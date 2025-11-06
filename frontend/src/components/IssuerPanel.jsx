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
  CONSENT_CARD: ['consent.scope', 'consent.purpose', 'consent.expires_on'],
  ALLERGY_CARD: ['allergies[0].code.coding[0].code', 'allergies[0].criticality'],
  IDENTITY_CARD: [
    'identity.pid_hash',
    'identity.pid_valid_from',
    'identity.pid_valid_to',
    'identity.wallet_id',
  ],
};

const PRIMARY_SCOPE_OPTIONS = [
  {
    value: 'MEDICAL_RECORD',
    label: '病況卡（vc_cond）－7 天後自動封存',
  },
  {
    value: 'MEDICATION_PICKUP',
    label: '處方領藥卡（vc_rx）－3 天後自動刪除',
  },
  {
    value: 'CONSENT_CARD',
    label: '數據同意卡（vc_cons）－180 天授權保留',
  },
  {
    value: 'ALLERGY_CARD',
    label: '過敏資訊卡（vc_algy）－預設 3 年效期',
  },
  {
    value: 'IDENTITY_CARD',
    label: '匿名身分卡（vc_pid）－預設 10 年效期',
  },
];

const SCOPE_TO_VC_UID = {
  MEDICAL_RECORD: '00000000_vc_cond',
  MEDICATION_PICKUP: '00000000_vc_rx',
  CONSENT_CARD: '00000000_vc_cons',
  ALLERGY_CARD: '00000000_vc_algy',
  IDENTITY_CARD: '00000000_vc_pid',
};

const DEFAULT_CARD_IDENTIFIERS = {
  MEDICAL_RECORD: {
    vcUid: '00000000_vc_cond',
    vcCid: 'vc_cond',
    vcId: '',
    apiKey: '',
  },
  MEDICATION_PICKUP: {
    vcUid: '00000000_vc_rx',
    vcCid: 'vc_rx',
    vcId: '',
    apiKey: '',
  },
  CONSENT_CARD: {
    vcUid: '00000000_vc_cons',
    vcCid: 'vc_cons',
    vcId: '',
    apiKey: '',
  },
  ALLERGY_CARD: {
    vcUid: '00000000_vc_algy',
    vcCid: 'vc_algy',
    vcId: '',
    apiKey: '',
  },
  IDENTITY_CARD: {
    vcUid: '00000000_vc_pid',
    vcCid: 'vc_pid',
    vcId: '',
    apiKey: '',
  },
};

const INITIAL_CONDITION = {
  id: `cond-${Math.random().toString(36).slice(2, 8)}`,
  system: 'http://hl7.org/fhir/sid/icd-10',
  code: 'K2970',
  display: 'CHRONICGASTRITIS',
  recordedDate: dayjs().format('YYYY-MM-DD'),
  encounter: 'enc-001',
  subject: 'did:example:patient-001',
  managingOrg: 'org:tph-001',
};

const INITIAL_MEDICATION = {
  id: `med-${Math.random().toString(36).slice(2, 8)}`,
  system: 'http://www.whocc.no/atc',
  code: 'A02BC05',
  display: 'OMEPRAZOLE20MG',
  quantityText: '30 TABLET',
  doseText: 'BID 10ML',
  daysSupply: 30,
  pickupWindowEnd: dayjs().add(3, 'day').format('YYYY-MM-DD'),
  performer: 'did:example:rx-unit-01',
};

const INITIAL_ALLERGY = {
  id: `algy-${Math.random().toString(36).slice(2, 8)}`,
  system: 'http://hl7.org/fhir/sid/icd-10',
  code: 'Z881',
  display: 'PENICILLIN',
  severity: '2',
};

const INITIAL_IDENTITY = {
  pidHash: '12345678',
  pidType: '01',
  pidValidFrom: dayjs().format('YYYY-MM-DD'),
  pidIssuer: '886',
  pidValidTo: dayjs().add(10, 'year').format('YYYY-MM-DD'),
  walletId: '10000001',
};

function buildPayload({
  condition,
  includeMedication,
  medication,
  encounterHash,
  issuedOn,
  consentExpiry,
  consentScope,
  consentPurpose,
  consentPath,
  allergy,
  identity,
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
    consent:
      consentScope || consentPurpose || consentPath
        ? {
            scope: consentScope || undefined,
            purpose: consentPurpose || undefined,
            path: consentPath || undefined,
            expires_on: consentExpiry || undefined,
          }
        : undefined,
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
            dosage_text: medication.doseText || undefined,
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
    allergies:
      allergy && (allergy.code || allergy.display || allergy.severity)
        ? [
            {
              resourceType: 'AllergyIntolerance',
              id: allergy.id,
              code: {
                coding: [
                  {
                    system: allergy.system || 'http://hl7.org/fhir/sid/icd-10',
                    code: allergy.code || '',
                    display: allergy.display || undefined,
                  },
                ],
                text: allergy.display || undefined,
              },
              criticality: allergy.severity || undefined,
            },
          ]
        : [],
    identity:
      identity &&
      (identity.pidHash ||
        identity.pidType ||
        identity.pidValidFrom ||
        identity.pidIssuer ||
        identity.pidValidTo ||
        identity.walletId)
        ? {
            pid_hash: identity.pidHash || undefined,
            pid_type: identity.pidType || undefined,
            pid_valid_from: identity.pidValidFrom || undefined,
            pid_issuer: identity.pidIssuer || undefined,
            pid_valid_to: identity.pidValidTo || undefined,
            wallet_id: identity.walletId || undefined,
          }
        : undefined,
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

function resolveExpiry(scope, consentExpiry, medication) {
  if (consentExpiry) {
    const parsed = dayjs(consentExpiry);
    if (parsed.isValid()) {
      return parsed;
    }
  }

  switch (scope) {
    case 'MEDICATION_PICKUP': {
      if (medication?.pickupWindowEnd) {
        const parsed = dayjs(medication.pickupWindowEnd);
        if (parsed.isValid()) {
          return parsed;
        }
      }
      return dayjs().add(3, 'day');
    }
    case 'CONSENT_CARD':
      return dayjs().add(180, 'day');
    case 'ALLERGY_CARD':
      return dayjs().add(3, 'year');
    case 'IDENTITY_CARD':
      return dayjs().add(10, 'year');
    default:
      return dayjs().add(7, 'day');
  }
}

function normalizeDigits(value, { fallback = '', length } = {}) {
  const fallbackDigits = String(fallback ?? '').replace(/[^0-9]/g, '');
  const digits = String(value ?? '')
    .replace(/[^0-9]/g, '')
    .trim();
  if (length) {
    const source = digits || fallbackDigits;
    if (!source) {
      return ''.padStart(length, '0');
    }
    if (source.length >= length) {
      return source.slice(0, length);
    }
    return source.padStart(length, '0');
  }
  return digits || fallbackDigits;
}

function normalizeAlphaNumUpper(value, fallback = '') {
  const cleaned = String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();
  return cleaned || fallback;
}

function normalizeCnEnText(value, fallback = '') {
  const cleaned = String(value ?? '')
    .replace(/[^0-9A-Za-z\u4E00-\u9FFF\s-]/g, '')
    .trim();
  return cleaned || fallback;
}

function normalizeDate(value, fallbackMoment) {
  const parsed = dayjs(value);
  if (parsed.isValid()) {
    return parsed.format('YYYY-MM-DD');
  }
  const fb = fallbackMoment && fallbackMoment.isValid() ? fallbackMoment : dayjs();
  return fb.format('YYYY-MM-DD');
}

function normalizePath(value, fallback = 'CONSENT_001') {
  const cleaned = String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .trim();
  return cleaned || fallback;
}

function convertToGovFormat({
  payload,
  scope,
  medication,
  consentScope,
  consentPurpose,
  consentPath,
  consentExpiry,
  allergy,
  identity,
  identifiers = {},
}) {
  const issuanceDate = dayjs().format('YYYYMMDD');
  const expiry = resolveExpiry(scope, consentExpiry, medication);
  const expiredDate = expiry.isValid()
    ? expiry.format('YYYYMMDD')
    : dayjs().add(90, 'day').format('YYYYMMDD');

  const normalizedIdentifiers = {
    vcUid: identifiers.vcUid || SCOPE_TO_VC_UID[scope] || '00000000_vc_cond',
    vcCid: identifiers.vcCid || '',
    vcId: identifiers.vcId || '',
    apiKey: identifiers.apiKey || '',
  };

  const fields = [];

  const pushField = (ename, content) => {
    if (content === undefined || content === null) {
      return;
    }
    const trimmed = String(content).trim();
    if (!trimmed) {
      return;
    }
    fields.push({ type: 'NORMAL', ename, content: trimmed });
  };

  if (scope === 'MEDICAL_RECORD' && payload?.condition) {
    const coding = payload.condition.code?.coding?.[0] ?? {};
    const codeValue = normalizeAlphaNumUpper(coding.code, 'K2970');
    const displayValue = normalizeCnEnText(
      coding.display || payload.condition.code?.text,
      'CHRONICGASTRITIS'
    );
    const onsetValue = normalizeDate(payload.condition.recordedDate, expiry);
    pushField('cond_code', codeValue);
    pushField('cond_display', displayValue);
    pushField('cond_onset', onsetValue);
  }

  if (scope === 'MEDICATION_PICKUP' && medication) {
    const quantityParts = parseQuantityParts(medication.quantityText);
    const medCode = normalizeAlphaNumUpper(medication.code, 'RX0001');
    const medName = normalizeCnEnText(medication.display, 'OMEPRAZOLE');
    const doseText = normalizeCnEnText(
      medication.doseText || medication.quantityText || `${medication.display || ''}${medication.daysSupply || ''}`,
      'BID 10ML'
    );
    const qtyValue = normalizeDigits(quantityParts.value || medication.daysSupply, {
      fallback: '30',
    });
    const qtyUnit = normalizeCnEnText(quantityParts.unit || 'TABLET', 'TABLET');
    pushField('med_code', medCode);
    pushField('med_name', medName);
    pushField('dose_text', doseText);
    pushField('qty_value', qtyValue);
    pushField('qty_unit', qtyUnit);
  }

  if (scope === 'CONSENT_CARD') {
    const normalizedScope = normalizeCnEnText(consentScope, 'MEDSSI01');
    const normalizedPurpose = normalizeCnEnText(consentPurpose, 'MEDDATARESEARCH');
    const normalizedEnd = normalizeDate(expiry, expiry);
    const normalizedPath = normalizePath(consentPath);
    pushField('cons_scope', normalizedScope);
    pushField('cons_purpose', normalizedPurpose);
    pushField('cons_end', normalizedEnd);
    pushField('cons_path', normalizedPath);
  }

  if (scope === 'ALLERGY_CARD') {
    const algyCode = normalizeAlphaNumUpper(allergy?.code, 'ALG001');
    const algyName = normalizeCnEnText(allergy?.display, 'PENICILLIN');
    const algySeverity = normalizeDigits(allergy?.severity, { fallback: '2' });
    pushField('algy_code', algyCode);
    pushField('algy_name', algyName);
    pushField('algy_severity', algySeverity);
  }

  if (scope === 'IDENTITY_CARD') {
    const pidHash = normalizeDigits(identity?.pidHash, { fallback: '12345678', length: 8 });
    const pidType = normalizeDigits(identity?.pidType, { fallback: '01' });
    const pidIssuer = normalizeDigits(identity?.pidIssuer, { fallback: '886' });
    const pidValidFrom = normalizeDate(identity?.pidValidFrom, dayjs());
    const pidValidTo = normalizeDate(identity?.pidValidTo, expiry);
    const walletId = normalizeDigits(identity?.walletId, { fallback: '10000001' });
    pushField('pid_hash', pidHash);
    pushField('pid_type', pidType);
    pushField('pid_valid_from', pidValidFrom);
    pushField('pid_issuer', pidIssuer);
    pushField('pid_valid_to', pidValidTo);
    pushField('wallet_id', walletId);
  }

  const filtered = fields;

  const payloadBase = {
    vcUid: normalizedIdentifiers.vcUid,
    issuanceDate,
    expiredDate,
  };

  const assignIfPresent = (key, value) => {
    if (value !== undefined && value !== null) {
      const text = String(value).trim();
      if (text) {
        payloadBase[key] = text;
      }
    }
  };

  assignIfPresent('vcCid', normalizedIdentifiers.vcCid);
  assignIfPresent('vcId', normalizedIdentifiers.vcId);
  assignIfPresent('apiKey', normalizedIdentifiers.apiKey);

  return {
    ...payloadBase,
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
  const [consentScopeCode, setConsentScopeCode] = useState('MEDSSI01');
  const [consentPurpose, setConsentPurpose] = useState('MEDDATARESEARCH');
  const [consentPath, setConsentPath] = useState('IRB_2025_001');
  const [medicalFields, setMedicalFields] = useState(
    DEFAULT_DISCLOSURES.MEDICAL_RECORD.join(', ')
  );
  const [medicationFields, setMedicationFields] = useState(
    DEFAULT_DISCLOSURES.MEDICATION_PICKUP.join(', ')
  );
  const [consentFields, setConsentFields] = useState(
    DEFAULT_DISCLOSURES.CONSENT_CARD.join(', ')
  );
  const [allergyInfo, setAllergyInfo] = useState(INITIAL_ALLERGY);
  const [identityInfo, setIdentityInfo] = useState(INITIAL_IDENTITY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [govIdentifiers, setGovIdentifiers] = useState(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_CARD_IDENTIFIERS;
    }
    try {
      const stored = window.localStorage.getItem('medssi.govIdentifiers');
      if (!stored) {
        return DEFAULT_CARD_IDENTIFIERS;
      }
      const parsed = JSON.parse(stored);
      return {
        MEDICAL_RECORD: {
          ...DEFAULT_CARD_IDENTIFIERS.MEDICAL_RECORD,
          ...(parsed.MEDICAL_RECORD || {}),
        },
        MEDICATION_PICKUP: {
          ...DEFAULT_CARD_IDENTIFIERS.MEDICATION_PICKUP,
          ...(parsed.MEDICATION_PICKUP || {}),
        },
        CONSENT_CARD: {
          ...DEFAULT_CARD_IDENTIFIERS.CONSENT_CARD,
          ...(parsed.CONSENT_CARD || {}),
        },
        ALLERGY_CARD: {
          ...DEFAULT_CARD_IDENTIFIERS.ALLERGY_CARD,
          ...(parsed.ALLERGY_CARD || {}),
        },
        IDENTITY_CARD: {
          ...DEFAULT_CARD_IDENTIFIERS.IDENTITY_CARD,
          ...(parsed.IDENTITY_CARD || {}),
        },
      };
    } catch (err) {
      console.warn('Unable to restore government VC identifiers', err);
      return DEFAULT_CARD_IDENTIFIERS;
    }
  });

  useEffect(() => {
    if (primaryScope === 'MEDICATION_PICKUP' && !includeMedication) {
      setIncludeMedication(true);
    }
  }, [primaryScope, includeMedication]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('medssi.govIdentifiers', JSON.stringify(govIdentifiers));
    }
  }, [govIdentifiers]);

  const currentIdentifiers = govIdentifiers[primaryScope] || DEFAULT_CARD_IDENTIFIERS[primaryScope];

  const updateIdentifier = (key, value) => {
    setGovIdentifiers((previous) => ({
      ...previous,
      [primaryScope]: {
        ...(previous[primaryScope] || {}),
        [key]: value,
      },
    }));
  };

  const disclosurePolicies = useMemo(() => {
    const entries = [
      ['MEDICAL_RECORD', medicalFields],
      ['MEDICATION_PICKUP', medicationFields],
      ['CONSENT_CARD', consentFields],
      ['ALLERGY_CARD', DEFAULT_DISCLOSURES.ALLERGY_CARD.join(', ')],
      ['IDENTITY_CARD', DEFAULT_DISCLOSURES.IDENTITY_CARD.join(', ')],
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
  }, [medicalFields, medicationFields, consentFields]);

  const payloadTemplate = useMemo(
    () =>
      buildPayload({
        condition,
        includeMedication: includeMedication || primaryScope === 'MEDICATION_PICKUP',
        medication,
        encounterHash,
        issuedOn: dayjs().format('YYYY-MM-DD'),
        consentExpiry: consentExpiry || null,
        consentScope: consentScopeCode,
        consentPurpose,
        consentPath,
        allergy: allergyInfo,
        identity: identityInfo,
      }),
    [
      condition,
      includeMedication,
      medication,
      encounterHash,
      consentExpiry,
      primaryScope,
      consentScopeCode,
      consentPurpose,
      consentPath,
      allergyInfo,
      identityInfo,
    ]
  );

  function updateCondition(field, value) {
    setCondition((prev) => ({ ...prev, [field]: value }));
  }

  function updateMedication(field, value) {
    setMedication((prev) => ({ ...prev, [field]: value }));
  }

  function updateAllergy(field, value) {
    setAllergyInfo((prev) => ({ ...prev, [field]: value }));
  }

  function updateIdentity(field, value) {
    setIdentityInfo((prev) => ({ ...prev, [field]: value }));
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
      consentPath,
      consentExpiry,
      allergy: allergyInfo,
      identity: identityInfo,
      identifiers: currentIdentifiers,
    });

    if (!govPayload.fields.length) {
      setLoading(false);
      setError('缺少必要欄位，請確認診斷／領藥或同意書欄位是否完整。');
      return;
    }

    try {
      const response = await client.issueWithData(govPayload, issuerToken);
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
    setConsentScopeCode('MEDSSI01');
    setConsentPurpose('MEDDATARESEARCH');
    setConsentPath('IRB_2025_001');
    setMedicalFields(DEFAULT_DISCLOSURES.MEDICAL_RECORD.join(', '));
    setMedicationFields(DEFAULT_DISCLOSURES.MEDICATION_PICKUP.join(', '));
    setConsentFields(DEFAULT_DISCLOSURES.CONSENT_CARD.join(', '));
    setAllergyInfo(INITIAL_ALLERGY);
    setIdentityInfo({
      ...INITIAL_IDENTITY,
      pidValidFrom: dayjs().format('YYYY-MM-DD'),
      pidValidTo: dayjs().add(10, 'year').format('YYYY-MM-DD'),
    });
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

          <div className="alert warning">
            MODA 沙盒僅支援「含資料」發卡流程，空白樣板目前無法在官方系統測試。
          </div>

          <button type="button" onClick={submit} disabled={loading}>
            {loading ? '發卡中…' : '建立含資料 QR Code'}
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
            {primaryScope === 'CONSENT_CARD' && (
              <>
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
                <label htmlFor="consent-path">授權資料路徑（cons_path，可空白）</label>
                <input
                  id="consent-path"
                  value={consentPath}
                  onChange={(event) => setConsentPath(event.target.value)}
                />
              </>
            )}
            <div className="grid four">
              <div>
                <label htmlFor="gov-vc-uid">政府 vcUid</label>
                <input
                  id="gov-vc-uid"
                  value={currentIdentifiers?.vcUid || ''}
                  onChange={(event) => updateIdentifier('vcUid', event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="gov-vc-id">vcId（卡片序號）</label>
                <input
                  id="gov-vc-id"
                  value={currentIdentifiers?.vcId || ''}
                  onChange={(event) => updateIdentifier('vcId', event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="gov-vc-cid">vcCid（樣板代號）</label>
                <input
                  id="gov-vc-cid"
                  value={currentIdentifiers?.vcCid || ''}
                  onChange={(event) => updateIdentifier('vcCid', event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="gov-api-key">API Key（可選）</label>
                <input
                  id="gov-api-key"
                  value={currentIdentifiers?.apiKey || ''}
                  onChange={(event) => updateIdentifier('apiKey', event.target.value)}
                />
              </div>
            </div>
            <p className="hint">
              ※ 請填入發行端沙盒後台顯示的卡片序號與樣板代號。值會暫存於瀏覽器 localStorage，便於多次測試。
            </p>
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
            <label htmlFor="quantity-text">包裝數量（僅限數字／中文）</label>
            <input
              id="quantity-text"
              value={medication.quantityText}
              onChange={(event) => updateMedication('quantityText', event.target.value)}
              disabled={!includeMedication && primaryScope !== 'MEDICATION_PICKUP'}
            />
            <label htmlFor="dose-text">用藥指示</label>
            <input
              id="dose-text"
              value={medication.doseText || ''}
              onChange={(event) => updateMedication('doseText', event.target.value)}
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

          {(primaryScope === 'ALLERGY_CARD' || primaryScope === 'MEDICATION_PICKUP') && (
            <fieldset>
              <legend>過敏資訊（vc_algy）</legend>
              <label htmlFor="allergy-code">過敏代碼（algy_code）</label>
              <input
                id="allergy-code"
                value={allergyInfo.code}
                onChange={(event) => updateAllergy('code', event.target.value)}
              />
              <label htmlFor="allergy-name">過敏名稱（algy_name）</label>
              <input
                id="allergy-name"
                value={allergyInfo.display}
                onChange={(event) => updateAllergy('display', event.target.value)}
              />
              <label htmlFor="allergy-severity">嚴重程度（algy_severity）</label>
              <input
                id="allergy-severity"
                value={allergyInfo.severity}
                onChange={(event) => updateAllergy('severity', event.target.value)}
              />
            </fieldset>
          )}

          {primaryScope === 'IDENTITY_CARD' && (
            <fieldset>
              <legend>匿名身分資訊（vc_pid）</legend>
              <label htmlFor="pid-hash">識別碼雜湊（pid_hash，8 位數字）</label>
              <input
                id="pid-hash"
                value={identityInfo.pidHash}
                onChange={(event) => updateIdentity('pidHash', event.target.value)}
              />
              <label htmlFor="pid-type">識別碼類型（pid_type）</label>
              <input
                id="pid-type"
                value={identityInfo.pidType}
                onChange={(event) => updateIdentity('pidType', event.target.value)}
              />
              <label htmlFor="pid-valid-from">發證日期（pid_valid_from）</label>
              <input
                id="pid-valid-from"
                type="date"
                value={identityInfo.pidValidFrom}
                onChange={(event) => updateIdentity('pidValidFrom', event.target.value)}
              />
              <label htmlFor="pid-issuer">發行者代碼（pid_issuer）</label>
              <input
                id="pid-issuer"
                value={identityInfo.pidIssuer}
                onChange={(event) => updateIdentity('pidIssuer', event.target.value)}
              />
              <label htmlFor="pid-valid">有效期限（pid_valid_to）</label>
              <input
                id="pid-valid"
                type="date"
                value={identityInfo.pidValidTo}
                onChange={(event) => updateIdentity('pidValidTo', event.target.value)}
              />
              <label htmlFor="wallet-id">錢包識別碼（wallet_id）</label>
              <input
                id="wallet-id"
                value={identityInfo.walletId}
                onChange={(event) => updateIdentity('walletId', event.target.value)}
              />
            </fieldset>
          )}

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
            <label htmlFor="consent-fields">同意卡欄位 (CONSENT_CARD)</label>
            <textarea
              id="consent-fields"
              value={consentFields}
              onChange={(event) => setConsentFields(event.target.value)}
            />
            <label htmlFor="identity-fields">身分卡欄位 (IDENTITY_CARD)</label>
            <textarea
              id="identity-fields"
              value={DEFAULT_DISCLOSURES.IDENTITY_CARD.join(', ')}
              readOnly
              aria-readonly="true"
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
