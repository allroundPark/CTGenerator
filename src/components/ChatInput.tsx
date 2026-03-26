"use client";

import { useState, useRef, useEffect } from "react";
import { AttachedImage, ImageAttachOption } from "@/types/ct";

interface ChatInputProps {
  onSubmit: (message: string, images?: AttachedImage[]) => void;
  disabled: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  large?: boolean;
  highlightAttach?: boolean;
  onFocusChange?: (focused: boolean) => void;
  hasContent?: boolean;
}

const OPTION_LABELS: Record<ImageAttachOption, { label: string; desc: string }> = {
  apply: { label: "바로 적용", desc: "원본 그대로 배경으로" },
  edit: { label: "수정 후 적용", desc: "크롭/보정/AI 편집" },
  reference: { label: "참고용", desc: "스타일만 참고하여 새로 생성" },
};

export default function ChatInput({
  onSubmit,
  disabled,
  placeholder = "어떤 카드를 만들까요?",
  autoFocus = true,
  large = false,
  highlightAttach = false,
  onFocusChange,
  hasContent = false,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [images, setImages] = useState<AttachedImage[]>([]);
  const [showOptions, setShowOptions] = useState<number | null>(null); // 옵션 표시할 이미지 인덱스
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, [value]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if ((!trimmed && images.length === 0) || disabled) return;
    onSubmit(trimmed || "이 이미지로 카드 만들어줘", images.length > 0 ? images : undefined);
    setValue("");
    clearAllImages();
    textareaRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newImages: AttachedImage[] = Array.from(files).map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      option: "apply" as ImageAttachOption, // 기본: 바로 적용
    }));
    setImages((prev) => [...prev, ...newImages]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = (index: number) => {
    setImages((prev) => {
      const removed = prev[index];
      URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
    if (showOptions === index) setShowOptions(null);
  };

  const updateOption = (index: number, option: ImageAttachOption) => {
    setImages((prev) => prev.map((img, i) => (i === index ? { ...img, option } : img)));
    setShowOptions(null);
  };

  const clearAllImages = () => {
    images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    setImages([]);
    setShowOptions(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div
      className={`bg-ds-elevated border border-ds-border ${
        large ? "rounded-2xl p-4" : "rounded-xl p-2"
      }`}
    >
      {/* 이미지 프리뷰 목록 */}
      {images.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {images.map((img, idx) => (
            <div key={idx} className="relative group">
              {/* 썸네일 */}
              <button
                type="button"
                onClick={() => setShowOptions(showOptions === idx ? null : idx)}
                className="block"
              >
                <img
                  src={img.previewUrl}
                  alt={`첨부 ${idx + 1}`}
                  className={`h-16 w-16 rounded-lg object-cover border-2 transition-colors ${
                    showOptions === idx ? "border-blue-500" : "border-transparent"
                  }`}
                />
              </button>

              {/* 옵션 뱃지 */}
              <span
                className={`absolute -bottom-1 left-1/2 -translate-x-1/2 text-[9px] px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                  img.option === "apply"
                    ? "bg-green-100 text-green-700"
                    : img.option === "edit"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-purple-100 text-purple-700"
                }`}
              >
                {OPTION_LABELS[img.option].label}
              </span>

              {/* 삭제 버튼 */}
              <button
                onClick={() => removeImage(idx)}
                className="absolute -top-1.5 -right-1.5 bg-white text-ds-text-inverse rounded-full w-4 h-4 flex items-center justify-center text-[9px] opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ✕
              </button>

              {/* 옵션 드롭다운 */}
              {showOptions === idx && (
                <div className="absolute bottom-full left-0 mb-1 bg-ds-base border border-ds-border rounded-lg shadow-lg z-10 w-48 py-1">
                  {(Object.keys(OPTION_LABELS) as ImageAttachOption[]).map((opt) => (
                    <button
                      key={opt}
                      onClick={() => updateOption(idx, opt)}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-ds-surface transition-colors ${
                        img.option === opt ? "bg-ds-surface font-medium" : ""
                      }`}
                    >
                      <div className="font-medium text-white">
                        {OPTION_LABELS[opt].label}
                        {img.option === opt && <span className="ml-1 text-amber-300">✓</span>}
                      </div>
                      <div className="text-ds-text-secondary mt-0.5">{OPTION_LABELS[opt].desc}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* 이미지 추가 버튼 */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="h-16 w-16 rounded-lg border-2 border-dashed border-ds-text-muted flex items-center justify-center text-ds-text-muted hover:border-ds-text-secondary hover:text-ds-text-secondary transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        {/* 이미지 첨부 버튼 */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleImageSelect}
          className="hidden"
        />
        {images.length === 0 && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className={`shrink-0 transition-colors disabled:opacity-30 w-9 h-9 flex items-center justify-center ${
              highlightAttach
                ? "text-amber-400 animate-pulse hover:text-amber-300"
                : "text-ds-text-secondary hover:text-white"
            }`}
            title="이미지 첨부 (여러 장 가능)"
          >
            <svg width={large ? "22" : "18"} height={large ? "22" : "18"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </button>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => onFocusChange?.(true)}
          onBlur={() => onFocusChange?.(false)}
          placeholder={images.length > 0 ? "이미지와 함께 요청을 입력하세요" : placeholder}
          disabled={disabled}
          rows={1}
          className={`flex-1 resize-none outline-none bg-transparent text-base text-white placeholder:text-ds-text-secondary`}
          style={{ fontSize: "16px" }}
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || (!value.trim() && images.length === 0)}
          className={`shrink-0 rounded-lg bg-white text-ds-text-inverse font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100 h-9 ${
            large ? "px-4 text-sm" : "px-3 text-xs"
          }`}
        >
          {disabled ? "생성 중..." : hasContent ? "보내기" : "만들기"}
        </button>
      </div>
    </div>
  );
}
