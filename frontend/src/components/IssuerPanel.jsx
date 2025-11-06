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
  ALLERGY_CARD: ['allergies[0].code.coding[0].code', 'allergies[0].criticality'],
  IDENTITY_CARD: [
    'patient_digest.hashed_id',
    'patient_digest.document_version',
    'patient_digest.valid_to',
  ],
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
    value: 'CONSENT_CARD',
    label: '同意卡（vc_cons）－180 天授權保留',
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
  display: '慢性胃炎',
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
  quantityText: '30粒',
  doseText: '每日2次10毫升',
  daysSupply: 30,
  pickupWindowEnd: dayjs().add(3, 'day').format('YYYY-MM-DD'),
  performer: 'did:example:rx-unit-01',
};

const INITIAL_ALLERGY = {
  id: `algy-${Math.random().toString(36).slice(2, 8)}`,
  system: 'http://hl7.org/fhir/sid/icd-10',
  code: 'Z881',
  display: '盤尼西林過敏',
  severity: '2',
};

const INITIAL_IDENTITY = {
  hash: '12345678',
  type: '01',
  version: '1',
  issuer: '3567',
  validTo: dayjs().add(2, 'year').format('YYYY-MM-DD'),
  walletId: '10000001',
  name: '張小華',
  birth: '1950-07-18',
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
  consentIssuer,
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
      consentScope || consentPurpose || consentPath || consentIssuer
        ? {
            scope: consentScope || undefined,
            purpose: consentPurpose || undefined,
            path: consentPath || undefined,
            issuer: consentIssuer || undefined,
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
    patient_digest:
      identity &&
      (identity.hash || identity.type || identity.version || identity.issuer || identity.validTo)
        ? {
            hashed_id: identity.hash || undefined,
            document_type: identity.type || undefined,
            document_version: identity.version || undefined,
            issuer: identity.issuer || undefined,
            valid_to: identity.validTo || undefined,
            wallet_id: identity.walletId || undefined,
            display_name: identity.name || undefined,
            birth_date: identity.birth || undefined,
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

function resolveExpiry(scope, consentExpiry, medication, identity) {
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
    case 'RESEARCH_ANALYTICS':
      return dayjs().add(180, 'day');
    case 'ALLERGY_CARD':
      return dayjs().add(3, 'year');
    case 'IDENTITY_CARD': {
      if (identity?.validTo) {
        const parsed = dayjs(identity.validTo);
        if (parsed.isValid()) {
          return parsed;
        }
      }
      return dayjs().add(10, 'year');
    }
    default:
      return dayjs().add(7, 'day');
  }
}

function normalizeDigits(value, { fallback = '', length } = {}) {
  const digits = String(value ?? '')
    .replace(/[^0-9]/g, '')
    .trim();
  if (length) {
    if (!digits) {
      return fallback ? fallback.padEnd(length, '0').slice(0, length) : ''.padEnd(length, '0');
    }
    return digits.padEnd(length, '0').slice(0, length);
  }
  return digits || fallback;
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
    .replace(/[^0-9A-Za-z\u4e00-\u9fff\s]/g, '')
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
  consentIssuer,
  consentExpiry,
  allergy,
  identity,
  identifiers = {},
}) {
  const issuanceDate = dayjs().format('YYYYMMDD');
  const expiry = resolveExpiry(scope, consentExpiry, medication, identity);
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

  if (scope === 'MEDICAL_RECORD' && payload?.condition) {
    const coding = payload.condition.code?.coding?.[0] ?? {};
    const codeValue = normalizeAlphaNumUpper(coding.code, 'K2970');
    const displayValue = normalizeCnEnText(
      coding.display || payload.condition.code?.text,
      '慢性胃炎'
    );
    const onsetValue = normalizeDate(payload.condition.recordedDate, expiry);
    fields.push(
      { ename: 'cond_code', content: codeValue },
      { ename: 'cond_display', content: displayValue },
      { ename: 'cond_onset', content: onsetValue }
    );
  }

  if (scope === 'MEDICATION_PICKUP' && medication) {
    const quantityParts = parseQuantityParts(medication.quantityText);
    const medCode = normalizeAlphaNumUpper(medication.code, 'RX0001');
    const medName = normalizeCnEnText(medication.display, '胃藥膠囊').toUpperCase();
    const doseText = normalizeCnEnText(
      medication.doseText || medication.quantityText || `${medication.display || ''}${medication.daysSupply || ''}`,
      '每日2次10毫升'
    );
    const qtyValue = normalizeDigits(quantityParts.value || medication.daysSupply, {
      fallback: '30',
    });
    const qtyUnit = normalizeCnEnText(quantityParts.unit || '粒', '粒');
    fields.push(
      { ename: 'med_code', content: medCode },
      { ename: 'med_name', content: medName },
      { ename: 'dose_text', content: doseText },
      { ename: 'qty_value', content: qtyValue },
      { ename: 'qty_unit', content: qtyUnit }
    );
  }

  if (scope === 'CONSENT_CARD' || scope === 'RESEARCH_ANALYTICS') {
    const normalizedScope = normalizeCnEnText(consentScope, 'MEDSSI研究');
    const normalizedPurpose = normalizeCnEnText(consentPurpose, '胃炎風險分析');
    const normalizedEnd = normalizeDate(expiry, expiry);
    const normalizedPath = normalizePath(consentPath);
    fields.push(
      { ename: 'cons_scope', content: normalizedScope },
      { ename: 'cons_purpose', content: normalizedPurpose },
      { ename: 'cons_end', content: normalizedEnd },
      { ename: 'cons_path', content: normalizedPath }
    );
  }

  if (scope === 'ALLERGY_CARD') {
    const algyCode = normalizeAlphaNumUpper(allergy?.code, 'ALG001');
    const algyName = normalizeCnEnText(allergy?.display, '常見過敏原');
    const algySeverity = normalizeDigits(allergy?.severity, { fallback: '2' });
    fields.push(
      { ename: 'algy_code', content: algyCode },
      { ename: 'algy_name', content: algyName },
      { ename: 'algy_severity', content: algySeverity }
    );
  }

  if (scope === 'IDENTITY_CARD') {
    const pidHash = normalizeDigits(identity?.hash, { fallback: '12345678', length: 8 });
    const pidType = normalizeDigits(identity?.type, { fallback: '01' });
    const pidVer = normalizeDigits(identity?.version, { fallback: '1' });
    const pidIssuer = normalizeDigits(identity?.issuer, { fallback: '3567' });
    const pidValidTo = normalizeDate(identity?.validTo, expiry);
    const walletId = normalizeDigits(identity?.walletId, { fallback: '10000001' });
    fields.push(
      { ename: 'pid_hash', content: pidHash },
      { ename: 'pid_type', content: pidType },
      { ename: 'pid_ver', content: pidVer },
      { ename: 'pid_issuer', content: pidIssuer },
      { ename: 'pid_valid_to', content: pidValidTo },
      { ename: 'wallet_id', content: walletId }
    );
  }

  const filtered = fields.filter(
    (field) => field.content !== undefined && field.content !== null && String(field.content).trim() !== ''
  );

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
  const [consentPurpose, setConsentPurpose] = useState('AI胃炎研究');
  const [consentPath, setConsentPath] = useState('IRB_2025_001');
  const [consentIssuer, setConsentIssuer] = useState('MOHW-IRB-2025-001');
  const [medicalFields, setMedicalFields] = useState(
    DEFAULT_DISCLOSURES.MEDICAL_RECORD.join(', ')
  );
  const [medicationFields, setMedicationFields] = useState(
    DEFAULT_DISCLOSURES.MEDICATION_PICKUP.join(', ')
  );
  const [consentFields, setConsentFields] = useState(
    DEFAULT_DISCLOSURES.RESEARCH_ANALYTICS.join(', ')
  );
  const [allergyInfo, setAllergyInfo] = useState(INITIAL_ALLERGY);
  const [identityInfo, setIdentityInfo] = useState(INITIAL_IDENTITY);
  const [mode, setMode] = useState('WITH_DATA');
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
          ...(parsed.CONSENT_CARD || parsed.RESEARCH_ANALYTICS || {}),
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
      ['RESEARCH_ANALYTICS', consentFields],
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
        consentIssuer,
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
      consentIssuer,
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
      consentIssuer,
      consentExpiry,
      allergy: allergyInfo,
      identity: identityInfo,
      identifiers: currentIdentifiers,
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
        const { fields: _ignoredFields, ...metaOnly } = govPayload;
        response = await client.issueWithoutData(metaOnly, issuerToken);
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
    setConsentScopeCode('MEDSSI01');
    setConsentPurpose('AI胃炎研究');
    setConsentPath('IRB_2025_001');
    setConsentIssuer('MOHW-IRB-2025-001');
    setMedicalFields(DEFAULT_DISCLOSURES.MEDICAL_RECORD.join(', '));
    setMedicationFields(DEFAULT_DISCLOSURES.MEDICATION_PICKUP.join(', '));
    setConsentFields(DEFAULT_DISCLOSURES.RESEARCH_ANALYTICS.join(', '));
    setAllergyInfo(INITIAL_ALLERGY);
    setIdentityInfo(INITIAL_IDENTITY);
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
                <label htmlFor="consent-issuer">核發單位（cons_issuer，可空白）</label>
                <input
                  id="consent-issuer"
                  value={consentIssuer}
                  onChange={(event) => setConsentIssuer(event.target.value)}
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
              <legend>身分識別摘要（vc_pid）</legend>
              <label htmlFor="pid-hash">身分雜湊（pid_hash）</label>
              <input
                id="pid-hash"
                value={identityInfo.hash}
                onChange={(event) => updateIdentity('hash', event.target.value)}
              />
              <label htmlFor="pid-type">證件類型（pid_type）</label>
              <input
                id="pid-type"
                value={identityInfo.type}
                onChange={(event) => updateIdentity('type', event.target.value)}
              />
              <label htmlFor="pid-ver">識別版本（pid_ver）</label>
              <input
                id="pid-ver"
                value={identityInfo.version}
                onChange={(event) => updateIdentity('version', event.target.value)}
              />
              <label htmlFor="pid-issuer">發證機關（pid_issuer）</label>
              <input
                id="pid-issuer"
                value={identityInfo.issuer}
                onChange={(event) => updateIdentity('issuer', event.target.value)}
              />
              <label htmlFor="pid-valid-to">到期日（pid_valid_to）</label>
              <input
                id="pid-valid-to"
                type="date"
                value={identityInfo.validTo}
                onChange={(event) => updateIdentity('validTo', event.target.value)}
              />
              <label htmlFor="pid-wallet">錢包識別碼（wallet_id，可空白）</label>
              <input
                id="pid-wallet"
                value={identityInfo.walletId}
                onChange={(event) => updateIdentity('walletId', event.target.value)}
              />
              <label htmlFor="pid-name">遮罩姓名（選填）</label>
              <input
                id="pid-name"
                value={identityInfo.name}
                onChange={(event) => updateIdentity('name', event.target.value)}
              />
              <label htmlFor="pid-birth">生日（選填）</label>
              <input
                id="pid-birth"
                type="date"
                value={identityInfo.birth}
                onChange={(event) => updateIdentity('birth', event.target.value)}
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
            <label htmlFor="research-fields">研究驗證欄位 (RESEARCH_ANALYTICS)</label>
            <textarea
              id="research-fields"
              value={consentFields}
              onChange={(event) => setConsentFields(event.target.value)}
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
