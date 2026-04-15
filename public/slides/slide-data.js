const SLIDE_DATA = {
  meta: {
    event: "UX2 Demo Day",
    session: "",
    accentColor: "#5B6CF8",
    accentSecondary: "#D4A843"
  },

  cover: {
    variant: 'hero',
    title: "C/T 카드 제작 도구",
    subtitle: "현업이 완성도 높은 C/T 카드 초안을\n직접 만드는 AI 제작 도구",
    members: "Product1팀 윤성호, Product2팀 박주형",
    image: "cover-preview.png",
    imageAlt: "C/T 카드 제작 도구 미리보기"
  },

  problem: {
    title: "C/T 카드 한 장 제작에\n많은 인원·오랜 시간이 소요됩니다",
    cards: [
      { num: "01", heading: "현업 → 앱까지 프로세스가 깁니다", body: "현업이 엑셀 제작 → 인픽스 디자인 요청\n→ C/T 담당 디자이너 검토 → CMS 등록\n→ 하루 뒤 앱에서 현업이 확인\n\n여러 조직을 거치느라 카드 한 장 제작에 하루 이상이 소요됩니다." },
      { num: "02", heading: "디자인 제작 구조상 비용이 매년 발생합니다", body: "지금 디자인 제작은 인픽스에서 진행하는 구조로,\n컨텐츠 디자인에 대한 비용이 매년 발생하고 있습니다." }
    ]
  },

  built: {
    variant: 'steps',
    demoUrl: '/?demo=1',
    quote: "우리의 접근",
    quoteHighlight: "완성도 높은 C/T 카드 초안을\n현업 손에서 직접 제작",
    sub: "최종 검수는 C/T 담당 디자이너가 맡습니다.",
    features: [
      { icon: "bolt",  heading: "디자인 고려사항을 반영한 문구·이미지 생성", body: "브랜드 톤 · C/T 카드 규격 · 기존 CT 문구 톤앤매너를\n반영해 3장 병렬 생성합니다 (약 40~60초).\n\n※ 사용자마다 Google AI API 키 발급·입력이 필요합니다." },
      { icon: "link",  heading: "공간 이동 없이 개인 디바이스로", body: "인터넷·업무 공간을 오갈 필요 없이,\n현업이 쓰는 디바이스 하나로 콘텐츠 제작이 완결됩니다." },
      { icon: "check", heading: "Mix & Match + 즉시 확인", body: "문구·서브·이미지 3풀을 자유롭게 조합하고,\n실제 앱 목업에서 룩앤필을 바로 확인합니다." }
    ]
  },

  how: null,

  ba: {
    title: "여러 조직·여러 날 걸리던 제작,\n한 화면에서 완결",
    before: {
      count: 6, suffix: "단계",
      desc: "여러 조직을 거쳐 일 단위 소요",
      items: ["현업 엑셀 제작 → 인픽스 디자인 요청", "C/T 담당 디자이너 검토 → CMS 업로드", "다음날 앱 확인 → 수정 루프"]
    },
    after: {
      count: 2, suffix: "단계",
      desc: "현업이 초안 작성 후 검수",
      items: [
        "현업이 완성도 높은 초안 제작",
        "C/T 담당 디자이너 검수 후 반영"
      ]
    }
  },

  next: {
    variant: 'roadmap',
    title: "앞으로 해야 할 일",
    canTitle: "지금 할 수 있는 것",
    can: [
      "C/T 카드 생성 및 수정",
      "문구·서브·이미지 3풀 독립 Mix & Match",
      "앱 목업 미리보기 + WebP 다운로드"
    ],
    cantTitle: "현재 한계",
    cant: [
      "이미지 품질 향상을 위한 프롬프트 지속 보완 필요"
    ],
    nextTitle: "다음 단계",
    items: [
      { heading: "브랜드 가이드라인 학습 고도화", body: "키컬러·시즌·톤앤매너까지 반영해 완성도 균일화" },
      { heading: "CT 타입 확장", body: "041 외 다른 CT 타입으로 확장, 메인피드 전반 커버" },
      { heading: "프롬프트 코드 공유", body: "이용자들이 니즈에 맞는 Tool을 개별 제작할 수 있도록 프롬프트 코드를 공유하는 방향도 검토" }
    ]
  },

  closing: null,

  extra: []
};
