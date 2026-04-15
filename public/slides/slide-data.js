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
    subtitle: "현업이 직접 대화로 만들고,\n실제 앱 룩앤필까지 바로 확인",
    members: "Product1팀 윤성호, Product2팀 박주형"
  },

  problem: {
    title: "한 장을 위해 너무 많이 움직인다",
    cards: [
      { num: "01", heading: "현업 → 앱까지 프로세스가 길다", body: "현업이 엑셀 제작 → 인픽스 디자인 요청\n→ 자사 디자이너 검토 → CMS 등록\n→ 하루 뒤 앱에서 현업이 확인\n\n여러 조직을 거치느라 카드 하나도 일 단위가 걸려요." },
      { num: "02", heading: "디자인 제작 구조상 비용이 매년 발생", body: "지금 디자인 제작은 인픽스에서 진행하는 구조로,\n컨텐츠 디자인에 대한 비용이 매년 발생하고 있어요." }
    ]
  },

  built: {
    variant: 'steps',
    demoUrl: '/?demo=1',
    quote: "우리의 접근",
    quoteHighlight: "현업 손에서 끝나는\nC/T 카드 제작",
    sub: "디자이너 의뢰도, 공간 이동도 없이.",
    features: [
      { icon: "bolt",  heading: "AI가 문구·이미지 생성", body: "문구는 Gemini 2.5 Flash,\n이미지는 나노바나나2(Gemini 3.1 Flash Image)로\n브랜드 톤에 맞춰 자동 생성" },
      { icon: "link",  heading: "공간 이동 없이 개인 디바이스로", body: "인터넷·업무 공간을 오갈 필요 없이,\n현업이 쓰는 디바이스 하나로 콘텐츠 제작 완결" },
      { icon: "check", heading: "Mix & Match + 즉시 확인", body: "문구·서브·이미지 3풀을 자유 조합,\n실제 앱 목업에서 룩앤필을 바로 확인" }
    ]
  },

  how: null,

  ba: {
    title: "여러 조직·여러 날 걸리던 제작,\n한 화면에서 완결",
    before: {
      count: 6, suffix: "단계",
      desc: "여러 조직을 거쳐 일 단위 소요",
      items: ["현업 엑셀 제작 → 인픽스 디자인 요청", "자사 디자이너 검토 → CMS 업로드", "다음날 앱 확인 → 수정 루프"]
    },
    after: {
      count: 2, suffix: "단계",
      desc: "현업이 초안 작성 후 검수",
      items: [
        "초안: 브랜드·소재 입력 → 문구·이미지 자동 생성 → Mix & Match로 완성",
        "검수: 앱 목업에서 룩앤필 확인 → WebP 다운로드 후 회사 메일 발송"
      ]
    }
  },

  next: {
    variant: 'roadmap',
    title: "앞으로 해야 할 일",
    canTitle: "지금 할 수 있는 것",
    can: [
      "단일 브랜드 CT 041 카드 자동 생성",
      "문구·서브·이미지 3풀 독립 Mix & Match",
      "앱 목업 미리보기 + PNG·메일 발송"
    ],
    cantTitle: "현재 한계",
    cant: [
      "브랜드별 톤앤매너 편차",
      "일부 소재 이미지 완성도 불균일"
    ],
    nextTitle: "다음 단계",
    items: [
      { heading: "브랜드 가이드라인 학습 고도화", body: "키컬러뿐 아니라 시즌·톤앤매너까지 반영해 완성도 균일화" },
      { heading: "CT 타입 확장", body: "041 외 다른 CT 타입으로 확장, 메인피드 전반 커버" }
    ]
  },

  closing: null,

  extra: []
};
