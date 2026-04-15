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
    title: "같은 카드, 매번 처음부터",
    cards: [
      { num: "01", heading: "현업 → 앱까지 프로세스가 길다", body: "엑셀 제작 → 인픽스 디자인 요청\n→ 자사 디자이너 검토 → CMS 등록\n→ 하루 뒤 앱에서 확인\n\n여러 조직을 거치느라 카드 하나도 일 단위가 걸려요." },
      { num: "02", heading: "외주 디자이너 비용 부담", body: "지금은 디자인 검수·제작을 인픽스(외주)에서\n받아오는 구조로, 카드 단위 비용이 계속 발생해요.\n제작량이 늘수록 부담도 커지고요." }
    ]
  },

  built: {
    variant: 'steps',
    quote: "그래서 생각했어요 —",
    quoteHighlight: "현업이 완성도 높은 초안을\n직접 만들면 되지 않을까?",
    sub: "대화만으로 C/T 카드를 완성하는 도구를 만들었습니다.",
    features: [
      { icon: "link",  heading: "브랜드 정보 자동 인식", body: "등록 브랜드 26개 + 웹 검색으로 키컬러·톤·마스코트까지 자동 파악" },
      { icon: "bolt",  heading: "문구 3안 자동 생성", body: "NM1·NM2·NM3 3-layer, 34byte 제한, 종결어미 규칙을 지키는 카피 3종" },
      { icon: "grid",  heading: "이미지 3장 병렬 생성", body: "실사·3D·2D 스타일을 동시에 렌더링, 브랜드 컬러를 자동 주입" },
      { icon: "check", heading: "Mix & Match + 즉시 확인", body: "문구·서브·이미지 3풀을 스와이프로 자유 조합, 실제 앱 목업에서 바로 확인" }
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
      count: 1, suffix: "단계",
      desc: "현업이 단독으로 완결",
      items: ["브랜드·소재 입력 → 문구·이미지 자동 생성", "앱 목업에서 룩앤필 즉시 확인", "확정 후 바로 PNG·메일 발송"]
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

  closing: {
    quote: '"매번 처음부터 만들던 C/T 카드,',
    secondary: '브랜드 하나로 끝낼 수 있었습니다."',
    secondaryHighlight: '브랜드 하나',
    members: "Product1팀 윤성호, Product2팀 박주형"
  },

  extra: [
    {
      type: 'image',
      src: 'hero.png',
      alt: '완성된 CT 카드 예시',
      position: 'after-ba'
    }
  ]
};
