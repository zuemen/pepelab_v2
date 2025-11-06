module.exports = {
  // Issuer sandbox credentials -------------------------------------------
  vcId: '00000000_vc_cond', // 胃炎病歷卡樣板序號
  vcCid: '646005', // 對應後台樣板代號
  vcUid: '00000000_vc_cond',
  apiKey: 'YOUR_ISSUER_API_KEY',

  // Verifier sandbox credentials ----------------------------------------
  verifier_ref: '00000000_vp_consent',
  verifier_accessToken: 'YOUR_VERIFIER_ACCESS_TOKEN',
  verifier_refs: {
    consent: '00000000_vp_consent', // 授權驗證（診斷摘要 + 數位同意卡）
    research: '00000000_vp_research', // 研究揭露（診斷摘要 + 同意書 + 過敏史）
    pickup: '00000000_vp_rx_pickup', // 領藥驗證（處方 + 過敏史 + 同意書）
  },

  // 預設欄位值：依官方樣板建議，可依實際資料覆寫
  cards: {
    vc_cons: {
      cons_scope: 'research_info',
      cons_purpose: 'AI 胃炎趨勢研究',
      cons_end: '2025-12-31',
      cons_issuer: 'MOHW-IRB-2025-001',
      cons_path: 'medssi://consent/irb-2025-001'
    },
    vc_cond: {
      cond_code: 'K29.70',
      cond_display: '慢性胃炎（未特指）',
      cond_onset: '2025-02-12'
    },
    vc_algy: {
      algy_code: 'Z88.1',
      algy_name: 'Penicillin allergy',
      algy_severity: 'Severe'
    },
    vc_rx: {
      med_code: 'A02BC05',
      med_name: 'Omeprazole 20mg capsule',
      dose_text: 'Take 1 capsule twice daily before meals',
      qty_value: '30',
      qty_unit: 'capsules'
    }
  }
};
