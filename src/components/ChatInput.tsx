"use client";

import { useState, useRef, useEffect } from "react";

interface ChatInputProps {
  onSubmit: (message: string, image?: File) => void;
  disabled: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  large?: boolean;
}

export default function ChatInput({
  onSubmit,
  disabled,
  placeholder = "어떤 카드를 만들까요?",
  autoFocus = true,
  large = false,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
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
    if ((!trimmed && !imageFile) || disabled) return;
    onSubmit(trimmed || "이 이미지로 카드 만들어줘", imageFile || undefined);
    setValue("");
    clearImage();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const clearImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div
      className={`bg-white border border-gray-200 shadow-sm ${
        large ? "rounded-2xl p-4" : "rounded-xl p-3"
      }`}
    >
      {/* 이미지 프리뷰 */}
      {imagePreview && (
        <div className="mb-2 relative inline-block">
          <img
            src={imagePreview}
            alt="첨부 이미지"
            className="h-16 rounded-lg object-cover"
          />
          <button
            onClick={clearImage}
            className="absolute -top-1.5 -right-1.5 bg-gray-900 text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px]"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* 이미지 첨부 버튼 */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageSelect}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className={`shrink-0 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-30 ${
            large ? "p-1" : "p-0.5"
          }`}
          title="이미지 첨부"
        >
          <svg width={large ? "22" : "18"} height={large ? "22" : "18"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </button>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className={`flex-1 resize-none outline-none bg-transparent ${
            large ? "text-base" : "text-sm"
          } placeholder:text-gray-400`}
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || (!value.trim() && !imageFile)}
          className={`shrink-0 rounded-lg bg-gray-900 text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-800 ${
            large ? "px-4 py-2 text-sm" : "px-3 py-1.5 text-xs"
          }`}
        >
          {disabled ? "생성 중..." : "생성"}
        </button>
      </div>
    </div>
  );
}
