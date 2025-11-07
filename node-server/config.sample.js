module.exports = {
  // Issuer sandbox credentials -------------------------------------------
  vcId: '00000000_vc_cond', // 胃炎病歷卡樣板序號
  vcCid: 'vc_cond', // 對應後台樣板代號
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
      cons_scope: 'MEDSSI01',
      cons_purpose: 'MEDDATARESEARCH',
      cons_end: '2025-05-07',
      cons_path: 'IRB_2025_001'
    },
    vc_cond: {
      cond_code: 'K2970',
      cond_display: 'CHRONICGASTRITIS',
      cond_onset: '2025-02-12'
    },
    vc_algy: {
      algy_code: 'ALG001',
      algy_name: 'PENICILLIN',
      algy_severity: '2'
    },
    vc_rx: {
      med_code: 'A02BC05',
      med_name: 'OMEPRAZOLE',
      dose_text: 'BID10ML',
      qty_value: '30',
      qty_unit: 'TABLET'
    },
    vc_pid: {
      pid_hash: '12345678',
      pid_type: '01',
      pid_ver: '01',
      pid_issuer: '886',
      pid_valid_to: '2035-12-31',
      wallet_id: '10000001'
    }
  }
};
