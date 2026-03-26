import { useState, useCallback } from "react";
import {
  CTContent,
  BgTreatment,
  CTTextField,
  CopyOption,
  SubOption,
  ImageOption,
  ImageStyle,
} from "@/types/ct";

const EMPTY_CONTENT: CTContent = {
  id: "empty",
  label: "",
  titleLine1: "",
  titleLine2: "",
  subLine1: "",
  subLine2: "",
  imageUrl: "",
  imageConstraint: { fit: "cover", alignX: "center", alignY: "center" },
  textColor: "WT",
  bgTreatment: { type: "none" },
};

export function useCardPools() {
  const [copyPool, setCopyPool] = useState<CopyOption[]>([]);
  const [subPool, setSubPool] = useState<SubOption[]>([]);
  const [imagePool, setImagePool] = useState<ImageOption[]>([]);

  const [selCopy, setSelCopy] = useState(0);
  const [selSub, setSelSub] = useState(0);
  const [selImage, setSelImage] = useState(0);

  const hasContent = copyPool.length > 0;

  // 현재 선택 조합 → CTContent
  const composite: CTContent = hasContent
    ? {
        id: "composite",
        ...(copyPool[selCopy] || copyPool[0]),
        ...(subPool[selSub] || subPool[0]),
        imageUrl: imagePool[selImage]?.imageUrl || "",
        textColor: imagePool[selImage]?.textColor || "WT",
        bgTreatment: imagePool[selImage]?.bgTreatment || { type: "none" },
        imageConstraint: imagePool[selImage]?.imageConstraint || {
          fit: "cover",
          alignX: "center",
          alignY: "center",
        },
        imageType: imagePool[selImage]?.imageType,
      }
    : EMPTY_CONTENT;

  // 풀에 variants 추가 (첫 생성)
  const appendToPool = useCallback(
    (variants: CTContent[], imageUrl?: string) => {
      const newCopies: CopyOption[] = variants.map((v) => ({
        label: v.label,
        titleLine1: v.titleLine1,
        titleLine2: v.titleLine2,
      }));
      const newSubs: SubOption[] = variants.map((v) => ({
        subLine1: v.subLine1,
        subLine2: v.subLine2,
      }));

      setCopyPool((prev) => {
        const isFirst = prev.length === 0;
        const next = [...prev, ...newCopies];
        if (isFirst) setSelCopy(0);
        else setSelCopy(prev.length); // 새로 추가된 첫 번째로 선택
        return next;
      });

      const emptySub: SubOption = { subLine1: "", subLine2: "" };
      setSubPool((prev) => {
        const isFirst = prev.length === 0;
        const next = isFirst ? [emptySub, ...newSubs] : [...prev, ...newSubs];
        if (isFirst) setSelSub(0);
        else setSelSub(prev.length); // 새로 추가된 첫 번째로 선택
        return next;
      });

      // 이미지 공유 — 하나만 추가
      const imgUrl = imageUrl || variants[0]?.imageUrl;
      if (imgUrl) {
        const v = variants[0];
        setImagePool((prev) => {
          if (prev.some((p) => p.imageUrl === imgUrl)) return prev;
          return [
            ...prev,
            {
              imageUrl: imgUrl,
              textColor: v.textColor || "WT",
              bgTreatment: v.bgTreatment || { type: "none" },
              imageConstraint: v.imageConstraint || {
                fit: "cover",
                alignX: "center",
                alignY: "center",
              },
              imageType: v.imageType,
            },
          ];
        });
      }

      // 첫 생성이면 이미지도 0으로
      setSelImage((prev) => (prev === 0 ? 0 : prev));
    },
    [],
  );

  // 이미지 풀에 추가
  const addImageToPool = useCallback(
    (
      imageUrl: string,
      textColor?: "BK" | "WT",
      bgTreatment?: BgTreatment,
      metadata?: {
        generationPrompt?: string;
        generationStyle?: ImageStyle;
        generationVariation?: number;
      },
    ) => {
      setImagePool((prev) => {
        const newIndex = prev.length;
        const next = [
          ...prev,
          {
            imageUrl,
            textColor: textColor || "WT",
            bgTreatment: bgTreatment || { type: "none" },
            imageConstraint: {
              fit: "cover" as const,
              alignX: "center" as const,
              alignY: "center" as const,
            },
            ...metadata,
          },
        ];
        // 첫 이미지일 때만 자동 선택
        if (newIndex === 0) setSelImage(0);
        return next;
      });
    },
    [],
  );

  // 풀 초기화
  const resetPools = useCallback(() => {
    setCopyPool([]);
    setSubPool([]);
    setImagePool([]);
    setSelCopy(0);
    setSelSub(0);
    setSelImage(0);
  }, []);

  // 스와이프
  const handleSwipe = useCallback(
    (zone: "copy" | "image" | "sub", direction: 1 | -1) => {
      if (zone === "copy") {
        setCopyPool((pool) => {
          setSelCopy((prev) =>
            Math.max(0, Math.min(pool.length - 1, prev + direction)),
          );
          return pool;
        });
      } else if (zone === "image") {
        setImagePool((pool) => {
          setSelImage((prev) =>
            Math.max(0, Math.min(pool.length - 1, prev + direction)),
          );
          return pool;
        });
      } else {
        setSubPool((pool) => {
          setSelSub((prev) =>
            Math.max(0, Math.min(pool.length - 1, prev + direction)),
          );
          return pool;
        });
      }
    },
    [],
  );

  // 필드 직접 수정
  const handleFieldSave = useCallback(
    (field: CTTextField, value: string) => {
      const copyFields = ["label", "titleLine1", "titleLine2", "title"];
      const subFields = ["subLine1", "subLine2", "sub"];

      if (copyFields.includes(field)) {
        setCopyPool((prev) =>
          prev.map((c, i) =>
            i === selCopy ? { ...c, [field]: value } : c,
          ),
        );
      } else if (subFields.includes(field)) {
        setSubPool((prev) =>
          prev.map((s, i) =>
            i === selSub ? { ...s, [field]: value } : s,
          ),
        );
      }
    },
    [selCopy, selSub],
  );

  // copy pool에 대안 추가
  const addCopyOptions = useCallback((options: CopyOption[]) => {
    setCopyPool((prev) => {
      setSelCopy(prev.length); // 새로 추가된 첫 번째로 선택
      return [...prev, ...options];
    });
  }, []);

  // sub pool에 대안 추가
  const addSubOptions = useCallback((options: SubOption[]) => {
    setSubPool((prev) => {
      setSelSub(prev.length);
      return [...prev, ...options];
    });
  }, []);

  // 이미지 풀에서 텍스트 색상/배경 처리 변경
  const updateImageOption = useCallback(
    (
      index: number,
      update: Partial<Pick<ImageOption, "textColor" | "bgTreatment">>,
    ) => {
      setImagePool((prev) =>
        prev.map((img, i) => (i === index ? { ...img, ...update } : img)),
      );
    },
    [],
  );

  return {
    copyPool,
    subPool,
    imagePool,
    selCopy,
    selSub,
    selImage,
    setSelCopy,
    setSelSub,
    setSelImage,
    hasContent,
    composite,
    appendToPool,
    addImageToPool,
    resetPools,
    handleSwipe,
    handleFieldSave,
    addCopyOptions,
    addSubOptions,
    updateImageOption,
  };
}
